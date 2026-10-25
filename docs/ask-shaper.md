# Ask Shaper (ShaperAI) MVP

Ask Shaper bere obstoječe organizacijske podatke iz Supabase z uporabnikovo sejo. Diskreten plavajoč gumb odpre samostojno belo-modro modalno ploščo s predlogi vprašanj, stanjem nalaganja, napakami, obdobjem in viri. Globalni CSS je nespremenjen; v `organization-app.tsx` sta dodana samo import in komponenta. Vsako vprašanje je samostojno, brez pošiljanja zgodovine pogovora.

## Nastavitev ponudnika

Na strežniku nastavi skrivnost `SHAPER_AI_API_KEY` in izberi `SHAPER_AI_PROVIDER`: `groq` ali `openai`. Za Groq je podprt tudi običajni `GROQ_API_KEY`, kadar skupni ključ ni nastavljen. Če ponudnik ni izbran, Groq prepoznamo po `GROQ_API_KEY` ali predponi ključa; ostane združljivost s prejšnjo OpenAI nastavitvijo. Izrecno neusklajen ponudnik/ključ je zavrnjen pred omrežnim klicem, brez pošiljanja ključa drugemu ponudniku.

| Ponudnik | Privzeti model | Fiksni endpoint |
| --- | --- | --- |
| Groq | `openai/gpt-oss-20b` | `https://api.groq.com/openai/v1/chat/completions` |
| OpenAI | `gpt-4.1-mini` | `https://api.openai.com/v1/chat/completions` |

`SHAPER_AI_MODEL` je neobvezen. Izbrani model mora podpirati Chat Completions in strogi `json_schema`; pri Groq sta privzeti GPT-OSS 20B in preizkušena konfiguracija GPT-OSS 120B podprta z `reasoning_effort: low` in `include_reasoning: false`. Groq ne prejme nepodprtega polja `store`; OpenAI še naprej prejme `store: false`. Endpointov ni mogoče nadomestiti s poljubnim URL-jem. Glej [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs) in [Groq API Reference](https://console.groq.com/docs/api-reference).

Nova imena v `.env.example` imajo prazne vrednosti. Ključ nima predpone `NEXT_PUBLIC_`, se ne shranjuje v bazo in ga klient ne prejme. Za lokalni demo je nastavljen samo v ignorirani `.env.local` z dovoljenji 600; ni del commita ali PR. Objavljen demo potrebuje isto skrivnost v svojem strežniškem okolju in ponoven zagon/preview build. Lokalna konfiguracija se ne prenese na Netlify ali drugo gostovanje.

Manjkajoč ključ vrne 503 z navodilom za nastavitev. Napake, timeout, zavrnitev, prekinjen ali neveljaven odgovor ponudnika vrnejo varno 502 brez izpisa ponudnikovega telesa ali poverilnic. Običajni pogledi aplikacije delujejo neodvisno od asistenta.

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
4. Meritve uporabljajo `analytics()` in pravila iz `docs/backend-security.md`: različni zaključeni task ID-ji iz shranjenih prehodov, nednevno razdeljeni zgodovinski seštevki samo ob celotni pokritosti intervala, izključene izbrisane ure, Ljubljana/ponedeljek, (present+remote)/(present+remote+unexcused), manjkajoča prisotnost kot neznana udeležba, brez izmišljene odstotne vrednosti pri ničelnem imenovalcu. Dodan neobvezen časovni argument v `analytics()` ohranja obstoječo privzeto semantiko in omogoča ponovljive teste.
5. Drugi AI klic prejme samo omejen nabor pripravljenih dokaznih stavkov, obdobje in imena virov. Ne prejme surovih vrstic, opisov, e-pošte, UUID-jev, sej, tokenov, ključev ali zgodovine. Imena/naslovi v teh stavkih so podatki, ne navodila. Model lahko izbere samo enega od dveh fiksnih uvodov in mora vrniti točno vse dokazne ID-je. Vse ostalo se zavrne. Dejanski stavki in številke se vedno vrnejo iz strežniškega izračuna; model jih ne more prepisati ali dopolniti s prostim besedilom.
6. UI prikazuje navadno React besedilo, brez HTML/Markdown izvajanja. Native dialog zagotavlja modalno upravljanje fokusa in Escape; gumbi, polja, statusi ter napake imajo dostopne oznake. Mobilni slog je izoliran v CSS modulu. Zapiranje prekliče brskalniško zahtevo. Odgovori API so `no-store`, brez shranjevanja pogovorov v bazo ali logiranja vprašanj.

## Omejitve porabe

Največ dva plačljiva klica na vprašanje, največ 300 izhodnih tokenov na OpenAI klic oziroma 768 na Groq klic (vključno z razmišljanjem), 15 sekund na klic, brez samodejnih ponovitev in brez orodij modela. Vhod omejujejo dolžina vprašanja, fiksna navodila in največ 20 skrajšanih dokaznih postavk. Kvote se rezervirajo pred plačljivim klicem, tudi pri napakah: 6 vprašanj/minuto in 60/dan na uporabnika ter 1.000/dan za celotno aplikacijo. 429 vsebuje `Retry-After`.

Kvote rezervira uporabniški Supabase RPC `org_reserve_ai_budget()` pred prvim plačljivim klicem. Migracija `20261025102948_shared_ai_budget.sql` hrani zasebne števce, rezervacija vseh treh omejitev je atomarna in skupna vsem instancam ter restartom. Dan se zaključi ob polnoči UTC; minute so strežniške. Uporabnik ne more izbrati identitete, brati ali ponastaviti števcev. Ob manjkajoči migraciji se AI ustavi s 503. Testni dependency injection za lokalne teste ostane ločen od produkcijske poti. Ponudnikova denarna omejitev ostaja priporočena, saj je cena odvisna od modela.

## Preverjanje v tem okolju

- `pnpm test`, `pnpm typecheck` in `pnpm lint` uspejo. Vse testne datoteke so zagnane tudi neposredno: **77 posameznih testov uspe**, vključno s 27 testi Ask Shaper. Sedem dodatnih Groq preverja endpoint, strogo shemo, token cap, združljive parametre, prepoznavo ponudnika/alias, neusklajeno konfiguracijo, izolacijo MEMBER, izmišljene rezultate, izbiro modela in varno obravnavo napak.
- Običajni `pnpm build` je uspešen s privzeto konfiguracijo Next.js in polnim preverjanjem tipov. Omrežno dovoljenje izvajalnega okolja je razrešilo prvotni lokalni EPERM; v `next.config.ts` ni obvoda. Prvotni OpenAI commit je uspešno prestal tudi GitHub Actions Build and test #17.
- **Živi Groq je preverjen** z demo ključem: šest vprašanj, oba strukturirana AI koraka, HTTP 200 in pravilni slovenski odgovori. Primeri: 2,5 opravljenih ur, 1,5 h do cilja, zamujena DEMO naloga, prazen imenovalec prisotnosti, 3 h imenovanega člana prejšnji teden in organizacijski zaostanki. Podatki so bili izrecno sintetične fixtures, ne dejanski organizacijski rezultati. Ključ, surovi odgovori z razmišljanjem in občutljivi podatki niso shranjeni v poročilu ali repozitoriju.
- Lokalni produkcijski strežnik se uspešno zažene. HTTP smoke potrdi `/` 200, `/api/health` 200 ter neprijavljen `POST /api/ask-shaper` 401. Vizualni pregled v brskalniku še ni izveden.
- Testi uporabljajo pravi Supabase JS/PostgREST klient z nadomeščenim HTTP transportom. Živo branje z računi MEMBER/ADMIN in dejanski PostgreSQL RLS še nista preverjena. Živi OpenAI klic ni izveden; Groq je izbrani demo ponudnik.
- Produkcijska baza ni spremenjena, migracije niso zagnane, koda ni združena v main in produkcijska objava ni sprožena. Nastavitev ključa na objavljenem demo gostovanju ostaja ločena od lokalne `.env.local`.
