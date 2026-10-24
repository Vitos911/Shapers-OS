<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ShapersOS: skupni dogovor

- Nadgrajuj obstoječi Next.js App Router projekt v korenu. `shapersos-workspace/` je ignorirana stara kopija. Ne menjaj frameworka in ne prepisuj `/legacy`.
- Pred delom preberi [CONTRIBUTING.md](CONTRIBUTING.md), [stanje](docs/PROJECT_STATUS.md), [lastništvo in vrstni red](docs/DEVELOPMENT_PLAN.md) ter [pogodbe](docs/DATA_CONTRACTS.md). Obstoječi infrastrukturni dokument je `docs/infrastructure.md`; ne ustvarjaj druge različice z drugačno velikostjo črk.
- A dela na `feature/dashboard-tasks`: dashboard, navigacija, projekti/naloge/TODO/Kanban. B dela na `feature/hours-attendance`: ure, prisotnost, Calendar, admin/analitika. Imena vej so dogovorjena izjema od splošnih predpon.
- `components/organization-app.tsx` trenutno integrira vse poglede: spreminja ga A. B razvija ločene komponente v `components/hours/`, `components/attendance/`, `components/admin/`; A jih vključi skozi majhen integracijski PR. Te mape so načrtovane, ne že dokončane funkcionalnosti.
- Skupne datoteke (`app/globals.css`, `lib/organization.ts`, `lib/org-server.ts`, `lib/org-validation.ts`, `app/api/org/[resource]/route.ts`, migracije, paket/lockfile, auth) imajo enega aktivnega avtorja spremembe in obvezen pregled drugega razvijalca. Pred posegom se dogovori o obsegu. Ne združuj stotih nepovezanih formatirnih sprememb.
- Delaj na feature/organizacijski veji, nikoli neposredno na `main`. Pred novo nalogo fetch in merge `origin/main`; brez force push, `reset --hard` ali zavračanja tujih sprememb. PR naj pokaže dokaze za dejanski HEAD.
- Pred zaključkom izvedi `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` oziroma `pnpm check`. Pri funkcionalni spremembi preveri še dejansko vlogo, API, shranitev in reload; zapiši, kaj ostane NOT VERIFIED. Build ni dokaz Google/SMTP/Vercel prijave.
- Podatki prihajajo iz Supabase projekta `xdzofggamwoywxwdduio`. Pred SQL preveri ciljni projekt in aktualno shemo/RLS. Ne ustvarjaj podvojenih tabel; shemo spreminjaj z novo pregledljivo migracijo, ne s prepisom že uporabljenih migracij.
- Ohrani 20 izvornih članov, tedenske agregate in JSONB prostore. Brez mock nadomestkov. Cilj ur preberi iz `members.weekly_hours`, vloge pa iz preverjenega backenda/RLS. Nikoli iz uporabniško spremenljivih metapodatkov ali samo UI.
- Google Calendar je izključno readonly. Osebni koledar ni skupni vir sestankov/prisotnosti. Vseh šest serij ohrani. Ne ugibaj Google referenc za uvoz.
- `SUPABASE_SECRET_KEY`, OAuth skrivnosti in `AUTH_COOKIE_SECRET` ostanejo na strežniku. Ne izpisuj vrednosti env, tokenov ali `.private/`. Javna ključa sta samo URL in publishable key prek obstoječega config API; ne dodajaj `NEXT_PUBLIC_` skrivnosti.
- Brez izrecne odobritve ne izvajaj destruktivnega SQL, brisanja podatkov, produkcijske objave ali merge v `main`. `scripts/check-organization.mjs` vključuje brisanje testnih vrstic in ni del samodejnega CI.
- Vercel Git integracija že obstaja: `main` je Production, feature/PR je Preview. Ne dodajaj drugega deployment pipeline ali novega projekta. Oddaljene zaščite in Google nastavitve so ločene od lokalnih datotek; nikoli ne trdi, da so uveljavljene samo zato, ker so dokumentirane.
