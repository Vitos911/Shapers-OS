# Google Calendar (read-only)

Status, 2026-10-25: all 55 persisted meetings have Google event IDs and synchronization timestamps. All 258 historical attendance records have been imported against those references; see [attendance import verification](attendance-import.md). Live Google API access was not exercised during this attendance task. The supplied ICS contains 55 unique events and remains source material, not a replacement live calendar. This attendance task did not create, modify or delete Google Calendar events.

## Operator setup

1. As the calendar owner, create/select a dedicated sandbox calendar yourself in Google Calendar. In Settings → Import & export, import `supabase/seed/meetings.ics` into that selected calendar once. This is a manual owner action, not an app endpoint. Avoid importing twice; Google duplicate handling must not be assumed.
2. Copy its Calendar ID from Settings → Integrate calendar. It is not the Google Doc ID, workspace UUID or an ICS UID. Set `GOOGLE_CALENDAR_ID` in the server secret configuration (or the SUPERADMIN calendar setting).
3. Enable Google Calendar API in a Google Cloud project. Choose one mechanism:

   - An already public calendar: set restricted `GOOGLE_CALENDAR_API_KEY`. Do not make a private real team calendar public merely to avoid OAuth.
   - Private calendar: share the selected calendar with a service account as **See all event details / Reader**, not Writer. Set its JSON in server-only `GOOGLE_SERVICE_ACCOUNT_JSON`.
   - Private calendar via OAuth: obtain a refresh token with `https://www.googleapis.com/auth/calendar.events.readonly`; set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` server-side. Do not paste tokens into chat or source control.

4. Restart the app after changing server env. Open Sestanki and click the synchronization button. The server calls only `GET https://www.googleapis.com/calendar/v3/calendars/{id}/events` with `timeMin`, `timeMax`, `singleEvents=true`, `orderBy=startTime`, `timeZone=Europe/Ljubljana`, `showDeleted=true`, pagination and request timeouts. OAuth token exchange uses POST to Google's token endpoint but never writes Calendar events.
5. Default synchronization covers the previous 49 days through 90 days ahead. API date bounds are start-inclusive/end-exclusive, max 370 days. List/personal/series/upcoming/past filters work on persisted references. Recurring instances keep Google instance IDs, recurring series ID and original start. All-day end dates are exclusive and honor Ljubljana DST. Cancelled references are marked without deleting attendance.
6. After the actual September–October meetings are synced, import historical attendance:

   ```bash
   node --env-file=.env.local scripts/import-sandbox.mjs --type attendance --file supabase/seed/attendance-pending-calendar.json
   node --env-file=.env.local scripts/import-sandbox.mjs --type attendance --file supabase/seed/attendance-pending-calendar.json --apply
   ```

   Matching order: explicit Google event ID, iCal UID + Ljubljana date, then unique series + Ljubljana date. Ambiguous/missing matches are reported and block the apply. Existing `(meeting_id, member_id)` records and corrections are preserved, not overwritten. Rerun safely after correcting source matches. Migration `20261025080709_historical_attendance_service_import.sql` is required for service-key historical INSERTs: it exempts only the actual database `service_role` INSERT from self-check-in validation. User roles, RLS, UPDATE guards, immutable attendance identity, audit and history triggers remain in effect. No helper-function privileges are granted to the service role.

## Failure behavior and limitations

Missing credentials produce a setup state/503; Google rejection or timeout produces a sanitized error. No fixture meetings are inserted on failure. Cached references show their synchronization timestamps and are not claimed as fresh. All Google pages must be read successfully before database writes start. Reference storage is row-by-row, not a global transaction: a database failure may leave a partial refreshed set and requires a rerun. Attendance is stored separately and never touched by synchronization. This is bounded full listing, not Google incremental sync-token/webhook processing; schedule changes outside the selected window may require a wider resync.

Self check-in is enforced by PostgreSQL: eligible noncancelled, timed meeting, from 30 minutes before start until two hours after end, only `present` or `remote`. Duplicate attendance is rejected; edit the existing record instead. ADMIN/SUPERADMIN corrections can use all four statuses outside the window. Community applies to everyone; other relevance uses member series and explicitly parsed participant emails/names. Members cannot read unrelated members' private attendance.

Official API reference: [events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). Source instructions were supplied in the [sandbox schedule document](https://docs.google.com/document/d/1nc0QaSEs_o3gX9OVv-G6JR8vZsGYlUuTnrkutsU6RdY/edit). This document is not itself a Calendar integration.
