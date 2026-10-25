# Razvojni načrt do 25. oktobra 2026 ob 14.00

Vsi časi so Europe/Ljubljana (25. 10. prehod na zimski čas). Izhodišče in znane vrzeli: [PROJECT_STATUS.md](PROJECT_STATUS.md). Cilj je dokončati in preveriti obstoječi MVP, brez menjave frameworka. Spodnje naloge so načrt, ne trditev o že izvedeni implementaciji.

## Lastništvo

A je `Vitos911`, B je `vasjabajt-bot`; oba imata write dostop. Obe dogovorjeni feature veji sta bili ustvarjeni na GitHub iz pregledanega `0f574c4`. Organizacijske spremembe so ločeno na `codex/development-workflow`; po njihovem odobrenem merge oba sinhronizirata svoji veji z `origin/main`.

| Področje / datoteke | Aktivni avtor | Pregled in integracija |
| --- | --- | --- |
| `components/organization-app.tsx`, dashboard/navigacija/naloge/projekti | A | B pregleda; A vključuje izločene module |
| Načrtovano `components/dashboard/`, `components/tasks/`, `components/projects/` in pripadajoči testi | A | B |
| Načrtovano `components/hours/`, `components/attendance/`, `components/admin/` in pripadajoči testi | B | A |
| `components/personal-calendar.tsx`, `lib/google-calendar.ts`, `lib/personal-calendar.ts`, `/api/personal-calendar`, Calendar/hours/attendance testi | B | A; dashboard kartico v lupino vključi A |
| `lib/organization.ts` (obstoječi tipi/izračuni), `lib/org-validation.ts`, `lib/org-server.ts`, `/api/org/[resource]` | Skupna pogodba; en avtor po dogovoru | Drugi obvezno pregleda; A task/project del, B work/attendance/calendar del |
| `components/cloud-app.tsx`, `components/auth-complete.tsx`, `lib/google-auth.ts`, `app/auth/` | B za P0 auth nastavitev/popravke | A obvezno pregleda, brez novega Auth sistema |
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, skupne UI komponente/design tokens | A kot integrator | B poda potrebe; oba ne urejata globalnega CSS hkrati |
| `supabase/migrations`, `supabase/tests`, paket/lockfile, CI in infrastruktura | En avtor na PR | Drugi pregleda; lastnik odobri produkcijsko uporabo |
| `components/workspace.tsx`, `lib/model.ts`, `lib/storage.ts`, `/legacy` | Ohranjeno | Brez širjenja legacy funkcij za izpolnitev organizacijskega MVP |

Najprej A izloči skupni Card/Empty/Stat, navigacijo in task/project poglede v majhnih PR-jih. B sočasno pripravi hours/attendance/admin komponente s tipiziranimi props iz obstoječega `Snapshot`; ne ureja monolita. Skupni props: samo potrebni izseki snapshot, potrjena `Identity`, `busy`, callback za mutacijo/refresh in jasno error stanje. Ne pošiljaj service klienta v komponento. Integracijske podpise potrdita pred začetkom izločanja; javni API ostane po [DATA_CONTRACTS.md](DATA_CONTRACTS.md).

## P0: vrstni red in sprejemni pogoji

| Rok | A – `feature/dashboard-tasks` | B – `feature/hours-attendance` | Skupni pogoj |
| --- | --- | --- | --- |
| 24. 10., prvi delovni blok | Prevzem pogodb in shell lastništva; preveri task/project obrazce in prazna stanja | Pridobi pravi Calendar ID/readonly dostop; preveri Production/Preview env in auth redirecte | GitHub sodelavci, ruleset, osnovni CI; brez novega produkcijskega push |
| 24. 10., do 20.00 | Pravi ADMIN projekt → naloga → dodelitev → MEMBER status → zgodovina/reload; osebni TODO in Kanban brez mockov | Ure/reload/tedenski cilj; vseh 6 serij Calendar → Supabase reference → prisotnost; admin popravek | Mutacijske/cleanup teste izvajaj samo v izrecno odobrenem testnem okolju |
| 25. 10., do 10.00 | Končaj P0 popravke in majhne integracijske PR-je; preveri prioriteto/rok/dodelitev skladno z backendom | Vse 3 vloge; prepoved tujih ur/dostopov; prijava/callback/refresh/odjava na ciljnem Preview | Spremembe RLS v ločeni migraciji in pregled drugega razvijalca |
| 25. 10., 10.00–12.00 | Desktop/mobilni prehod dashboard → projekt → naloga | Desktop/mobilni prehod ure → sestanek → prisotnost → admin analitika | `pnpm check` na zadnjem HEAD, brez odprtih P0 napak |
| 25. 10., 12.00–13.00 | Skupni sprejemni test in popravki | Skupni sprejemni test in popravki | Točni URL, odobrena/neodobrena identiteta, save/reload, cross-user zavrnitve |
| 25. 10., 13.00–14.00 | Dokumentacija in predaja | Nastavitve in operativna predaja | Lastnik izrecno odobri merge/Production; po izdaji ponovi javni smoke. Brez odobritve ostane pregledan PR |

Če Calendar ID/pravice niso pravočasno na voljo, to ostane P0 BLOCKED z opisom manjkajoče nastavitve. ICS ali osebni koledar ne štejeta kot delujoča skupna integracija. Trenutni MEMBER backend ne dovoli spremembe prioritete/roka/dodelitve: A ne razširi samo UI; pripravi predlog najmanjših pravic in uskladi API + RLS + test. Admin lahko ta polja že upravlja.

Ločene member/admin strani uvedita šele po stabilni izločitvi komponent; v tem koraku je navigacija še hash. Neposreden `/#hours` in `/#analytics` zato preverjaj kot fragmentna pogleda, ne izmišljene `/hours` ali `/admin` poti. API/RLS morata varovati podatke neodvisno od vidne navigacije.

## P1 in P2

P1 po P0: boljši dashboard, razumljiva analitika, odzivnost in dostopnost, dokumentacija/UX ter ločene route strani. Enoten design system nadgradi iz obstoječega CSS, brez vizualne prenove sredi integracije. P2 (značke, streaki, AI, Slack) je odložen do potrditve vseh P0 pogojev.

## Dokončano pomeni

Stran se odpre, dejanski uporabnik dobi samo dovoljene podatke, zapis je potrjen iz baze in ostane po refresh, napake niso prikazane kot uspeh, drugi član ne more prebrati/spremeniti tujih podatkov, mobilni pogled deluje, vsi lokalni/PR checki uspejo. Pri Calendar dodatno preveri realen readonly Google odgovor in vse serije. Pri Production je potreben ločen test dejanskega javnega URL in callbacka. Dokaze in NOT VERIFIED/BLOCKED pogoje dodaj v PR ter [verification.md](verification.md).
