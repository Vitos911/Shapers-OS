"use client";
import { useState } from "react";
import { FolderKanban, Plus, Users } from "lucide-react";
import { isAdmin, type OrgProject, type Snapshot } from "@/lib/organization";
import styles from "./project-discovery.module.css";

type Action = (
  resource: string,
  method: string,
  body: unknown,
) => Promise<unknown>;
const statuses: Record<string, string> = {
  planning: "Načrtovanje",
  active: "V teku",
  done: "Zaključeno",
  archived: "Arhivirano",
};
const events: Record<string, string> = {
  joined: "Pridružitev",
  left: "Izstop / odstranitev",
  request_pending: "Zahteva za članstvo",
  request_approved: "Odobreno",
  request_rejected: "Zavrnjeno",
  request_cancelled: "Preklicano",
};

export function MyProjects({ snapshot: s }: { snapshot: Snapshot }) {
  const mine = s.projects.filter((p) =>
    s.projectMembers.some(
      (m) => m.project_id === p.id && m.member_id === s.identity.member_id,
    ),
  );
  return (
    <section
      className={`panel ${styles.section}`}
      aria-labelledby="my-projects-title"
    >
      <div className={styles.heading}>
        <h2 id="my-projects-title">Moji projekti</h2>
        <a href="#projects">Razišči vse projekte →</a>
      </div>
      {mine.length ? (
        <ul className={styles.mine}>
          {mine.map((p) => (
            <li key={p.id}>
              <FolderKanban size={18} aria-hidden="true" />
              <a href="#projects">{p.name}</a>
              <span className="status-badge" data-status={p.status}>
                {statuses[p.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          Še nisi član projekta. Pridruži se odprtemu projektu ali pošlji
          zahtevo za odobritev.
        </p>
      )}
    </section>
  );
}

export default function ProjectDiscovery({
  snapshot: s,
  busy,
  action,
  edit,
}: {
  snapshot: Snapshot;
  busy: boolean;
  action: Action;
  edit: (project?: OrgProject) => void;
}) {
  const [scope, setScope] = useState("all"),
    [search, setSearch] = useState("");
  const admin = isAdmin(s.identity.role),
    me = s.identity.member_id;
  const joined = (id: string) =>
    s.projectMembers.some((m) => m.project_id === id && m.member_id === me);
  const projects = s.projects.filter(
    (p) =>
      (!search ||
        `${p.name} ${p.description} ${p.goal || ""}`
          .toLocaleLowerCase("sl")
          .includes(search.toLocaleLowerCase("sl"))) &&
      (scope === "all" ||
        (scope === "mine"
          ? joined(p.id)
          : p.join_policy !== "closed" &&
            ["planning", "active"].includes(p.status) &&
            !joined(p.id))),
  );
  return (
    <>
      {s.collaboration?.ready === false && (
        <p className="info-banner" role="status">
          Samostojno članstvo in prevzem nalog čakata na namestitev podatkovnih
          migracij. Obstoječi projekti in naloge so ohranjeni.
        </p>
      )}
      <div className="org-actions">
        <label>
          Iskanje projektov
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ime, opis ali cilj …"
          />
        </label>
        <label>
          Prikaži
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Vsi dostopni projekti</option>
            <option value="mine">Moji projekti</option>
            <option value="open">Odprti za pridružitev</option>
          </select>
        </label>
        {admin && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => edit()}
          >
            <Plus size={16} />
            Nov projekt
          </button>
        )}
      </div>
      <div className={styles.grid}>
        {projects.map((p) => {
          const members =
            s.projectDirectory?.filter((m) => m.project_id === p.id) ||
            s.projectMembers
              .filter((m) => m.project_id === p.id)
              .map((m) => ({
                ...m,
                name:
                  s.members.find((x) => x.id === m.member_id)?.name || "Član",
              }));
          const progress = s.projectProgress?.find(
            (x) => x.project_id === p.id,
          );
          const pending = s.joinRequests?.find(
            (r) =>
              r.project_id === p.id &&
              r.member_id === me &&
              r.status === "pending",
          );
          const obligations = s.tasks.some(
            (t) =>
              t.project_id === p.id &&
              t.assignee_id === me &&
              !t.archived &&
              t.status !== "done",
          );
          const active = ["planning", "active"].includes(p.status);
          const requests =
            s.joinRequests?.filter(
              (r) => r.project_id === p.id && r.status === "pending",
            ) || [];
          return (
            <article
              key={p.id}
              className={`panel ${styles.project}`}
              aria-labelledby={`project-${p.id}`}
            >
              <div className={styles.heading}>
                <FolderKanban size={22} aria-hidden="true" />
                <span className="status-badge" data-status={p.status}>
                  {statuses[p.status]}
                </span>
              </div>
              <h2 id={`project-${p.id}`}>{p.name}</h2>
              <p>{p.description || "Opis še ni dodan."}</p>
              <div className={styles.goal}>
                <strong>Cilj projekta</strong>
                <p>{p.goal || "Cilj še ni določen."}</p>
              </div>
              <div className={styles.progress}>
                <span>Napredek nalog</span>
                {progress ? (
                  <>
                    <strong>
                      {progress.done} / {progress.total} zaključenih
                    </strong>
                    <progress
                      aria-label={`Napredek projekta ${p.name}`}
                      value={progress.done}
                      max={Math.max(1, progress.total)}
                    />
                  </>
                ) : (
                  <small>Napredek trenutno ni na voljo.</small>
                )}
              </div>
              <p className={styles.muted}>
                {p.visibility === "organization"
                  ? "Vidno organizaciji"
                  : "Zasebni projekt"}{" "}
                ·{" "}
                {p.join_policy === "open"
                  ? "Odprta pridružitev"
                  : p.join_policy === "approval"
                    ? "Potrebna odobritev"
                    : "Samo s povabilom"}
              </p>
              <details>
                <summary>
                  <Users size={15} aria-hidden="true" /> Člani projekta (
                  {members.length})
                </summary>
                {members.length ? (
                  <ul className={styles.list}>
                    {members.map((m) => (
                      <li key={m.member_id}>
                        <span>
                          {m.name}
                          {m.member_id === me ? " (ti)" : ""}
                        </span>
                        {admin && (
                          <button
                            disabled={busy}
                            className="cloud-text-button"
                            onClick={() =>
                              void action("project-members", "POST", {
                                project_id: p.id,
                                member_id: m.member_id,
                                remove: true,
                              })
                            }
                          >
                            Odstrani člana
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Projekt še nima članov.</p>
                )}
              </details>
              <div className="org-actions">
                {me &&
                  (joined(p.id) ? (
                    <button
                      className="button secondary"
                      disabled={busy || obligations}
                      aria-describedby={
                        obligations ? `handoff-${p.id}` : undefined
                      }
                      onClick={() =>
                        void action("membership", "POST", {
                          project_id: p.id,
                          action: "leave",
                        })
                      }
                    >
                      Zapusti projekt
                    </button>
                  ) : pending ? (
                    <>
                      <span role="status">Zahteva čaka na odobritev.</span>
                      <button
                        disabled={busy}
                        className="cloud-text-button"
                        onClick={() =>
                          void action("membership", "POST", {
                            project_id: p.id,
                            action: "leave",
                          })
                        }
                      >
                        Prekliči zahtevo
                      </button>
                    </>
                  ) : active && p.join_policy && p.join_policy !== "closed" ? (
                    <button
                      disabled={busy}
                      className="button primary"
                      onClick={() =>
                        void action("membership", "POST", {
                          project_id: p.id,
                          action: "join",
                        })
                      }
                    >
                      {p.join_policy === "open"
                        ? "Pridruži se"
                        : "Zaprosi za članstvo"}
                    </button>
                  ) : (
                    <span className={styles.muted}>
                      Pridružitev trenutno ni odprta.
                    </span>
                  ))}
                {admin && (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() => edit(p)}
                  >
                    Uredi projekt
                  </button>
                )}
              </div>
              {joined(p.id) && obligations && (
                <p id={`handoff-${p.id}`} className={styles.handoff}>
                  Pred izstopom predaj ali zaključi svoje odprte naloge.
                </p>
              )}
              {admin && (
                <details>
                  <summary>
                    Upravljanje članstva
                    {requests.length ? ` · ${requests.length} zahtev` : ""}
                  </summary>
                  <p className={styles.muted}>
                    Članstvo omogoča sodelovanje; naloge dodeljuješ ločeno.
                  </p>
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
                      Dodaj člana
                      <select name="member_id" required defaultValue="">
                        <option value="" disabled>
                          Izberi člana
                        </option>
                        {s.members
                          .filter(
                            (m) => !members.some((x) => x.member_id === m.id),
                          )
                          .map((m) => (
                            <option value={m.id} key={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button disabled={busy} className="button secondary">
                      Dodaj v projekt
                    </button>
                  </form>
                  {requests.map((r) => (
                    <div key={r.id} className={styles.request}>
                      <strong>
                        {s.members.find((m) => m.id === r.member_id)?.name ||
                          "Član"}
                      </strong>
                      {["approve", "reject"].map((actionName) => (
                        <button
                          key={actionName}
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void action("membership", "POST", {
                              project_id: p.id,
                              member_id: r.member_id,
                              action: actionName,
                            })
                          }
                        >
                          {actionName === "approve" ? "Odobri" : "Zavrni"}
                        </button>
                      ))}
                    </div>
                  ))}
                </details>
              )}
              <details>
                <summary>Zgodovina članstva</summary>
                <ul className={styles.list}>
                  {s.membershipHistory
                    ?.filter((h) => h.project_id === p.id)
                    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
                    .map((h) => (
                      <li key={h.id}>
                        <span>
                          {events[h.action] || h.action} ·{" "}
                          {members.find((m) => m.member_id === h.member_id)
                            ?.name ||
                            s.members.find((m) => m.id === h.member_id)?.name ||
                            "Član"}
                        </span>
                        <time dateTime={h.occurred_at}>
                          {new Intl.DateTimeFormat("sl-SI", {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: "Europe/Ljubljana",
                          }).format(new Date(h.occurred_at))}
                        </time>
                      </li>
                    ))}
                </ul>
                <small>
                  Prikazane so spremembe od uvedbe zgodovine, za katere imaš
                  dovoljenje.
                </small>
              </details>
            </article>
          );
        })}
      </div>
      {!projects.length && (
        <p className={styles.empty}>
          Ni projektov za izbrani filter. Zasebni projekti so vidni samo
          pooblaščenim članom.
        </p>
      )}
    </>
  );
}
