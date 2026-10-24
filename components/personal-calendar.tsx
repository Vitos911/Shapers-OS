"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, ExternalLink, RefreshCw } from "lucide-react";

type Event = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  url: string;
  meetingUrl: string;
};
type Calendar = {
  connected: boolean;
  events: Event[];
  reason?: string;
  truncated?: boolean;
  syncedAt?: string;
  automaticRenewal?: boolean;
};
function when(event: Event) {
  if (event.allDay) {
    const last = new Date(event.end + "T12:00:00Z");
    last.setUTCDate(last.getUTCDate() - 1); // Google all-day end is exclusive.
    const day = (v: string | Date) =>
      new Intl.DateTimeFormat("sl-SI", {
        dateStyle: "medium",
        timeZone: "Europe/Ljubljana",
      }).format(typeof v === "string" ? new Date(v + "T12:00:00Z") : v);
    return (
      day(event.start) +
      (last.toISOString().slice(0, 10) !== event.start
        ? " – " + day(last)
        : "") +
      " · Ves dan"
    );
  }
  return (
    new Intl.DateTimeFormat("sl-SI", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Ljubljana",
    }).format(new Date(event.start)) +
    " – " +
    new Intl.DateTimeFormat("sl-SI", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Ljubljana",
    }).format(new Date(event.end))
  );
}
export default function PersonalCalendar({
  client,
}: {
  client: SupabaseClient;
}) {
  const [calendar, setCalendar] = useState<Calendar | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [connecting, setConnecting] = useState(false),
    [limit, setLimit] = useState(8);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const load = useCallback(
    async (method = "POST") => {
      controller.current?.abort();
      const abort = new AbortController(),
        current = ++sequence.current;
      controller.current = abort;
      try {
        const { data } = await client.auth.getSession();
        if (abort.signal.aborted) return;
        setBusy(true);
        setError("");
        if (!data.session)
          throw new Error("Prijava je potekla. Prijavi se znova.");
        const response = await fetch("/api/personal-calendar", {
          method,
          headers: { Authorization: "Bearer " + data.session.access_token },
          credentials: "same-origin",
          cache: "no-store",
          signal: abort.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Google koledarja ni mogoče prebrati.",
          );
        if (current === sequence.current && !abort.signal.aborted)
          setCalendar(result);
      } catch (e) {
        if (current === sequence.current && !abort.signal.aborted) {
          setCalendar(null); // Never display stale personal data after loss of access.
          setError(e instanceof Error ? e.message : "Povezava ni uspela.");
        }
      } finally {
        if (current === sequence.current && !abort.signal.aborted)
          setBusy(false);
      }
    },
    [client],
  );
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 5 * 60000);
    window.addEventListener("focus", refresh);
    const pending = controller;
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      pending.current?.abort();
    };
  }, [load]);
  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const response = await fetch("/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: "/", calendar: true }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Google povezave ni mogoče začeti.");
      const target = new URL(data.url);
      if (
        target.protocol !== "https:" ||
        target.pathname !== "/auth/v1/authorize"
      )
        throw new Error("Neveljaven naslov prijave.");
      location.assign(target.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Povezava ni uspela.");
      setConnecting(false);
    }
  }
  return (
    <section
      className="panel org-panel personal-calendar"
      aria-busy={busy || connecting}
    >
      <div className="personal-calendar-heading">
        <div>
          <h2>
            <CalendarDays size={20} aria-hidden="true" /> Moj Google koledar
          </h2>
          <p>Prihodnjih 90 dni · glavni koledar · Europe/Ljubljana</p>
        </div>
        {calendar?.connected && (
          <div className="personal-calendar-actions">
            <button
              className="button secondary"
              disabled={busy || connecting}
              onClick={() => void load()}
            >
              <RefreshCw size={15} /> Osveži
            </button>
            <button
              className="button secondary"
              disabled={busy || connecting}
              onClick={() => void load("DELETE")}
            >
              Odklopi
            </button>
          </div>
        )}
      </div>
      <p className="personal-calendar-privacy">
        Samo zate. Osebni dogodki niso shranjeni v skupno bazo in jih drugi
        člani ne vidijo.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Berem tvoj koledar …</p>}
      {!busy && !calendar?.connected && (
        <div>
          <p>
            {calendar?.reason ||
              "Dovoli branje svojega Google koledarja. Izberi isti račun kot pri prijavi."}
          </p>
          <button
            className="button primary"
            disabled={connecting}
            onClick={() => void connect()}
          >
            {connecting ? "Odpiram Google …" : "Poveži Google koledar"}
          </button>
          <p className="personal-calendar-privacy">
            Google bo zahteval privolitev. Dogodkov ne ustvarjamo ali
            spreminjamo.
          </p>
        </div>
      )}
      {calendar?.connected && (
        <>
          {!calendar.events.length ? (
            <p className="org-empty">
              V tvojem glavnem koledarju v prihodnjih 90 dneh ni dogodkov.
            </p>
          ) : (
            <ol className="personal-agenda">
              {calendar.events.slice(0, limit).map((event) => (
                <li key={event.id}>
                  <div>
                    <time dateTime={event.start}>{when(event)}</time>
                    <h3>{event.title}</h3>
                    {event.location && <p>{event.location}</p>}
                  </div>
                  <div className="personal-calendar-actions">
                    {event.meetingUrl && (
                      <a
                        className="button primary"
                        href={event.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Pridruži se <ExternalLink size={14} />
                      </a>
                    )}
                    {event.url && (
                      <a
                        className="button secondary"
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Odpri dogodek <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {calendar.events.length > limit && (
            <button
              className="button secondary"
              onClick={() => setLimit((v) => v + 8)}
            >
              Pokaži več ({calendar.events.length - limit})
            </button>
          )}
          {calendar.truncated && (
            <p>
              Prikazanih je prvih 500 dogodkov. Celoten seznam odpri v Google
              Koledarju.
            </p>
          )}
          {calendar.syncedAt && (
            <p className="personal-calendar-privacy" role="status">
              Osveženo{" "}
              {new Intl.DateTimeFormat("sl-SI", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Ljubljana",
              }).format(new Date(calendar.syncedAt))}{" "}
              · samodejno vsakih 5 minut
            </p>
          )}
          {!calendar.automaticRenewal && (
            <p className="personal-calendar-privacy">
              Po izteku dovoljenja bo potrebna ponovna povezava. Za samodejno
              obnovo mora skrbnik nastaviti strežniško Google OAuth
              konfiguracijo.
            </p>
          )}
        </>
      )}
    </section>
  );
}
