# Integracijski kandidat — 25. oktober 2026

Ta veja združuje izvorne commite PR #1–#9, lokalni attendance popravek `9eb3ba1`, posnetek obstoječega leaderboard/weekly-streak dela in opcijsko Slack vejo `ff9e814`. Izvorna zgodovina je ohranjena z merge commiti. Main, produkcijska baza in produkcijski deployment s tem delom niso spremenjeni. Posameznih stacked PR-jev po sprejetju skupnega kandidata ni treba znova združevati.

## Popravki integracije

- En organizacijski vmesnik ohrani Dashboard, profil/logo, tedenske cilje/streak, leaderboard/dosežke, dostopno mobilno navigacijo, Visual Polish, task timeline, zgodovino ur/prisotnosti in Ask Shaper.
- Osebni Calendar je prikazan enkrat na Pregledu in enkrat v Sestankih. Ask Shaper je znotraj ozadja, ki ob odprti mobilni navigaciji postane inertno.
- Naloge vključujejo Backlog/Kanban, projektni imenik in preverjanje `expected_updated_at`; ob napaki ponovnega branja UI ne javlja uspeha. Google login ostane ločen od dodatnega readonly Calendar dovoljenja.
- Končna migracija guard funkcije ohrani nove pravice trenutnega izvajalca in servisni zgodovinski attendance INSERT. Starih, že uporabljenih migracij ne prepisuje. Prazna in nadgrajena baza dosežeta enaka končna task pravila.
- Dashboard in AI uporabljata enako prisotnost: present/remote nad present/remote/unexcused. Manjkajoči zapisi so neznani in izrecno prikazani, ne izmišljene odsotnosti.
- AI uporablja atomarne podatkovne kvote, skupne vsem instancam: 6/min/uporabnika, 60/dan/uporabnika, 1.000/dan za aplikacijo. Rezervacija je pred plačljivim klicem; napaka ali manjkajoča migracija ustavi klic. Dan je UTC. Poljubne identitete, ponastavljanje števcev in neposredno branje zasebne tabele niso dovoljeni.
- Slack ostane opcijski strežniški servis. Brez konfiguracije nima stranskih učinkov. Ni samodejnih obvestil; pošiljanje testnega sporočila ostaja izrecno varovano. V tem delu nobeno sporočilo ni poslano.

## Ponovljiva preverjanja

Node 22.18+ in pnpm 11.25.0:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm check` vključuje unit/integracijske teste, izolirani PGlite suite, typecheck, lint in običajni Next build. `test:browser` po buildu zažene lasten lokalni produkcijski strežnik na 127.0.0.1:3245 in ga ob koncu ustavi. Za že zagnan lokalni strežnik nastavi `CHECK_APP_ORIGIN`. Sistemski Chromium/Chrome lahko izbereš z `BROWSER_EXECUTABLE`.

Browser suite uporablja samo testne Auth/API transporte in se nikoli ne poveže na hosted Supabase ali AI. Pokriva MEMBER/ADMIN/SUPERADMIN, 9/11/11 pogledov pri 390/768/1440 px, task save/reload s concurrency poljem, ure, timeline, profil/leaderboard, napako AI in mobilno tipkovnico. Testni podatki niso del aplikacijskega runtime ali produkcijske baze. SQL suite izvede vseh 17 migracij v obeh vrstnih redih, preveri pravice/zgodovino/uvoz/leaderboard/kvote in rollback vseh fixture zapisov. Supabase Auth UID in platformni helper sta lokalna testna adapterja; to ne dokazuje hosted Auth/PostgREST.

CI ponovi test, podatkovne preizkuse, typecheck, lint, build in browser suite brez produkcijskih poverilnic. Artefakti v `test-results/` in logi ostanejo ignorirani. Stare testne številke in produkcijski dokazi v drugih dokumentih so zgodovina posameznih vej.

## Migracije — pripravljene, ne uporabljene na produkciji

Ob pregledu je hosted Supabase vseboval 13 migracij. Ta veja vrne njihove datoteke v sledljiv vir in doda štiri čakajoče migracije:

| Vrstni red | Datoteka | Vpliv |
| --- | --- | --- |
| 1 | `20261024144936_hackathon_p0.sql` | Task RLS/directory in Calendar RPC. Trenutni `in_review` pretvori v `in_progress`; pred izvedbo pregledati prizadete vrstice. |
| 2 | `20261025085526_history_audit_hardening.sql` | Actor name pri prihodnjih zapisih, history SELECT policy in append-only zaščita. Brez backfilla. |
| 3 | `20261025102503_release_integration_guards.sql` | Združi task in attendance guard brez spreminjanja aktivnosti. |
| 4 | `20261025102948_shared_ai_budget.sql` | Zasebni operativni števci in autentificiran quota RPC. |

Produkcijska uporaba potrebuje lastnikovo izrecno odobritev. Najprej obnovi platformno podprto svežo varnostno kopijo v ločeno okolje in preveri shemo, grants/RLS, vloge in dejanske zapisovalce. Lokalni engine preizkus ni dokaz hosted obnove. Že uporabljene zgodovinske migracije ostanejo byte-identične.

Ker sta prvi dve čakajoči verziji starejši od nekaterih že uporabljenih verzij, običajen `db push` lahko zahteva `--include-all`. Po povezavi z izrecno izbranim staging projektom preglej `supabase db push --include-all --dry-run`; nadaljuj samo, če seznam vsebuje točno pričakovane štiri migracije in nobenega reset/repair koraka. Na produkciji šele po ločeni odobritvi. Ne označuj migracij kot uporabljenih brez dejanske izvedbe.

Končni guard mora biti uporabljen po obeh starejših različicah; vmesni guard ni končna izdaja. Nova snapshot pot brez directory RPC namenoma vrne 503. Zato je usklajena migracija pogoj pred preusmeritvijo produkcije na to kodo. Vnaprej dogovori kratko cutover okno, da stari UI ne pošilja odstranjenega statusa `in_review`.

## Okolje in izdaja

- Cilj je obstoječi Vercel projekt **shapers-os**, ID `prj_WliKT2bUvi1cm9tGtmADvSZXj3jQ`, ekipa `team_uTUkfQtEA9I5Q0CQ4cywuCXz`; domena https://shapers-os.vercel.app. Podobno imenovani `shapers_os` je drug projekt.
- Supabase: `xdzofggamwoywxwdduio`. Ne spreminjaj produkcijskih podatkov ali OAuth/RLS nastavitev kot del avtomatskega testa.
- Vsa env imena so v `.env.example`. `APP_URL` mora biti točen origin ciljnega okolja; preveri tudi Supabase Site URL/redirect allowlist ter Google callback `/auth/callback`. Preview potrebuje svojo konfiguracijo; lokalna `.env.local` se ne prenese.
- AI: strežniški `SHAPER_AI_PROVIDER`, `SHAPER_AI_API_KEY` ali `GROQ_API_KEY`, neobvezni `SHAPER_AI_MODEL`; shared quota migracija je obvezna. Brez ključa jasen 503; ni lažnega odgovora.
- Shared Calendar potrebuje pravi ID in eno dejansko readonly credential možnost. Osebni koledar tega ne nadomešča.
- Slack: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`; `SLACK_TEST_ENABLED=false` naj ostane privzeto. Testnega pošiljanja ta izdaja ne sproži.
- Po odobrenem mergeu in migracijah preveri Vercel SHA/alias, error/fatal loge in dejanske Google login/logout/Calendar, vse tri vloge, CRUD+reload, history, ure, prisotnost, AI ter mobilni UI. READY build in fixture preverjanja niso produkcijski PASS.
- Rollback aplikacije mora upoštevati spremembo statusov in append-only history. Brez samodejnega destruktivnega down SQL; ob incidentu ustavi izdajo in uporabi pregledan plan/obnovo. Staro kodo in vse izvorne veje ohrani do zaključene verifikacije.

## Odprte zunanje omejitve

Podatkovni pregled je našel devet projektov namesto desetih, dva z imenom Test, samo eno zaključeno nalogo in nepravilnosti prisotnosti. Koda teh zapisov ne popravlja brez lastnikovega potrjenega vira/odločitve in ne ustvarja novih nalog ali projektov za lepši demo. Poročilo [data-readiness.md](data-readiness.md) vsebuje podrobnosti.

Neodvisen pregled drugega razvijalca, aktualni oddaljeni CI in odobritev mergea so še vedno pogoji. Hosted produkcijski OAuth/AI/Calendar in dejanski CRUD niso potrjeni s temi lokalnimi testi. Produkcijskih skrivnosti, pravil branch protection, gesel ali podatkov ta veja ne spreminja. Pripravljen kandidat za pregled ni potrdilo končne stabilne produkcijske izdaje.
