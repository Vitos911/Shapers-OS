"use client";

import { ArrowRight, CalendarDays, Check, CheckSquare, ClipboardCheck, Clock3, Flame, Plus } from "lucide-react";
import { ljubljanaDate, type OrgMember, type OrgTask, type Snapshot } from "@/lib/organization";
import { weeklyStreak, WEEKLY_TARGETS } from "@/lib/weekly-streak";
import { WeeklyStreakCard } from "./weekly-streak-card";
import type { ReactNode } from "react";
import { dashboardMeetings, dashboardTasks } from "./dashboard-data";
import styles from "./member-dashboard.module.css";

const number = (value: number) => new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("sl-SI", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Ljubljana",
}).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
const time = (value: string) => new Intl.DateTimeFormat("sl-SI", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Ljubljana",
}).format(new Date(value));
const statuses: Record<string, string> = { backlog: "Čakalnica", todo: "Začeti", in_progress: "V teku", in_review: "V pregledu" };
const priorities: Record<string, string> = { low: "Nizka", medium: "Srednja", high: "Visoka", urgent: "Nujna" };
const attendance: Record<string, string> = { present: "Prisoten", remote: "Na daljavo", excused: "Opravičeno", unexcused: "Neopravičeno" };

export function WeeklyHoursProgress({ hours, goal }: { hours: number; goal: number }) {
  const progress = goal > 0 ? Math.min(100, Math.max(0, hours / goal * 100)) : 0;
  return <div className={styles.weekly}>
    <dl className={styles.numbers}>
      <div><dt>Opravljene ure</dt><dd>{number(hours)} <span>h</span></dd></div>
      <div><dt>Tedenski cilj</dt><dd>{number(goal)} <span>h</span></dd></div>
      <div><dt>Še manjka</dt><dd>{number(Math.max(0, goal - hours))} <span>h</span></dd></div>
    </dl>
    {goal > 0 ? <div className={styles.progress}>
      <div><span>Napredek tega tedna</span><strong>{number(progress)} %</strong></div>
      <progress aria-label="Napredek tedenskih ur" value={progress} max={100} />
    </div> : <p>Tedenski cilj še ni določen.</p>}
  </div>;
}

export function DashboardHero({ member, busy, onLogHours }: {
  member?: OrgMember; busy: boolean; onLogHours: () => void;
}) {
  return <section className={styles.hero} aria-labelledby="dashboard-welcome">
    <div className={styles.heroContent}>
      <div className={styles.heroMeta}><span className={styles.sectionLabel}>01 — Tvoj pregled</span><span>{member ? `Shapers ${member.tier}` : "Organizacija"}</span></div>
      <h1 id="dashboard-welcome">Tvoj teden. Tvoj vpliv.</h1>
      <p className={styles.intro}>{member ? `Pozdravljen/a, ${member.name.split(" ")[0]}. ` : ""}Pregled nalog, ur in dogajanja v organizaciji.</p>
      {!member && <p className={styles.calendarNotice}>Ta račun nima članskega profila. Osebne ure in naloge so na voljo po povezavi s članom.</p>}
    </div>
    {member && <button className="button primary" disabled={busy} onClick={onLogHours}><Plus size={17} aria-hidden="true" />Beleži ure</button>}
  </section>;
}

export function MyTasksCard({ snapshot, today, busy, onComplete }: {
  snapshot: Pick<Snapshot, "identity" | "tasks" | "projects">; today: string; busy: boolean; onComplete: (task: OrgTask) => void;
}) {
  const tasks = dashboardTasks(snapshot, today);
  return <section className={`${styles.glass} ${styles.card}`} aria-labelledby="dashboard-tasks">
    <span className={styles.sectionLabel}>02 — V ospredju</span>
    <div className={styles.cardHeading}><div className={styles.title}><CheckSquare size={19} aria-hidden="true" /><h2 id="dashboard-tasks">Moje naloge</h2><span className={styles.count}>{tasks.length}</span></div><a href="#tasks">Prikaži vse<ArrowRight size={15} aria-hidden="true" /></a></div>
    <p className={styles.caption}>Najprej tisto, kar potrebuje tvojo pozornost.</p>
    {tasks.length ? <ul className={styles.list}>{tasks.slice(0, 5).map((task) => {
      const overdue = !!task.due_date && task.due_date < today;
      return <li key={task.id} className={styles.task}>
        <button className={styles.complete} disabled={busy} onClick={() => onComplete(task)} aria-label={`Zaključi nalogo: ${task.title}`}><Check size={18} aria-hidden="true" /></button>
        <div className={styles.taskBody}><h3>{task.title}</h3><p>{snapshot.projects.find((project) => project.id === task.project_id)?.name || "Brez projekta"}</p>
          <div className={styles.taskMeta}><span className={styles.badge} data-priority={task.priority}>{priorities[task.priority] || task.priority}</span><span>{statuses[task.status] || task.status}</span></div>
        </div>
        <div className={styles.deadline} data-overdue={overdue}>{overdue && <strong>Zamujeno</strong>}{task.due_date ? <time dateTime={task.due_date}>{date(task.due_date)}</time> : <span>Brez roka</span>}</div>
      </li>;
    })}</ul> : <div className={styles.empty}><CheckSquare size={26} aria-hidden="true" /><h3>{snapshot.identity.member_id ? "Vse je urejeno." : "Članski profil ni povezan."}</h3><p>{snapshot.identity.member_id ? "Trenutno nimaš odprtih dodeljenih nalog." : "Osebne naloge bodo prikazane po povezavi računa s članom."}</p></div>}
  </section>;
}

export function UpcomingMeetingsCard({ snapshot, now }: { snapshot: Pick<Snapshot, "meetings" | "calendar" | "attendance" | "identity">; now: number }) {
  const meetings = dashboardMeetings(snapshot, now).slice(0, 4);
  return <section className={`${styles.glass} ${styles.card}`} aria-labelledby="dashboard-meetings">
    <span className={styles.sectionLabel}>03 — Na koledarju</span>
    <div className={styles.cardHeading}><div className={styles.title}><CalendarDays size={19} aria-hidden="true" /><h2 id="dashboard-meetings">Prihajajoči sestanki</h2></div><a href="#meetings">Prikaži vse<ArrowRight size={15} aria-hidden="true" /></a></div>
    <p className={styles.caption}>Organizacijski koledar · Europe/Ljubljana</p>
    {!snapshot.calendar.configured && <p className={styles.calendarNotice}>Organizacijski Google koledar še ni povezan. {meetings.length ? "Prikazani so zadnji shranjeni sestanki." : "Ko bo povezava pripravljena, bodo sestanki prikazani tukaj."}</p>}
    {meetings.length ? <ul className={styles.list}>{meetings.map((meeting) => {
      const record = snapshot.attendance.find((entry) => entry.meeting_id === meeting.id && entry.member_id === snapshot.identity.member_id);
      return <li className={styles.meeting} key={meeting.id}>
        <div className={styles.calendarIcon} aria-hidden="true"><span>{new Intl.DateTimeFormat("sl-SI", { month: "short", timeZone: "Europe/Ljubljana" }).format(new Date(meeting.starts_at))}</span><strong>{new Intl.DateTimeFormat("sl-SI", { day: "numeric", timeZone: "Europe/Ljubljana" }).format(new Date(meeting.starts_at))}</strong></div>
        <div><span className={styles.series}>{meeting.series || "Organizacijski sestanek"}</span><h3>{meeting.title}</h3><p><time dateTime={meeting.starts_at}>{date(meeting.starts_at)} · {meeting.all_day ? "Celodnevno" : `${time(meeting.starts_at)}–${time(meeting.ends_at)}`}</time></p>{record && <span className={styles.badge}>Prisotnost: {attendance[record.status] || record.status}</span>}</div>
      </li>;
    })}</ul> : <div className={styles.empty}><CalendarDays size={26} aria-hidden="true" /><h3>Ni prihajajočih sestankov.</h3><p>{snapshot.calendar.configured ? "V skupnem koledarju trenutno ni shranjenih prihodnjih dogodkov. Povezavo lahko osvežiš v pogledu Sestanki." : "Tvoj naslednji sestanek bo prikazan po povezavi koledarja."}</p></div>}
  </section>;
}

export function QuickActions({ canLog, busy, onLogHours }: { canLog: boolean; busy: boolean; onLogHours: () => void }) {
  return <section className={styles.quickSection} aria-labelledby="dashboard-quick"><h2 id="dashboard-quick">Hitri dostop</h2><div className={styles.quickActions}>
    {canLog && <button disabled={busy} onClick={onLogHours}><Clock3 size={20} aria-hidden="true" /><span>Nova evidenca ur</span><Plus size={17} aria-hidden="true" /></button>}
    <a href="#tasks"><CheckSquare size={20} aria-hidden="true" /><span>Moje naloge</span><ArrowRight size={17} aria-hidden="true" /></a>
    <a href="#meetings"><CalendarDays size={20} aria-hidden="true" /><span>Sestanki</span><ArrowRight size={17} aria-hidden="true" /></a>
    <a href="#attendance"><ClipboardCheck size={20} aria-hidden="true" /><span>Moja prisotnost</span><ArrowRight size={17} aria-hidden="true" /></a>
  </div></section>;
}

export function DashboardSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="Nalagam dashboard iz Supabase"><span className="sr-only">Nalagam dashboard iz Supabase …</span><div /><div /><div /></div>;
}

export default function MemberDashboard({ snapshot, now, busy, onLogHours, onComplete, leaderboard }: {
  snapshot: Snapshot; now: number; busy: boolean; onLogHours: () => void; onComplete: (task: OrgTask) => void; leaderboard?: ReactNode;
}) {
  const today = ljubljanaDate(new Date(now));
  const member = snapshot.members.find((entry) => entry.id === snapshot.identity.member_id);
  const streak = weeklyStreak(snapshot, new Date(now));
  const hours = streak?.hours || 0;
  const tasks = dashboardTasks(snapshot, today);
  const nextMeeting = dashboardMeetings(snapshot, now)[0];
  return <div className={styles.dashboard}>
    <DashboardHero member={member} busy={busy} onLogHours={onLogHours} />
    <section className={styles.kpis} aria-label="Tedenski pregled">
      <article className={styles.kpi}><div className={styles.kpiHeading}><span>Ure ta teden</span><Clock3 size={16} aria-hidden="true" /></div>{member ? <WeeklyHoursProgress hours={hours} goal={WEEKLY_TARGETS[member.tier] || 0} /> : <><strong className={styles.kpiValue}>—</strong><p>Članski profil ni povezan.</p></>}</article>
      <a className={styles.kpi} href="#tasks"><div className={styles.kpiHeading}><span>Odprte naloge</span><CheckSquare size={16} aria-hidden="true" /></div><strong className={styles.kpiValue}>{member ? tasks.length : "—"}</strong><p>{member ? "Tvoje dodeljene naloge" : "Članski profil ni povezan."}<ArrowRight size={14} aria-hidden="true" /></p></a>
      <a className={styles.kpi} href="#meetings"><div className={styles.kpiHeading}><span>Naslednji sestanek</span><CalendarDays size={16} aria-hidden="true" /></div>{nextMeeting ? <><strong className={styles.meetingValue}>{nextMeeting.title}</strong><p>{date(nextMeeting.starts_at)} · {nextMeeting.all_day ? "Celodnevno" : time(nextMeeting.starts_at)}</p></> : <><strong className={styles.kpiValue}>—</strong><p>{snapshot.calendar.configured ? "Ni shranjenih prihodnjih sestankov." : "Koledar še ni povezan."}</p></>}</a>
      <article className={styles.kpi}><div className={styles.kpiHeading}><span>Weekly streak</span><Flame size={16} aria-hidden="true" /></div><strong className={styles.kpiValue}>{streak ? <>{streak.current}<span> tednov</span></> : "—"}</strong><p>{streak ? "Zaporedni uspešni tedni" : "Osebni niz ni na voljo."}</p></article>
    </section>
    <div className={styles.columns}><MyTasksCard snapshot={snapshot} today={today} busy={busy} onComplete={onComplete} /><UpcomingMeetingsCard snapshot={snapshot} now={now} /></div>
    <QuickActions canLog={!!member} busy={busy} onLogHours={onLogHours} />
    {streak && <WeeklyStreakCard streak={streak} />}
    {leaderboard}
  </div>;
}
