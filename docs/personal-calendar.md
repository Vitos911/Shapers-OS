# Osebni Google koledar

Osnovna Google prijava zahteva samo `openid email profile`. V Pregledu ali Sestankih klikni **Poveži Google koledar** in izberi isti račun kot pri prijavi. Ta ločeni tok pošlje `calendar: true` na `/auth/google` ter zahteva `calendar.events.readonly`, offline dostop in privolitev za glavni (`primary`) koledar. Izbira je vezana na šifrirani PKCE flow; navadna prijava ne zamenja obstoječega koledarskega dovoljenja s profilnim žetonom. Google mora pokazati dovoljenje za branje dogodkov; uporabnik ga mora sam odobriti.

Živi pregled 2026-10-24: produkcijski APP_URL in Supabase Site URL sta usklajena na `https://shapers-os.vercel.app`, produkcijski callback je dovoljen, GOOGLE_CLIENT_ID in skriti GOOGLE_CLIENT_SECRET istega Supabase odjemalca sta nastavljena v Vercel Production. Google je za `vito.bajt@gmail.com` vrnil `403 access_denied`, ker račun ni testni uporabnik. Google Cloud projekt `371443663682` trenutnemu računu zavrne `oauthconfig.testusers.get`, `oauthconfig.verification.get` in `resourcemanager.projects.get`. Lastnik mora v Google Auth Platform → Audience dodati ta račun med Test users ter preveriti Calendar API. To zahteva lastnikov dostop; sama Vercel/Supabase nastavitev omejitve ne odpravi. Živo branje koledarja do takrat ostaja BLOCKED.

## Nastavitev

1. V Google Cloud projektu istega OAuth odjemalca omogoči **Google Calendar API**.
2. Google Auth Platform → Data Access: dodaj `https://www.googleapis.com/auth/calendar.events.readonly`. Ne dodajaj pravic za pisanje. V načinu Testing morajo biti resnični računi med Test users. Za produkcijsko širšo uporabo občutljivega obsega Google lahko zahteva preverjanje aplikacije; refresh tokeni v načinu External/Testing imajo lahko omejeno življenjsko dobo.
3. Supabase Google ponudnik in oba callback naslova ostanejo kot v [google-auth.md](google-auth.md); ni novega callbacka ali spremembe baze.
4. Za samodejno obnovo dodaj **strežniški** `GOOGLE_CLIENT_ID` in `GOOGLE_CLIENT_SECRET` istega odjemalca kot v Supabase v ignorirano `.env.local` in produkcijski secret store; nato ponovno zaženi aplikacijo. Ne uporabljaj NEXT_PUBLIC_ ali Git. Ne uporabljaj skupnega GOOGLE_REFRESH_TOKEN za osebni koledar.
5. Če manjkajo obnovitvene nastavitve, prva seja po privolitvi še vedno deluje. Po približno 50 minutah aplikacija zahteva ponovno povezavo in ne prikaže zastarelih dogodkov kot svežih.

## Prikaz in zasebnost

Pregled in Sestanki samodejno prebereta prihodnjih 90 dni glavnega koledarja (tudi trenutno potekajoče dogodke). Prikažeta čas v Europe/Ljubljana, naslov, lokacijo in povezavo na dogodek/Google Meet. Ponavljajoči dogodki se razširijo v posamezne termine; odpovedani in izrecno zavrnjeni so izločeni. Celodnevni in večdnevni dogodki ohranijo datumski pomen ter izključni končni datum. Sekundarni/deljeni koledarji niso vključeni. Prvih osem vrstic je vidnih takoj, ostale na Pokaži več. Največ 500 dogodkov, ob omejitvi izrecno opozorilo.

Osvežitev ob odprtju, vrnitvi v okno in vsakih pet minut, kadar je stran vidna. Ročni Osveži ne piše v Google. Napaka ni predstavljena kot prazen koledar. Osebni koledar je ločen od skupnega organizacijskega koledarja in udeležbe.

Google access/refresh token ostaneta v ločenem AES-256-GCM šifriranem HttpOnly/SameSite=Lax piškotku; v HTTPS je Secure in __Host-, brez Domain. Veljavnost povezave v tem brskalniku največ 28 dni, ne podaljšuje se ob branju. Vezana je na preverjeni Supabase Auth UUID. Vsak API POST/DELETE preveri isti izvor, Bearer sejo in aktivni org_context/RLS, tudi za SUPERADMIN. Drug uporabnik ali admin ne more uporabiti istega piškotka za branje tujega koledarja. Poljubni user_id/calendar_id se ne sprejemajo; bere se izključno primary za nosilca dovoljenja. Odgovori private/no-store brez Google žetonov; noben dogodek, opis, seznam gostov ali Google poverilnica se ne zapisuje v skupne tabele. Brskalniku se vrnejo samo nujna polja dogodkov.

**Odklopi** odstrani povezavo samo v tem brskalniku. **Odjava** izbriše tudi koledarski piškotek. Ti dejanji ne spreminjata Googlovih dogodkov in ne prekličeta globalnega Google soglasja; tega uporabnik po želji odstrani v nastavitvah Google računa. Začasna napaka omrežja ne zahteva ponovne privolitve; poteklo/preklicano dovoljenje pa jo.

## Preverjanje

Testi pokrivajo PKCE readonly/offline zahtevke, šifriran ločen piškotek, nobenega provider tokena v browser handoffu, vse tri vloge z napačnim UUID, neprijavljene/neodobrene, CSRF, tampering/expiry, paginacijo/ponovitve, celodnevne dogodke, napake/kvote, obnovo/rotacijo, zavrnjen refresh in odklop. To niso žive Google privolitve. Živo osebno branje je potrjeno šele po uporabnikovi novi privolitvi in uspešnem seznamu dogodkov.

Uradni viri: [Google Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [OAuth web server/offline access](https://developers.google.com/identity/protocols/oauth2/web-server), [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
