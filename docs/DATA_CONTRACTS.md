# Workspace API contracts (WemryOS upgrade)

The dated contracts below describe the original single-organization release. The upgrade extends them without renaming endpoints or existing table identifiers. See [the migration and verification guide](wemryos-upgrade.md).

- Every organization API, AI request and personal-calendar authorization receives the selected `x-workspace-id` UUID. This is a selector, never authorization. The server verifies Auth `getUser()` and database `org_context()`; database membership and restrictive RLS independently constrain access.
- An absent scope retains compatibility with Global Shapers (`00000000-0000-4000-8000-000000000001`). New interfaces always provide scope. Workspace content is remounted when selection changes.
- `GET /api/workspaces` lists verified memberships. `POST` creates workspaces or executes allowlisted invitation, membership, group, privacy and ownership commands. Invitations are email-bound links, not automatically sent messages.
- Roles are OWNER / ADMIN / MEMBER per workspace. Existing SUPERADMIN is preserved for the Global Shapers platform administration surface; it grants no access to another workspace.
- Members can create projects; `created_by` is server-owned. A project creator automatically joins it and can edit it and manage its roster and join requests. Open/approval/closed reuse the existing membership workflow.
- Members can create tasks in accessible projects and edit tasks they created or are assigned; project owners and workspace administrators have broader rights. New workspace assignments require project membership. Legacy administrator assignment behavior is preserved for Global Shapers.
- Task statuses and priorities are unchanged. Compare-and-swap, authoritative completion timestamps, immutable task/audit history and conditional task claims remain enforced. Member-created tasks do not create leaderboard credit.
- Membership groups are configurable labels and targets, separate from permission roles. `members.weekly_hours` remains authoritative; 0 disables the hour requirement. Historical aggregates and finalized scores are not rewritten.
- `POST /api/workspaces/presence` manages a per-tab, server-timed connection lease and returns only the active workspace's minimal roster. Polls every 30 seconds; five minutes without interaction is idle; leases expire after 90 seconds. A failed read is unknown. Privacy suppression removes every lease for the member and returns unknown across all readers. Presence is not work activity.
- `GET /api/org/workspace-settings` returns membership groups and feature settings. `workspaceDirectory` exposes only names, identifiers and workspace roles; it does not broaden personal hours/email access.

---

# Skupne podatkovne pogodbe

Vir tipov je obstoječi `lib/organization.ts`: `Identity`, `Snapshot`, `WorkSession`, `WorkState`, `OrgMember`, `OrgProject`, `OrgTask`, `WorkEntry`, `WeeklyHours`, `Meeting`, `Attendance`, `TaskHistory`. Ne ustvarjaj konkurenčnega modela v UI. Validacijo določa `lib/org-validation.ts`, končne pravice in omejitve pa aktualna Supabase shema/RLS/triggerji. Tipizacija sama ni varnostna meja.

## Obstoječi API

Vse `/api/org/*` zahteve imajo `Authorization: Bearer <Supabase access token>`. Strežnik preveri `getUser()` in `org_context()` ter uporabi uporabniški Supabase klient. `GET snapshot` vrača `Snapshot`, filtriran z RLS. Običajen MEMBER zato ne dobi seznama vseh članov za samostojno dodeljevanje.

| Vir | Metode in podatki | Dostop |
| --- | --- | --- |
| `snapshot` | GET: identity, members, projects, tasks, work, weeklyHours, meetings, attendance, history, projectMembers, taskDirectory, meetingMembers, settings, calendar | Aktivni potrjeni organizacijski uporabnik; RLS |
| `projects` | POST/PATCH: name, description, status; PATCH z id | ADMIN/SUPERADMIN |
| `tasks` | POST/PATCH: project_id, title, description, assignee_id, status, priority, due_date; PATCH id/archived v dovoljenem obsegu in obvezni expected_updated_at | Ustvarjanje ADMIN; trenutni izvajalec status/opis/prioriteta/rok ter dodelitev članu istega projekta |
| `project-members` | POST: project_id, member_id; `remove: true` za odstranitev članstva | ADMIN/SUPERADMIN |
| `work-timer` | GET: server_now, sessions, work (trajni + začasni dnevni zapisi). POST: action=start/pause/resume/stop, session_id; start project_id/description, ostali expected_version | Aktivni povezan član, samo lastna seja; strežniški čas, varen RPC |
| `work` | POST/PATCH: member_id, date, hours, description, project_id, reason; PATCH id, expected_updated_at in deleted | Samo ADMIN/SUPERADMIN; poln popravek dnevnega zapisa z razlogom, RLS/varen RPC |
| `work-audit` | GET: zadnjih 100 sprememb org_work_entries, reason v new_data.adjustment_reason | ADMIN/SUPERADMIN; nespremenljiva org_audit sled |
| `attendance` | POST/PATCH: meeting_id, member_id, status, note; PATCH id | Lastni present/remote v oknu; ADMIN tudi excused/unexcused/popravki |
| `calendar` | POST: samo from/to (YYYY-MM-DD); server prebere Google in shrani reference | ADMIN/SUPERADMIN pred privilegiranim delom; Google izključno GET |
| `profile` | PATCH: name | Lastni profil |
| `settings` | PATCH: name, calendar_id | SUPERADMIN |
| `access`, `audit`, `invite` | GET access/audit; PATCH access; POST invite za že odobren naslov | SUPERADMIN; vabila so zunanja komunikacija in niso del avtomatskega testa |

Tabelni seznam je orientacija po obstoječi poti; točne allowliste preveri v `fields()` pred spremembo. Ne dodajaj uporabniških owner/role/timestamp polj, ki jih backend ne sprejme. Ustvarjanje praviloma vrne 201, sprememba 200; napaka `{ error: string }` z ustreznim HTTP statusom (400/401/403/404/409/413/503). Organizacijski odgovori imajo `Cache-Control: no-store`. UI uspeh prikaže šele po potrjeni mutaciji in uspešnem ponovnem branju; ne prikriva napake z lokalno kopijo.

## Invariante

- Naloga: `backlog`, `todo`, `in_progress`, `done`; prioriteta `low`, `medium`, `high`, `urgent`. Zaključek in zgodovino določi baza. Ne dodajaj lastnega `completed_at` iz brskalnika.
- `members.weekly_hours` je avtoritativni cilj posameznika, ne hardcoded lookup po imenu. `org_weekly_hours` so zgodovinski agregati s pokritostjo, ne dnevni vnosi. Ne razbijaj jih na izmišljene dneve in ne podvajaj z dnevnimi vnosi v pokritem obdobju.
- Datum dneva je YYYY-MM-DD, časovni trenutki so ISO z offsetom; teden se začne v ponedeljek v Europe/Ljubljana. DST 25. 10. ni UTC polnoč in ni vedno 24-urni dan.
- Prisotnost: present/remote/excused/unexcused, unikatna kombinacija member/meeting. MEMBER okno je od 30 minut pred začetkom do 2 uri po koncu; prihodnji, odpovedani in celodnevni sestanki ne dovolijo samoprijave. ADMIN popravek je backend izjema.
- Google identiteta: pravi calendar_id + google_event_id, ne naslov ali datum kot nadomestek. Vseh šest serij ostane v `SERIES`. Ne uvažaj čakajoče prisotnosti brez nedvoumnih referenc.
- `calendar.configured` in `syncReady` sta signala konfiguracije, ne dokaz uspešnega živega Googla. Osebni `primary` Calendar je ločen od skupnih referenc in prisotnosti.
- MEMBER, ADMIN in SUPERADMIN vedno iz zaupane baze. Skriti gumbi, hash in props `role` ne nadomeščajo RLS. Service client se nikoli ne vrača odjemalcu.

Pred spremembo shared modela ali API A/B potrdita polja, pravice, migracijo in sprejemni test. Najprej združita pregledan združljiv temelj, nato posodobita feature veji. Do roka se izogibaj preimenovanju delujočih env imen, tabel, statusov in auth tokov.

Časovnik in postopek izdaje: [live-work-timer.md](live-work-timer.md). Ure časovnika ohranijo natančne sekunde (brez četrturnega zaokroževanja); admin dnevni vnos upošteva dejansko dolžino dneva v Ljubljani.
