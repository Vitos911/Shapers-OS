import { createSign } from "node:crypto";
import {
  SERIES,
  TZ,
  midnightInLjubljana,
  type Identity,
} from "./organization.ts";
import { HttpError, allRows, serviceClient, requireAdmin } from "./org-server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  htmlLink?: string;
  iCalUID?: string;
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email?: string }[];
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
};
export type CalendarEvent = {
  calendar_id: string;
  google_event_id: string;
  ical_uid: string | null;
  recurring_event_id: string | null;
  original_start: string | null;
  title: string;
  description: string;
  series: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  all_day: boolean;
  location: string;
  meeting_url: string;
  cancelled: boolean;
  synced_at: string;
  participantEmails: string[];
};
type Fetcher = typeof fetch;
export function safeHttpUrl(input: string | undefined) {
  try {
    const u = new URL(input || "");
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function normalizeEvent(
  event: GoogleEvent,
  calendarId: string,
): CalendarEvent | null {
  if (!event.id || !event.start || !event.end) return null;
  const allDay = !!event.start.date;
  // Google returns RFC3339 offsets. Reject offset-less timestamps rather than guessing server TZ.
  const time = (v: { dateTime?: string; date?: string }) =>
    v.date
      ? midnightInLjubljana(v.date)
      : v.dateTime && /(Z|[+-]\d\d:\d\d)$/.test(v.dateTime)
        ? new Date(v.dateTime).toISOString()
        : null;
  let start: string | null, end: string | null;
  try {
    start = time(event.start);
    end = time(event.end);
  } catch {
    return null;
  }
  if (!start || !end || end <= start) return null;
  const title = event.summary || "(Brez naslova)",
    description = event.description || "";
  const series =
    SERIES.find((s) => title.toLowerCase().includes(s.toLowerCase())) ||
    SERIES.find((s) => description.toLowerCase().includes(s.toLowerCase())) ||
    "";
  const participantEmails = [
    ...new Set([
      ...(event.attendees || []).flatMap((a) =>
        a.email ? [a.email.trim().toLowerCase()] : [],
      ),
      ...(
        description.match(
          /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        ) || []
      ).map((email) => email.toLowerCase()),
    ]),
  ];
  return {
    calendar_id: calendarId,
    google_event_id: event.id,
    ical_uid: event.iCalUID || null,
    recurring_event_id: event.recurringEventId || null,
    original_start:
      event.originalStartTime?.dateTime ||
      event.originalStartTime?.date ||
      null,
    title,
    description,
    series,
    starts_at: start,
    ends_at: end,
    timezone: event.start.timeZone || TZ,
    all_day: allDay,
    location: event.location || "",
    meeting_url: safeHttpUrl(
      event.hangoutLink ||
        event.conferenceData?.entryPoints?.find(
          (e) => e.entryPointType === "video",
        )?.uri ||
        event.htmlLink,
    ),
    cancelled: event.status === "cancelled",
    synced_at: new Date().toISOString(),
    participantEmails,
  };
}
async function googleToken(env: NodeJS.ProcessEnv, fetcher: Fetcher) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_REFRESH_TOKEN)
    return null;
  const params = new URLSearchParams();
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let account;
    try {
      account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new HttpError(503, "Google service account JSON ni veljaven.");
    }
    if (!account.client_email || !account.private_key)
      throw new HttpError(503, "Google service account ni popoln.");
    const encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned =
      encode({ alg: "RS256", typ: "JWT" }) +
      "." +
      encode({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3500,
      });
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    params.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    params.set(
      "assertion",
      unsigned + "." + signer.sign(account.private_key, "base64url"),
    );
  } else {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      throw new HttpError(503, "Manjka Google OAuth client konfiguracija.");
    params.set("grant_type", "refresh_token");
    params.set("client_id", env.GOOGLE_CLIENT_ID);
    params.set("client_secret", env.GOOGLE_CLIENT_SECRET);
    params.set("refresh_token", env.GOOGLE_REFRESH_TOKEN!);
  }
  const result = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: params,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!result.ok)
    throw new HttpError(
      502,
      "Google prijava ni uspela. Preveri readonly poverilnice.",
    );
  const data = await result.json();
  if (typeof data.access_token !== "string")
    throw new HttpError(502, "Google ni vrnil žetona.");
  return data.access_token as string;
}
export function calendarConfigured(calendarId: string, env = process.env) {
  return (
    !!calendarId &&
    !!(
      env.GOOGLE_CALENDAR_API_KEY ||
      env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      env.GOOGLE_REFRESH_TOKEN
    )
  );
}
export async function fetchGoogleEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  options: { env?: NodeJS.ProcessEnv; fetcher?: Fetcher } = {},
) {
  const env = options.env || process.env,
    fetcher = options.fetcher || fetch;
  if (!calendarConfigured(calendarId, env))
    throw new HttpError(
      503,
      "Google Calendar ni povezan. Nastavi Calendar ID in strežniške readonly poverilnice.",
    );
  if (
    !Number.isFinite(Date.parse(timeMin)) ||
    !Number.isFinite(Date.parse(timeMax)) ||
    timeMax <= timeMin ||
    Date.parse(timeMax) - Date.parse(timeMin) > 370 * 86400000
  )
    throw new HttpError(
      400,
      "Obdobje koledarja mora biti veljavno in krajše od enega leta.",
    );
  const token = await googleToken(env, fetcher);
  const events: CalendarEvent[] = [],
    cancelled: string[] = [],
    warnings: string[] = [];
  let pageToken = "";
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    for (const [k, v] of Object.entries({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      timeZone: TZ,
      maxResults: "250",
      showDeleted: "true",
    }))
      url.searchParams.set(k, v);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    if (!token) url.searchParams.set("key", env.GOOGLE_CALENDAR_API_KEY!);
    let result: Response;
    try {
      result = await fetcher(url, {
        headers: token ? { Authorization: "Bearer " + token } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new HttpError(
        502,
        "Google Calendar se ne odziva. Podatki niso osveženi.",
      );
    }
    if (!result.ok)
      throw new HttpError(
        502,
        `Google Calendar je zavrnil branje (${result.status}). Preveri API, Calendar ID in pravice Reader.`,
      );
    const data = await result.json();
    if (!Array.isArray(data.items))
      throw new HttpError(502, "Google je vrnil neveljaven seznam dogodkov.");
    for (const event of data.items as GoogleEvent[]) {
      if (event.status === "cancelled" && event.id) {
        cancelled.push(event.id);
        continue;
      }
      const normalized = normalizeEvent(event, calendarId);
      if (normalized) events.push(normalized);
      else
        warnings.push(
          "Dogodek brez veljavnega ID-ja ali časov je bil izpuščen.",
        );
    }
    if (!data.nextPageToken) return { events, cancelled, warnings };
    if (typeof data.nextPageToken !== "string" || seen.has(data.nextPageToken))
      throw new HttpError(
        502,
        "Google paginacija ni veljavna. Sinhronizacija ni potrjena.",
      );
    seen.add(data.nextPageToken);
    pageToken = data.nextPageToken;
  }
  throw new HttpError(
    502,
    "Koledar presega omejitev strani; sinhronizacija ni potrjena.",
  );
}
export async function syncCalendar(
  client: SupabaseClient,
  actor: Identity,
  from: string,
  to: string,
) {
  requireAdmin(actor);
  const settings = await client
    .from("org_settings")
    .select("calendar_id")
    .single();
  if (settings.error)
    throw new HttpError(503, "Nastavitev koledarja ni mogoče prebrati.");
  const calendarId =
    (actor.organization_id && actor.organization_id!=="00000000-0000-4000-8000-000000000001" ? "" : process.env.GOOGLE_CALENDAR_ID) || settings.data.calendar_id;
  // Full trusted fetch must succeed before any database writes. Attendance is never touched.
  const result = await fetchGoogleEvents(
    calendarId,
    midnightInLjubljana(from),
    midnightInLjubljana(to),
  );
  const admin = serviceClient(actor.organization_id),
    members = await allRows(admin, "members", actor.organization_id);
  const events = result.events.map(event => {
    const { participantEmails, ...row } = event;
    const assigned = members.filter((m) =>
      participantEmails.includes(String(m.email).trim().toLowerCase()),
    );
    if (!assigned.length) result.warnings.push("Dogodek brez prepoznanih e-poštnih naslovov: obstoječa dodelitev udeležencev je ohranjena.");
    return { ...row, member_ids: assigned.length ? assigned.map(m => m.id) : null };
  });
  const saved = await admin.rpc("org_apply_calendar", {
    p_calendar_id: calendarId,
    p_events: events,
    p_cancelled: result.cancelled,
  });
  if (saved.error) throw new HttpError(503, "Koledar ni shranjen. Preveri migracijo za atomsko sinhronizacijo in ponovi osvežitev.");
  return {
    synced: result.events.length,
    cancelled: result.cancelled.length,
    warnings: result.warnings,
    requestedBy: "admin",
  };
}
