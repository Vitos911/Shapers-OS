# Shapers OS

Slovenski delovni prostor za projekte, dogodke, člane in prostovoljske ure.

## Zagon v GitHub Codespaces

1. Odpri repozitorij z **Code → Codespaces → Open/Create**.
2. Za obstoječi Codespace v terminalu zaženi:

   ```bash
   git pull --ff-only origin main
   corepack enable
   pnpm install --frozen-lockfile
   pnpm dev
   ```

3. V zavihku **Ports** odpri vrata **3000** v brskalniku. Ohranijo naj zasebno vidnost.

Povezava `*.github.dev` je urejevalnik kode. Aplikacija teče na posredovanih vratih 3000 (`*-3000.app.github.dev`). Nov Codespace uporabi `.devcontainer/devcontainer.json`; po začetni namestitvi se razvojni strežnik zažene samodejno. V obstoječem Codespacu lahko izbereš **Codespaces: Rebuild Container** za uporabo te konfiguracije.

## Lokalni zagon

Potrebuješ Node.js 22 ali novejši (za teste vsaj 22.18) in pnpm 11.25.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Odpri `http://localhost:3000`. Produkcijski zagon:

```bash
pnpm test
pnpm build
pnpm start
```

## Funkcije

- Projekti s področjem, ciljnim datumom, statusom in seznamom nalog.
- Člani z vlogami in seštevkom opravljenih ur.
- Dogodki z datumom, lokacijo in ročnim beleženjem udeležbe.
- Evidenca ur po članu in projektu, validacija datumov in 15-minutnih intervalov.
- Iskanje v trenutnem pogledu, filtri projektov in pregled trenutnega meseca.
- Izvoz ur v CSV ter izvoz/uvoz varnostne kopije JSON v Nastavitvah.
- Preverjanje odzivnosti strežnika: `GET /api/health`.
- Samodejni testi in produkcijski build v GitHub Actions.

## Podatki in omejitve prve različice

Če je Supabase nastavljen, aplikacija ponudi prijavo po e-pošti in skupne delovne prostore. Lastnik prostora lahko izbranim potrjenim e-poštnim računom dodeli ogled ali urejanje. Podatki se shranijo v bazo šele po uspešnem odgovoru; spori pri sočasnem urejanju zahtevajo osvežitev. Poglej [navodila za Supabase](docs/supabase.md).

Lokalni način ostane na voljo. Ta shranjuje zapise v `localStorage` trenutnega brskalnika in se ne sinhronizira med napravami. Stari lokalni podatki ostanejo ohranjeni; prenos v Supabase sprožiš izrecno v Nastavitvah. Redno izvozi varnostno kopijo.

Začetni delovni prostor je prazen. Dodajanje člana ustvari zapis v evidenci; ne ustvari uporabniškega računa, dodeli dostopa ali pošlje vabila. Za Supabase sta v ignorirani `.env.local` nastavljena samo URL in publishable ključ. Secret ali service-role ključi niso potrebni. Privzeti Supabase mail strežnik ima omejene prejemnike; za širšo ekipo nastavi lasten SMTP v Supabase.

`.env`, `.env.*`, ključi, običajne datoteke poverilnic, odvisnosti in build so izključeni iz Gita. Nikoli ne dodajaj dejanskih skrivnosti v izvorno kodo.
