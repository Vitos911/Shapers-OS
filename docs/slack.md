# Minimalna strežniška Slack povezava

Veja: `feature/slack-integration`. Servis je ločen od koledarja, dashboardov in podatkovnega modela. Ni samodejnih obvestil, sprememb Supabase ali novega načina prijave.

## Nastavitev

V strežniškem okolju nastavi:

```dotenv
SLACK_BOT_TOKEN=
SLACK_CHANNEL_ID=
SLACK_TEST_ENABLED=false
```

Uporabi bot token `xoxb-…`, pravico **chat:write** ter ID obstoječega kanala `C…` oziroma zasebnega kanala `G…`. Bota povabi v ta kanal. Servis ne potrebuje `chat:write.public` ali branja seznamov kanalov. Ključa ne daj v Git, `NEXT_PUBLIC_`, zahtevo iz brskalnika ali dnevnike. `.env.local` ostane ignoriran.

Brez obeh nastavitev se glavni del aplikacije normalno zažene; Slack se ne inicializira z omrežnim klicem. Izrecen klic nenastavljenega Slacka vrne `503/not_configured`, nikoli lažnega uspeha.

## Servis

Strežniška koda uvaža samo `lib/slack/index.ts`, ki ima oznako `server-only`:

```ts
import { slack } from "@/lib/slack";

await slack.checkConnection();
await slack.sendMessage("Kratko besedilo za nastavljeni kanal.");
```

Uporabljena sta uradna Slack Web API endpointa [auth.test](https://docs.slack.dev/reference/methods/auth.test/) in [chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/), prek standardnega strežniškega `fetch`. Dodatnega SDK ali integracije v infrastrukturi ni. Bot token se pošlje izključno v Authorization glavi na `https://slack.com/api/…`; preusmeritve so prepovedane. Klic ima omejitev 8 sekund, odgovori se ne predpomnijo in ni samodejnega ponavljanja.

`checkConnection()` preveri bot identiteto. To samo po sebi ne potrjuje članstva ali pravic pisanja v kanal. `sendMessage()` zahteva neprazno besedilo do 4000 znakov; kanal je vedno strežniški `SLACK_CHANNEL_ID`. Besedilo se pošlje brez Slack markupa, posebni znaki so ubežani, predogledi povezav so izključeni.

Uspeh se vrne šele po veljavnem Slack odgovoru `ok:true`, pri pošiljanju tudi po pričakovanem kanalu in časovni oznaki sporočila. HTTP 200 z `ok:false` je napaka. Napake tokena, pravic/kanala, 429 in nedosegljivost imajo varne kode; surovi provider odgovori, tokeni in izjeme se ne vračajo ali izpisujejo. Za 429 se prenese preverjeni `Retry-After` ([Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/)). Če pri pošiljanju poteče čas ali je odgovor neveljaven, je dostava **nepotrjena**: pred ponovnim poskusom preveri kanal, saj bi Slack sporočilo lahko že prejel.

## Zaščiten ročni preizkus

`GET /api/slack/test` preveri povezavo brez pošiljanja. `POST /api/slack/test` pošlje natanko eno vnaprej določeno testno sporočilo v nastavljeni kanal. Oba uporabljata obstoječi `requireAuth` in zahtevata **SUPERADMIN**. Member, Admin, anonimni, neveljavni ali onemogočeni računi nimajo dostopa. Obstoječe avtentikacijske datoteke se ne spreminjajo.

POST dodatno zahteva:

- izrecen strežniški `SLACK_TEST_ENABLED=true`;
- veljaven `APP_URL` in točno enak Origin, brez cross-site zahteve;
- `Content-Type: application/json`;
- samo telo `{"confirm":"send-test-message"}`; poljubno besedilo, kanal, token ali druga polja so zavrnjena.

Primer s sejnim **Supabase** access tokenom že prijavljenega Superadmina, nikoli Slack tokenom:

```bash
curl "$APP_URL/api/slack/test" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

# To dejansko pošlje fiksno testno sporočilo; sproži samo namenoma.
curl -X POST "$APP_URL/api/slack/test" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Origin: $APP_URL" \
  -H "Content-Type: application/json" \
  --data '{"confirm":"send-test-message"}'
```

Ne shranjuj access tokena v Git ali zgodovino ukazov; uporabi varno trenutno okolje. Po preizkusu vrni `SLACK_TEST_ENABLED=false`. Testno sporočilo ne vsebuje imen, e-pošte, projektnih podatkov ali koledarja.

Ponovitve testnega POST so omejene na en poskus na minuto znotraj posamezne strežniške instance, tudi po nepotrjeni dostavi. To je zaščita pred dvojnim klikom, ne porazdeljeni rate limiter: cold start/več instanc nimata skupnega stanja. Slackov 429 ostane avtoritativen; ni tihega retryja ali obljube dostave exactly-once.

## Preverjanje

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`tests/slack.test.mjs` uporablja izolirane protokolne fixture odgovore za pozitivne in negativne scenarije, avtorizacijo, redakcijo napak in ponovitve. Ti niso runtime mock, nadomestilo za nenastavljeni Slack ali dokaz žive dostave. Živo povezavo in sporočilo je treba preveriti z zgornjim zaščitenim postopkom in dejanskim botom. Brez nastavljenih poverilnic tega ni dovoljeno označiti kot opravljeno.
