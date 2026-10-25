"use client";

import { taskActivity, weeklyHoursHistory, type HoursHistoryFilter } from "@/lib/activity-history";
import type { OrgTask, Snapshot } from "@/lib/organization";
import styles from "./activity-history.module.css";

const number = (value: number) => new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeZone: "Europe/Ljubljana" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
const timestamp = (value: string) => new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Ljubljana" }).format(new Date(value));
const labels: Record<string, string> = {
  title: "Naslov", description: "Opis", project_id: "Projekt", status: "Status", priority: "Prednost", due_date: "Rok", assignee_id: "Dodeljeni član", archived: "Arhivirana",
  todo: "Začeti", in_progress: "V teku", in_review: "V pregledu", done: "Zaključeno", low: "Nizka", medium: "Srednja", high: "Visoka", urgent: "Nujna",
};
const events: Record<string, string> = { created: "Naloga ustvarjena", completed: "Naloga zaključena", reopened: "Naloga ponovno odprta", updated: "Spremembe naloge", unavailable: "Podatki spremembe niso na voljo" };

export function TaskActivityTimeline({ task, snapshot }: { task: OrgTask; snapshot: Snapshot }) {
  const history = snapshot.history.filter((entry) => entry.task_id === task.id).toSorted((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.id.localeCompare(b.id));
  function value(field: string, input: unknown) {
    if (input === null || input === undefined || input === "") return "Ni določeno";
    if (field === "assignee_id") return snapshot.members.find((m) => m.id === input)?.name || `Član (${input})`;
    if (field === "project_id") return snapshot.projects.find((p) => p.id === input)?.name || `Projekt (${input})`;
    if (field === "due_date") return date(String(input));
    if (field === "archived") return input ? "Da" : "Ne";
    return ["status", "priority"].includes(field) ? labels[String(input)] || String(input) : String(input);
  }
  return <details className={styles.details}>
    <summary>Podrobnosti in zgodovina</summary>
    <div className={styles.taskDetails}>
      <h3>{task.title}</h3>
      <p className={styles.description}>{task.description || "Brez opisa."}</p>
      <h4>Activity Timeline · zgodovina naloge</h4>
      <p className={styles.caption}>Najnovejše spremembe najprej · Europe/Ljubljana</p>
      {history.length ? <ol className={styles.timeline}>{history.map((entry) => {
        const activity = taskActivity(entry);
        return <li key={entry.id}>
          <strong>{events[activity.kind]}</strong>
          <p className={styles.byline}>{entry.actor_name || (entry.actor_id ? `Uporabnik (${entry.actor_id})` : "Avtor ni zabeležen")}<br /><time dateTime={entry.occurred_at}>{timestamp(entry.occurred_at)}</time></p>
          {activity.changes.length ? <dl className={styles.changes}>{activity.changes.map((change) => <div key={change.field}>
            <dt>{labels[change.field]}</dt><dd><span>Prej: {value(change.field, change.before)}</span><span>Potem: {value(change.field, change.after)}</span></dd>
          </div>)}</dl> : <p className={styles.caption}>Ni zabeleženih razlik spremljanih polj.</p>}
        </li>;
      })}</ol> : <p className="org-empty">Za to nalogo še ni dostopnih zapisov zgodovine.</p>}
      <p className={styles.caption}>Prikazani so zapisi, ki jih dovoljujejo tvoje pravice. Za starejše zapise brez shranjenega imena je prikazan ID avtorja.</p>
    </div>
  </details>;
}

export function WeeklyHoursHistory({ snapshot, filter, now }: { snapshot: Snapshot; filter: HoursHistoryFilter; now: number }) {
  const history = weeklyHoursHistory(snapshot, filter, new Date(now));
  return <section className={`panel org-panel ${styles.hours}`} aria-label="Tedenska zgodovina ur">
    <details>
      <summary>Tedenska zgodovina ur in cilji</summary>
      <h2>Zgodovina ur po tednih</h2>
      <p className={styles.caption}>Celi tedni od ponedeljka do nedelje, ki se dotikajo izbranega obdobja · Europe/Ljubljana. Uvoženo pokritje nadomesti dnevne vnose, zato ure niso štete dvakrat.</p>
      <p className={styles.caption}>Cilj je trenutna tedenska obveznost člana. Zgodovina sprememb cilja in popolnost preteklih evidenc nista zabeleženi. Prazen teden pomeni, da ni vnosov, ne potrjene odsotnosti dela.</p>
      {filter.project && <p className="notice">Izbran je projekt: prikazan je samo njegov del dnevnih ur. Uvoženi agregati nimajo projektne razčlenitve in niso vključeni; primerjava s celotnim ciljem ni na voljo.</p>}
      {history.error ? <p role="alert">{history.error}</p> : !history.rows.length ? <p className="org-empty">Za izbrano obdobje in člana ni tedenske zgodovine.</p> : <div className="org-table-wrap" tabIndex={0} role="region" aria-label="Tedenska zgodovina ur — vodoravno pomikanje"><table>
        <thead><tr><th>Teden</th><th>Član</th><th>Zabeležene ure</th><th>Trenutni cilj</th><th>Primerjava s ciljem</th><th>Vir ur</th></tr></thead>
        <tbody>{history.rows.map((row) => <tr key={`${row.member.id}:${row.week}`}>
          <td>{date(row.week)}–{date(row.end)}{row.current && <small>Teden je še v teku</small>}</td><td>{row.member.name}</td>
          <td>{row.hasRecords ? `${number(row.hours)} h` : "Ni vnosov"}</td><td>{row.goal !== null ? `${number(row.goal)} h` : "Ni določen"}</td>
          <td>{row.comparable && row.hasRecords ? <div className={styles.comparison}><progress aria-label={`Tedenski napredek: ${row.member.name}, ${row.week}`} value={Math.min(row.hours, row.goal!)} max={row.goal!} /><span>{number(row.hours)} / {number(row.goal!)} h</span></div> : "—"}</td>
          <td>{row.hasRecords ? <>{number(row.dailyHours)} h dnevnih vnosov<br />{number(row.importedHours)} h uvoženih seštevkov</> : "Ni evidenc"}</td>
        </tr>)}</tbody>
      </table></div>}
    </details>
  </section>;
}
