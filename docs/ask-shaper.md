# Ask Shaper (ShaperAI) MVP

Ask Shaper bere obstoječe organizacijske podatke iz Supabase z uporabnikovo sejo. Diskreten plavajoč gumb odpre samostojno belo-modro modalno ploščo s predlogi vprašanj, stanjem nalaganja, napakami, obdobjem in viri. Globalni CSS je nespremenjen; v `organization-app.tsx` sta dodana samo import in komponenta. Vsako vprašanje je samostojno, brez pošiljanja zgodovine pogovora.

## Nastavitev ponudnika

Na strežniku nastavi `SHAPER_AI_API_KEY` za OpenAI in po želji `SHAPER_AI_MODEL`. Privzeti model je `gpt-4.1-mini`; drug model mora podpirati Chat Completions, `json_schema` Structured Outputs, `temperature: 0` in `max_completion_tokens`. Nova imena v `.env.example` imajo prazne vrednosti. Ključ nima predpone `NEXT_PUBLIC_`, se ne shranjuje v bazo in ga klient ne prejme.

Povezava uporablja pravi endpoint `https://api.openai.com/v1/chat/completions`, brez nove odvisnosti. Manjkajoč ključ vrne 503 z navodilom za nastavitev. Napake, timeout, zavrnitev, prekinjen ali neveljaven odgovor ponudnika vrnejo varno 502 brez izpisa ponudnikovega telesa ali poverilnic. Običajni pogledi aplikacije delujejo neodvisno od asistenta.

## Podprta vprašanja

| Dostop | Primeri |
| --- | --- |
| MEMBER, lastni podatki | Katere naloge imam? Katere moje naloge zamujajo? Koliko ur sem opravil ta teden? Koliko mi še manjka do tedenskega cilja? Kdaj imam naslednji sestanek? Kakšna je moja prisotnost? |
| ADMIN / SUPERADMIN | Koliko ur je Član Ime opravil prejšnji teden? Kateri člani zaostajajo za tedenskim ciljem? Katere naloge zamujajo? Koliko nalog je bilo zaključenih prejšnji teden? Kakšna je bila udeležba na seriji Shape Talks? Kateri projekti imajo odprte naloge? |

Imenovani član zahteva enolično, polno ime; ni ugibanja podobnih imen. Podprti so trenutni/prejšnji teden, zadnjih šest tednov in izrecni ISO datumski intervali do 93 dni. Privzeto obdobje je trenutni teden, pri prisotnosti zadnjih šest tednov. Tedenski cilj in zaostanek vedno uporabljata trenutni teden. Naloge/projekti so trenutno stanje, ne zgodovinski backlog. Seznami pokažejo največ 20 postavk s celotnim številom rezultatov. Ob preveč podatkih se odgovor zavrne in zahteva ožje obdobje; agregati niso izračunani iz odrezanega vzorca.

Naslednji sestanek je prvi prihodnji relevantni **organizacijski** sestanek v shranjenih podatkih za približno 90 dni. Upošteva serijo in izrecno članstvo tudi pri administratorjevem osebnem vprašanju. Prikazana je zadnja sinhronizacija. Osebni Google Calendar, prosti SQL, spremembe podatkov, upravljanje pravic in več različnih tem v eni zahtevi niso podprti.

## Varnost in zanesljivi izračuni

1. `POST /api/ask-shaper` pri vsaki zahtevi kliče obstoječi `getCurrentUser()` in preveri obstoječe dovoljene vloge. Ne uporablja service-role klienta ali novega sistema vlog. Telo je omejeno pri branju na obstoječih 20.000 bajtov; sprejme samo `question` z 1–1000 znaki.
2. Prvi AI klic prejme samo vprašanje in datum v Ljubljani. Vrne strogo preverjen načrt iz končnega seznama namenov, obsegov, obdobij in serij. Ne vrača SQL, imen tabel ali identifikatorjev članov. Načrt ni avtoriteta za dostop: MEMBER-jev organizacijski ali tuji obseg je na strežniku zavrnjen s 403 pred poizvedbami.
3. Strežnik izvaja samo vnaprej napisane SELECT recepte s klientom iz preverjene uporabniške seje. RLS ostane druga zaščitna meja; MEMBER recepti dodatno izrecno filtrirajo lastni `member_id` oziroma `assignee_id`. Berejo se samo potrebne tabele in stolpci, z največ 5.000 vrsticami na recept in urejeno paginacijo. Ni migracij ali pisanja v podatkovne tabele.
4. Meritve uporabljajo `analytics()` in pravila iz `docs/backend-security.md`: različni zaključeni task ID-ji iz shranjenih prehodov, nednevno razdeljeni zgodovinski seštevki samo ob celotni pokritosti intervala, izključene izbrisane ure, Ljubljana/ponedeljek, present+remote nad eligible−excused, manjkajoča prisotnost kot odsotnost, brez izmišljene odstotne vrednosti pri ničelnem imenovalcu. Dodan neobvezen časovni argument v `analytics()` ohranja obstoječo privzeto semantiko in omogoča ponovljive teste.
5. Drugi AI klic prejme samo omejen nabor pripravljenih dokaznih stavkov, obdobje in imena virov. Ne prejme surovih vrstic, opisov, e-pošte, UUID-jev, sej, tokenov, ključev ali zgodovine. Imena/naslovi v teh stavkih so podatki, ne navodila. Model lahko izbere samo enega od dveh fiksnih uvodov in mora vrniti točno vse dokazne ID-je. Vse ostalo se zavrne. Dejanski stavki in številke se vedno vrnejo iz strežniškega izračuna; model jih ne more prepisati ali dopolniti s prostim besedilom.
6. UI prikazuje navadno React besedilo, brez HTML/Markdown izvajanja. Native dialog zagotavlja modalno upravljanje fokusa in Escape; gumbi, polja, statusi ter napake imajo dostopne oznake. Mobilni slog je izoliran v CSS modulu. Zapiranje prekliče brskalniško zahtevo. Odgovori API so `no-store`, brez shranjevanja pogovorov v bazo ali logiranja vprašanj.

## Omejitve porabe

Največ dva plačljiva klica na vprašanje, največ 300 izhodnih tokenov na klic, 15 sekund na klic, brez samodejnih ponovitev in brez orodij modela. Vhod omejujejo dolžina vprašanja, fiksna navodila in največ 20 skrajšanih dokaznih postavk. Kvote se rezervirajo pred plačljivim klicem, tudi pri napakah: 6 vprašanj/minuto in 60/dan na uporabnika ter 1.000/dan na proces. 429 vsebuje `Retry-After`.

**Omejitev MVP:** kvote so v pomnilniku posameznega procesa in se ob restartu ponastavijo; več instanc jih ne deli. Zato niso trda organizacijska denarna omejitev v porazdeljeni/serverless produkciji. Pred takim zagonom nastavi ločen OpenAI projekt z ustreznimi ponudnikovimi omejitvami porabe ter po potrebi skupni števec na prehodu. Dodatna infrastruktura ali tabela za kvote v tem MVP ni uvedena. Strošek je odvisen od izbranega modela.

## Preverjanje v tem okolju

- `pnpm test`: ukaz uspe. Ker okolje blokira nekatere podprocese, so vse testne datoteke zagnane tudi neposredno z `node --experimental-strip-types tests/<datoteka>.test.mjs`: **70 posameznih testov uspe**, vključno z 20 novimi testi Ask Shaper.
- `pnpm typecheck`: uspe. `pnpm lint`: uspe brez opozoril.
- Običajni `pnpm build` prevede aplikacijo, a ga to okolje ustavi pri podprocesu TypeScript CLI: `Could not parse output from TypeScript's --showConfig`. Izolirana diagnostika pokaže blokiran `spawnSync` (EPERM) in prazen stdout asinhronega otroškega procesa.
- Produkcijski build z začasnim uradno podprtim `experimental.useTypeScriptCli: false` uspe, vključno s preverjanjem tipov in vsemi potmi. Izvirni `next.config.ts` se nato obnovi; ta lokalni obvod ni del sprememb.
- Testi uporabljajo pravi Supabase JS/PostgREST klient z nadomeščenim HTTP transportom ter nadomeščen transport OpenAI. Pokrivajo vse tri vloge, tuje/organizacijske zavrnitve, resnični `getCurrentUser()` za neveljavne/nepotrjene/preklicane dostope, 401/403, odsoten ključ, validacijo telesa, izračune, zgodovino zaključkov, DST, upravičenost do sestankov, ničelni imenovalec, prompt injection, zavrnjene izmišljene odgovore, napake ponudnika/baze, zgornjo mejo podatkov in kvote.
- Lokalni HTTP smoke in vizualni pregled sta blokirana: `next start` ne more odpreti niti `0.0.0.0:3100` niti `127.0.0.1:3100` (`listen EPERM`). Strežnik zato ni ostal zagnan.
- Ključ OpenAI v okolju ni nastavljen: **živi AI klic ni preverjen**. Živo branje z računi MEMBER/ADMIN in dejanski Supabase RLS v tej nalogi nista izvedena; dokaz zanju niso fixtures. Produkcijska baza ni spremenjena, migracije niso zagnane, koda ni združena v main in produkcijska objava ni sprožena. Vizualni pregled v pravem brskalniku ni izveden.
