# CRM-migratie naar de ZOL-admin

Het CRM uit de overdracht van 26 oktober 2026 draait nu in de admin (menu **CRM**, route `#crm`) op Supabase. De echte gegevens staan nog in de versleutelde lokale kluis; deze stappen brengen ze over zonder dat ze in Git, in een prompt of in een log terechtkomen.

## Wat er is gebouwd

| Onderdeel | Bestand |
| --- | --- |
| Tabellen, rechten en functies | `supabase/migrations/20261026120000_add_crm.sql` |
| Gedeelde logica (validatie, samenvoegen, verwijderen, verschil) | `src/crm/model.js` |
| Gegevenslaag (alle schrijfacties als één atomaire commit) | `src/crm/store.js` |
| Scherm in de admin | `src/crm/ui.js`, `src/crm.css` |
| Migratieplan (dry-run, rapport, controles) | `src/crm/import.js` |
| Kluis ontgrendelen en exporteren | `scripts/crm-vault-export.mjs` |
| Importeren, controleren, terugdraaien | `scripts/crm-import.mjs` |

Bron-ID's blijven de primaire sleutel (`collectie + id`); er worden geen nieuwe ID's aangemaakt, dus er is geen mapping nodig en alle verwijzingen, geschiedenis en geneste metadata blijven geldig. Alle bronvelden staan ongewijzigd in `data` (jsonb). Velden zonder eigen collectie (zoals de onzekerheden) staan in `source_meta`.

Rollen: eigenaar/beheerder → CRM-beheerder, editor → medewerker, viewer → alleen lezen. Privacybeheer, samenvoegen, verwijderen en export zijn alleen voor beheerders. De lokale kluisaccounts worden niet overgenomen; de bestaande adminaccounts (met MFA) zijn leidend en worden in het controlelogboek vastgelegd.

## Stappen

1. **Migratie toepassen** op een testproject en daarna productie (`supabase db push` of via de Supabase-omgeving). Controleer dat de privé-bucket `crm-files` bestaat.
2. **Kopie ontgrendelen en exporteren** op Maks' eigen computer. Thijn typt de wachtwoordzin zelf in de terminal; die komt nergens anders terecht.
   ```sh
   node scripts/crm-vault-export.mjs "<pad naar zol-crm/data/live>" ~/crm-migratie-2026-10-26
   ```
   De uitvoermap moet buiten de repository liggen. Bevat de bron na 26 oktober nieuwe wijzigingen, maak dan voor de cutover een nieuwe kopie.
3. **Dry-run** (schrijft niets). De controlepunten komen uit `LEESMIJ.md`:
   ```sh
   export SUPABASE_URL=...   SUPABASE_SERVICE_ROLE_KEY=...   # alleen in deze terminalsessie
   node scripts/crm-import.mjs ~/crm-migratie-2026-10-26 --expect organizations=25,contacts=10,openTasks=10
   ```
   Het rapport (`import-report.json`) toont aantallen per collectie en status, relaties met onopgeloste verwijzingen, records die de validatie niet halen, bijlageproblemen en afwijkingen met de database. Beoordeel het volgens de normale productie-reviewprocedure.
4. **Back-up** van de bestaande admin-database maken en de schrijfpauze/cutover afspreken. Bewaar de oorspronkelijke kluis.
5. **Importeren** met de bevestigingscode uit de dry-run:
   ```sh
   node scripts/crm-import.mjs ~/crm-migratie-2026-10-26 --apply --confirm <code>
   ```
   De import is transactioneel, idempotent (opnieuw draaien voegt niets toe) en overschrijft nooit bestaande records: afwijkende records stoppen de import, tenzij je bewust `--keep-existing` gebruikt. Verwijderde personen uit de verwijderlijst en records die naar hen verwijzen worden nooit teruggezet.
6. **Controleren** (vergelijkt inhoud per record en de hashes van bijlagen):
   ```sh
   node scripts/crm-import.mjs ~/crm-migratie-2026-10-26 --verify --expect organizations=25,contacts=10,openTasks=10
   ```
7. **Terugdraaien** kan met `node scripts/crm-import.mjs --rollback <batch-id>`. Records die na de import in het CRM zijn gewijzigd blijven staan en worden gemeld.
8. Vul in **CRM → Beheer & privacy** het verwerkingsregister aan (opslagregio, verwerkersovereenkomst, privacyverklaring). Zoals in het bron-CRM blokkeert de database wijzigingen aan dossiers totdat het register compleet is en is goedgekeurd.
9. Verwijder de exportmap na de gecontroleerde cutover.

## Wat nog openstaat voor productie

- Migratie en import zijn alleen getest met synthetische gegevens; de echte dry-run, import en `--verify` moeten nog op de ontgrendelde kopie draaien.
- Back-up en rollback zijn getest in een testdatabase (PGlite), nog niet op een Supabase-testproject.
- De opslag-RLS van `crm-files` (alleen beheerders lezen, editors uploaden) is alleen in SQL gedefinieerd; test bijlagen openen als beheerder en medewerker op het testproject.
- Back-ups van de CRM-tabellen vallen onder de back-ups van het Supabase-project; stem de bewaartermijn af met het bewaarbeleid in het CRM.
