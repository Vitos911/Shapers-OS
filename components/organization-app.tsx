"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import Link from "next/link";
import PersonalCalendar from "./personal-calendar";
import BrandLogo from "./brand-logo";
import UserProfile from "./user-profile";
import { ownProfile } from "@/lib/user-profile";
import MemberDashboard, { DashboardSkeleton } from "./dashboard/member-dashboard";
import shellStyles from "./dashboard/organization-shell.module.css";
import { isDate } from "@/lib/model";
import {
  UserRound,
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Clock3,
  CalendarDays,
  Users,
  Settings2,
  LogOut,
  RefreshCw,
  Plus,
  Menu,
  X,
  BarChart3,
  ClipboardCheck,
} from "lucide-react";
import {
  addDays,
  analytics,
  eligibleMeeting,
  isAdmin,
  ljubljanaDate,
  PRIORITIES,
  selfCheckInAllowed,
  SERIES,
  TASK_STATUSES,
  weekStart,
  type OrgProject,
  type OrgTask,
  type Snapshot,
  type WorkEntry,
  type Attendance,
} from "@/lib/organization";

type View =
  | "overview"
  | "projects"
  | "tasks"
  | "hours"
  | "meetings"
  | "attendance"
  | "members"
  | "analytics"
  | "profile"
  | "settings";
type Edit = {
  kind: "projects" | "tasks" | "work" | "attendance";
  data?: OrgProject | OrgTask | WorkEntry | Attendance;
};
type Access = {
  email: string;
  role: string;
  disabled: boolean;
  member_id: string | null;
  auth_user_id: string | null;
};
const nav = [
  ["overview", "Pregled", LayoutDashboard],
  ["tasks", "Moje naloge", CheckSquare],
  ["projects", "Projekti", FolderKanban],
  ["hours", "Prostovoljske ure", Clock3],
  ["meetings", "Sestanki", CalendarDays],
  ["attendance", "Prisotnost", ClipboardCheck],
  ["members", "Člani", Users],
  ["analytics", "Analitika", BarChart3],
  ["profile", "Moj profil", UserRound],
  ["settings", "Nastavitve", Settings2],
] as const;
const labels: Record<string, string> = {
  todo: "Začeti",
  in_progress: "V teku",
  in_review: "V pregledu",
  done: "Zaključeno",
  planning: "Načrtovanje",
  active: "V teku",
  archived: "Arhivirano",
  low: "Nizka",
  medium: "Srednja",
  high: "Visoka",
  urgent: "Nujna",
  present: "Prisoten",
  remote: "Na daljavo",
  excused: "Opravičeno",
  unexcused: "Neopravičeno",
};
const n = (v: number) =>
  new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(v);
const date = (v: string) =>
  new Intl.DateTimeFormat("sl-SI", {
    dateStyle: "medium",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(v.length === 10 ? v + "T12:00:00Z" : v));
const time = (v: string) =>
  new Intl.DateTimeFormat("sl-SI", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(v));
const percent = (v: number | null) => (v === null ? "—" : n(v * 100) + " %");
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel org-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="org-empty">{children}</p>;
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="panel org-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function OrganizationApp({
  client,
  user,
  onSignOut,
}: {
  client: SupabaseClient;
  user: User;
  onSignOut: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [view, setView] = useState<View>("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [edit, setEdit] = useState<Edit | null>(null),
    [access, setAccess] = useState<Access[]>([]);
  const [project, setProject] = useState(""),
    [member, setMember] = useState(""),
    [tier, setTier] = useState(""),
    [series, setSeries] = useState(""),
    [period, setPeriod] = useState("upcoming"),
    [calendarView, setCalendarView] = useState(false),
    [month, setMonth] = useState(ljubljanaDate().slice(0, 7)),
    [personal, setPersonal] = useState(false);
  const [from, setFrom] = useState(addDays(weekStart(), -35)),
    [to, setTo] = useState(ljubljanaDate());
  const [now, setNow] = useState(() => Date.now());
  const navigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButton.current;
    document.body.style.overflow = "hidden";
    const panel = navigation.current;
    const controls = () => Array.from(panel?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") || []);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenu(false); }
      if (event.key === "Tab") {
        const items = controls(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const resize = () => { if (window.innerWidth > 1000) setMenu(false); };
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resize);
      trigger?.focus();
    };
  }, [menu]);
  async function signOut() {
    try {
      await onSignOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Odjava ni uspela.");
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const request = useCallback(
    async (resource: string, method = "GET", body?: unknown) => {
      const session = await client.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Prijava je potekla. Prijavi se znova.");
      const result = await fetch("/api/org/" + resource, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const data = await result.json();
      if (!result.ok) {
        const failure = new Error(data.error || "Zahteva ni uspela.");
        Object.assign(failure, { status: result.status });
        throw failure;
      }
      return data;
    },
    [client],
  );
  const refresh = useCallback(async () => {
    try {
      const data = (await request("snapshot")) as Snapshot;
      setSnapshot(data);
      return data;
    } catch (e) {
      if (
        [401, 403].includes(Number((e as Error & { status?: number }).status))
      ) {
        setSnapshot(null);
        setAccess([]);
      }
      throw e;
    }
  }, [request]);
  useEffect(() => {
    let alive = true;
    void request("snapshot")
      .then((data) => {
        if (alive) setSnapshot(data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [request]);
  useEffect(() => {
    const read = () => {
      const hash = location.hash.slice(1);
      setView(nav.some((v) => v[0] === hash) ? (hash as View) : "overview");
      setMenu(false);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  async function action(resource: string, method: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request(resource, method, body);
      await refresh();
      setEdit(null);
      setNotice(
        resource === "calendar"
          ? `Koledar osvežen: ${result.synced} dogodkov. ${result.warnings?.join(" ") || ""}`
          : "Sprememba je shranjena v Supabase.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shranjevanje ni uspelo.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const metrics = useMemo(
    () =>
      snapshot && isDate(from) && isDate(to) && from <= to
        ? analytics(snapshot, { from, to, project, member, tier })
        : null,
    [snapshot, from, to, project, member, tier],
  );
  if (!snapshot)
    return (
      <div className="cloud-entry">
        <section className="cloud-entry-card">
          <h1>Shapers OS</h1>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                className="button secondary"
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                Poskusi znova
              </button>
              <a className="cloud-text-button" href="/legacy">
                Prejšnji prostori (ohranjeni podatki)
              </a>
              <button
                className="cloud-text-button"
                onClick={() => void signOut()}
              >
                Odjava
              </button>
            </>
          ) : (
            <DashboardSkeleton />
          )}
        </section>
      </div>
    );
  const s = snapshot,
    actor = s.identity,
    admin = isAdmin(actor.role),
    superadmin = actor.role === "SUPERADMIN",
    me = s.members.find((m) => m.id === actor.member_id),
    profile = ownProfile(s, user);
  const memberName = (id: string | null) =>
    s.members.find((m) => m.id === id)?.name || (id ? "Član" : "Nedodeljeno");
  const projectName = (id: string | null) =>
    s.projects.find((p) => p.id === id)?.name || "Brez projekta";
  const relevant = (e: Snapshot["meetings"][number]) =>
    !!me &&
    eligibleMeeting(
      me,
      e,
      s.meetingMembers.some(
        (a) => a.meeting_id === e.id && a.member_id === me.id,
      ),
    );
  const meetings = s.meetings
    .filter(
      (e) =>
        !e.cancelled &&
        (!series || e.series === series) &&
        (!personal || relevant(e)) &&
        (period === "all" ||
          (period === "upcoming"
            ? Date.parse(e.ends_at) >= now
            : Date.parse(e.ends_at) < now)),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const shownTasks = s.tasks.filter(
    (t) =>
      !t.archived &&
      (!project || t.project_id === project) &&
      (!member || t.assignee_id === member) &&
      (view !== "overview" || t.assignee_id === actor.member_id),
  );
  const shownHours = s.work
    .filter(
      (e) =>
        !e.deleted &&
        e.date >= from &&
        e.date <= to &&
        (!project || e.project_id === project) &&
        (!member || e.member_id === member),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const historicalRows = s.weeklyHours
    .filter(
      (h) =>
        !project &&
        h.week_start >= from &&
        h.through_date <= to &&
        (!member || h.member_id === member),
    )
    .sort((a, b) => b.week_start.localeCompare(a.week_start));
  const canEdit = (id: string) => id === actor.member_id;
  const choices = (values: string[]) =>
    values.map((v) => (
      <option key={v} value={v}>
        {labels[v] || v}
      </option>
    ));
  const memberOptions = (
    <>
      <option value="">Izberi člana</option>
      {s.members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </>
  );
  const filters = (
    <div className="org-filters">
      {(!isDate(from) || !isDate(to) || from > to) && (
        <p role="alert">Izberi veljaven začetni in končni datum.</p>
      )}
      <label>
        Od
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        Do
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label>
        Projekt
        <select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">Vsi projekti</option>
          {s.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {admin && (
        <label>
          Član
          <select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">Vsi člani</option>
            {s.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
  const meetingCards = (events: typeof meetings) =>
    events.map((e) => (
      <article className="panel org-meeting" key={e.id}>
        <div>
          <span className="eyebrow">{e.series || "Nedoločena serija"}</span>
          <h3>{e.title}</h3>
          <p>
            {date(e.starts_at)} ·{" "}
            {e.all_day
              ? "Celodnevno"
              : `${time(e.starts_at)}–${time(e.ends_at)}`}{" "}
            · Europe/Ljubljana
          </p>
        </div>
        <p>{e.location}</p>
        <details>
          <summary>Podrobnosti in udeleženci</summary>
          <p className="org-prewrap">{e.description || "Brez opisa."}</p>
          <p>
            {admin
              ? s.members
                  .filter((m) =>
                    eligibleMeeting(
                      m,
                      e,
                      s.meetingMembers.some(
                        (a) => a.meeting_id === e.id && a.member_id === m.id,
                      ),
                    ),
                  )
                  .map((m) => m.name)
                  .join(", ")
              : "Prikazani so sestanki, do katerih imaš dostop."}
          </p>
        </details>
        {e.meeting_url && (
          <a
            className="button secondary"
            href={e.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Odpri sestanek
          </a>
        )}
        {me && relevant(e) && (
          <div className="org-actions">
            {selfCheckInAllowed(e) ? (
              ["present", "remote"].map((status) => (
                <button
                  key={status}
                  disabled={busy}
                  className="button secondary"
                  onClick={() => {
                    const old = s.attendance.find(
                      (a) => a.meeting_id === e.id && a.member_id === me.id,
                    );
                    void action(
                      "attendance",
                      old ? "PATCH" : "POST",
                      old
                        ? { id: old.id, status }
                        : {
                            meeting_id: e.id,
                            member_id: me.id,
                            status,
                            note: "",
                          },
                    );
                  }}
                >
                  {labels[status]}
                </button>
              ))
            ) : (
              <small>
                Samoprijava: od 30 min pred začetkom do 2 h po koncu.
              </small>
            )}
          </div>
        )}
        <small>
          Referenca Google: {e.google_event_id} · osveženo {date(e.synced_at)}
        </small>
      </article>
    ));
  return (
    <div className={`app-shell ${shellStyles.shell}`} aria-busy={busy}>
      <a className="skip-link" href="#org-main">
        Preskoči na vsebino
      </a>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Zapri navigacijo"
          onClick={() => setMenu(false)}
        />
      )}
      <aside ref={navigation} id="org-navigation" className={"sidebar" + (menu ? " is-open" : "")} aria-label="Navigacija organizacije" role={menu ? "dialog" : undefined} aria-modal={menu || undefined}>
        <button className={shellStyles.close} aria-label="Zapri navigacijo" onClick={() => setMenu(false)}><X size={20} /></button>
        <Link className="brand brand-logo-link" href="/">
          <BrandLogo />
        </Link>
        <div className="org-hub">
          <strong>{s.settings.name}</strong>
          <small>{actor.role} · Supabase</small>
        </div>
        <nav aria-label="Glavna navigacija">
          {nav
            .filter((v) => admin || !["analytics", "members"].includes(v[0]))
            .map(([id, label, Icon]) => (
              <a
                className={"nav-link" + (view === id ? " active" : "")}
                aria-current={view === id ? "page" : undefined}
                key={id}
                href={"#" + id}
                onClick={() => setMenu(false)}
              >
                <Icon size={19} />
                {label}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <small>{user.email}</small>
          <button className="button secondary" onClick={() => void signOut()}>
            <LogOut size={16} />
            Odjava
          </button>
        </div>
      </aside>
      <div className="main-shell" inert={menu}>
        <header className="topbar">
          <button
            className="button secondary org-menu"
            ref={menuButton}
            aria-label="Odpri navigacijo"
            aria-expanded={menu}
            aria-controls="org-navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={18} />
          </button>
          <span>
            {s.settings.name} / {nav.find((v) => v[0] === view)?.[1]}
          </span>
          <button
            className="button secondary"
            aria-label="Osveži podatke iz baze"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await refresh();
                setError("");
                setNotice("Podatki so osveženi iz Supabase.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={15} />
            Osveži iz baze
          </button>
          <a className={shellStyles.profile} href="#profile" aria-label="Odpri moj profil" aria-current={view === "profile" ? "page" : undefined}>
            <span className={shellStyles.avatar} aria-hidden="true">{profile?.initials || "?"}</span>
            <div><strong>{profile?.name || actor.email}</strong><small>{me ? `Shapers ${me.tier}` : "Moj profil"}</small></div>
          </a>
        </header>
        <main id="org-main" className="org-main">
          {view !== "overview" && <div className="page-heading">
            <span className="eyebrow">SKUPAJ USTVARJAMO SPREMEMBE</span>
            <h1>
              {nav.find((v) => v[0] === view)?.[1]}
            </h1>
            <p>{view === "profile" ? "Tvoji podatki, članstvo in dostop do organizacije." : "Skupen prostor. Preverjena prijava. Podatki v Supabase."}</p>
          </div>}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="info-banner" role="status">
              {notice}
            </div>
          )}
          {view === "meetings" && <PersonalCalendar key={user.id} client={client} />}
          {view === "profile" && <UserProfile snapshot={s} user={user} busy={busy} onSaveName={(name) => action("profile", "PATCH", { name })} />}
          {(view === "analytics" || view === "members") && !admin ? (
            <Card title="Dostop je omejen">
              <p>Ta pogled zahteva administratorsko vlogo.</p>
            </Card>
          ) : null}
          {view === "overview" && (
            <>
              <MemberDashboard snapshot={s} now={now} busy={busy}
                onLogHours={() => setEdit({ kind: "work" })}
                onComplete={(task) => { void action("tasks", "PATCH", { id: task.id, status: "done" }); }}
              />
              <PersonalCalendar key={user.id} client={client} />
            </>
          )}
          {view === "projects" && (
            <>
              <div className="org-actions">
                {admin && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => setEdit({ kind: "projects" })}
                  >
                    <Plus size={16} />
                    Nov projekt
                  </button>
                )}
              </div>
              <div className="org-cards">
                {s.projects.map((p) => (
                  <Card key={p.id} title={p.name}>
                    <span className="status-badge">{labels[p.status]}</span>
                    <p>{p.description || "Brez opisa."}</p>
                    <small>
                      Ustvarjeno {date(p.created_at)} · posodobljeno{" "}
                      {date(p.updated_at)}
                    </small>
                    {admin && (
                      <>
                        <div className="org-actions">
                          <button
                            className="button secondary"
                            onClick={() =>
                              setEdit({ kind: "projects", data: p })
                            }
                          >
                            Uredi projekt
                          </button>
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Arhiviram projekt »${p.name}«?`))
                                void action("projects", "PATCH", {
                                  id: p.id,
                                  status: "archived",
                                });
                            }}
                          >
                            Arhiviraj
                          </button>
                        </div>
                        <h3>Člani projekta</h3>
                        <ul>
                          {s.projectMembers
                            .filter((m) => m.project_id === p.id)
                            .map((m) => (
                              <li key={m.member_id}>
                                {memberName(m.member_id)}{" "}
                                <button
                                  className="cloud-text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void action("project-members", "POST", {
                                      project_id: p.id,
                                      member_id: m.member_id,
                                      remove: true,
                                    })
                                  }
                                >
                                  Odstrani dodelitev
                                </button>
                              </li>
                            ))}
                        </ul>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void action("project-members", "POST", {
                              project_id: p.id,
                              member_id: new FormData(e.currentTarget).get(
                                "member_id",
                              ),
                            });
                          }}
                        >
                          <label>
                            Dodeli člana
                            <select name="member_id" required>
                              {memberOptions}
                            </select>
                          </label>
                          <button className="button secondary" disabled={busy}>
                            Dodeli projektu
                          </button>
                        </form>
                      </>
                    )}
                  </Card>
                ))}
              </div>
              {!s.projects.length && (
                <Empty>Ni projektov. Prvi projekt ustvari administrator.</Empty>
              )}
            </>
          )}
          {view === "tasks" && (
            <>
              <div className="org-actions">
                {admin && (
                  <button
                    className="button primary"
                    onClick={() => setEdit({ kind: "tasks" })}
                    disabled={busy || !s.projects.length}
                  >
                    <Plus size={16} />
                    Nova naloga
                  </button>
                )}
                <label>
                  Projekt
                  <select
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    <option value="">Vsi projekti</option>
                    {s.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {admin && (
                  <label>
                    Dodeljeno
                    <select
                      value={member}
                      onChange={(e) => setMember(e.target.value)}
                    >
                      <option value="">Vse naloge</option>
                      {memberOptions}
                    </select>
                  </label>
                )}
                <button
                  className="button secondary"
                  onClick={() => setMember(actor.member_id || "__none__")}
                >
                  Samo moje
                </button>
              </div>
              <div className="org-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Naloga / projekt</th>
                      <th>Dodeljeno</th>
                      <th>Rok</th>
                      <th>Prednost</th>
                      <th>Status</th>
                      <th>Dejanja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownTasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.title}</strong>
                          <small>{projectName(t.project_id)}</small>
                        </td>
                        <td>{memberName(t.assignee_id)}</td>
                        <td>{t.due_date ? date(t.due_date) : "—"}</td>
                        <td>{labels[t.priority]}</td>
                        <td>
                          <label className="sr-only" htmlFor={"status-" + t.id}>
                            Status: {t.title}
                          </label>
                          <select
                            id={"status-" + t.id}
                            disabled={busy}
                            value={t.status}
                            onChange={(e) =>
                              void action("tasks", "PATCH", {
                                id: t.id,
                                status: e.target.value,
                              })
                            }
                          >
                            {choices(TASK_STATUSES)}
                          </select>
                        </td>
                        <td>
                          <button
                            className="button secondary"
                            onClick={() => setEdit({ kind: "tasks", data: t })}
                          >
                            Uredi
                          </button>
                          {admin && (
                            <button
                              disabled={busy}
                              className="cloud-text-button"
                              onClick={() => {
                                if (confirm(`Arhiviram nalogo »${t.title}«?`))
                                  void action("tasks", "PATCH", {
                                    id: t.id,
                                    archived: true,
                                  });
                              }}
                            >
                              Arhiviraj
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!shownTasks.length && (
                <Empty>Ni dodeljenih nalog za izbrani filter.</Empty>
              )}
            </>
          )}
          {view === "hours" && (
            <>
              {filters}
              <div className="org-actions">
                <strong>
                  {n(shownHours.reduce((a, e) => a + Number(e.hours), 0))} h
                  dnevnih vnosov v obdobju
                </strong>
                {me && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => setEdit({ kind: "work" })}
                  >
                    <Plus size={16} />
                    Zabeleži ure
                  </button>
                )}
              </div>
              <div className="org-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Član</th>
                      <th>Projekt</th>
                      <th>Ure</th>
                      <th>Opis</th>
                      <th>Dejanja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownHours.map((e) => (
                      <tr key={e.id}>
                        <td>{date(e.date)}</td>
                        <td>{memberName(e.member_id)}</td>
                        <td>{projectName(e.project_id)}</td>
                        <td>{n(Number(e.hours))}</td>
                        <td>{e.description}</td>
                        <td>
                          {canEdit(e.member_id) && (
                            <>
                              <button
                                className="button secondary"
                                onClick={() =>
                                  setEdit({ kind: "work", data: e })
                                }
                              >
                                Uredi
                              </button>
                              <button
                                className="cloud-text-button"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    confirm("Odstranim ta vnos iz evidence ur?")
                                  )
                                    void action("work", "PATCH", {
                                      id: e.id,
                                      deleted: true,
                                    });
                                }}
                              >
                                Odstrani
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!shownHours.length && (
                <Empty>V izbranem obdobju ni vnosov ur.</Empty>
              )}
            </>
          )}
          {view === "hours" && (
            <Card title="Uvoženi tedenski seštevki">
              <p>
                Ti izvirni podatki nimajo dnevne razčlenitve. Prikazani so samo
                v celoti zajeti tedni; pri ožjem obdobju razširi datume. Novih
                dnevnih vnosov znotraj uvoženega pokritja baza ne dovoli. Pri
                filtru projekta agregati niso vključeni, ker izvor nima
                projektne razčlenitve.
              </p>
              <p>
                <strong>
                  {n(historicalRows.reduce((v, h) => v + Number(h.hours), 0))} h
                </strong>{" "}
                iz tedenskih agregatov, poleg dnevnih vnosov zgoraj.
              </p>
              <div className="org-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Teden od</th>
                      <th>Pokritje do</th>
                      <th>Član</th>
                      <th>Ure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalRows.map((h) => (
                      <tr key={h.id}>
                        <td>{date(h.week_start)}</td>
                        <td>{date(h.through_date)}</td>
                        <td>{memberName(h.member_id)}</td>
                        <td>{n(Number(h.hours))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {view === "meetings" && (
            <>
              <Card title="Organizacijski Google Calendar · samo branje">
                <p>
                  {s.calendar.configured
                    ? "Google branje je konfigurirano. Spodaj so zadnje uspešno shranjene reference; ob napaki ostanejo označene s časom zadnje osvežitve."
                    : "Google Calendar še ni povezan. Potrebna sta Calendar ID in strežniška API key ali readonly prijava. Lokalni primeri se ne prikazujejo kot živi dogodki."}
                </p>
                {!s.calendar.syncReady && (
                  <p>
                    Za varno shranjevanje referenc manjka SUPABASE_SECRET_KEY na
                    strežniku.
                  </p>
                )}
                <button
                  className="button secondary"
                  disabled={
                    busy || !s.calendar.configured || !s.calendar.syncReady
                  }
                  onClick={() => void action("calendar", "POST", {})}
                >
                  <RefreshCw size={16} />
                  Osveži iz Google Calendar
                </button>
              </Card>
              <div className="org-filters">
                <label>
                  Serija
                  <select
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                  >
                    <option value="">Vse serije</option>
                    {choices(SERIES)}
                  </select>
                </label>
                <label>
                  Obdobje
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="upcoming">Prihodnji</option>
                    <option value="past">Pretekli</option>
                    <option value="all">Vsi v bazi</option>
                  </select>
                </label>
                {me && (
                  <label className="org-check">
                    <input
                      type="checkbox"
                      checked={personal}
                      onChange={(e) => setPersonal(e.target.checked)}
                    />
                    Samo zame
                  </label>
                )}
                <button
                  className="button secondary"
                  onClick={() => setCalendarView(!calendarView)}
                >
                  {calendarView ? "Seznam" : "Koledarski pregled"}
                </button>
              </div>
              {calendarView ? (
                <>
                  <label>
                    Mesec
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => {
                        if (e.target.value) setMonth(e.target.value);
                      }}
                    />
                  </label>
                  <div className="org-calendar">
                    {Array.from(
                      {
                        length: new Date(
                          Number(month.slice(0, 4)),
                          Number(month.slice(5)),
                          0,
                        ).getDate(),
                      },
                      (_, i) => {
                        const day =
                            month + "-" + String(i + 1).padStart(2, "0"),
                          items = meetings.filter(
                            (e) => ljubljanaDate(new Date(e.starts_at)) === day,
                          );
                        return (
                          <section key={day}>
                            <h3>{date(day)}</h3>
                            {items.map((e) => (
                              <p key={e.id}>
                                {time(e.starts_at)} · {e.title}
                              </p>
                            ))}
                          </section>
                        );
                      },
                    )}
                  </div>
                </>
              ) : (
                <div className="org-cards">{meetingCards(meetings)}</div>
              )}
              {!meetings.length && (
                <Empty>
                  Za ta filter ni shranjenih sestankov. To ni dokaz, da je
                  Google koledar prazen; preveri povezavo in osvežitev.
                </Empty>
              )}
            </>
          )}
          {view === "attendance" && (
            <>
              <div className="org-actions">
                {admin && (
                  <button
                    className="button primary"
                    disabled={busy || !s.meetings.length}
                    onClick={() => setEdit({ kind: "attendance" })}
                  >
                    Zabeleži / popravi udeležbo
                  </button>
                )}
                <label>
                  Serija
                  <select
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                  >
                    <option value="">Vse serije</option>
                    {choices(SERIES)}
                  </select>
                </label>
                {admin && (
                  <label>
                    Član
                    <select
                      value={member}
                      onChange={(e) => setMember(e.target.value)}
                    >
                      <option value="">Vsi člani</option>
                      {memberOptions}
                    </select>
                  </label>
                )}
              </div>
              <p>
                Člani se prijavijo v zavihku Sestanki; administrator lahko
                popravi tudi pretekle zapise.
              </p>
              <div className="org-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sestanek</th>
                      <th>Član</th>
                      <th>Status</th>
                      <th>Opomba</th>
                      <th>Dejanja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.attendance
                      .filter(
                        (a) =>
                          (!member || a.member_id === member) &&
                          (!series ||
                            s.meetings.find((e) => e.id === a.meeting_id)
                              ?.series === series),
                      )
                      .map((a) => (
                        <tr key={a.id}>
                          <td>
                            {s.meetings.find((e) => e.id === a.meeting_id)
                              ?.title || "Zgodovinski sestanek"}
                            <small>
                              {s.meetings.find((e) => e.id === a.meeting_id)
                                ?.starts_at
                                ? date(
                                    s.meetings.find(
                                      (e) => e.id === a.meeting_id,
                                    )!.starts_at,
                                  )
                                : ""}
                            </small>
                          </td>
                          <td>{memberName(a.member_id)}</td>
                          <td>{labels[a.status]}</td>
                          <td>{a.note}</td>
                          <td>
                            {admin && (
                              <button
                                className="button secondary"
                                onClick={() =>
                                  setEdit({ kind: "attendance", data: a })
                                }
                              >
                                Popravi
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {(view === "analytics" || view === "members") && admin && (
            <>
              {filters}
              <label>
                Članski razred
                <select value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="">Vsi razredi</option>
                  {choices(["GO!", "Impact", "Core"])}
                </select>
              </label>
              {metrics && (
                <>
                  {metrics.partialWeeks > 0 && (
                    <p role="status" className="notice">
                      Izpuščenih je {metrics.partialWeeks} tedenskih seštevkov,
                      ker izbrani datumi ne pokrivajo celotnega njihovega
                      obdobja. Dnevna razporeditev teh ur ni znana.
                    </p>
                  )}
                  {project && (
                    <p className="notice">
                      Tedenski napredek vključuje vse projekte. Ure v obdobju
                      izključujejo zgodovinske tedenske seštevke brez podatka o
                      projektu.
                    </p>
                  )}
                  <div className="stats-grid">
                    <Stat
                      label="Člani / aktivni"
                      value={`${metrics.totalMembers} / ${metrics.activeMembers}`}
                    />
                    <Stat label="Ure ta teden" value={n(metrics.weeklyHours)} />
                    <Stat label="Pod tedenskim ciljem" value={metrics.behind} />
                    <Stat
                      label="Zaključene naloge v obdobju"
                      value={metrics.completed}
                    />
                    <Stat
                      label="Odprte / zamujene"
                      value={`${metrics.open} / ${metrics.overdue}`}
                    />
                    <Stat
                      label="Udeležba"
                      value={percent(metrics.attendanceRate)}
                    />
                  </div>
                  <Card title="Člani in prispevek">
                    <div className="org-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Član</th>
                            <th>Razred</th>
                            <th>Tedenski cilj</th>
                            <th>Ta teden</th>
                            <th>Ure v obdobju</th>
                            <th>Zaključene naloge</th>
                            <th>Udeležba</th>
                            <th>Auth</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.rows.map((r) => (
                            <tr key={r.id}>
                              <td>
                                {r.name}
                                <small>{r.email}</small>
                              </td>
                              <td>{r.tier}</td>
                              <td>{n(Number(r.weekly_hours))} h</td>
                              <td>{n(r.weekly)} h</td>
                              <td>{n(r.hours)} h</td>
                              <td>{r.completed}</td>
                              <td>{percent(r.attendanceRate)}</td>
                              <td>
                                {r.auth_user_id ? "Povezan" : "Čaka pripravo"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <Card title="Ure po tednih">
                    <div className="org-bars">
                      {metrics.weekly.map((w) => (
                        <div key={w.week}>
                          <span>{date(w.week)}</span>
                          <meter
                            min={0}
                            max={Math.max(
                              1,
                              ...metrics.weekly.map((x) => x.hours),
                            )}
                            value={w.hours}
                          />
                          <strong>{n(w.hours)} h</strong>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card title="Primerjava razredov">
                    <div className="org-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Razred</th>
                            <th>Člani</th>
                            <th>Ure v obdobju</th>
                            <th>Zaključene naloge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {["GO!", "Impact", "Core"].map((t) => {
                            const rows = metrics.rows.filter(
                              (r) => r.tier === t,
                            );
                            return (
                              <tr key={t}>
                                <td>{t}</td>
                                <td>{rows.length}</td>
                                <td>
                                  {n(rows.reduce((a, r) => a + r.hours, 0))}
                                </td>
                                <td>
                                  {rows.reduce((a, r) => a + r.completed, 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <details>
                    <summary>Definicije meritev</summary>
                    <p>
                      Aktiven član ima v izbranem obdobju ure, zaključen dogodek
                      naloge ali prisotnost. Zaključene naloge so različni ID-ji
                      s prehodom v done v shranjeni zgodovini (tudi po ponovnem
                      odprtju). Udeležba = present + remote / vsi relevantni
                      zaključeni sestanki brez excused; manjkajoča prijava šteje
                      kot odsotnost. Tedni se začnejo v ponedeljek v
                      Europe/Ljubljana. Tedenski cilj se ne sorazmeri za
                      trenutni dan. Filter projekt ne velja za udeležbo, ker
                      sestanki niso vezani na projekte.
                    </p>
                  </details>
                </>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <Card title="Moj profil">
                <p>Oglej si podatke svojega računa, članstvo in prikazno ime.</p>
                <a className="button secondary" href="#profile">Odpri moj profil</a>
              </Card>
              <Card title="Ohranjeni delovni prostori">
                <p>
                  Obstoječi JSON podatki niso izbrisani ali samodejno združeni.
                  Arhiv in stare varnostne kopije ostanejo dostopni njihovim
                  lastnikom; nova organizacijska evidenca uporablja relacijske
                  tabele.
                </p>
                <a className="button secondary" href="/legacy">
                  Odpri prejšnje prostore
                </a>
              </Card>
              {superadmin && (
                <>
                  <Card title="Organizacija in povezave">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void action("settings", "PATCH", {
                          name: f.get("name"),
                          calendar_id: f.get("calendar_id"),
                        });
                      }}
                    >
                      <label>
                        Ime organizacije
                        <input
                          name="name"
                          defaultValue={s.settings.name}
                          required
                          maxLength={80}
                        />
                      </label>
                      <label>
                        Google Calendar ID
                        <input
                          name="calendar_id"
                          defaultValue={s.settings.calendar_id}
                          maxLength={500}
                        />
                      </label>
                      <p>
                        Zasebne ključe nastavi samo v strežniškem okolju, nikoli
                        v tem obrazcu. GOOGLE_CALENDAR_ID iz okolja ima
                        prednost.
                      </p>
                      <button className="button primary" disabled={busy}>
                        Shrani nastavitve
                      </button>
                    </form>
                  </Card>
                  <Card title="Vloge in dostop">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          setAccess(await request("access"));
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Naloži dostope
                    </button>
                    <div className="org-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>E-pošta</th>
                            <th>Vloga</th>
                            <th>Stanje</th>
                            <th>Sprememba</th>
                          </tr>
                        </thead>
                        <tbody>
                          {access.map((a) => (
                            <AccessRow
                              key={a.email + ":" + a.role + ":" + a.disabled}
                              access={a}
                              busy={busy}
                              save={async (role) => {
                                if (
                                  !confirm(
                                    `Spremenim vlogo za ${a.email} v ${role}?`,
                                  )
                                )
                                  return;
                                const ok = await action("access", "PATCH", {
                                  email: a.email,
                                  role,
                                  disabled: a.disabled,
                                });
                                if (ok) setAccess(await request("access"));
                              }}
                              toggle={async () => {
                                if (
                                  !confirm(
                                    `${a.disabled ? "Omogočim" : "Onemogočim"} dostop za ${a.email}?`,
                                  )
                                )
                                  return;
                                const ok = await action("access", "PATCH", {
                                  email: a.email,
                                  role: a.role,
                                  disabled: !a.disabled,
                                });
                                if (ok) setAccess(await request("access"));
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await action("invite", "POST", {
                          email: new FormData(e.currentTarget).get("email"),
                        });
                      }}
                    >
                      <label>
                        Povabi odobreni račun
                        <input type="email" name="email" required />
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Pošlji varno povabilo
                      </button>
                      <p>
                        Za že odobrene resnične naslove. Sandbox.example ne
                        prejema pošte; uporabi ločen provisioning skript.
                      </p>
                    </form>
                  </Card>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            shapers OS · Skupen učinek · Supabase je vir podatkov
          </footer>
        </main>
      </div>
      {edit && (
        <Editor
          edit={edit}
          snapshot={s}
          admin={admin}
          busy={busy}
          error={error}
          close={() => setEdit(null)}
          save={async (body) => {
            let verb = edit.data ? "PATCH" : "POST";
            if (edit.kind === "attendance" && !edit.data) {
              const existing = s.attendance.find(
                (a) =>
                  a.meeting_id === body.meeting_id &&
                  a.member_id === body.member_id,
              );
              if (existing) {
                body = { ...body, id: existing.id };
                delete body.meeting_id;
                delete body.member_id;
                verb = "PATCH";
              }
            }
            await action(edit.kind, verb, body);
          }}
        />
      )}
    </div>
  );
}
function AccessRow({
  access: a,
  busy,
  save,
  toggle,
}: {
  access: Access;
  busy: boolean;
  save: (role: string) => Promise<void>;
  toggle: () => Promise<void>;
}) {
  const [role, setRole] = useState(a.role);
  return (
    <tr>
      <td>{a.email}</td>
      <td>
        <label className="sr-only" htmlFor={"role-" + a.email}>
          Vloga za {a.email}
        </label>
        <select
          id={"role-" + a.email}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {["MEMBER", "ADMIN", "SUPERADMIN"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </td>
      <td>
        {a.disabled
          ? "Onemogočen"
          : a.auth_user_id
            ? "Povezan"
            : "Čaka prijavo"}
      </td>
      <td>
        <button
          className="button secondary"
          disabled={busy || role === a.role}
          onClick={() => void save(role)}
        >
          Shrani vlogo
        </button>
        <button
          className="cloud-text-button"
          disabled={busy}
          onClick={() => void toggle()}
        >
          {a.disabled ? "Omogoči" : "Onemogoči"}
        </button>
      </td>
    </tr>
  );
}
function Editor({
  edit,
  snapshot: s,
  admin,
  busy,
  error,
  close,
  save,
}: {
  edit: Edit;
  snapshot: Snapshot;
  admin: boolean;
  busy: boolean;
  error: string;
  close: () => void;
  save: (data: Record<string, unknown>) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  const d = (edit.data || {}) as unknown as Record<string, unknown>,
    kind = edit.kind;
  const val = (key: string, fallback = "") => String(d[key] ?? fallback);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      data: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) data[k] = String(v);
    if ("hours" in data) data.hours = Number(data.hours);
    if (data.project_id === "") data.project_id = null;
    if (data.assignee_id === "") data.assignee_id = null;
    if (data.due_date === "") data.due_date = null;
    if (edit.data) data.id = edit.data.id;
    await save(data);
  }
  const options = (values: string[]) =>
    values.map((v) => (
      <option key={v} value={v}>
        {labels[v] || v}
      </option>
    ));
  return (
    <dialog
      className="dialog"
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-inner">
        <div className="org-actions">
          <h2>
            {edit.data ? "Uredi" : "Dodaj"}{" "}
            {kind === "projects"
              ? "projekt"
              : kind === "tasks"
                ? "nalogo"
                : kind === "work"
                  ? "delovne ure"
                  : "udeležbo"}
          </h2>
          <button
            className="button secondary"
            aria-label="Zapri obrazec"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="org-fields">
            {kind === "projects" && (
              <>
                <label>
                  Ime projekta
                  <input
                    name="name"
                    required
                    maxLength={160}
                    defaultValue={val("name")}
                  />
                </label>
                <label>
                  Opis
                  <textarea
                    name="description"
                    maxLength={5000}
                    defaultValue={val("description")}
                  />
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={val("status", "planning")}
                  >
                    {options(["planning", "active", "done", "archived"])}
                  </select>
                </label>
              </>
            )}
            {kind === "tasks" && (
              <>
                {admin && (
                  <>
                    <label>
                      Naslov naloge
                      <input
                        name="title"
                        required
                        maxLength={200}
                        defaultValue={val("title")}
                      />
                    </label>
                    <label>
                      Projekt
                      <select
                        name="project_id"
                        required
                        defaultValue={val("project_id")}
                      >
                        <option value="">Izberi projekt</option>
                        {s.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Dodeljeno
                      <select
                        name="assignee_id"
                        defaultValue={val("assignee_id")}
                      >
                        <option value="">Nedodeljeno</option>
                        {s.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Prednost
                      <select
                        name="priority"
                        defaultValue={val("priority", "medium")}
                      >
                        {options(PRIORITIES)}
                      </select>
                    </label>
                    <label>
                      Rok
                      <input
                        name="due_date"
                        type="date"
                        defaultValue={val("due_date")}
                      />
                    </label>
                  </>
                )}
                <label>
                  Opis
                  <textarea
                    name="description"
                    maxLength={5000}
                    defaultValue={val("description")}
                  />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={val("status", "todo")}>
                    {options(TASK_STATUSES)}
                  </select>
                </label>
              </>
            )}
            {kind === "work" && (
              <>
                <label>
                  Datum
                  <input
                    name="date"
                    type="date"
                    max={ljubljanaDate()}
                    defaultValue={val("date", ljubljanaDate())}
                    required
                  />
                </label>
                <label>
                  Ure
                  <input
                    name="hours"
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    defaultValue={val("hours", "1")}
                    required
                  />
                </label>
                <label>
                  Projekt (neobvezno)
                  <select name="project_id" defaultValue={val("project_id")}>
                    <option value="">Brez projekta</option>
                    {s.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Opis
                  <textarea
                    name="description"
                    maxLength={2000}
                    defaultValue={val("description")}
                  />
                </label>
              </>
            )}
            {kind === "attendance" && (
              <>
                {!edit.data && (
                  <>
                    <label>
                      Sestanek
                      <select name="meeting_id" required>
                        <option value="">Izberi sestanek</option>
                        {s.meetings.map((m) => (
                          <option key={m.id} value={m.id}>
                            {date(m.starts_at)} · {m.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Član
                      <select name="member_id" required>
                        <option value="">Izberi člana</option>
                        {s.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Status
                  <select name="status" defaultValue={val("status", "present")}>
                    {options(["present", "remote", "excused", "unexcused"])}
                  </select>
                </label>
                <label>
                  Razlog / opomba
                  <textarea
                    name="note"
                    maxLength={2000}
                    defaultValue={val("note")}
                  />
                </label>
              </>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Shranjujem …" : "Shrani v Supabase"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Prekliči
            </button>
          </fieldset>
        </form>
      </div>
    </dialog>
  );
}
