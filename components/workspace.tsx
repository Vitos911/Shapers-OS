"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Earth,
  FolderKanban,
  LayoutDashboard,
  Leaf,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  PROJECT_STATUSES,
  STORAGE_KEY,
  emptyWorkspace,
  isDate,
  localDate,
  parseWorkspace,
  summarize,
  toCsv,
  validateHours,
  type WorkspaceData,
  type Project,
} from "@/lib/model";
import type { WorkspaceStore } from "@/lib/storage";
import BrandLogo from "./brand-logo";

type View =
  "overview" | "projects" | "events" | "members" | "hours" | "settings";
type Modal = "project" | "event" | "member" | "hours" | null;
const navigation = [
  { id: "overview", label: "Pregled", icon: LayoutDashboard },
  { id: "projects", label: "Projekti", icon: FolderKanban },
  { id: "events", label: "Dogodki", icon: CalendarDays },
  { id: "members", label: "Člani", icon: Users },
  { id: "hours", label: "Prostovoljske ure", icon: Clock3 },
] as const;
const titles: Record<View, string> = {
  overview: "Naš prostor za spremembe.",
  projects: "Ideje postanejo dejanja.",
  events: "Srečajmo se v živo.",
  members: "Ljudje, ki premikamo stvari.",
  hours: "Vsaka ura šteje.",
  settings: "Tvoj delovni prostor.",
};
const descriptions: Record<View, string> = {
  overview: "Projekti, ljudje in naslednji koraki. Vse na enem mestu.",
  projects: "Spremljaj projekte od prve ideje do zadnje opravljene naloge.",
  events: "Načrtuj srečanja in zabeleži udeležbo članov.",
  members: "Poveži ekipo in spremljaj njen prispevek skupnosti.",
  hours: "Zabeleži svoj prispevek in ohrani pregled nad opravljenim delom.",
  settings: "Uredi ime skupnosti ter izvozi ali uvozi svojo varnostno kopijo.",
};
const number = (value: number) =>
  new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(value);
const dateLabel = (value: string) =>
  value
    ? new Intl.DateTimeFormat("sl-SI", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "Brez roka";
const stamp = () => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
});
const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();

function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <header>
          <div>
            <span className="eyebrow">WEMRYOS FOR BUSINESS</span>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zapri obrazec"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace({
  store,
  accountControls,
  sharingPanel,
}: {
  store: WorkspaceStore;
  accountControls?: ReactNode;
  sharingPanel?: ReactNode;
}) {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Vsi projekti");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hub, setHub] = useState("Naša skupnost");
  const [busy, setBusy] = useState(false);
  const [editable, setEditable] = useState(true);
  const saving = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void store
      .load()
      .then((snapshot) => {
        if (!active) return;
        setData(snapshot.data);
        setHub(snapshot.name);
        setEditable(snapshot.editable);
        setBlocked(false);
      })
      .catch(() => {
        if (active) {
          setBlocked(true);
          setError(
            store.kind === "supabase"
              ? "Podatkov iz Supabase ni mogoče odpreti. Preveri povezavo in pravice ter klikni Osveži iz baze."
              : "Podatkov v brskalniku ni mogoče odpreti. Obstoječi zapisi so ohranjeni. V Nastavitvah lahko uvoziš veljavno varnostno kopijo.",
          );
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const navigate = () => {
      const id = location.hash.slice(1);
      setView(
        [...navigation.map((x) => x.id), "settings"].includes(id)
          ? (id as View)
          : "overview",
      );
      setQuery("");
      setSelectedProject(null);
      setSelectedEvent(null);
      setSidebarOpen(false);
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    const sync = (event: StorageEvent) => {
      if (store.kind !== "local") return;
      if (event.key === STORAGE_KEY) {
        try {
          setData(
            event.newValue ? parseWorkspace(event.newValue) : emptyWorkspace(),
          );
          setBlocked(false);
        } catch {
          setBlocked(true);
          setError(
            "Podatki v drugem zavihku niso veljavni. Preveri varnostno kopijo.",
          );
        }
      }
      if (event.key === "shapers-os.hub")
        setHub(event.newValue || "Naša skupnost");
    };
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("storage", sync);
    };
  }, [store]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function save(next: WorkspaceData, message: string, name = hub) {
    if (!ready || blocked) {
      setError(
        "Shranjevanje ni na voljo. Odpri Nastavitve in preveri shranjene podatke.",
      );
      return false;
    }
    if (!editable) {
      setError("Za ta prostor imaš pravico samo za ogled.");
      return false;
    }
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    try {
      const snapshot = await store.save(next, name);
      setData(snapshot.data);
      setHub(snapshot.name);
      setEditable(snapshot.editable);
      setError("");
      setNotice(
        store.kind === "supabase"
          ? "Sprememba je shranjena v Supabase."
          : message,
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Shranjevanje ni uspelo. Preveri prostor in dovoljenja brskalnika.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function reloadCloud() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const snapshot = await store.load();
      setData(snapshot.data);
      setHub(snapshot.name);
      setEditable(snapshot.editable);
      setBlocked(false);
      setError("");
      setNotice("Podatki so osveženi iz baze.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Osvežitev ni uspela.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      let next = data;
      const name = text(form, "name");
      if (modal !== "hours" && !name)
        throw new Error("Vnesi ime brez praznih presledkov.");
      if (modal === "project")
        next = {
          ...data,
          projects: [
            ...data.projects,
            {
              ...stamp(),
              name,
              description: text(form, "description"),
              category: text(form, "category"),
              status: "Načrtovanje",
              due: text(form, "due"),
            },
          ],
        };
      if (modal === "member")
        next = {
          ...data,
          members: [
            ...data.members,
            { ...stamp(), name, role: text(form, "role") || "Član ekipe" },
          ],
        };
      if (modal === "event")
        next = {
          ...data,
          events: [
            ...data.events,
            {
              ...stamp(),
              name,
              date: text(form, "date"),
              time: text(form, "time"),
              location: text(form, "location"),
              attendees: [],
            },
          ],
        };
      if (modal === "hours") {
        const date = text(form, "date");
        if (!isDate(date) || date > localDate())
          throw new Error(
            "Ure lahko zabeležiš za današnji ali pretekli datum.",
          );
        const memberId = text(form, "memberId");
        const projectId = text(form, "projectId");
        if (
          !data.members.some((x) => x.id === memberId) ||
          !data.projects.some((x) => x.id === projectId)
        )
          throw new Error("Izberi člana in projekt.");
        next = {
          ...data,
          entries: [
            ...data.entries,
            {
              ...stamp(),
              memberId,
              projectId,
              date,
              hours: validateHours(text(form, "hours")),
              note: text(form, "note"),
            },
          ],
        };
      }
      if (await save(next, "Zapis je shranjen v tem brskalniku."))
        setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preveri vnesene podatke.");
    }
  }

  function exportHours() {
    const rows: unknown[][] = [["Datum", "Član", "Projekt", "Ure", "Opis"]];
    for (const item of data.entries)
      rows.push([
        item.date,
        data.members.find((x) => x.id === item.memberId)?.name,
        data.projects.find((x) => x.id === item.projectId)?.name,
        item.hours,
        item.note,
      ]);
    download(
      toCsv(rows),
      `shapers-ure-${localDate()}.csv`,
      "text/csv;charset=utf-8",
    );
    setNotice("Izvoz CSV je pripravljen.");
  }

  async function importBackup(file: File) {
    let acquired = false;
    try {
      if (file.size > 5_000_000)
        throw new Error("Največja velikost varnostne kopije je 5 MB.");
      const next = parseWorkspace(await file.text());
      if (!editable || saving.current) return;
      if (
        !window.confirm(
          `Uvoz bo zamenjal zapise ${store.kind === "supabase" ? "v skupnem prostoru Supabase" : "v tem brskalniku"}. Si že izvozil/a trenutno varnostno kopijo?`,
        )
      )
        return;
      saving.current = true;
      acquired = true;
      setBusy(true);
      const snapshot = await store.save(next, hub);
      setData(snapshot.data);
      setHub(snapshot.name);
      setBlocked(false);
      setError("");
      setNotice("Varnostna kopija je uvožena.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uvoz ni uspel.");
    } finally {
      if (acquired) { saving.current = false; setBusy(false); }
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function importLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setNotice("V tem brskalniku še ni lokalnih zapisov.");
        return;
      }
      const next = parseWorkspace(raw);
      if (
        !confirm(
          "Lokalni podatki bodo poslani v izbrani prostor Supabase in zamenjali njegovo vsebino. Nadaljujem?",
        )
      )
        return;
      await save(next, "Lokalni podatki so preneseni.");
    } catch {
      setError(
        "Lokalnih podatkov ni mogoče prebrati. Preveri varnostno kopijo.",
      );
    }
  }

  const stats = summarize(data);
  const matches = (value: string) =>
    value.toLocaleLowerCase("sl").includes(query.toLocaleLowerCase("sl"));
  const projects = data.projects.filter(
    (p) =>
      matches(`${p.name} ${p.description} ${p.category}`) &&
      (status === "Vsi projekti" || p.status === status),
  );
  const events = [...data.events]
    .filter((e) => matches(`${e.name} ${e.location}`))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const members = data.members.filter((m) => matches(`${m.name} ${m.role}`));
  const entries = [...data.entries]
    .filter((e) =>
      matches(
        `${e.note} ${data.members.find((m) => m.id === e.memberId)?.name} ${data.projects.find((p) => p.id === e.projectId)?.name}`,
      ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const currentProject = data.projects.find((x) => x.id === selectedProject);
  const currentEvent = data.events.find((x) => x.id === selectedEvent);
  const monthName = new Intl.DateTimeFormat("sl-SI", { month: "long" }).format(
    new Date(),
  );
  const button = (kind: Modal, label: string, secondary = false) => (
    <button
      disabled={!ready || blocked || busy || !editable}
      className={secondary ? "button secondary" : "button primary"}
      onClick={() => {
        setError("");
        setModal(kind);
      }}
    >
      <Plus size={17} />
      {label}
    </button>
  );

  function projectCard(project: Project) {
    const tasks = data.tasks.filter((t) => t.projectId === project.id);
    const done = tasks.filter((t) => t.done).length;
    const hours = data.entries
      .filter((e) => e.projectId === project.id)
      .reduce((sum, e) => sum + e.hours, 0);
    return (
      <button
        key={project.id}
        className="project-card"
        onClick={() => setSelectedProject(project.id)}
      >
        <div className="spread">
          <span
            className={`project-symbol category-${CATEGORIES.indexOf(project.category)}`}
          >
            <Leaf size={22} />
          </span>
          <span
            className={`badge status-${PROJECT_STATUSES.indexOf(project.status)}`}
          >
            {project.status}
          </span>
        </div>
        <span className="category-label">{project.category}</span>
        <h3>{project.name}</h3>
        <p>
          {project.description || "Dodaj naloge in skupaj naredite prvi korak."}
        </p>
        <div className="progress-label">
          <span>
            {done} / {tasks.length} nalog
          </span>
          <span>
            {tasks.length ? Math.round((done / tasks.length) * 100) : 0} %
          </span>
        </div>
        <div className="progress">
          <span
            style={{
              width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
        <footer>
          <span>
            <CalendarDays size={14} />
            {dateLabel(project.due)}
          </span>
          <span>
            <Clock3 size={14} />
            {number(hours)} h
          </span>
        </footer>
      </button>
    );
  }

  return (
    <div className="app-shell" aria-busy={busy}>
      <a className="skip-link" href="#main-content">
        Preskoči na vsebino
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Zapri navigacijo"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a className="brand brand-logo-link" href="#overview">
          <BrandLogo />
        </a>
        <div className="workspace-label">
          <span className="hub-avatar">S</span>
          <div>
            <strong>{hub}</strong>
            <span>Delovni prostor</span>
          </div>
          <span className="online-dot" title={store.kind === "supabase" ? "Podatki v Supabase" : "Podatki v brskalniku"} />
        </div>
        <div className="nav-heading">DELOVNI PROSTOR</div>
        <nav aria-label="Glavna navigacija">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={view === item.id ? "nav-link active" : "nav-link"}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "projects" && data.projects.length > 0 && (
                <span className="nav-count">{data.projects.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mission-note">
            <Sparkles size={19} />
            <strong>
              Majhni koraki.
              <br />
              Skupen učinek.
            </strong>
            <p>Prostor za ideje, ki naredijo nekaj dobrega.</p>
          </div>
          <a
            href="#settings"
            className={`nav-link ${view === "settings" ? "active" : ""}`}
          >
            <Settings2 size={19} />
            Nastavitve in podatki
          </a>
          <div className="local-label">
            <span className="online-dot" />
            {store.kind === "supabase" ? "Shranjeno v Supabase" : "Shranjeno v brskalniku"}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              aria-label="Odpri navigacijo"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>{hub}</span>
            <ChevronRight size={14} />
            <strong>
              {navigation.find((x) => x.id === view)?.label || "Nastavitve"}
            </strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Išči v trenutnem pogledu"
                placeholder="Poišči v tem pogledu …"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <a
              href="#settings"
              className="icon-button"
              aria-label="Pomoč in podatki"
            >
              <CircleHelp size={20} />
            </a>
            <span
              className="profile-avatar"
              aria-label={store.kind === "supabase" ? "Skupni delovni prostor" : "Lokalni delovni prostor"}
            >
              S
            </span>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">SKUPAJ USTVARJAMO SPREMEMBE</span>
              <h1>{titles[view]}</h1>
              <p>{descriptions[view]}</p>
            </div>
            <div className="heading-action">
              {view === "overview" || view === "hours"
                ? button("hours", "Zabeleži ure")
                : view === "projects"
                  ? button("project", "Nov projekt")
                  : view === "events"
                    ? button("event", "Nov dogodek")
                    : view === "members"
                      ? button("member", "Dodaj člana")
                      : null}
            </div>
          </div>
          {!ready && (
            <div className="info-banner" role="status">
              Odpiram delovni prostor …
            </div>
          )}
          {error && !modal && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Zapri sporočilo"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="storage-notice">
            <span className="small-dot" />
            {store.kind === "supabase" ? `Supabase · skupni podatki${editable ? "" : " · samo ogled"}` : "Lokalni delovni prostor · podatki ostanejo v tem brskalniku"}
            <a href="#settings">
              Varnostna kopija
              <ArrowRight size={13} />
            </a>
          </div>

          {(accountControls || store.kind === "supabase") && <div className="cloud-controls">{accountControls}{store.kind === "supabase" && <button className="button secondary" disabled={busy} onClick={() => void reloadCloud()}>Osveži iz baze</button>}</div>}
          {busy && <div className="info-banner" role="status">Shranjujem oziroma osvežujem podatke …</div>}

          {view === "overview" && (
            <>
              <section className="welcome-banner">
                <div>
                  <span className="pill">
                    <Earth size={14} />
                    SKUPNOST
                  </span>
                  <h2>
                    Dobre ideje potrebujejo
                    <br />
                    prostor za začetek.
                  </h2>
                  <p>
                    Zberi ekipo, odpri projekt in naredi prvi korak.
                    <br className="desktop-break" /> Skupaj lahko dosežemo več.
                  </p>
                  <button
                    className="button white"
                    disabled={!ready || blocked || busy || !editable}
                    onClick={() => setModal("project")}
                  >
                    Ustvari projekt
                    <ArrowRight size={16} />
                  </button>
                </div>
                <Earth
                  className="banner-earth"
                  size={245}
                  strokeWidth={0.7}
                  aria-hidden="true"
                />
                <span className="banner-coordinate">
                  IDEJE → DEJANJA → SPREMEMBE
                </span>
              </section>
              <section className="stats-grid" aria-label="Pregled skupnosti">
                {[
                  {
                    label: "Aktivni projekti",
                    value: number(stats.activeProjects),
                    detail: "Od ideje do izvedbe",
                    icon: FolderKanban,
                    style: "blue",
                  },
                  {
                    label: "Člani skupnosti",
                    value: number(stats.members),
                    detail: "Vsak prispevek šteje",
                    icon: Users,
                    style: "violet",
                  },
                  {
                    label: "Ure v tem mesecu",
                    value: number(stats.monthlyHours),
                    detail: monthName,
                    icon: Clock3,
                    style: "orange",
                  },
                  {
                    label: "Prihajajoči dogodki",
                    value: number(stats.upcomingEvents),
                    detail: "Priložnosti za povezovanje",
                    icon: CalendarDays,
                    style: "green",
                  },
                ].map((item) => (
                  <div className="stat-card" key={item.label}>
                    <div className="spread">
                      <span>{item.label}</span>
                      <span className={`stat-icon ${item.style}`}>
                        <item.icon size={18} />
                      </span>
                    </div>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </section>
              <div className="overview-columns">
                <section>
                  <div className="section-heading">
                    <h2>Projekti v središču</h2>
                    <a href="#projects">
                      Vsi projekti
                      <ArrowRight size={15} />
                    </a>
                  </div>
                  {projects.length ? (
                    <div className="project-grid overview-projects">
                      {projects.slice(0, 4).map(projectCard)}
                    </div>
                  ) : (
                    <div className="panel">
                      <Empty
                        icon={<FolderKanban size={27} />}
                        title={query ? "Ni zadetkov" : "Začni z dobro idejo"}
                        action={
                          !query &&
                          button("project", "Ustvari prvi projekt", true)
                        }
                      >
                        {query
                          ? "Poskusi z drugim iskalnim izrazom."
                          : "Tvoj prvi projekt bo tukaj. Dodaj cilj, razdeli naloge in spremljaj napredek."}
                      </Empty>
                    </div>
                  )}
                </section>
                <section>
                  <div className="section-heading">
                    <h2>Naslednji dogodki</h2>
                    <a href="#events">
                      Vsi
                      <ArrowRight size={15} />
                    </a>
                  </div>
                  <div className="panel events-panel">
                    {events.filter((e) => e.date >= localDate()).length ? (
                      events
                        .filter((e) => e.date >= localDate())
                        .slice(0, 4)
                        .map((event) => (
                          <button
                            className="event-row"
                            key={event.id}
                            onClick={() => setSelectedEvent(event.id)}
                          >
                            <span className="date-tile">
                              <small>
                                {new Intl.DateTimeFormat("sl-SI", {
                                  month: "short",
                                }).format(new Date(`${event.date}T12:00:00`))}
                              </small>
                              <strong>{Number(event.date.slice(-2))}</strong>
                            </span>
                            <span>
                              <strong>{event.name}</strong>
                              <small>
                                {event.time} ·{" "}
                                {event.location || "Lokacija še ni določena"}
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))
                    ) : (
                      <Empty
                        icon={<CalendarDays size={25} />}
                        title="Naredimo prostor za srečanje"
                        action={button("event", "Dodaj dogodek", true)}
                      >
                        Naslednje srečanje ekipe, delavnica ali akcija v
                        skupnosti.
                      </Empty>
                    )}
                  </div>
                  <div className="impact-note">
                    <span className="stat-icon green">
                      <Leaf size={20} />
                    </span>
                    <div>
                      <h3>Učinek se začne z vami.</h3>
                      <p>
                        Do zdaj ste zabeležili {number(stats.totalHours)}{" "}
                        prostovoljskih ur.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}

          {view === "projects" && (
            <>
              <div className="filter-bar">
                <div className="filter-tabs" aria-label="Status projekta">
                  {["Vsi projekti", ...PROJECT_STATUSES].map((s) => (
                    <button
                      aria-pressed={status === s}
                      className={status === s ? "selected" : ""}
                      key={s}
                      onClick={() => setStatus(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <span>{projects.length} projektov</span>
              </div>
              {projects.length ? (
                <section className="project-grid">
                  {projects.map(projectCard)}
                </section>
              ) : (
                <section className="panel">
                  <Empty
                    icon={<FolderKanban size={32} />}
                    title={
                      data.projects.length
                        ? "Ni projektov za ta izbor"
                        : "Prvi korak je tvoj"
                    }
                    action={button("project", "Nov projekt")}
                  >
                    Dodaj projekt, določi cilj in spremljaj napredek z nalogami.
                  </Empty>
                </section>
              )}
            </>
          )}

          {view === "events" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Koledar skupnosti</h2>
                <span>{events.length} dogodkov</span>
              </div>
              {events.length ? (
                events.map((event) => (
                  <button
                    className={`event-row full ${event.date < localDate() ? "past-event" : ""}`}
                    key={event.id}
                    onClick={() => setSelectedEvent(event.id)}
                  >
                    <span className="date-tile">
                      <small>
                        {new Intl.DateTimeFormat("sl-SI", {
                          month: "short",
                        }).format(new Date(`${event.date}T12:00:00`))}
                      </small>
                      <strong>{Number(event.date.slice(-2))}</strong>
                    </span>
                    <span className="event-description">
                      <strong>{event.name}</strong>
                      <small>
                        <MapPin size={13} />
                        {event.location || "Lokacija še ni določena"}
                      </small>
                    </span>
                    <span className="event-time">
                      {dateLabel(event.date)} · {event.time}
                    </span>
                    <span className="badge">
                      {event.attendees.length} udeležencev
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))
              ) : (
                <Empty
                  icon={<CalendarDays size={32} />}
                  title="Naslednja priložnost za povezovanje"
                  action={button("event", "Ustvari dogodek")}
                >
                  Dodaj dogodek, čas in lokacijo. Udeležbo članov lahko
                  zabeležiš v podrobnostih.
                </Empty>
              )}
            </section>
          )}

          {view === "members" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Naša ekipa</h2>
                <span>{members.length} članov</span>
              </div>
              {members.length ? (
                <div className="members-grid">
                  {members.map((member, index) => (
                    <article className="member-card" key={member.id}>
                      <span className={`member-avatar color-${index % 4}`}>
                        {member.name
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((x) => x[0])
                          .join("")}
                      </span>
                      <h3>{member.name}</h3>
                      <p>{member.role}</p>
                      <div>
                        <Clock3 size={15} />
                        {number(
                          data.entries
                            .filter((x) => x.memberId === member.id)
                            .reduce((sum, x) => sum + x.hours, 0),
                        )}{" "}
                        zabeleženih ur
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Users size={32} />}
                  title="Spremembe ustvarjamo skupaj"
                  action={button("member", "Dodaj prvega člana")}
                >
                  Dodaj člane ekipe, da jim lahko pripišeš ure in zabeležiš
                  njihovo udeležbo.
                </Empty>
              )}
            </section>
          )}

          {view === "hours" && (
            <>
              <div className="hours-summary">
                <div>
                  <span>Skupni prispevek</span>
                  <strong>
                    {number(stats.totalHours)} <small>ur</small>
                  </strong>
                </div>
                <div>
                  <span>Ta mesec</span>
                  <strong>
                    {number(stats.monthlyHours)} <small>ur</small>
                  </strong>
                </div>
                <button
                  className="button secondary"
                  disabled={!data.entries.length}
                  onClick={exportHours}
                >
                  <ArrowDownToLine size={17} />
                  Izvozi CSV
                </button>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Evidenca opravljenega dela</h2>
                  <span>{entries.length} zapisov</span>
                </div>
                {entries.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Član</th>
                          <th>Projekt in opis</th>
                          <th className="numeric">Ure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{dateLabel(entry.date)}</td>
                            <td>
                              {
                                data.members.find(
                                  (m) => m.id === entry.memberId,
                                )?.name
                              }
                            </td>
                            <td>
                              <strong>
                                {
                                  data.projects.find(
                                    (p) => p.id === entry.projectId,
                                  )?.name
                                }
                              </strong>
                              <small>{entry.note || "Brez opisa"}</small>
                            </td>
                            <td className="numeric">{number(entry.hours)} h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={<Clock3 size={32} />}
                    title="Tvoj čas naredi razliko"
                    action={button("hours", "Zabeleži prve ure")}
                  >
                    Izberi člana in projekt, vnesi čas ter dodaj kratek opis
                    opravljenega dela.
                  </Empty>
                )}
              </section>
            </>
          )}

          {view === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <span className="stat-icon blue">
                  <Settings2 size={21} />
                </span>
                <h2>Ime skupnosti</h2>
                <p>{store.kind === "supabase" ? "Ime je skupno vsem uporabnikom tega prostora." : "Ime se prikaže v navigaciji tega brskalnika."}</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = text(new FormData(e.currentTarget), "hub");
                    if (!name) return;
                    await save(data, "Ime skupnosti je shranjeno.", name);
                  }}
                >
                  <label>
                    Ime delovnega prostora
                    <input
                      name="hub"
                      defaultValue={hub}
                      key={hub}
                      maxLength={80}
                      required
                      disabled={busy || !editable}
                    />
                  </label>
                  <button disabled={busy || !editable || blocked} className="button primary">Shrani ime</button>
                </form>
              </section>
              <section className="panel settings-panel">
                <span className="stat-icon green">
                  <ArrowDownToLine size={21} />
                </span>
                <h2>Podatki in varnostne kopije</h2>
                <p>
                  {store.kind === "supabase" ? "Podatki so shranjeni v izbranem prostoru Supabase. Vidijo jih samo računi z dodeljenim dostopom. Za najnovejše spremembe klikni Osveži iz baze." : "Podatki so shranjeni samo v tem brskalniku in se ne sinhronizirajo med napravami ali člani. Redno izvozi kopijo."}
                </p>
                <button
                  className="button secondary"
                  disabled={!ready || blocked}
                  onClick={() =>
                    download(
                      JSON.stringify(data, null, 2),
                      `shapers-os-${localDate()}.json`,
                      "application/json",
                    )
                  }
                >
                  <ArrowDownToLine size={17} />
                  Izvozi varnostno kopijo
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !editable}
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={17} />
                  Uvozi varnostno kopijo
                </button>
                {store.kind === "supabase" && <button className="button secondary" disabled={busy || !editable || blocked} onClick={() => void importLocal()}><Upload size={17} />Prenesi lokalne podatke v Supabase</button>}
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Izberi varnostno kopijo JSON"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importBackup(file);
                  }}
                />
                <div className="info-banner">
                  Dodajanje člana ustvari zapis v evidenci. Pravice za dostop do skupnega prostora se upravljajo ločeno in ne pošljejo vabila po e-pošti.
                </div>
              </section>
              {sharingPanel}
            </div>
          )}
          <footer className="page-footer">
            <span>
              shapers<span>OS</span> · Your team. One workspace.
            </span>
            <span>Iz majhnih dejanj rastejo velike spremembe.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}

      {modal && (
        <Dialog
          title={
            {
              project: "Ustvari nov projekt",
              event: "Načrtuj dogodek",
              member: "Dodaj člana ekipe",
              hours: "Zabeleži prostovoljske ure",
            }[modal]
          }
          onClose={() => {
            setModal(null);
            setError("");
          }}
        >
          <form onSubmit={submit}>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {modal === "project" && (
              <>
                <label>
                  Ime projekta
                  <input
                    name="name"
                    maxLength={120}
                    placeholder="Npr. Zelena soseska"
                    required
                  />
                </label>
                <label>
                  Kaj želimo doseči?
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={1000}
                    placeholder="Opiši cilj projekta in komu je namenjen …"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Področje
                    <select name="category">
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ciljni datum
                    <input name="due" type="date" />
                  </label>
                </div>
              </>
            )}
            {modal === "member" && (
              <>
                <label>
                  Ime in priimek
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={100}
                    required
                    placeholder="Ime člana ekipe"
                  />
                </label>
                <label>
                  Vloga
                  <input
                    name="role"
                    maxLength={100}
                    placeholder="Npr. Koordinacija projektov"
                  />
                </label>
                <p className="form-hint">
                  Člana dodaš v evidenco prostora. Vabilo po e-pošti se ne
                  pošlje.
                </p>
              </>
            )}
            {modal === "event" && (
              <>
                <label>
                  Ime dogodka
                  <input
                    name="name"
                    maxLength={120}
                    required
                    placeholder="Npr. Mesečno srečanje ekipe"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Datum
                    <input
                      name="date"
                      type="date"
                      defaultValue={localDate()}
                      required
                    />
                  </label>
                  <label>
                    Čas
                    <input
                      name="time"
                      type="time"
                      defaultValue="17:00"
                      required
                    />
                  </label>
                </div>
                <label>
                  Lokacija
                  <input
                    name="location"
                    maxLength={150}
                    placeholder="Naslov ali ime lokacije"
                  />
                </label>
              </>
            )}
            {modal === "hours" &&
              (data.members.length && data.projects.length ? (
                <>
                  <label>
                    Član
                    <select name="memberId" required>
                      <option value="">Izberi člana</option>
                      {data.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Projekt
                    <select name="projectId" required>
                      <option value="">Izberi projekt</option>
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-row">
                    <label>
                      Datum
                      <input
                        type="date"
                        name="date"
                        defaultValue={localDate()}
                        max={localDate()}
                        required
                      />
                    </label>
                    <label>
                      Število ur
                      <input
                        type="number"
                        name="hours"
                        min="0.25"
                        max="24"
                        step="0.25"
                        placeholder="2,5"
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Opravljeno delo
                    <textarea
                      name="note"
                      rows={3}
                      maxLength={1000}
                      placeholder="Na kratko opiši svoj prispevek …"
                    />
                  </label>
                </>
              ) : (
                <div className="prerequisites">
                  <Clock3 size={34} />
                  <h3>Najprej poveži ekipo in projekt.</h3>
                  <p>
                    Za beleženje ur potrebuješ vsaj enega člana in en projekt.
                  </p>
                  {!data.members.length && (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setModal("member")}
                    >
                      <Users size={17} />
                      Dodaj člana
                    </button>
                  )}
                  {!data.projects.length && (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setModal("project")}
                    >
                      <FolderKanban size={17} />
                      Ustvari projekt
                    </button>
                  )}
                </div>
              ))}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                Prekliči
              </button>
              {(modal !== "hours" ||
                !!(data.members.length && data.projects.length)) && (
                <button disabled={busy || !editable} className="button primary" type="submit">
                  {modal === "hours"
                    ? "Shrani ure"
                    : modal === "project"
                      ? "Ustvari projekt"
                      : modal === "event"
                        ? "Shrani dogodek"
                        : "Dodaj člana"}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </form>
        </Dialog>
      )}

      {currentProject && (
        <Dialog
          title={currentProject.name}
          onClose={() => setSelectedProject(null)}
        >
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="detail-meta">
            <span className="badge">{currentProject.category}</span>
            <span>
              <CalendarDays size={15} />
              {dateLabel(currentProject.due)}
            </span>
          </div>
          <p className="detail-description">
            {currentProject.description || "Projekt še nima opisa."}
          </p>
          <label>
            Status projekta
            <select
              value={currentProject.status}
              disabled={busy || !editable || blocked}
              onChange={(e) =>
                save(
                  {
                    ...data,
                    projects: data.projects.map((p) =>
                      p.id === currentProject.id
                        ? { ...p, status: e.target.value }
                        : p,
                    ),
                  },
                  "Status projekta je posodobljen.",
                )
              }
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <h3 className="task-heading">Naslednji koraki</h3>
          <div className="task-list">
            {data.tasks
              .filter((t) => t.projectId === currentProject.id)
              .map((task) => (
                <label
                  key={task.id}
                  className={`task ${task.done ? "done" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={task.done}
                    disabled={busy || !editable || blocked}
                    onChange={() =>
                      save(
                        {
                          ...data,
                          tasks: data.tasks.map((t) =>
                            t.id === task.id ? { ...t, done: !t.done } : t,
                          ),
                        },
                        "Naloga je posodobljena.",
                      )
                    }
                  />
                  <span>{task.title}</span>
                </label>
              ))}
          </div>
          <form
            className="add-task"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const title = text(new FormData(form), "task");
              if (!title) return;
              if (
                await save(
                  {
                    ...data,
                    tasks: [
                      ...data.tasks,
                      {
                        ...stamp(),
                        projectId: currentProject.id,
                        title,
                        done: false,
                      },
                    ],
                  },
                  "Naloga je dodana.",
                )
              )
                form.reset();
            }}
          >
            <input
              aria-label="Nova naloga"
              name="task"
              maxLength={200}
              placeholder="Dodaj naslednji korak …"
              required
              disabled={busy || !editable || blocked}
            />
            <button disabled={busy || !editable || blocked} className="button primary" aria-label="Dodaj nalogo">
              <Plus size={19} />
            </button>
          </form>
        </Dialog>
      )}

      {currentEvent && (
        <Dialog
          title={currentEvent.name}
          onClose={() => setSelectedEvent(null)}
        >
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="detail-meta">
            <span>
              <CalendarDays size={16} />
              {dateLabel(currentEvent.date)} · {currentEvent.time}
            </span>
            <span>
              <MapPin size={16} />
              {currentEvent.location || "Lokacija še ni določena"}
            </span>
          </div>
          <h3 className="task-heading">Evidenca udeležbe</h3>
          <p className="form-hint">
            Označi člane, ki so se udeležili dogodka. Shranjevanje je samodejno.
          </p>
          {data.members.length ? (
            <div className="task-list">
              {data.members.map((member) => (
                <label className="task" key={member.id}>
                  <input
                    type="checkbox"
                    checked={currentEvent.attendees.includes(member.id)}
                    disabled={busy || !editable || blocked}
                    onChange={() =>
                      save(
                        {
                          ...data,
                          events: data.events.map((e) =>
                            e.id === currentEvent.id
                              ? {
                                  ...e,
                                  attendees: e.attendees.includes(member.id)
                                    ? e.attendees.filter(
                                        (id) => id !== member.id,
                                      )
                                    : [...e.attendees, member.id],
                                }
                              : e,
                          ),
                        },
                        "Udeležba je shranjena.",
                      )
                    }
                  />
                  <span>{member.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p>Najprej dodaj člane v pogledu Člani.</p>
          )}
        </Dialog>
      )}
    </div>
  );
}
