# Skupne podatkovne pogodbe

Vir tipov je obstoječi `lib/organization.ts`: `Identity`, `Snapshot`, `OrgMember`, `OrgProject`, `OrgTask`, `WorkEntry`, `WeeklyHours`, `Meeting`, `Attendance`, `TaskHistory`. Ne ustvarjaj konkurenčnega modela v UI. Validacijo določa `lib/org-validation.ts`, končne pravice in omejitve pa aktualna Supabase shema/RLS/triggerji. Tipizacija sama ni varnostna meja.

## Obstoječi API

Vse `/api/org/*` zahteve imajo `Authorization: Bearer <Supabase access token>`. Strežnik preveri `getUser()` in `org_context()` ter uporabi uporabniški Supabase klient. `GET snapshot` vrača `Snapshot`, filtriran z RLS. Običajen MEMBER zato ne dobi seznama vseh članov za samostojno dodeljevanje.

| Vir | Metode in podatki | Dostop |
| --- | --- | --- |
| `snapshot` | GET: identity, members, projects, tasks, work, weeklyHours, meetings, attendance, history, projectMembers, taskDirectory, meetingMembers, settings, calendar | Aktivni potrjeni organizacijski uporabnik; RLS |
| `projects` | POST/PATCH: name, description, status; PATCH z id | ADMIN/SUPERADMIN |
| `tasks` | POST/PATCH: project_id, title, description, assignee_id, status, priority, due_date; PATCH id/archived v dovoljenem obsegu in obvezni expected_updated_at | Ustvarjanje ADMIN; trenutni izvajalec status/opis/prioriteta/rok ter dodelitev članu istega projekta |
| `project-members` | POST: project_id, member_id; `remove: true` za odstranitev članstva | ADMIN/SUPERADMIN |
| `work` | POST/PATCH: date, hours, description, project_id; lastnik iz seje; PATCH id in dovoljeni deleted | Lastni vnosi; admin lahko bere, ne piše v imenu drugega |
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
