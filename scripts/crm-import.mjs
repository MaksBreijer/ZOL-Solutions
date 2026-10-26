#!/usr/bin/env node
// Migreert een CRM-exportmap (scripts/crm-vault-export.mjs) naar Supabase.
//
//   Dry-run (standaard, schrijft niets):  node scripts/crm-import.mjs <exportmap> [--expect organizations=25,contacts=10,openTasks=10]
//   Importeren:                           node scripts/crm-import.mjs <exportmap> --apply --confirm <code uit dry-run>
//   Controleren na import:                node scripts/crm-import.mjs <exportmap> --verify
//   Terugdraaien:                         node scripts/crm-import.mjs --rollback <batch-id>
//
// Vereist SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de omgeving (alleen voor deze sessie; nooit opslaan in Git of logs).
import fs from 'node:fs'
import path from 'node:path'
import crypto, { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_NAMESPACE, checkExpectations, compareWithDatabase, planImport } from '../src/crm/import.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const exportDir = args.find((arg, index) => !arg.startsWith('--') && !['--confirm', '--expect', '--rollback', '--namespace'].includes(args[index - 1]))
const BUCKET = 'crm-files'
const fail = (message) => { console.error(message); process.exit(1) }

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
const needDatabase = () => { if (!supabase) fail('Zet SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in je terminal voor deze sessie.') }

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('seq', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

if (option('--rollback')) {
  needDatabase()
  const { data, error } = await supabase.rpc('crm_import_rollback', { p_batch: option('--rollback') })
  if (error) fail(`Terugdraaien mislukt: ${error.message}`)
  if (data.fileKeys.length) await supabase.storage.from(BUCKET).remove(data.fileKeys)
  console.log(`Teruggedraaid: ${data.removed} records verwijderd, ${data.fileKeys.length} bijlagen verwijderd.`)
  if (data.keptBecauseModified.length) console.log(`Behouden omdat ze na de import zijn gewijzigd (${data.keptBecauseModified.length}):`, data.keptBecauseModified.map((item) => `${item.collection}/${item.id}`).join(', '))
  process.exit(0)
}

if (!exportDir) fail('Gebruik: node scripts/crm-import.mjs <exportmap> [--apply --confirm <code>] [--verify] | --rollback <batch-id>')
const source = JSON.parse(fs.readFileSync(path.join(exportDir, 'state.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'manifest.json'), 'utf8'))
const files = Object.fromEntries(Object.entries(manifest.files || {}).filter(([, entry]) => entry))
const namespace = option('--namespace') || DEFAULT_NAMESPACE
const plan = planImport(source, { files, namespace })

// Bijlagen: de bytes moeten overeenkomen met het manifest.
const fileProblems = []
for (const file of plan.files) {
  const local = path.join(exportDir, 'files', file.fileKey.replace(/^files\//, ''))
  if (!fs.existsSync(local)) { fileProblems.push(`${file.fileKey}: bestand ontbreekt in de exportmap`); continue }
  if (crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex') !== file.sha256) fileProblems.push(`${file.fileKey}: hash komt niet overeen met het manifest`)
}

let comparison = null
if (supabase) {
  const stored = await fetchAll('crm_records', 'collection,id,data')
  comparison = compareWithDatabase(plan, stored)
}

const expectations = Object.fromEntries((option('--expect') || '').split(',').filter(Boolean).map((pair) => { const [name, value] = pair.split('='); return [name, Number(value)] }))
const expected = checkExpectations(plan, expectations)
const report = {
  ...plan.report, fileProblems,
  database: comparison ? { alreadyPresentIdentical: comparison.matched, missing: comparison.missing.length, different: comparison.different.length, differentIds: comparison.different } : 'niet gecontroleerd (geen databaseverbinding)',
  expectations: expected,
}
fs.writeFileSync(path.join(exportDir, 'import-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })

const print = () => {
  const c = plan.report.counts
  console.log(`\nBronnamespace: ${namespace} · bevestigingscode: ${plan.planHash}`)
  console.log('Aantallen per collectie:', c.perCollection)
  console.log(`Zichtbare organisaties: ${c.organizationsVisible} (+${c.organizationsMerged} samengevoegd/verborgen) · open taken: ${c.openTasks}`)
  console.log('Taken per status:', c.tasksByStatus, '· kansen per fase:', c.dealsByStage, '· inbox:', c.inboxByStatus)
  console.log(`Verwijderlijst: ${c.erasedKeys} · auditregels: ${c.auditEntries} · bijlagen: ${c.files}${c.files ? '' : ' (de bron bevat geen bijlagen)'}`)
  console.log('Relaties (totaal / onopgelost):', Object.fromEntries(Object.entries(plan.report.relations).map(([name, entry]) => [name, `${entry.total} / ${entry.unresolved}`])))
  if (plan.report.unresolvedReferences.length) console.log(`Onopgeloste verwijzingen (${plan.report.unresolvedReferences.length}):`, plan.report.unresolvedReferences)
  if (plan.invalid.length) console.log(`Records die de validatie niet halen (${plan.invalid.length}):`, plan.invalid)
  if (fileProblems.length) console.log('Bijlageproblemen:', fileProblems)
  if (plan.warnings.length) console.log('Waarschuwingen:', plan.warnings)
  if (plan.report.legacyMembersNotImported) console.log(`${plan.report.legacyMembersNotImported} lokale accounts worden niet overgenomen: de bestaande adminaccounts zijn leidend.`)
  for (const item of expected) console.log(`Controlepunt ${item.key}: verwacht ${item.expected}, bron ${item.actual} ${item.ok ? '✓' : '✗ AFWIJKING'}`)
  if (comparison) console.log(`Database: ${comparison.matched} identiek aanwezig, ${comparison.missing.length} ontbreken, ${comparison.different.length} wijken af`)
  console.log(`Rapport: ${path.join(exportDir, 'import-report.json')}`)
}

if (flag('--verify')) {
  needDatabase(); print()
  const dbFiles = await supabase.from('crm_files').select('file_key,sha256')
  const problems = []
  for (const file of plan.files) {
    const row = dbFiles.data?.find((item) => item.file_key === file.fileKey)
    if (!row || row.sha256 !== file.sha256) { problems.push(`${file.fileKey}: ontbreekt of afwijkende hash in database`); continue }
    const download = await supabase.storage.from(BUCKET).download(file.fileKey)
    if (download.error || crypto.createHash('sha256').update(Buffer.from(await download.data.arrayBuffer())).digest('hex') !== file.sha256) problems.push(`${file.fileKey}: opslag komt niet overeen`)
  }
  const ok = !comparison.missing.length && !comparison.different.length && !problems.length && expected.every((item) => item.ok)
  console.log(ok ? '\nVerificatie geslaagd.' : `\nVerificatie MISLUKT. ${problems.join('; ')}`)
  process.exit(ok ? 0 : 1)
}

if (!flag('--apply')) {
  print()
  console.log(plan.errors.length ? `\nDry-run: ${plan.errors.length} blokkerende fouten, import niet mogelijk:\n- ${plan.errors.join('\n- ')}` : '\nDry-run klaar. Er is niets geschreven. Beoordeel het rapport en voer daarna uit met --apply --confirm ' + plan.planHash)
  process.exit(plan.errors.length ? 1 : 0)
}

// --- Importeren ---
needDatabase(); print()
if (plan.errors.length) fail(`Blokkerende fouten:\n- ${plan.errors.join('\n- ')}`)
if (option('--confirm') !== plan.planHash) fail(`Bevestigingscode ontbreekt of klopt niet. Beoordeel eerst de dry-run en gebruik --confirm ${plan.planHash}.`)
if ((plan.invalid.length || fileProblems.length) && !flag('--accept-invalid')) fail('Er zijn ongeldige records of bijlageproblemen. Los ze op, of accepteer ze bewust met --accept-invalid (ze worden dan verliesvrij overgenomen en gemeld).')
if (expected.some((item) => !item.ok)) fail('Een controlepunt wijkt af van de bron. Controleer of dit de juiste kopie is.')
if (comparison.different.length && !flag('--keep-existing')) fail(`${comparison.different.length} records in de database wijken af van de bron. Er wordt niets overschreven; gebruik --keep-existing om die records over te slaan en de rest te importeren.`)

const uploaded = []
try {
  for (const file of plan.files) {
    const existing = await supabase.storage.from(BUCKET).download(file.fileKey)
    if (!existing.error) {
      const same = crypto.createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex') === file.sha256
      if (!same) throw new Error(`${file.fileKey} bestaat al met andere inhoud.`)
      continue
    }
    const bytes = fs.readFileSync(path.join(exportDir, 'files', file.fileKey.replace(/^files\//, '')))
    const { error } = await supabase.storage.from(BUCKET).upload(file.fileKey, bytes, { contentType: file.contentType || 'application/octet-stream', upsert: false })
    if (error) throw new Error(`Upload van ${file.fileKey} mislukt: ${error.message}`)
    uploaded.push(file.fileKey)
  }
  const batch = randomUUID()
  const { data, error } = await supabase.rpc('crm_import_apply', {
    p_batch: batch, p_namespace: namespace, p_rows: plan.rows, p_erased: plan.erased, p_audit: plan.audit, p_files: plan.files, p_report: report, p_allow_conflicts: flag('--keep-existing'),
  })
  if (error) throw new Error(error.message)
  console.log(`\nGeïmporteerd (batch ${batch}): ${data.inserted} nieuw, ${data.unchanged} al aanwezig en identiek, ${data.skippedErased} overgeslagen wegens verwijderlijst, ${data.conflicts.length} conflicten overgeslagen.`)
  console.log(`Terugdraaien kan met: node scripts/crm-import.mjs --rollback ${batch}`)
  console.log('Controleer nu met: node scripts/crm-import.mjs <exportmap> --verify')
} catch (error) {
  if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
  fail(`Import afgebroken, niets is opgeslagen: ${error.message}`)
}
