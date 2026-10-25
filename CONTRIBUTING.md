# Sodelovanje pri ShapersOS

Razvijalec A: `Vitos911`, veja `feature/dashboard-tasks`. Razvijalec B: `vasjabajt-bot`, veja `feature/hours-attendance` (potrjen write dostop). Stabilna veja je `main`. [Razvojni načrt](docs/DEVELOPMENT_PLAN.md) določa datoteke in vrstni red; [pogodbe](docs/DATA_CONTRACTS.md) so skupna osnova. `CODEOWNERS` določa dejanska računa; za skupne poti zahteva pregled drugega razvijalca še vedno tudi PR postopek.

## Prvi zagon

Node 22.18+ (Vercel trenutno 24.x), pnpm 11.25.0. Kopiraj `.env.example` v svojo ignorirano `.env.local` in izpolni samo nastavitve za dogovorjeno okolje. Gesel/ključev ne prenašaj s commitom. Vsak razvijalec uporablja svoj checkout in svojo Auth identiteto, ne skupne seje ali kopije `node_modules`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

## Začetek in sinhronizacija

Za začetno ustvarjanje vej uporabi točen pregledan stabilni SHA oziroma `origin/main`. Če veja že obstaja, jo prevzemi, ne ustvarjaj ponovno:

```bash
git fetch origin
git switch --track origin/feature/dashboard-tasks
git merge origin/main
```

B uporabi `origin/feature/hours-attendance`. Za novo lokalno vejo, kadar oddaljene še ni, uporabi `git switch -c feature/dashboard-tasks origin/main` oziroma B različico. Ne izvajaj `git switch main` z nedokončanimi spremembami. Pred vsako naslednjo nalogo naredi commit ali varno shrani svoje delo, nato `git fetch origin` in `git merge origin/main`. Na deljeni veji uporabljaj merge; ne prepisuj zgodovine z rebase/force push.

## Majhni PR-ji

1. Pred posegom v skupno datoteko se dogovorita, kdo je aktivni avtor. A/B lahko hkrati razvijata frontend v lastnih mapah. A integrira B komponente v trenutno skupno lupino.
2. Commit vsebuje eno razumljivo spremembo in pripadajoče dokaze; brez `.env.local`, `.private/`, gradbenih map ali občutljivih posnetkov uporabnikov.
3. Izvedi `pnpm check`. Pri spremembi pogodbe ali dovoljenj dodaj smiselno regresijsko preverjanje. Za UI/API preveri člana in administratorja, napako, prazno stanje, mobilni prikaz ter shranitev po reload.
4. `git push -u origin feature/dashboard-tasks` (B svojo vejo). Odpri PR v `main`; uporabi predlogo. Nedokončano delo označi kot Draft. Preview mora uporabljati svoja pravilna origin/env pravila.
5. Drugi razvijalec pregleda spremembo, pogodbe in dokaze. Po novih commitih ponovno preveri zadnji HEAD in pridobi nov pregled. Pred merge morajo biti odpravljene razprave in konflikti.
6. Merge v `main` je izdaja: ker je že povezan s Production, zahteva **izrecno odobritev lastnika za produkcijsko objavo**. Ne vključi auto-merge in ne pushaj neposredno na `main`.

Ob konfliktu primerjaj namen obeh vej, sestavi rešitev z obema zahtevanima funkcionalnostma in ponovno preveri. Ne uporabljaj celotnega `--ours`/`--theirs` za skupne komponente. Spremembo API/sheme najprej uskladita kot ločen temeljni PR; nato oba posodobita veji. Že uporabljene migracije so nespremenljive.

## GitHub pravila, ki jih mora skrbnik uveljaviti

Živi pregled 24. 10. je pokazal nezaščiten `main`. Lokalne datoteke tega ne morejo nadomestiti. V Settings → Rules → Rulesets nastavi aktivno pravilo za `main`:

- PR pred merge, vsaj 1 odobritev drugega razvijalca, razveljavitev starih odobritev ob novem commitu, razrešene razprave.
- Zahtevaj uspešen check obstoječega workflowa `Build and test`, job `build` (izberi dejansko ime iz prve izvedbe), posodobljeno vejo in Vercel check za ta projekt, ko je na voljo.
- Prepovej force push in brisanje `main`; ne dovoli rutinskega obhoda pravil niti skrbniku. CODEOWNER review omogoči po dodelitvi dejanskih računov in potrebnih write pravic.
- Če zasebni repo/načrt ne podpira teh pravil, zabeleži omejitev in uporabljaj ročno odobritev; ne predstavljaj procesnega dogovora kot tehnične zaščite.

Obstoječi Actions workflow samo preverja kodo brez skrivnosti in baze. GitHub → Vercel opravlja deployment; VERCEL_TOKEN in dodatni deploy Actions niso potrebni. Nastavitev ruleseta in sodelavcev ni bila tiho spreminjana.
