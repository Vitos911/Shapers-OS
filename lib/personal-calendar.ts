// Server-only. No personal events or credentials are saved to shared organization tables.
import {
  authOrigin,
  cookie,
  readCookie,
  sameOrigin,
  seal,
  unseal,
} from "./google-auth.ts";
import { HttpError, requireAuth } from "./org-server.ts";
import { midnightInLjubljana, type Identity } from "./organization.ts";

const NAME = "shapers-google-calendar";
const READ_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
type Grant = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessExpires: number;
  expires: number;
};
type Authenticator = (request: Request) => Promise<{ identity: Identity }>;
const headers = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export type PersonalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  url: string;
  meetingUrl: string;
};
type GoogleEvent = {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};
function safeLink(value?: string) {
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
}
function validTime(value: string | undefined, allDay: boolean) {
  return (
    !!value &&
    (allDay
      ? /^\d{4}-\d{2}-\d{2}$/.test(value)
      : /(Z|[+-]\d\d:\d\d)$/.test(value)) &&
    Number.isFinite(Date.parse(value))
  );
}
export function personalEvent(event: GoogleEvent): PersonalEvent | null {
  const allDay = !!event.start?.date,
    start = event.start?.date || event.start?.dateTime,
    end = event.end?.date || event.end?.dateTime;
  if (
    !event.id ||
    event.status === "cancelled" ||
    event.attendees?.some((a) => a.self && a.responseStatus === "declined") ||
    !validTime(start, allDay) ||
    !validTime(end, allDay) ||
    Date.parse(end!) <= Date.parse(start!)
  )
    return null;
  return {
    id: event.id,
    title: event.summary || "(Brez naslova)",
    start: start!,
    end: end!,
    allDay,
    location: event.location || "",
    url: safeLink(event.htmlLink),
    meetingUrl: safeLink(event.hangoutLink),
  };
}
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}
function disconnected(origin: string, reason: string) {
  const result = json({ connected: false, events: [], reason });
  result.headers.append("Set-Cookie", cookie(NAME, "", origin, 0));
  return result;
}
export async function personalCalendar(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  authenticate: Authenticator = requireAuth,
  fetcher: typeof fetch = fetch,
) {
  try {
    const origin = authOrigin(request, env);
    // POST avoids cookie-only reads, prefetch and CSRF. Never accept arbitrary calendar/user IDs.
    sameOrigin(request, origin);
    const { identity } = await authenticate(request);
    let grant: Grant;
    try {
      grant = unseal<Grant>(readCookie(request, NAME, origin), env);
    } catch {
      return disconnected(
        origin,
        "Poveži Google koledar in dovoli branje svojih dogodkov.",
      );
    }
    if (
      grant.userId !== identity.user_id ||
      typeof grant.accessToken !== "string" ||
      !grant.accessToken ||
      !Number.isFinite(grant.accessExpires)
    )
      return disconnected(
        origin,
        "Poveži koledar istega računa, s katerim si prijavljen/a.",
      );
    let refreshed = false;
    const renew = async () => {
      if (
        !grant.refreshToken ||
        !env.GOOGLE_CLIENT_ID ||
        !env.GOOGLE_CLIENT_SECRET
      )
        return false;
      const result = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: grant.refreshToken,
        }),
      });
      if (result.status === 400 || result.status === 401) return false;
      if (!result.ok)
        throw new HttpError(
          502,
          "Google obnova ni dosegljiva. Poskusi osvežiti kasneje.",
        );
      const data = await result.json();
      if (
        typeof data.access_token !== "string" ||
        !data.access_token ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0
      )
        throw new HttpError(502, "Google ni vrnil veljavne obnove povezave.");
      grant = {
        ...grant,
        accessToken: data.access_token,
        accessExpires: Date.now() + Math.max(1, data.expires_in - 60) * 1000,
        refreshToken: data.refresh_token || grant.refreshToken,
      };
      refreshed = true;
      return true;
    };
    if (grant.accessExpires <= Date.now() && !(await renew()))
      return disconnected(
        origin,
        "Google povezava je potekla. Ponovno jo poveži in dovoli branje koledarja.",
      );
    const now = new Date(),
      until = new Date(now.getTime() + 90 * 86400000);
    const events: PersonalEvent[] = [],
      seen = new Set<string>();
    let pageToken = "",
      retried = false,
      truncated = false;
    for (let page = 0; page < 5; page++) {
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      Object.entries({
        timeMin: now.toISOString(),
        timeMax: until.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        timeZone: "Europe/Ljubljana",
        maxResults: "100",
        showDeleted: "false",
        fields:
          "items(id,summary,status,start,end,location,htmlLink,hangoutLink,attendees(self,responseStatus)),nextPageToken",
      }).forEach(([k, v]) => url.searchParams.set(k, v));
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      let result = await fetcher(url, {
        headers: { Authorization: "Bearer " + grant.accessToken },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (result.status === 401 && !retried) {
        retried = true;
        if (await renew())
          result = await fetcher(url, {
            headers: { Authorization: "Bearer " + grant.accessToken },
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
      }
      if (result.status === 401)
        return disconnected(
          origin,
          "Google povezava ni več veljavna. Ponovno poveži koledar.",
        );
      if (result.status === 403) {
        const data = await result.json().catch(() => ({}));
        const reasons =
          data.error?.errors?.map((e: { reason?: string }) => e.reason) || [];
        if (
          reasons.some((r: string) =>
            [
              "rateLimitExceeded",
              "userRateLimitExceeded",
              "quotaExceeded",
              "dailyLimitExceeded",
            ].includes(r),
          )
        )
          throw new HttpError(
            429,
            "Google omejuje število zahtev. Poskusi kasneje.",
          );
        throw new HttpError(
          403,
          "Branje koledarja ni dovoljeno. Ponovno poveži in dovoli dostop. Skrbnik mora v Google Cloud omogočiti Google Calendar API in readonly obseg.",
        );
      }
      if (!result.ok)
        throw new HttpError(
          502,
          "Google koledar ni dosegljiv. Dogodki niso osveženi.",
        );
      const data = await result.json();
      if (data.items !== undefined && !Array.isArray(data.items))
        throw new HttpError(502, "Google je vrnil neveljavne dogodke.");
      for (const raw of data.items || []) {
        const event = personalEvent(raw);
        if (event && !seen.has(event.id)) {
          events.push(event);
          seen.add(event.id);
        }
      }
      if (!data.nextPageToken) break;
      if (
        typeof data.nextPageToken !== "string" ||
        data.nextPageToken === pageToken
      )
        throw new HttpError(502, "Google paginacija ni veljavna.");
      pageToken = data.nextPageToken;
      if (page === 4) truncated = true;
    }
    const instant = (e: PersonalEvent) =>
      Date.parse(e.allDay ? midnightInLjubljana(e.start) : e.start);
    events.sort((a, b) => instant(a) - instant(b));
    const result = json({
      connected: true,
      events,
      truncated,
      from: now.toISOString(),
      until: until.toISOString(),
      syncedAt: new Date().toISOString(),
      automaticRenewal: !!(
        grant.refreshToken &&
        env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET
      ),
      scope: READ_SCOPE,
    });
    if (refreshed)
      result.headers.append(
        "Set-Cookie",
        cookie(
          NAME,
          seal(grant, env),
          origin,
          Math.max(0, Math.floor((grant.expires - Date.now()) / 1000)),
        ),
      );
    return result;
  } catch (e) {
    return json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Google koledarja ni mogoče prebrati. Poskusi kasneje.",
        events: [],
      },
      e instanceof HttpError ? e.status : 502,
    );
  }
}
export async function disconnectPersonalCalendar(
  request: Request,
  env = process.env,
  authenticate: Authenticator = requireAuth,
) {
  try {
    const origin = authOrigin(request, env);
    sameOrigin(request, origin);
    await authenticate(request);
    return disconnected(
      origin,
      "Google koledar je odklopljen v tem brskalniku.",
    );
  } catch (e) {
    return json(
      { error: e instanceof HttpError ? e.message : "Odklop ni uspel." },
      e instanceof HttpError ? e.status : 502,
    );
  }
}
