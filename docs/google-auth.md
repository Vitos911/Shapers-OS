# Google prijava — ShapersOS

## Stanje

Google OAuth 2.0 prek Supabase Auth je implementiran. Obstoječi e-poštni implicit flow, demo gesla, Supabase session storage in /legacy ostajajo ohranjeni. Google ponudnik je ob preverjanju izklopljen (`external.google=false`), zato uspešna živa Google prijava in produkcijski callback še nista preverjena. Lastnik je izrecno odobril svoj realni račun za SUPERADMIN; ne nastane dodaten izmišljeni član.

## Google Cloud Console

1. Google Auth Platform: nastavi branding/consent za ShapersOS. Pri External/Testing dodaj resnične račune v Test users, ne izmišljenih sandbox naslovov.
2. Ustvari OAuth Client ID tipa **Web application**.
3. Authorized JavaScript origins: `http://localhost:3000` in točen produkcijski HTTPS izvor. Za ločeno produkcijo je priporočljiv ločen odjemalec brez localhost izvora.
4. Authorized redirect URI:

   ```text
   https://xdzofggamwoywxwdduio.supabase.co/auth/v1/callback
   ```

   To je Supabase callback, ne aplikacijski /auth/callback. Tudi lokalni Next.js uporablja ta naslov, ker uporablja gostovani Supabase.
5. Client ID in Client Secret vnesi neposredno v Supabase Dashboard. Ne v frontend, Git ali klepet. Zahtevani so samo `openid email profile`, brez Calendar ali offline dovoljenj.

## Supabase Dashboard

1. [Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/xdzofggamwoywxwdduio/auth/providers): omogoči Google, shrani Client ID/Secret. Ne izklopi nonce preverjanja ali preverjanja e-pošte.
2. [URL Configuration](https://supabase.com/dashboard/project/xdzofggamwoywxwdduio/auth/url-configuration): Site URL nastavi na dejanski glavni izvor. Dodatni redirect vzorci:

   ```text
   http://localhost:3000/auth/callback?flow=*
   https://YOUR-EXACT-PRODUCTION-HOST/auth/callback?flow=*
   ```

   Za 127.0.0.1 ali zasebni Codespace dodaj njegov točen izvor z istim callback vzorcem. Ne uporabljaj wildcard gostitelja. Ohrani prejšnje `/` in `/legacy` redirect vnose ter e-poštno predlogo. Naključni flow parameter se preveri proti šifriranemu piškotku.
3. Supabase lahko poveže preverjeno Google identiteto z obstoječim računom istega e-poštnega naslova po svojih pravilih identity linking. Aplikacija ne povezuje po prikaznem imenu ali uporabniških metapodatkih.
4. Organizacijski dostop dodatno zahteva aktivni zapis v `org_private.access`, preverjeno identiteto in RLS. Neodobren Google uporabnik ima lahko Auth sejo, vendar API vrne 403 in baza ne razkrije organizacijskih vrstic. MEMBER/ADMIN/SUPERADMIN ostajajo iste zaupanja vredne vloge; prvi signup ni promoviran.

## Okoljske spremenljivke

- Obstoječa `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`: uporabljata se za OAuth. Login endpointi ne uporabljajo secret/service ključa.
- `APP_URL`: točen izvor, npr. `http://localhost:3000` lokalno, dejanski `https://...` v produkciji. Brez poti/query/fragmenta. Brez nastavitve so dovoljene samo loopback zahteve. Za reverse proxy jo obvezno nastavi; forwarded-host glave ne izbirajo preusmeritve.
- Pri tem repozitoriju jo nastavi tudi lokalno: `pnpm start` posluša na 0.0.0.0, zato notranji Next.js URL ni nujno localhost. Uporabljaj isti localhost izvor v brskalniku, APP_URL in redirect seznamu.
- `AUTH_COOKIE_SECRET`: neodvisna naključna strežniška skrivnost, vsaj 32 znakov, ista na vseh instancah. Lokalno je bila varno generirana v ignorirano .env.local brez izpisa vrednosti. Nastavi jo posebej v produkcijskem secret store. Rotacija prekine tekoče OAuth poskuse, ne obstoječih Supabase sej.
- Google login Client ID/Secret: samo Supabase Dashboard. Obstoječe `GOOGLE_CLIENT_*` spremenljivke v repozitoriju so za ločeno Calendar integracijo, ne to prijavo.
- `SUPABASE_SECRET_KEY`: še vedno samo strežniško orodje za odobrena administrativna opravila.
- `DEMO_AUTH_ENABLED=true`: začasno le pri izrecni uporabi demo CLI; sicer false/nenastavljeno.
- Nobena skrivnost ne sme imeti predpone `NEXT_PUBLIC_`.

## Varnostni tok in odjava

Gumb pošlje same-origin POST /auth/google. Strežnik preveri izvor, dovoljeno povratno stran (samo / ali /legacy), stanje ponudnika in z nameščenim Supabase SDK ustvari S256 PKCE. Verifier/storage in neodvisni flow nonce sta v AES-256-GCM šifriranem HttpOnly, SameSite=Lax piškotku z veljavnostjo 10 minut.

GET /auth/callback preveri nonce, piškotek, čas in kodo; SDK zamenja enkratno kodo za sejo. getUser() potrdi preverjeno, neanonimno identiteto. Google provider tokeni se zavržejo. Šifriran 90-sekundni HttpOnly handoff vsebuje samo Supabase access/refresh tokena in dovoljeno povratno stran; browser se preusmeri na /auth/complete brez tokenov v URL-ju.

Completion stran prek same-origin POST /auth/session prejme le svojo ponovno preverjeno Supabase sejo, piškotek se izbriše. Obstoječi browser client s setSession() ohrani dosedanji način persistiranja/osveževanja seje; API še vedno neodvisno preverja getUser(), zaupanja vredno vlogo in RLS. React effect replay uporabi isto completion promise.

Odjava uporablja obstoječi Supabase signOut() in POST /auth/logout za brisanje začasnih OAuth piškotkov. Refresh tokeni so preklicani in lokalna seja odstranjena; že kopiran JWT lahko kot običajno velja do izteka. Sprememba ne trdi, da uvaja globalni takojšnji preklic vseh JWT-jev.

HTTPS piškotki uporabljajo Secure in __Host- predpono (Path=/, brez Domain); lokalni HTTP loopback ne uporablja Secure. OAuth API odgovori so private/no-store, no-referrer in ne razkrivajo tokenov v redirectih. Izključi CDN caching teh poti in redigiraj callback query v proxy dnevnikih. Velja zadnji začeti OAuth poskus v brskalniku; starejši so zavrnjeni. To ni migracija celotne aplikacije na SSR cookie seje.

## Varna demo povezava

Realni račun naj najprej opravi Google prijavo (neodobren račun bo zavrnjen za organizacijo). Nato lastnik določi točno preslikavo in vlogo. Po začasni nastavitvi DEMO_AUTH_ENABLED=true:

```bash
node --env-file=.env.local scripts/link-demo-account.mjs --email REAL_TEST_EMAIL --sandbox-email ziga.krajnc@sandbox.example --role MEMBER
node --env-file=.env.local scripts/link-demo-account.mjs --email REAL_TEST_EMAIL --sandbox-email ziga.krajnc@sandbox.example --role MEMBER --apply
```

Prvi ukaz je dry run brez zapisov. Apply zahteva preverjen Auth račun z Google identiteto, znani sandbox profil, skladno izrecno vlogo in strežniško poverilnico. Ohranijo se prvotni UUID, e-pošta in primarna Auth povezava ter delujoča izmišljena prijava. ADMIN zahteva administratorski sandbox profil in izrecno --role ADMIN. SUPERADMIN se lahko poveže samo po predhodni ločeni odobritvi SUPERADMIN; demo orodje tega privilegija ne ustvari. Konflikti/izključeni računi se ne prepišejo.

```bash
node --env-file=.env.local scripts/link-demo-account.mjs --email REAL_TEST_EMAIL --unlink
node --env-file=.env.local scripts/link-demo-account.mjs --email REAL_TEST_EMAIL --unlink --apply
```

Unlink odstrani povezavo in izključi MEMBER/ADMIN alias; že neodvisno odobren SUPERADMIN ohrani svojo operatorsko vlogo brez članskega profila. Vrni demo opt-in na false/nenastavljeno. Dejanske realno-sandbox preslikave v tej nalogi niso bile izvedene.

Migracija google_demo_profile_links samo nadomesti unikatnost access.member_id z indeksom, da se lahko kanonična prijava in odobren alias nanašata na isti obstoječi profil. Unikatnost e-pošte in Auth user ID ostane. Dodana link/unlink RPC-ja sta auditirana in dovoljena le service_role; nobena uporabniška vloga ju ne more klicati.

## Preverjanje in omejitve

Avtomatski testi preverjajo nameščeni SDK S256/verifier round trip z nadomestnim transportom, CSRF, open redirect, expiry/tampering, preklic, nepreverjeno identiteto, produkcijske piškotke in logout cleanup. SQL google_auth_rls.sql v rollback transakciji preveri vse tri vloge, neodobreno Google identiteto, ignoriranje metapodatkov, eksplicitne povezave, nespremenjeno izvirno prijavo in unlink. To niso uspešne žive Google prijave.

Po nastavitvi izvedi na localhost in produkciji: odobrena realna prijava, callback, reload in odjava; odobrena MEMBER/ADMIN alias računa; neodobren Google račun. Dokler to ni opravljeno, ostaja živi zunanji tok NOT VERIFIED. Produkcijska domena v tej nalogi ni bila podana.

Uradna navodila: [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

Varnostni advisor še vedno poroča o izklopljeni [zaščiti pred razkritimi gesli](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nastavitev ni bila samodejno spremenjena. INFO [RLS brez politike](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) na zasebni access tabeli ostaja namerni deny-all brez neposrednih uporabniških grantov.
