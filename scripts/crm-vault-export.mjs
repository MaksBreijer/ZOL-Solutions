#!/usr/bin/env node
// Leest de bewust ontgrendelde lokale CRM-kluis en schrijft een leesbare migratiemap (state.json, files/, manifest.json).
// De wachtwoordzin wordt alleen verborgen in de terminal ingetypt: nooit via argumenten, omgevingsvariabelen of logs.
// Gebruik: node scripts/crm-vault-export.mjs <kluismap (data/live)> <uitvoermap buiten de repository>
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { LocalVault } from './crm/local-vault.mjs'

const [vaultDir, outDir] = process.argv.slice(2)
if (!vaultDir || !outDir) { console.error('Gebruik: node scripts/crm-vault-export.mjs <kluismap> <uitvoermap>'); process.exit(2) }

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.resolve(outDir)
if (target === repoRoot || target.startsWith(repoRoot + path.sep)) {
  console.error('De uitvoermap mag niet in de repository staan: klantgegevens horen niet bij de code. Kies een map daarbuiten.')
  process.exit(2)
}
if (fs.existsSync(target) && fs.readdirSync(target).length) { console.error('De uitvoermap bestaat al en is niet leeg. Kies een nieuwe map.'); process.exit(2) }
if (!fs.existsSync(path.join(path.resolve(vaultDir), 'vault.json'))) { console.error('Geen vault.json gevonden in de kluismap.'); process.exit(2) }

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) { reject(new Error('Een interactieve terminal is nodig om de wachtwoordzin in te typen.')); return }
    process.stdout.write(prompt)
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); resolve(value); return }
        if (char === '\u0003') { process.stdin.setRawMode(false); reject(new Error('Afgebroken.')); return }
        if (char === '\u007f') value = value.slice(0, -1); else value += char
      }
    }
    process.stdin.on('data', onData)
  })
}

// Werkt op een kopie, zodat de oorspronkelijke kluis nooit wordt aangeraakt.
const copyDir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'zol-crm-kluis-'))
fs.cpSync(path.resolve(vaultDir), copyDir, { recursive: true })
let vault
try {
  vault = new LocalVault(copyDir)
  await vault.unlock(await askHidden('Wachtwoordzin van de CRM-kluis: '))
  const state = await (await vault.get('crm/state.json'))?.json()
  if (!state) throw new Error('crm/state.json niet gevonden in de kluis.')

  fs.mkdirSync(path.join(target, 'files'), { recursive: true, mode: 0o700 })
  const manifest = { exportedAt: new Date().toISOString(), version: 1, files: {} }
  for (const item of state.inbox || []) {
    if (!item.fileKey) continue
    const object = await vault.get(item.fileKey)
    if (!object) { manifest.files[item.fileKey] = null; continue }
    const name = item.fileKey.replace(/^files\//, '')
    fs.writeFileSync(path.join(target, 'files', name), object.body, { mode: 0o600 })
    manifest.files[item.fileKey] = {
      sha256: crypto.createHash('sha256').update(object.body).digest('hex'), size: object.body.length,
      fileName: object.customMetadata?.name || item.fileName || '', contentType: object.httpMetadata?.contentType || item.fileType || '',
    }
  }
  fs.writeFileSync(path.join(target, 'state.json'), JSON.stringify(state), { mode: 0o600 })
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
  const missing = Object.values(manifest.files).filter((entry) => entry === null).length
  console.log(`Export klaar in ${target}`)
  console.log(`Bijlagen: ${Object.keys(manifest.files).length - missing} geëxporteerd${missing ? `, ${missing} verwezen maar niet gevonden in de kluis` : ''}${Object.keys(manifest.files).length ? '' : ' (de bron bevat geen bijlagen)'}.`)
  console.log('Deze map bevat leesbare klantgegevens: bewaar hem privé en verwijder hem na de gecontroleerde cutover.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  vault?.lock()
  fs.rmSync(copyDir, { recursive: true, force: true })
}
