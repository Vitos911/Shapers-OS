# Verification record — 2026-10-24

2026-10-25 attendance update: [the historical import report](attendance-import.md) supersedes earlier pending-attendance statements below. All 258 source records are now stored. MEMBER/ADMIN local production browser and API checks, SUPERADMIN SQL/RLS checks, and regression checks passed; real SUPERADMIN browser login and hosted deployment remain untested in this task.

## Member Dashboard — feature/dashboard-tasks

Dashboard implemented from the owner's Claude Design ZIP as modular React components with scoped glass/blue styling, self-hosted Inter, personal weekly progress, own-task completion, organizational meetings/attendance, working quick links and accessible mobile navigation. Existing auth, API/RLS, schema, historical-hour calculations and legacy are preserved. Full scope and reproducible checks: [member-dashboard.md](member-dashboard.md).

54/54 source tests, TypeScript, lint and production build PASS. Local production browser checks PASS for actual MEMBER and ADMIN login, personal snapshot/hours, refresh/reload, quick links, work-editor opening and 390/768/1440px layouts without horizontal overflow. Mobile focus containment, Escape and focus restoration PASS. Separate intercepted browser checks PASS for task success/403, post-write read failure without false success, hours submission/reread/reload, meeting attendance, empty calendar and initial-load retry. Those test-only mutations never reach Supabase.

NOT VERIFIED: live task/work persistence and mutation RLS; shared Google events (unconfigured); hosted Preview/Production login; independent B review. Existing personal Calendar locally reports missing/invalid APP_URL; no auth/configuration change was made. No database writes/deletes, main merge or Production deployment were performed.

## Google login follow-up

Google OAuth was added with server PKCE, encrypted short-lived HttpOnly state/handoff cookies, same-origin POST protection, callback validation and the existing browser session model. 40/40 automated tests passed; both organization_rls.sql and google_auth_rls.sql passed against the live sandbox in rollback transactions. The owner explicitly approved their verified real account for SUPERADMIN in this follow-up (not an automatic signup promotion). No real sandbox-profile aliases were applied. All 20 original UUIDs/primary Auth links and 120 weekly totals remain unchanged.

Production build, TypeScript and lint passed. Production HTTP checks verified missing-provider 503, CSRF 403, invalid-callback 303 recovery and cookie clearing, missing-handoff denial, logout cleanup and unauthenticated API 401. Actual MEMBER/ADMIN password/API regression smoke passed with fixture cleanup. Browser checks observed an existing session survive reload, logout return to the new Google/email/demo login screen, an actionable Google-not-configured message, and invalid-callback recovery. A missing local APP_URL initially caused a setup failure because the Next server binds to 0.0.0.0; setting the exact localhost origin and restarting resolved it. This did not bypass origin validation. Secret scans found neither the Supabase secret nor OAuth cookie key in 76 source files or 13 browser chunks.

Migration `20261024115149_google_demo_profile_links` adds service-only explicit alias approval/removal and replaces only access.member_id uniqueness with an index; no public RLS access policy was relaxed. The first migration attempt had a CASE-expression syntax error, was rolled back and was corrected before successful application. Google Auth remains disabled, so successful live Google login/production callback is NOT VERIFIED. Setup and the exact callback/credential distinction are in [google-auth.md](google-auth.md).

This records observed evidence, not a blanket “everything complete” claim. See README for repository/build checks and the source tests for exact assertions.

## Database and imports

- Applied organization backend, provisioning, historical-weekly-hours and policy/index refinement migrations on `xdzofggamwoywxwdduio`; restored its already-applied members migration to Git. Original three JSON workspace migrations and two existing workspaces preserved.
- All 20 original member UUIDs preserved (sorted-ID digest `5938eaa1b582c5eb8e87a625f78dc66b`), tiers, targets and series unchanged. All 20 now linked to Auth; provisioning twice creates no duplicate accounts and does not rotate passwords.
- Trusted access: 3 sandbox ADMIN, 17 MEMBER, plus 3 explicitly owner-approved real SUPERADMIN access entries pending their own verified-email login. No extra fake organization member created. Real operator sign-in/invitations not exercised.
- Imported 120 weekly totals, 1,705.5 h; repeated import retained exactly the same count/sum. The final week is covered through 2026-10-23, not invented Saturday/Sunday hours.
- The supplied [hours source](https://docs.google.com/spreadsheets/d/1qqtvH5Qxxo1gEmlwpp6dhXuOBIsbWt-c6vgup_dFr44/edit) and [attendance source](https://docs.google.com/spreadsheets/d/1mSLkOloUM1iPtcdudR-_yCst1dDEtznBonaYlmVbWTI/edit) were read only, never edited. 258 attendance records are saved as pending source; zero imported attendance/Google references until a real calendar can be read.
- 55 source ICS events preserved and checked for unique UIDs, duration and Ljubljana DST switch. No Google writes performed. Ten named projects were unavailable; production project/task lists remain genuinely empty until users add data.

## Automated coverage

- `pnpm test`: model/storage regression tests, auth/role helpers, strict input/body limits, hour/import accounting, history-based analytics, attendance windows, Google pagination/recurrence/DST/error/empty cases, source ICS consistency.
- `supabase/tests/organization_rls.sql`: executed against the live sandbox in a rollback transaction. MEMBER/ADMIN/SUPERADMIN boundaries, spoofed metadata/email, escalation rejection, task transitions/history, ownership, quarter-hour constraints, attendance windows/duplicates/correction, access disabling and anonymous rejection. Fixtures leave no persistent users or application records.
- `scripts/check-organization.mjs`: actual Supabase password sign-ins for MEMBER/ADMIN → local Next API → Postgres → refreshed response. Project/task creation, assignment, done history, hour create/edit/reload, role denial and imported-period overlap denial. Temporary rows cleaned by exact per-run IDs; source/imported data retained.
- 31/31 automated tests passed, zero skipped or failed. The suite covers public config credential isolation, private OAuth refresh and signed readonly service-account assertions in addition to API-key fixtures. TypeScript, lint (zero warnings), production build and dependency peer check passed. Production API smoke checks passed again after the final build; disposable test records were removed. A Windows sandbox EPERM during pnpm's project-link creation required a rerun with normal host permissions; that rerun passed. CI intentionally builds without secrets. Fixtures verify Google request behavior, not live Google authorization.
- Secret scan checked 64 source files and 11 browser build chunks: no actual server-key occurrence or private credential pattern found. `.env.local`, `.private/` and the unrelated nested clone are ignored; only the safe `.env.example` template is tracked.

Applied version sequence (first four pre-existing; final four added during this task): `20261024083823`, `20261024084128`, `20261024084522`, `20261024090853`, `20261024093558`, `20261024094543`, `20261024095435`, `20261024101422`. All migration files are versioned, including the previously remote-only members migration.

## Browser and remaining boundaries

Production localhost was opened in the in-app browser. Actual sandbox ADMIN login, logout and database-backed overview/analytics were observed: 20 members, 201.5 current-week hours, cohort/hour details from Supabase. Actual MEMBER login shows only that member's six weekly totals (53 h), no organization analytics navigation, and explicit Google setup state. A previous temporary connection-refused tab was replaced after the production server was confirmed healthy; no browser security or firewall bypass was used. A 390px viewport was not separately automated with the available browser interface.

Not yet established by those checks: authenticated real SUPERADMIN browser workflow; live Google request; historical attendance import; separate fresh/empty Supabase project; latest hosted Codespace deployment. The existing private Codespace requires its owner's GitHub login and server env update; a main-branch push alone is not deployment verification. Keep these NOT VERIFIED until actually exercised. Local test accounts/SQL fixtures do not prove real SMTP delivery.

## Osebni Google koledar — 2026-10-24

Dodana avtomatska readonly/offline povezava ob naslednji Google prijavi ter kartica v Pregledu in Sestankih. Brez spremembe sheme baze ali skupnega koledarja. Osebni provider tokeni so ločeni od Supabase browser session in šifrirani v HttpOnly piškotku, vezanem na Auth UUID.

Preverjeno: vseh 50 testov PASS, lint brez opozoril, TypeScript v produkcijskem build PASS. Novi testi pokrivajo vse tri vloge za zavrnitev tujega UUID, manjkajoče/neodobrene seje, CSRF, tampering/expiry, readonly primary GET, paginacijo, recurrence expansion, časovne meje, decline/cancel, celodnevni exclusive end, minimalen odgovor brez opisov/gostov/tokenov, obnovo/rotacijo, preklic, kvote in odklop. Google transport je v teh testih nadomeščen — to ni dokaz žive Google privolitve.

Lokalni produkcijski HTTP: dejanska Supabase MEMBER/ADMIN prijava → API vrne connected=false brez piškotka, brez izmišljenih dogodkov. Brez Bearer 401, tuj Origin 403. Dejanski OAuth začetek 200 z calendar.events.readonly in access_type=offline. V brskalniku uspešna obstoječa demo prijava in vidna nova kartica/privolitev; prikaz pri mobilni širini brez vodoravnega prelivanja.

Meja živega preizkusa: trenutna stara prijava še nima koledarskega dovoljenja; uporabnik mora sam odobriti novo Google privolitev. Enable Google Calendar API in readonly scope v istem Google Cloud projektu po potrebi. GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ob preverjanju nista bila nastavljena za server-side refresh; začetno branje po privolitvi je neodvisno od tega, po izteku pa je brez konfiguracije potreben reconnect. Živ seznam osebnih dogodkov in produkcijska domena ostajata NOT VERIFIED.
