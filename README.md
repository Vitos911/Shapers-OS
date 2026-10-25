# Shapers OS

Slovenski delovni prostor za projekte, naloge, prostovoljske ure in udeležbo. Glavni pogled uporablja Supabase Auth in normalizirane tabele z RLS; brskalnik ni avtoritativna baza. Ciljni repozitorij je [Vitos911/Shapers-OS](https://github.com/Vitos911/Shapers-OS).

## Lokalni zagon

Node.js 22.18+ in pnpm 11.25.0. Ustvari `.env.local` po `.env.example` in nastavi svoj projekt. Datoteka in `.private/` morata ostati zunaj Gita.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

Odpri `http://localhost:3000`. Za razvoj uporabi `pnpm dev`. Preverjanje strežnika: `GET /api/health`. Brez nastavljenega Supabase se prikaže stanje za konfiguracijo, ne navidezna organizacija.

## Funkcije

- MEMBER: lastni profil, dodeljene naloge, lastne ure, tedenski cilji, relevantni sestanki in udeležba.
- ADMIN: člani, projekti, članstva projektov, naloge/dodelitve, popravljanje udeležbe in organizacijska analitika.
- SUPERADMIN: zaupani dostopi/vloge, izključitev računa, povabila že odobrenim naslovom in nastavitve.
- Prehodi nalog, zaključki in pomembne spremembe imajo shranjeno zgodovino; član ne more spremeniti prioritete, dodelitve ali vloge.
- Google Calendar API je izključno za branje. Manjkajoča povezava je vidna kot napaka konfiguracije; ICS ni predstavljen kot živi koledar.
- Stari JSON delovni prostori in izrecni lokalni način so ohranjeni na `/legacy`. Niso vir organizacijskih statistik; podatki se ne pretvarjajo ali brišejo samodejno.

## Vzpostavitev in dokumentacija

- [Infrastruktura: od prazne baze do produkcije](docs/infrastructure.md)
- [Google Calendar: uvoz, readonly dostop in udeležba](docs/google-calendar.md)
- [Google prijava: Cloud Console, Supabase, callback in demo povezave](docs/google-auth.md)
- [Varnost, RBAC in definicije meritev](docs/backend-security.md)
- [Ask Shaper: nastavitev, varnost, obseg in preverjanje AI asistenta](docs/ask-shaper.md)
- [Dokazi preverjanja in preostale omejitve](docs/verification.md)
- [Prejšnji JSON prostori](docs/supabase.md)
- [Oblikovne odločitve](docs/design.md)
- [Osebni Google koledar in samodejno branje prihodnjih dogodkov](docs/personal-calendar.md)

V obstoječem projektu je ohranjenih vseh 20 članskih UUID-jev in oba prejšnja delovna prostora. Povezanih je 20 sandbox Auth računov. Zgodovinske ure so 120 tedenskih seštevkov (1.705,5 h), ne izmišljeni dnevni vnosi. 258 zapisov udeležbe čaka na prave Google reference. Imena desetih projektov v dostopnih virih niso bila podana, zato projekti niso izmišljeni.

Demo gesla so naključna, različna za vsak račun in samo v lokalni ignorirani `.private/demo-credentials.json`. Ne objavljaj je. Demo obrazec odpreš na prijavni strani; za ADMIN uporabi `ana.kovac@sandbox.example`, za MEMBER `ziga.krajnc@sandbox.example` z ustreznim zasebnim geslom. Realni SUPERADMIN mora najprej potrditi svojo e-pošto; noben realni račun ni samodejno potrjen in nobeno povabilo ni bilo poslano.

## GitHub Codespaces

V obstoječem Codespacu (vrata 3000 naj ostanejo zasebna):

```bash
git switch main
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

Pred zagonom ustavi prejšnji razvojni strežnik na vratih 3000. Strežniške spremenljivke nastavi tudi v Codespacu; lokalna `.env.local` se namerno ne prenese z Gitom. Supabase Auth Site URL in dovoljene redirect URL-je prilagodi dejanskemu `*-3000.app.github.dev` naslovu. `*.github.dev` brez vrat je urejevalnik, ne aplikacija. Objavljena koda na GitHub še ne pomeni posodobljenega ali preverjenega Codespace strežnika.

Nikoli ne dodajaj dejanskih ključev, poverilnic ali `.env.local` v commit. Edina različicena env datoteka je `.env.example` s praznimi vrednostmi/oznakami.
