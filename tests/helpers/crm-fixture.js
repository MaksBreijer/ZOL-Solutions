import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Synthetische CRM-gegevens: geen echte personen of organisaties.
export const syntheticExport = () => ({
  version: 1,
  updatedAt: '2026-10-20T10:00:00.000Z',
  uncertainties: ['Synthetische onzekerheid'],
  organizations: [
    { id: 'org-alpha', name: 'Testclub Alpha', segment: 'Sportvereniging', aliases: ['Alpha FC'], email: 'info@alpha.example.invalid', source: 'fixture', updatedAt: '2026-10-01T09:00:00.000Z' },
    { id: 'org-beta', name: 'Testpraktijk Beta', segment: 'Fysiopraktijk', aliases: [], customField: { nested: [1, 2, 3] }, source: 'fixture' },
    { id: 'org-gamma', name: 'Gamma dubbel', segment: 'Fysiopraktijk', mergedInto: 'org-beta', mergeId: 'merge-1', source: 'fixture' },
  ],
  contacts: [
    { id: 'con-1', name: 'Pat Voorbeeld', organizationId: 'org-alpha', email: 'pat@example.invalid', phone: '0612345678', role: 'Trainer', source: 'fixture', updatedAt: '2026-10-02T09:00:00.000Z' },
    { id: 'con-2', name: 'Robin Testpersoon', organizationId: 'org-beta', email: 'robin@example.invalid', source: 'fixture' },
  ],
  deals: [{ id: 'deal-1', title: 'Samenwerking Alpha', organizationId: 'org-alpha', contactIds: ['con-1'], stage: 'voorstel', value: 1200, source: 'fixture' }],
  tasks: [
    { id: 'task-1', title: 'Opvolgen voorstel', status: 'wacht-op-reactie', due: '2026-10-30', organizationIds: ['org-alpha', 'org-beta'], contactIds: ['con-1'], priority: 'hoog', source: 'fixture' },
    { id: 'task-2', title: 'Oude taak', status: 'afgerond', organizationIds: ['org-beta'], source: 'fixture' },
    { id: 'task-3', title: 'Vervallen taak', status: 'vervallen', organizationIds: [], source: 'fixture' },
  ],
  activities: [
    { id: 'act-1', date: '2026-10-05', type: 'mail', text: 'Mail gestuurd naar Pat Voorbeeld', relatedIds: ['org-alpha', 'con-1', 'deal-1'], source: 'fixture' },
    { id: 'act-2', date: '2026-10-06', type: 'wijziging', text: 'Status bijgewerkt', relatedIds: ['task-1'], changes: { status: { from: 'open', to: 'wacht-op-reactie' } }, source: 'CRM' },
  ],
  events: [{ id: 'ev-1', title: 'Clubdag', date: '2026-11-01', organizationId: 'org-alpha', source: 'fixture' }],
  inbox: [
    { id: 'in-1', title: 'Notitie', status: 'te-verwerken', organizationId: 'org-beta', notes: 'Los', date: '2026-10-07', source: 'fixture' },
    { id: 'in-2', title: 'Screenshot', status: 'te-verwerken', organizationId: 'org-alpha', fileKey: 'files/synthetic-file-1', fileName: 'scherm.png', fileType: 'image/png', size: 8, date: '2026-10-08', source: 'fixture' },
  ],
  privacy: {
    members: [{ id: 'local-owner', email: 'owner@example.invalid', role: 'admin', active: true }],
    policy: { prospectReviewMonths: 6, auditDays: 365, backupDays: 30, reviewOnly: true },
    register: { controller: 'ZOL Solutions', purpose: 'Test', legalBasis: 'Gerechtvaardigd belang, onderbouwd', contactEmail: 'privacy@example.invalid', noticeUrl: 'https://example.invalid/privacy', processor: 'Supabase', hostingRegion: 'EU', processorAgreement: true, approvedAt: '2026-10-10T09:00:00.000Z' },
    requests: [{ id: 'req-1', contactId: 'con-2', type: 'inzage', status: 'ontvangen', receivedAt: '2026-10-09T10:00:00.000Z', due: '2026-11-09', identityVerified: false }],
    incidents: [{ id: 'inc-1', detectedAt: '2026-10-09T10:00:00.000Z', summary: 'Test', status: 'te-beoordelen', assessmentDue: '2026-10-12T10:00:00.000Z' }],
    audit: [{ id: 'aud-1', at: '2026-10-09T10:00:00.000Z', actorId: 'local-owner', actorEmail: 'owner@example.invalid', action: 'workspace.read', resource: '', recordIds: [] }],
    erasedIds: [],
    organizationMerges: [{ id: 'merge-1', targetId: 'org-beta', sourceIds: ['org-gamma'], createdAt: '2026-10-03T10:00:00.000Z', status: 'merged', targetRevision: 'r1', sourceRevisions: { 'org-gamma': 'r2' } }],
    pendingFileDeletes: [],
  },
})

// Voert de echte migratie uit in een geïsoleerde Postgres-engine. `test.role` bepaalt de ingelogde beheerdersrol.
export async function crmDatabase() {
  const db = new PGlite()
  await db.exec(`
    create schema private; create schema auth;
    create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email', coalesce(current_setting('test.email', true), '')) $$;
    create function private.is_admin(allowed text[] default array['owner','admin','editor','viewer']) returns boolean language sql as $$ select coalesce(current_setting('test.role', true), '') = any(allowed) $$;
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20261026120000_add_crm.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261026130000_crm_time_field.sql', import.meta.url), 'utf8'))
  const as = async (role) => {
    await db.query("select set_config('test.role', $1, false), set_config('test.uid', $2, false), set_config('test.email', $3, false)", [role, role ? '20000000-0000-4000-8000-000000000001' : '', role ? `${role}@example.invalid` : ''])
  }
  const removedFiles = []
  const textArrays = new Set(['p_ids', 'p_keys'])
  const client = {
    storage: { from: () => ({ remove: async (keys) => { removedFiles.push(...keys); return { error: null } } }) },
    async rpc(name, args = {}) {
      const keys = Object.keys(args)
      const values = keys.map((key) => (textArrays.has(key) ? `{${args[key].map((value) => `"${value}"`).join(',')}}` : args[key] !== null && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]))
      try {
        const { rows } = await db.query(`select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) as result`, values)
        return { data: rows[0].result, error: null }
      } catch (error) { return { data: null, error: { message: error.message, code: error.code } } }
    },
  }
  return { db, as, client, removedFiles }
}
