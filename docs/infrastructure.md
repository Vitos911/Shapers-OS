# Infrastructure and reproducible setup

Next.js App Router runs UI and Node route handlers. Supabase provides Auth and Postgres. Browser requests carry the current Auth access token; each organization request calls Auth `getUser()` and trusted `org_context()`. Regular operations use the user's token and RLS, not the service key. Service access is limited to explicit provisioning/imports, approved invitations and validated Google synchronization.

## Fresh checkout and empty Supabase database

1. Create/select a Supabase project you own. Do not reset the existing project or delete its members/workspaces. Install Node 22.18+, Corepack and pnpm 11.25.0. Clone this repository and run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to untracked `.env.local`. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and server-only `SUPABASE_SECRET_KEY` from that project. Never prefix the latter with `NEXT_PUBLIC_`.
3. Initialize and link the CLI locally, then apply migrations. Commands prompt for your Supabase login/database credentials; do not put credentials in shell arguments or Git:

   ```bash
   pnpm dlx supabase init
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref YOUR_PROJECT_REF
   pnpm dlx supabase db push --dry-run
   pnpm dlx supabase db push
   ```

   Review the dry-run first. Migrations are ordered in `supabase/migrations/`: three original JSON workspace migrations, restored existing members migration, organization backend, provisioning, historical weekly hours, policy/index refinement. Never replay applied migrations manually. The restored members migration matches the existing project's recorded version.
4. Populate the supplied fictional members, preserving any existing normalized-email matches and UUIDs:

   ```bash
   node --env-file=.env.local scripts/seed-members.mjs
   node --env-file=.env.local scripts/seed-members.mjs --apply --allow-create
   ```

5. For a sandbox only, explicitly set `DEMO_AUTH_ENABLED=true` in local `.env.local`, then:

   ```bash
   node --env-file=.env.local scripts/provision-users.mjs --demo
   node --env-file=.env.local scripts/provision-users.mjs --demo --apply
   node --env-file=.env.local scripts/provision-users.mjs --demo --apply
   ```

   The second apply must create no extra accounts or password rotations. Credentials are written before account creation to `.private/demo-credentials.json`. Keep a protected backup: rerunning does not recover a lost existing password. Real addresses cannot use demo auto-confirmation. Set the opt-in back to false afterwards; it guards provisioning, not an authentication bypass.
6. Bootstrap only owner-approved real operator emails. Privately create `.private/superadmins.json` containing an explicit JSON array of those emails (no passwords), then:

   ```bash
   node --env-file=.env.local scripts/provision-users.mjs --bootstrap-file .private/superadmins.json
   node --env-file=.env.local scripts/provision-users.mjs --bootstrap-file .private/superadmins.json --apply
   ```

   This is a service-only, audited operation. It grants trusted access to configured verified-email operators without inventing member records. They must complete their own normal email verification. The running project has the three addresses explicitly selected by its owner, not an arbitrary first signup. Existing sandbox admins remain ADMIN. Never put real operator addresses in shared seed data for a different deployment.
7. Import hours (dry-run then apply). Repeat apply to check idempotency:

   ```bash
   node --env-file=.env.local scripts/import-sandbox.mjs --type weekly-hours --file supabase/seed/weekly-hours.json
   node --env-file=.env.local scripts/import-sandbox.mjs --type weekly-hours --file supabase/seed/weekly-hours.json --apply
   ```

   Other supported types: `projects`, `work`, `attendance`; JSON or CSV. Conflicts stop the plan before writes. An interrupted apply may have saved earlier rows; deterministic keys allow safe reruns. Existing corrections are never silently overwritten. A weekly total has explicit `week_start` and `through_date`; daily entries in its covered period are blocked to prevent double-counting. No source project names were available; none were synthesized.
8. Configure Google following [Google Calendar setup](google-calendar.md), then import pending attendance only after real meeting references exist. Missing IDs/multiple same-series dates produce conflicts, not guessed matches.
9. Configure Supabase Auth Site URL and exact redirect allowlist for your app origin; enable email/password for sandbox passwords and email links for real operators. Configure your own SMTP for production and enable leaked-password protection if supported by your plan. Restrict public registration/invitations as appropriate. Email verification alone does not create organization access.
10. Run the checks below, then deploy as a Node service or compatible Next.js host. Configure env vars in the host secret store, never the frontend build output. `pnpm build` then `pnpm start` serves port 3000 (or host `PORT`). HTTPS and a private sandbox deployment are recommended. No additional hosting service is provisioned automatically.

## Environment contract

| Variable | Purpose / exposure |
| --- | --- |
| `SUPABASE_URL` | Required; project URL, safe public configuration |
| `SUPABASE_PUBLISHABLE_KEY` | Required `sb_publishable_` key; safe for browser, protected by RLS |
| `SUPABASE_SECRET_KEY` | Server only; provisioning/imports/invites/Google reference sync; never returned by config API |
| `GOOGLE_CALENDAR_ID` | Calendar source; takes precedence over SUPERADMIN setting |
| `GOOGLE_CALENDAR_API_KEY` | Server-only public-calendar API access; restrict to Calendar API |
| `GOOGLE_CALENDAR_TIMEZONE` | Fixed deployment value `Europe/Ljubljana`; app/database enforce this zone, not arbitrary host time |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Alternative private-calendar JSON credential, single-line escaped JSON in dotenv; Reader access only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Alternative private-calendar OAuth credentials, readonly Calendar events scope |
| `DEMO_AUTH_ENABLED` | Provisioning safety gate; true only when deliberately creating fictional demo accounts |
| `APP_URL` | Canonical origin for Google login; exact HTTPS origin in production |
| `AUTH_COOKIE_SECRET` | Independent random server-only secret (32+ characters) for temporary encrypted OAuth cookies |
| `CHECK_APP_ORIGIN` | Optional smoke-test origin, default `http://127.0.0.1:3000`; mutating smoke test rejects remote hosts |

Google needs one credential mechanism, not all three. Browser config returns only the Supabase URL and publishable key. The original JSON workspace API remains compatible at `/legacy`; organization imports are explicit, never inferred from legacy JSON. Existing legacy spaces were inspected and left untouched.

## Vercel: obstoječa Git integracija

Pregled 24. 10. 2026: projekt `shapers-os` (`prj_WliKT2bUvi1cm9tGtmADvSZXj3jQ`) v ekipi `vitos911s-projects` že gradi GitHub `Vitos911/Shapers-OS`, `main`. Obstoječi deployment je READY pri `0f574c4`; to ni objava sprememb iz tega pregleda. Ne ustvarjaj podvojenega Vercel projekta. Živo stanje in omejitve so v [PROJECT_STATUS.md](PROJECT_STATUS.md).

### Nastavitve projekta

| Nastavitev | Zahtevana vrednost |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | Koren repozitorija (`.` oziroma prazna nastavitev); ne `shapersos-workspace` |
| Node.js | Obstoječi 24.x; projekt zahteva vsaj 22.18 |
| Install Command | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` |
| Output Directory | Privzeto Next.js; brez override na `out/` |
| Production Branch | `main` |
| Preview | Push na feature vejo / PR; preveri tudi morebitne branch filtre in pravice obeh razvijalcev v ekipi |

Pri package-manager zaznavi ohrani `packageManager: pnpm@11.25.0`, omogoči Corepack po aktualnih navodilih Vercela in v logu potrdi dejansko verzijo; ne zamenjuj lockfile z npm. Ne potrebuješ VERCEL_TOKEN ali dodatnega deploy workflowa. Obstoječi Actions samo izvaja teste, typecheck, lint in build brez skrivnosti.

Next route handlerji uporabljajo Node.js runtime; OAuth kriptografija in Google servisni JWT se ne smeta preseliti v Edge ali statični export. Persistenca je v Supabase, začasni OAuth/provider podatki v šifriranih piškotkih, brez lokalnega diska v Functions. Seed/provision CLI skript ne zaganjaj kot del builda. `vercel.json` ni potreben za ta App Router projekt in ni uveden zaradi same prisotnosti Vercela.

### Env: pregled imen, ne izpis vrednosti

Živi metadata pregled Vercela je našel uporabljene `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` samo v **Production**. `APP_URL`, `AUTH_COOKIE_SECRET` in vse Google spremenljivke manjkajo; Preview/Development nastavitev ni bilo. Integracija je dodala tudi POSTGRES/SUPABASE_ANON/SERVICE_ROLE/NEXT_PUBLIC dvojnike, ki jih ta koda ne uporablja. Prisotnost imen ne potrjuje pravilnosti vrednosti; nobena vrednost ni bila dešifrirana ali objavljena. Nastavitev ne briši na slepo.

- Public konfiguracija: `SUPABASE_URL` in moderni `SUPABASE_PUBLISHABLE_KEY` sta namenoma vrnjena iz `/api/supabase-config`. Legacy anon ključ trenutno ne ustreza validaciji aplikacije. Ohrani dejanski imeni brez novih NEXT_PUBLIC dvojnikov.
- Server konfiguracija: `APP_URL` = točen HTTPS origin, `GOOGLE_CALENDAR_ID` (ali isti ID v `org_settings`) in Europe/Ljubljana.
- Server skrivnosti: `SUPABASE_SECRET_KEY`, `AUTH_COOKIE_SECRET` (naključnih 32+ znakov, isti v vseh instancah istega okolja), `GOOGLE_CALENDAR_API_KEY` ali `GOOGLE_SERVICE_ACCOUNT_JSON` oziroma OAuth `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN`. Nastavi jih neposredno v Vercel/Supabase, nikoli v klepet ali Git.
- Google provider Client ID/Secret v **Supabase Auth** je ločena nastavitev od env v aplikaciji. Aplikacija potrebuje `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` tudi za obnovo osebnega koledarskega dovoljenja.
- `DEMO_AUTH_ENABLED=false` ali nenastavljeno na hostingu; gre za zaščito provisioning CLI, ne za skrivanje demo obrazca.

Za lokalno okolje obstaja `.env.local`, ne `env.local`. Ob začetku je pregled našel samo tri Supabase spremenljivke; nato je dodan podani Calendar ID. APP_URL, cookie secret in Google poverilnice še manjkajo. Kopiranje repoja ne prenese te datoteke. Vse potrebne spremenljivke so navedene v obstoječi `.env.example` in zgornji env pogodbi.

### Production in Preview origin

Production kandidat je dejanski Vercel alias `https://shapers-os.vercel.app`. Lastnik mora potrditi končni kanonični URL in javno dostopnost; zaščite ne izklapljaj med testiranjem. Za Production `APP_URL` nastavi ta točen origin, brez poti/query. To bo začelo veljati šele pri novi izrecno odobreni produkcijski izdaji.

Za obe feature veji pridobi dejanski stabilni branch alias iz Vercel deploymenta. V Preview nastavi `APP_URL` kot **branch-specific override**, vsaki veji njen točen HTTPS alias. Uporabniki nato odpirajo ta kanonični alias; poljuben enkratni deployment URL ne ustreza same-origin preverjanju. Ne uporabi Production APP_URL v Preview. Sedanja auth koda nima samodejnega fallbacka na `VERCEL_URL`; zgolj nastavitev te sistemske spremenljivke ne zadošča.

Preview je prava aplikacija z resničnimi pravicami in podatki. Do ločenega odobrenega testnega projekta naj ostane zaščiten in naj se za shared Supabase uporablja samo odobren bralni pregled. Ne kopiraj produkcijskih servisnih skrivnosti na nepreverjene PR-je. Nova plačljiva Supabase veja/projekt ni del te priprave.

Supabase Auth Site URL in redirect allowlist prilagodi končnemu originu:

```text
https://shapers-os.vercel.app/
https://shapers-os.vercel.app/legacy
https://shapers-os.vercel.app/auth/callback?flow=*
```

Dodaj enake točne poti za vsak potrjen Preview origin ter localhost. Production gostitelja ne nadomesti s širokim `*.vercel.app`. Parameter `flow=*` je potreben, ker obstoječi PKCE tok preverja naključni nonce. Google Cloud Authorized redirect URI ostane **Supabase** `https://xdzofggamwoywxwdduio.supabase.co/auth/v1/callback`, ne Next aplikacijski callback. Ohrani e-poštne predloge in obstoječo avtentikacijo. Glej [Google auth](google-auth.md) in [osebni Calendar](personal-calendar.md).

### Skupni Google Calendar

Lastnik je podal embed URL; iz njegovega parametra `src` je pridobljen Calendar ID in nastavljen v `org_settings` ter ignorirani lokalni `.env.local`. Zapis je preverjen z bralno poizvedbo; druge nastavitve/podatki niso prepisani. `ctz=Europe/Belgrade` v embedu ne prepiše aplikacijskega Europe/Ljubljana. ID sam ne daje API dostopa: za javni koledar potrebuješ omejen strežniški API key, za zasebnega Reader service account ali readonly OAuth refresh token. Ne objavljaj koledarja kot javnega samo za lažjo integracijo. Nastavitev in preverjanje vseh šestih serij: [google-calendar.md](google-calendar.md).

Pred uvozom 258 čakajočih prisotnosti preveri prave Google reference in nedvoumne pare. Trenutni `syncCalendar` pri osvežitvi briše in ponovno vnaša povezave `org_meeting_members`; zato ga ta organizacijski pregled brez izrecne odobritve za tak poseg ne izvaja. Branje Googla, konfiguracijo ID in sinhronizacijo loči v dokazih.

### Izdaja in sprejem

Najprej pregledan PR, vsi checki in odobren Preview test, nato **izrecna odobritev lastnika za merge/Production**. Ker `main` že sproži produkcijsko Git objavo, push/merge ni nevtralna sinhronizacija. Pravila za `main`: [CONTRIBUTING.md](../CONTRIBUTING.md).

Na ciljnem deploymentu preveri `/`, `/legacy`, `/auth/complete`, neposredno odpiranje `/#hours`/`/#tasks`, health in zavrnitev neavtenticiranega `/api/org/snapshot`. Ne izmišljaj `/hours` ali `/admin`, saj še nista routes. Nato prijava odobrenih MEMBER/ADMIN/SUPERADMIN računov, neodobrena identiteta, callback, reload in odjava. `health=200` je samo liveness. Za CRUD/save/reload/attendance je potrebno odobreno testno okolje; za Google dejanska privolitev/readonly API. READY ali lokalni build teh dokazov ne nadomestita.

Če je projekt v drugem checkoutu res nepovezan, v Vercel izberi Add Existing Project/Import Git Repository → obstoječi GitHub repo, preveri ekipo in zgornje nastavitve. Import lahko takoj začne deployment: brez izrecne odobritve ne potrdi končnega ustvarjanja/Production. Trenutni projekt je že povezan in tega postopka ne potrebuje.

Uradni viri: [Vercel GitHub integracija](https://vercel.com/docs/git/vercel-for-github), [package managers/Corepack](https://vercel.com/docs/package-managers), [Supabase redirect URL](https://supabase.com/docs/guides/auth/redirect-urls). Pred Next spremembami beri priloženo verzijo dokumentacije v `node_modules/next/dist/docs/`.

## Verification commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

In another terminal, with demo accounts provisioned:

```bash
node --env-file=.env.local scripts/check-organization.mjs
```

The smoke test creates uniquely identified temporary project/task/work records and cleans up only its own records; run on the designated sandbox, not an unrelated production tenant. Run `supabase/tests/organization_rls.sql` in Supabase SQL Editor as one transaction: all fixtures roll back, including Auth test users. GitHub CI runs tests, lint and a credential-free build; it does not mutate your database or prove hosted Google access. An empty-database deployment has instructions but has not been separately executed against another project.
