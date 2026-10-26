"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings2,
  Trophy,
  X,
} from "lucide-react";
import BrandLogo from "./brand-logo";
import { isAdmin, ljubljanaDate, type Snapshot } from "@/lib/organization";
import styles from "./dashboard/organization-shell.module.css";

const primary = [
  ["overview", "Pregled", LayoutDashboard],
  ["projects", "Projekti", FolderKanban],
  ["tasks", "Naloge", CheckSquare],
  ["hours", "Ure", Clock3],
  ["meetings", "Sestanki", CalendarDays],
  ["leaderboard", "Lestvica", Trophy],
] as const;
export default function TopNavigation({
  snapshot: s,
  view,
  name,
  initials,
  busy,
  refresh,
  signOut,
}: {
  snapshot: Snapshot;
  view: string;
  name: string;
  initials: string;
  busy: boolean;
  refresh: () => void;
  signOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.activeElement?.closest("dialog")) {
        setOpen(false);
        const details = document.activeElement?.closest("details");
        header.current
          ?.querySelectorAll("details[open]")
          .forEach((el) => el.removeAttribute("open"));
        if (details instanceof HTMLDetailsElement)
          details.querySelector("summary")?.focus();
        else if (header.current?.contains(document.activeElement))
          trigger.current?.focus();
      }
    };
    window.addEventListener("hashchange", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const overdue = s.tasks.filter(
    (t) =>
      !!s.identity.member_id &&
      t.assignee_id === s.identity.member_id &&
      !t.archived &&
      t.status !== "done" &&
      t.due_date &&
      t.due_date < ljubljanaDate(),
  );
  return (
    <header
      className={styles.header}
      ref={header}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a[href]")) {
          setOpen(false);
          header.current
            ?.querySelectorAll("details[open]")
            .forEach((el) => el.removeAttribute("open"));
        }
      }}
    >
      <a
        href="#overview"
        className={styles.brand}
        aria-label="Shapers OS — Pregled"
      >
        <BrandLogo />
        <span>
          Shapers <b>OS</b>
        </span>
      </a>
      <button
        ref={trigger}
        className={styles.mobileToggle}
        aria-label={open ? "Zapri navigacijo" : "Odpri navigacijo"}
        aria-expanded={open}
        aria-controls="org-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav
        id="org-navigation"
        className={styles.navigation}
        data-open={open}
        aria-label="Glavna navigacija"
      >
        {primary.map(([id, label, Icon]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </a>
        ))}
        <details className={styles.dropdown}>
          <summary aria-label="Več pogledov">
            Več <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className={styles.popover}>
            <a
              href="#attendance"
              aria-current={view === "attendance" ? "page" : undefined}
            >
              Prisotnost
            </a>
            {isAdmin(s.identity.role) && (
              <>
                <a
                  href="#members"
                  aria-current={view === "members" ? "page" : undefined}
                >
                  Člani
                </a>
                <a
                  href="#analytics"
                  aria-current={view === "analytics" ? "page" : undefined}
                >
                  Analitika
                </a>
              </>
            )}
            <a href="/legacy">Prejšnji delovni prostori</a>
          </div>
        </details>
      </nav>
      <div className={styles.utilities}>
        <button
          aria-label="Osveži podatke iz baze"
          disabled={busy}
          onClick={refresh}
        >
          <RefreshCw size={17} />
        </button>
        <details className={styles.dropdown}>
          <summary aria-label={`Obvestila: ${overdue.length} zamujenih nalog`}>
            <Bell size={18} aria-hidden="true" />
            {overdue.length > 0 && (
              <span className={styles.notificationCount}>{overdue.length}</span>
            )}
          </summary>
          <div className={styles.popover}>
            <strong>Obvestila</strong>
            {overdue.length ? (
              overdue.slice(0, 5).map((t) => (
                <a key={t.id} href="#tasks">
                  Zamujeno: {t.title}
                </a>
              ))
            ) : (
              <p>Ni zamujenih dodeljenih nalog.</p>
            )}
          </div>
        </details>
        <a
          href="#settings"
          aria-label="Nastavitve"
          aria-current={view === "settings" ? "page" : undefined}
        >
          <Settings2 size={18} />
        </a>
        <details className={styles.dropdown}>
          <summary aria-label="Uporabniški profil">
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.profileName}>{name}</span>
          </summary>
          <div className={styles.popover}>
            <strong>{name}</strong>
            <small>{s.identity.role}</small>
            <a href="#profile">Moj profil</a>
            <button onClick={signOut}>
              <LogOut size={16} /> Odjava
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
