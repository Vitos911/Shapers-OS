# ShapersOS: pregled dejanskega stanja

Aktualna nadgradnja kode: [WemryOS for Business](wemryos-upgrade.md) na `feature/wemryos-platform-upgrade`. Spodnji pregled ostaja zgodovinski posnetek. Nova migracija ni uporabljena v produkciji; lokalni testi ne potrjujejo gostovane prijave ali produkcijskega prehoda.

Pregled: 24. oktober 2026. Izhodišče: `0f574c43a322dd452e4dc588a07250118aedb56f` na lokalnem in oddaljenem `main`. Repozitorij je zaseben. To je posnetek stanja, ne potrdilo produkcijske pripravljenosti.

## Tehnologija in poti

- Next.js 16.4.3 App Router, React 19.3.1, TypeScript strict, Supabase JS 2.118.0, lucide-react; CSS brez dodatnega UI frameworka. pnpm 11.25.0 in zaklenjene odvisnosti.
- Koren aplikacije je koren repozitorija. `shapersos-workspace/` je ignorirana starejša kopija, ne Vercel Root Directory.
- `/` naloži `CloudApp` in po prijavi `OrganizationApp`. Posamezni pogledi so fragmenti `/#overview`, `/#tasks`, `/#projects`, `/#hours`, `/#meetings`, `/#attendance`, `/#members`, `/#analytics`, `/#settings`. Ločene URL strani za člane in administratorje še niso implementirane.
- `/legacy` ohranja stare JSONB prostore in izrecni lokalni način. Teh podatkov glavni dashboard ne uporablja.
- `/auth/google`, `/auth/callback`, `/auth/complete`, `/auth/session`, `/auth/logout`: Google PKCE prijava in predaja obstoječi Supabase seji.
- `/api/org/[resource]`: snapshot ter dovoljene mutacije projektov, nalog, ur, prisotnosti, profilov, nastavitev in dostopov. `/api/personal-calendar`: ločen osebni readonly koledar. `/api/supabase-config`: samo javna konfiguracija. `/api/health`: liveness, ne preverjanje baze ali Googla.

## Živo preverjena baza

Supabase MCP je najprej potrdil URL projekta `xdzofggamwoywxwdduio`; nato so bile izvedene samo bralne poizvedbe po tabelah, politikah in migracijah.

| Podatek | Trenutno stanje |
| --- | --- |
| `members` | 20 članov, 20 Auth povezav, 3 `is_admin` |
| Zaupani aktivni dostopi `org_private.access` | 17 MEMBER, 3 ADMIN, **4 SUPERADMIN**; to niso 4 dodatni člani |
| Tedenski cilji iz baze | GO!: 10 članov × 4 h; Impact: 7 × 10 h; Core: 3 × 70 h |
| `org_weekly_hours` | 120 zapisov, 1.705,5 h; prvi teden 2026-09-14, pokritost do 2026-10-23 |
| Projekti / naloge / zgodovina / dnevne ure | 0 / 0 / 0 / 0 |
| Sestanki / prisotnost | 0 / 0 |
| Stari JSONB prostori | 2 |
| `org_settings` | Ob začetku 1 zapis, Ljubljana, prazen Calendar ID; po lastnikovem podatku je nastavljen podani skupni ID, brez spreminjanja časovnega pasu |
| Migracije | Vseh 9 lokalnih verzij obstaja tudi v oddaljeni zgodovini; zadnja `20261024115149` |
| RLS | Vklopljen na vseh 14 javnih tabelah; pregledane dejanske SELECT/INSERT/UPDATE/DELETE politike |

`org_private.access` je zasebna deny-all tabela brez neposrednih uporabniških pravic. Vloge razrešijo zaupanja vredne funkcije na podlagi potrjenega Auth uporabnika; `user_metadata` ne določa dostopa. SUPERADMIN torej že obstaja v backendu. Svetovalnik poroča INFO za namenoma zaprto tabelo ter WARN za izključeno zaščito pred razkritimi gesli; glej [obstoječi varnostni opis](backend-security.md).

## Funkcionalnosti in meje dokazov

| Področje | Obstoječa implementacija | Manjka oziroma ni ponovno preverjeno |
| --- | --- | --- |
| Prijava | Supabase email/demo, Google PKCE, preverjanje potrjenega uporabnika in organizacijskega dostopa | Google gumb na obstoječem Vercelu dejansko vrne napako manjkajočega APP_URL (FAIL/BLOCKED); Google privolitev, SMTP in uspešna javna prijava še niso potrjene |
| Dashboard | Dejanski `/api/org/snapshot`, ure/cilji, lastne naloge in naslednji sestanek; loading/error/empty stanja | Celoten potek z novimi podatki in reload je treba potrditi v ciljnem okolju |
| Projekti/naloge | ADMIN CRUD v dovoljenem obsegu, članstva, filtri, prioritete, roki, statusi, zgodovina | Glavni organizacijski pogled ima **tabelo, ne Kanbana**; neodvisni osebni TODO je samo v legacy modelu |
| Pravice nalog | MEMBER spreminja status/opis svoje naloge; ADMIN dodelitev, prioriteto in rok | Zahteva po spremembi roka/prioritete za člana je širša od trenutnega backenda; A naj pripravi usklajeno pogodbo/RLS pred spremembo UI |
| Ure | Lastni dnevni vnosi/popravki, tedenske zgodovinske evidence, cilj `members.weekly_hours`, admin pregled | Trenutno ni dnevnih vnosov; živi write/reload test tega pregleda še ni izveden |
| Skupni Calendar | Server GET, paginacija, recurrence, DST, normalizacija, sync referenc v Supabase; podani ID zdaj nastavljen | Manjkajo Google strežniške poverilnice lokalno in na Vercelu. `calendar.configured=false`; brez dogodkov ni žive prisotnosti |
| Prisotnost | `present`, `remote`, `excused`, `unexcused`; backend časovna okna in admin popravki | Dejanski Google sestanek → prijava → reload → admin popravek ostaja sprejemni pogoj |
| Osebni Calendar | Ločena readonly povezava in šifrirani HttpOnly provider tokeni | Ne nadomesti skupnega koledarja ali vira prisotnosti; živa privolitev ni potrjena |
| Analitika / admin | Izračuni iz Supabase snapshot, zaključki iz zgodovine, člani/stopnje/udeležba, SUPERADMIN nastavitve | Ločene route strani in pregled celotnega poteka vseh treh vlog |
| Mobilno | Obstoječe responsive CSS, zložljiva navigacija, tablični scroll | V tem pregledu še ni novega vizualnega testa vseh pogledov |

Šest serij je že definiranih: Summer School, Grants, Shape Talks, Community, Shapers Tech in Shapers Voice. V `supabase/seed` je 55 ICS dogodkov in 258 čakajočih zapisov prisotnosti. To sta **vira za uvoz**, ne že izvedena Google povezava ali živa prisotnost. Ne ustvarjaj izmišljenih Google ID-jev.

## GitHub in Vercel

- Živi GitHub pregled: `main` pri zgornjem SHA, **ni zaščiten**, oddaljenih feature vej ob začetku ni. Obe zahtevani feature veji sta nato ustvarjeni iz istega pregledanega SHA; A = Vitos911, B = vasjabajt-bot (write dostop potrjen). PR pravila sama v Markdownu ne preprečijo neposrednega push; zahtevana je nastavitev ruleseta.
- Vercel projekt `shapers-os` že obstaja; ID `prj_WliKT2bUvi1cm9tGtmADvSZXj3jQ`, ekipa `vitos911s-projects`. Platforma navaja Next.js in Node 24.x.
- Obstoječi production deployment `dpl_4iu5DNRwB2X6xorVMh8uAZ4ZUVJV` je `READY`, `source=git`, `githubCommitRef=main`, z istim izhodiščnim SHA. Git povezava torej že obstaja.
- Platforma vrne alias [shapers-os.vercel.app](https://shapers-os.vercel.app), vendar `live=false` in SSO protection `all_except_custom_domains`. To **ne dokazuje javnega dostopa brez Vercel prijave**. Zaščite med pregledom ne spreminjaj.
- Metadata pregled env imen: Supabase ključi/URL so prisotni samo v Production; **manjkajo APP_URL, AUTH_COOKIE_SECRET in Google spremenljivke**, Preview/Development env ni. Vrednosti niso bile dešifrirane. Lokalna `.env.local` ima tri Supabase nastavitve; dodan je samo podani Calendar ID. Ta datoteka ni Git tracked.
- Nastavitev Root Directory, pravilnosti strežniških env vrednosti, Preview in uspešne produkcijske prijave ni mogoče sklepati iz READY. Navodila za njihovo potrditev so v [infrastrukturi](infrastructure.md).

## Preverjanja ob začetku

`pnpm test`: 50 PASS, 0 FAIL, 0 SKIP. `pnpm typecheck`: PASS, tudi po dopolnitvi z `next typegen`. Produkcijski build in lint: PASS. Lokalni produkcijski HTTP + dejanska MEMBER/ADMIN prijava + RLS branje + ponovno branje + zavrnitev role-management: PASS; brez organizacijskih CRUD mutacij. Končni dokazi in omejitve so v [verification.md](verification.md). Prejšnji zapisi v tej datoteki ostajajo zgodovinski dokazi in niso predstavljeni kot na novo izvedeni testi.

Obstoječi `scripts/check-organization.mjs` piše in briše začasne zapise na povezani bazi. V tem pregledu ni samodejno zagnan, ker zahteva izrecno odobritev brisanja podatkov. Tudi rollback SQL suite vsebuje zapisovalne operacije; bralni pregled RLS ni njen nadomestek.

Pred izvedbo organizacijskih sprememb je načrt: ohraniti obstoječo aplikacijo, določiti lastništvo in pogodbe, dodati PR predlogo ter dopolniti obstoječi CI z eksplicitnim typecheck, uskladiti razvojni runtime in dopolniti obstoječo infrastrukturo z Vercel postopkom. Razdelitev in roki: [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).
