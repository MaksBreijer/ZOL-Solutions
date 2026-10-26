import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syntheticExport } from './helpers/crm-fixture.js'
import { LocalVault } from '../scripts/crm/local-vault.mjs'

const script = fileURLToPath(new URL('../scripts/crm-import.mjs', import.meta.url))

function exportFolder() {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-export-test-'))
  mkdirSync(path.join(dir, 'files'))
  const bytes = Buffer.from('PNGDATA!')
  writeFileSync(path.join(dir, 'files', 'synthetic-file-1'), bytes)
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify(syntheticExport()))
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ files: { 'files/synthetic-file-1': { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, fileName: 'scherm.png', contentType: 'image/png' } } }))
  return dir
}
const run = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } })

test('dry-run reports counts and a confirmation code without touching any database', () => {
  const dir = exportFolder()
  try {
    const result = run([dir, '--expect', 'organizations=2,contacts=2,openTasks=1'])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Zichtbare organisaties: 2/)
    assert.match(result.stdout, /Controlepunt organizations: verwacht 2, bron 2 ✓/)
    assert.match(result.stdout, /Er is niets geschreven/)
    const report = JSON.parse(readFileSync(path.join(dir, 'import-report.json'), 'utf8'))
    assert.equal(report.counts.files, 1)
    assert.deepEqual(report.fileProblems, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('apply is refused without database credentials, without confirmation code and on a tampered attachment', () => {
  const dir = exportFolder()
  try {
    assert.notEqual(run([dir, '--apply']).status, 0)
    writeFileSync(path.join(dir, 'files', 'synthetic-file-1'), 'GEMANIPULEERD')
    const result = run([dir])
    assert.match(result.stdout, /hash komt niet overeen met het manifest/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the local vault copy opens only with the right passphrase and returns the stored state and attachments', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-vault-test-'))
  try {
    const vault = new LocalVault(dir)
    await vault.setup('synthetische-wachtzin-123')
    await vault.put('crm/state.json', JSON.stringify(syntheticExport()), { httpMetadata: { contentType: 'application/json' } })
    await vault.put('files/synthetic-file-1', new Uint8Array(Buffer.from('PNGDATA!')), { httpMetadata: { contentType: 'image/png' }, customMetadata: { name: 'scherm.png' } })
    vault.lock()
    await assert.rejects(() => new LocalVault(dir).unlock('verkeerd-wachtwoord-1'), /onjuist/)
    const reopened = new LocalVault(dir)
    await reopened.unlock('synthetische-wachtzin-123')
    const state = await (await reopened.get('crm/state.json')).json()
    assert.equal(state.organizations.length, 3)
    const file = await reopened.get('files/synthetic-file-1')
    assert.equal(file.body.toString(), 'PNGDATA!')
    assert.equal(file.customMetadata.name, 'scherm.png')
    reopened.lock()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
