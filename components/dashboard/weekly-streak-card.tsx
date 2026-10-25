import { Check, Clock3, Flame, Minus, Trophy } from "lucide-react";
import type { WeeklyStreak } from "@/lib/weekly-streak";
import styles from "./member-dashboard.module.css";

const number = (value: number) => new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("sl-SI", {
  day: "numeric", month: "numeric", timeZone: "Europe/Ljubljana",
}).format(new Date(value + "T12:00:00Z"));
const statusLabels = { complete: "Cilj dosežen", incomplete: "Cilj ni dosežen", pending: "Teden še traja" };

export function WeeklyStreakCard({ streak }: { streak: WeeklyStreak }) {
  const progress = Math.min(100, streak.hours / streak.target * 100);
  return <section className={`${styles.glass} ${styles.card} ${styles.streak}`} aria-labelledby="weekly-streak-title">
    <div className={styles.cardHeading}>
      <div className={styles.title}><Flame size={20} aria-hidden="true" /><h2 id="weekly-streak-title">Weekly Streak</h2></div>
      <span className={styles.caption}>Pon–ned · Europe/Ljubljana</span>
    </div>
    <div className={styles.streakBody}>
      <div className={styles.streakSummary}>
        <p className={styles.streakCount}><strong>{streak.current}</strong><span>zaporednih<br />uspešnih tednov</span></p>
        <p className={styles.streakMessage}>{streak.complete ? "Cilj tega tedna je dosežen." : streak.current > 0 ? "Tvoj niz še traja. Nadaljuj do nedelje." : "Vsak teden je nov začetek."}</p>
        {streak.best !== null && <p className={styles.streakBest}><Trophy size={15} aria-hidden="true" />Najboljši niz v evidenci: <strong>{streak.best}</strong></p>}
      </div>
      <div className={styles.streakDetail}>
        <ol className={styles.streakWeeks} aria-label="Zadnjih 6 tednov">
          {streak.weeks.map((week) => <li key={week.start} data-state={week.status} aria-current={week.start === streak.currentWeek ? "date" : undefined}>
            <span className={styles.streakWeekIcon} aria-hidden="true">{week.status === "complete" ? <Check size={21} /> : week.status === "pending" ? <Clock3 size={19} /> : <Minus size={19} />}</span>
            <time dateTime={week.start}>{date(week.start)}</time>
            <span className={styles.srWeekStatus}>{statusLabels[week.status]} · do {date(week.end)} · {number(week.hours)} / {number(streak.target)} h</span>
          </li>)}
        </ol>
        <div className={styles.streakLegend}><span><Check size={13} aria-hidden="true" />Doseženo</span><span><Minus size={13} aria-hidden="true" />Nedoseženo</span><span><Clock3 size={13} aria-hidden="true" />V teku</span></div>
        <div className={styles.progress}>
          <div><span>Ta teden · {number(streak.target)} h cilj</span><strong>{number(streak.hours)} / {number(streak.target)} h</strong></div>
          <progress aria-label="Weekly Streak: napredek tega tedna" value={progress} max={100} />
        </div>
        <p className={styles.streakRemaining}>{streak.complete ? "Uspešen teden je že vštet v niz." : <><strong>{number(streak.remaining)} h</strong> do {streak.current > 0 ? "ohranitve" : "začetka"} niza do nedelje.</>}</p>
      </div>
    </div>
    <ul className={styles.streakMilestones} aria-label="Mejniki zaporednih tednov">
      {streak.milestones.map((milestone) => <li key={milestone.weeks} data-achieved={milestone.achieved}>
        <Trophy size={15} aria-hidden="true" /><span><strong>{milestone.weeks}</strong> tednov</span><span className={styles.srWeekStatus}>{milestone.achieved ? "Doseženo v evidenci" : "Še ni doseženo"}</span>{milestone.achieved && <Check size={14} aria-hidden="true" />}
      </li>)}
    </ul>
    <p className={styles.streakFootnote}>Iz zabeleženih ur po trenutnem tedenskem cilju člana. Manjkajoče ure v zaključenem tednu prekinejo niz; tekoči teden ga ne prekine.</p>
  </section>;
}
