# Shapers OS — podatkovna pripravljenost za demo

Preverjeno 25. 10. 2026 ob 11:02 CET (Europe/Ljubljana), Supabase projekt iz obstoječe konfiguracije. Izhodiščni commit `0f574c43a322dd452e4dc588a07250118aedb56f`; veja `codex/data-readiness`. Podrobni agregati in kontrolne vsote virov so v [data-readiness-evidence.json](data-readiness-evidence.json).

To je današnji bralni pregled dejanske baze. Stare navedbe v README in `verification.md`, da projekti in attendance še niso uvoženi, ne opisujejo več trenutnega stanja. Teh skupnih dokumentov nismo spreminjali.

## Rezultat

| Področje | Status | Ugotovitev |
| --- | --- | --- |
| Members | PASS | 20 članov, ohranjeni izvorni UUID, članstva, cilji in serije; vseh 20 ima primarno Auth povezavo. GO!: 10 × 4 h; Impact: 7 × 10 h; Core: 3 × 70 h. |
| Projects | FAIL | 9 projektov namesto zahtevanih 10; 7 z uvoznim ključem in spletnim virom v opisu, 2 z imenom »Test«. Isti imeni sta kandidata za pregled, ne dokaz identičnih projektov. Izvorna datoteka zahtevanih 10 sandbox projektov ni na voljo. |
| Tasks | FAIL | 1 dodeljena naloga, status `done`; ni odprtih nalog za prikaz poteka dela. Projekt in član obstajata. Vsi 3 dogodki zgodovine ustrezajo shranjenim before/after spremembam, zadnji zaključek tudi `completed_at`. |
| Hours | PASS | 120 izvornih tedenskih seštevkov = 1.705,5 h, dodatni 3 dnevni vnosi = 2 h. Skupaj 1.707,5 h; tekoči teden 203,5 h. Brez prekrivanja dnevnih in tedenskih ur ter brez kandidatov za identične dnevne dvojnike. |
| Attendance | FAIL | Vseh 258 izvornih zapisov je prisotnih z nespremenjenimi statusi. Od 260 zapisov sta 2 dodatna: prisotnost na prihodnjem sestanku in zapis člana brez povezave s serijo/sestankom. Brez podvojenih parov član/sestanek ali neveljavnih tujih ključev. |
| Calendar | NOT VERIFIED | Shranjenih 55 sestankov v vseh 6 serijah in 430 povezav udeležencev se ujema z ICS po terminih in naborih članov. Živ dostop do Google API in trenutna zmožnost sinhronizacije nista preverjena. |

PASS pri Members/Hours pomeni vsebino baze in preverjeni dostop MEMBER/ADMIN. Dejanska seja SUPERADMIN ni bila na voljo; ne trdimo, da je ta vloga preverjena.

## Preverjeni podatki in povezave

- Člani: vseh 20 se ujema z `supabase/seed/members.json` po UUID, e-pošti, članstvu, cilju in serijah. Ni podvojenih normaliziranih e-pošt ali primarnih Auth povezav. Prijavi in zaupanja vreden `org_context()` potrjujeta MEMBER in ADMIN.
- Ure: vseh 20 članov ima vseh šest tednov od 14. 9. do 19. 10. Zadnji tedenski zapis pokriva le obdobje do petka 23. 10.; sobotnih/nedeljskih ur nismo domnevali. Dodatni dnevni vnosi so z dne 25. 10. in se ne prekrivajo z uvozom.
- Naloga: zgodovina vsebuje nastanek `todo`, spremembo dodelitve `todo → todo` in zaključek `todo → done`. MEMBER upravičeno vidi le 2 dogodka, ki sta povezana z njegovim članstvom; ADMIN vidi tudi prvotni nastanek brez dodeljenega člana. Analitika kaže 1 dejanski zaključek, ne števila vseh dogodkov.
- Sestanki: Community 5 terminov; Summer School, Grants, Shape Talks, Shapers Tech in Shapers Voice po 10. Razpon 14. 9.–19. 11. 2026. Datumi, trajanje, prehod na zimski čas in vsak nabor udeležencev se ujemajo z ICS. Ni podvojenih Google identitet, ICS UID ali povezav udeležencev.
- Izvorni ICS navaja člane v `DESCRIPTION`; ne vsebuje `ATTENDEE` povabil. To preverjanje ne dokazuje poslanih ali sprejetih Google povabil.
- Attendance vir ima 198 `present`, 22 `remote`, 26 `excused` in 12 `unexcused`; vseh 258 se pravilno poveže z obstoječimi člani in sestanki. Zgodovina pokriva šest tednov. Prihodnji sestanki niso del imenovalca zgodovinske analitike, zapisi neustreznih članov pa ne štejejo v njihove upravičene sestanke.
- Lokalni produkcijski `GET /api/org/snapshot` se za MEMBER in ADMIN ujema z neposrednim branjem vseh 10 podatkovnih tabel iz Supabase. Koda dashboarda uporablja ta snapshot in `analytics()`; seštevek po članih je 1.707,5 h. Vizualni pregled brskalnika in gostujoča namestitev nista bila izvedena.

| Teden od | Izvorne ure |
| --- | ---: |
| 14. 9. 2026 | 317 |
| 21. 9. 2026 | 305,5 |
| 28. 9. 2026 | 305 |
| 5. 10. 2026 | 310,5 |
| 12. 10. 2026 | 266 |
| 19. 10. 2026, do 23. 10. | 201,5 |

| Članstvo | Člani | Ure 14. 9.–25. 10. | Ure tekočega tedna |
| --- | ---: | ---: | ---: |
| GO! | 10 | 213,5 | 21,5 |
| Impact | 7 | 368,5 | 42,5 |
| Core | 3 | 1.125,5 | 139,5 |

## Vloge in omejitve preverjanja

- **MEMBER: PASS za preverjeno sejo.** Vidi svoj profil, 6 tedenskih in 2 dnevna zapisa, svojo zaključeno nalogo, 2 dogodka zgodovine, 2 projekta, 25 pripadajočih sestankov in 17 attendance zapisov. Primerjava z ADMIN pogledom potrdi, da ni tujih zapisov in da lastni zapisi ne manjkajo.
- **ADMIN: PASS za preverjeno sejo.** Vidi vseh 20 članov in celoten podatkovni pregled. `GET /api/org/access` ter `/audit` pravilno vrneta 403 tako za ADMIN kot MEMBER.
- **SUPERADMIN: NOT VERIFIED.** Posredovani sandbox računi niso dokaz seje SUPERADMIN. Vloge nismo spreminjali ali ustvarili računa. Scenarij spodaj zahteva obstoječ, potrjen SUPERADMIN račun.
- **Anonimni dostop: PASS.** Vseh 10 pregledanih organizacijskih tabel zavrne anonimno branje z `42501`. Obstoječi `check-supabase.mjs` dodatno potrdi dosegljiv Auth in zavrnitev anonimnega dostopa do legacy tabel/helperja.
- **Google API: NOT VERIFIED.** Koledarski ID je v nastavitvah baze, vendar lokalno ni Google poverilnic ali strežniškega Supabase ključa. Lokalni API zato pošteno vrne `calendar.configured=false`, `syncReady=false`; shranjeni sestanki so vseeno dostopni po RLS. Sinhronizacije nismo sprožili, ker zapisuje reference v bazo.
- SQL testov, ki vstavljajo začasne uporabnike in podatke, ter obstoječega mutacijskega `check-organization.mjs` nismo zaganjali. Ne sklepamo o vseh trenutno nameščenih RLS definicijah zgolj iz migracij. Preverjen je opisani bralni dostop; obstoječi avtomatizirani testi preverjajo dodatne pogodbe s fixture podatki.

## Konkretna zapisa za pregled lastnika

Noben zapis ni bil spremenjen, izbrisan ali prepisan.

| Attendance ID | Sestanek | Težava |
| --- | --- | --- |
| `58646066-eef1-4d10-80a1-8c73b73a7711` | Shapers Voice, 5. 11. 2026 ob 19:00 CET | `present` pred prihodnjim terminom. |
| `6a681992-1b45-40ae-bece-b9411b489968` | Shapers Tech, 21. 10. 2026 ob 19:00 CEST | Član nima ustrezne serije ali izrecne povezave v `org_meeting_members`. ADMIN sme zapisati izjemo; potrebna je poslovna potrditev, ali je to namerno. |

Pred združitvijo ob 12:00 naj lastnik pregleda ta dva zapisa in projekta »Test«, priskrbi dejanski vir desetih projektov/nalog ter potrdi obstoječo SUPERADMIN sejo. Prepisov in brisanja ne predlagamo kot avtomatski uvoz. Za spremembe produkcijske baze je še vedno potrebno izrecno dovoljenje; ta veja vsebuje samo kodo in dokazila.

## Ponovljiv audit in uvoz

Audit uporablja javni publishable ključ in običajne seje z RLS. Strežniškega ključa ne potrebuje. Gesel ne dodaj v Git ali ukazne argumente. Zasebna JSON datoteka je poljubno poimenovan, ignoriran seznam `{email,password}` obstoječih demo računov. Alternativno zasebno nastavi `DATA_READINESS_MEMBER_TOKEN`, `DATA_READINESS_ADMIN_TOKEN`, `DATA_READINESS_SUPERADMIN_TOKEN`; skripta jih ne izpisuje. Ne uporabljaj service-role tokena kot uporabniške seje.

```bash
node --env-file=.env.local scripts/check-data-readiness.mjs \
  --credentials-file .private/data-readiness-credentials.json \
  --app-origin http://127.0.0.1:3000 \
  --output .private/data-readiness-report.json
```

`--app-origin` je neobvezen: brez njega se preverijo neposredne bralne poizvedbe v bazi, ne dashboard endpoint. Audit naredi le prijavo in branja; ne kliče uvozov, sinhronizacije, provisioning ali mutacijskih API poti. Izhod je agregiran in brez e-pošt, gesel, tokenov ali zasebnih opisov. Exit 1 pomeni ugotovljen FAIL ali NOT VERIFIED, tudi ob manjkajoči zahtevani vlogi; ne pomeni nujno napake skripte. V trenutnem stanju je exit 1 pričakovan.

Pregledani obstoječi uvozniki: `seed-members.mjs`, `provision-users.mjs` in `import-sandbox.mjs`. Prva dva spreminjata članstva/Auth, zato ju v tem pregledu nismo izvedli. Obstoječi sandbox importer podpira projekte, dnevno delo, tedenske ure in attendance; nima uvoza nalog ali dodelitev projektov. Teh podatkov brez izvorne datoteke nismo ustvarili.

`import-sandbox.mjs` je dopolnjen s preflight primerjavo dejanskega cilja:

1. Prebere in validira vse izvorne vrstice ter razreši obstoječe člane/sestanke.
2. Pred prvim zapisom prebere cilj, prepozna nespremenjene ponovitve, odstopanja in dvoumna ujemanja. Spremenjenih zapisov ne prepiše; konflikt ustavi celoten načrt pred pisanjem.
3. Blokira neobstoječe projekte pri dnevnem delu ter prekrivanje dnevnih in tedenskih ur v obeh smereh.
4. Pri projektih opozori tudi na enako normalizirano ime. Pri delu prepozna identične vrstice brez starega `import_key` in ne obnovi izbrisanega vnosa.
5. `--apply` vstavi samo manjkajoče vrstice z obstoječimi determinističnimi ključi in `ignoreDuplicates`; ponovitev istih podatkov ne spremeni starejših zapisov. Delno izveden uvoz po napaki se lahko ponovi. To ni ena skupna transakcija; med preflight in vnosom ostane možnost sočasnih sprememb. Obstoječe DB omejitve in zaščita pred prekrivanjem ostanejo veljavne.

Za uvoz je potreben zasebni strežniški `SUPABASE_SECRET_KEY` po obstoječi pogodbi; v tej seji ga ni. Spodnja ukaza sta samo dry-run in ne zapisujeta:

```bash
node --env-file=.env.local scripts/import-sandbox.mjs \
  --type weekly-hours --file supabase/seed/weekly-hours.json
node --env-file=.env.local scripts/import-sandbox.mjs \
  --type attendance --file supabase/seed/attendance-pending-calendar.json
```

Preflight logika je bila dejansko izvedena nad podatki današnjega ADMIN branja: ure `unchanged=120, toInsert=0, conflicts=0`; attendance `unchanged=258, toInsert=0, conflicts=0`. To je pregled načrta brez pisanja, ne dokaz dvakrat izvedenega strežniškega apply. Ni potrebe po ponovnem uvozu teh dveh virov. Za morebitni nov vir najprej izvedi dry-run; `--apply` uporabi samo po izrecni odobritvi ciljnega okolja in konkretnega načrta.

## Predlog 10-minutne predstavitve

| Čas | Vloga in zaslon | Kaj lahko pokažemo z obstoječimi podatki |
| --- | --- | --- |
| 0:00–1:00 | MEMBER, Pregled | Preverjeni Impact demo član: cilj 10 h, tekoči teden 7,5 h, skupaj 54 h od 14. 9. do 25. 10. |
| 1:00–3:00 | MEMBER, Naloge/Projekti/Zgodovina | Ena lastna zaključena naloga in njeni dejanski dogodki dodelitve/zaključka; 2 dostopna projekta. Pojasni, da so trenutni naslovi testni. Ne obljubljaj večstopenjskega kanbana ali preklapljaj stanj med bralnim demom. |
| 3:00–4:30 | MEMBER, Sestanki/Prisotnost | Community 26. 10. ob 18:00 CET, Summer School 27. 10. ob 18:00 CET, nato lastna zgodovina. To so shranjeni organizacijski sestanki; ne prikazuj jih kot dokaz svežega Google branja. Prihodnjega check-ina ne izvajaj. |
| 4:30–7:00 | ADMIN, Analitika/Člani/Prisotnost | Obdobje 14. 9.–25. 10., vsi projekti: 20 članov, 1.707,5 h, 203,5 h tekoči teden in 1 zaključena naloga. Za izvorno attendance zgodovino uporabi 14. 9.–23. 10. ter serijo Community; dva označena dodatna zapisa obravnavaj ločeno. |
| 7:00–9:00 | SUPERADMIN, Analitika/Projekti — pogojno | Šele po prijavi in potrditvi obstoječe vloge: filtri GO!/Impact/Core s številkami iz zgornje tabele ter pregled 9 dejanskih projektov. Če seja ni pripravljena, te podatke pokaži iz preverjenega ADMIN pogleda in povej, da SUPERADMIN tok ni preverjen. |
| 9:00–10:00 | Povzetek podatkov | Šest tednov ur/prisotnosti, 6 koledarskih serij, ohranjeni podatki in pošten pregled treh odprtih vsebinskih sklopov. Ne predstavljaj 9 projektov kot 10 ali testne naloge kot polnega izvornega task seznama. |

Za zgodovinske tedenske ure izberi celotne tedne in odstrani filter projekta: vir nima dnevne/projektne razdelitve. Aplikacija parcialne agregate in zgodovinske ure brez projekta pri projektnem filtru upravičeno izpusti.

## Validacija in predaja

- 56/56 dejanskih testnih trditev PASS, vključno s 6 novimi testi za audit in varen import preflight; brez izpuščenih testov.
- TypeScript, ESLint in produkcijski Next build PASS. Prvi build v omejenem peskovniku ni mogel zajeti izhoda TypeScript podprocesa; ponovitev z običajnimi dovoljenji podprocesov je uspela brez spremembe konfiguracije.
- Živi Supabase Auth/anonimni smoke, MEMBER/ADMIN branja, lokalni produkcijski snapshot in prepovedani bralni endpointi PASS.
- Ni sprememb podatkov baze, RLS, avtentikacije, leaderboarda, skupnega UI, deployment konfiguracije ali AI funkcij. Prijava v obstoječa demo računa je bila nujna za preverjanje; Auth ponudnik lahko zabeleži prijavne dogodke.
- Codex 1 lahko nadaljuje leaderboard. Codex 2 naj ob integraciji ponovi audit z obstoječo SUPERADMIN sejo in preveri živo Google povezavo v ciljni namestitvi; ne sme sklepati, da to dokazujejo lokalni fixture testi.
