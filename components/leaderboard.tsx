"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Award, CheckCheck, Flame, Goal, LockKeyhole, Medal, Search, ShieldCheck, Sparkles, Target, Trophy, Zap } from "lucide-react";
import { addDays, isAdmin, ljubljanaDate, weekStart, type Snapshot } from "@/lib/organization";
import type { Achievement, LeaderboardData, RankingRow, ScoreMetrics, Streak } from "@/lib/leaderboard";
import styles from "./leaderboard.module.css";

const score = (n: number) => new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
const number = (n: number) => new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(n);
const date = (v: string) => new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Ljubljana" }).format(new Date(v + "T12:00:00Z"));
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("");
const badgeIcons = { "first-steps": Sparkles, "task-master": CheckCheck, "on-fire": Flame, unstoppable: Zap, "perfect-attendance": ShieldCheck, "goal-crusher": Goal, "consistency-champion": Trophy, "always-there": Medal, "perfect-week": Award };

function Fire({ weeks }: { weeks: number }) {
  return <span className={styles.fire} data-level={weeks >= 10 ? 4 : weeks >= 6 ? 3 : weeks >= 3 ? 2 : weeks >= 1 ? 1 : 0}><Flame size={20} aria-hidden="true" /><span>{weeks} <small>tednov</small></span></span>;
}
function Movement({ value }: { value: number | null }) {
  return <span className={styles.movement} data-direction={value === null ? "unknown" : value > 0 ? "up" : value < 0 ? "down" : "same"}>{value === null ? "Ni primerjave" : value === 0 ? "Brez premika" : <>{value > 0 ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}{Math.abs(value)} mest{Math.abs(value) === 1 ? "o" : ""}</>}</span>;
}
function Achievements({ badges, compact = false }: { badges: Achievement[]; compact?: boolean }) {
  if (!badges.length) return <p className={styles.note}>Dosežki so na voljo po povezavi računa s članom.</p>;
  return <section aria-label="Moji dosežki"><h3 className={styles.subheading}><Award size={18} aria-hidden="true" />Moji dosežki <small>{badges.filter((b) => b.achieved).length} / {badges.length}</small></h3>
    <ul className={`${styles.achievements} ${compact ? styles.compactAchievements : ""}`}>{badges.map((badge) => {
      const Icon = badgeIcons[badge.id as keyof typeof badgeIcons] || Award;
      return <li key={badge.id} data-earned={badge.achieved} data-badge={badge.id} title={badge.description}><Icon size={22} aria-hidden="true" /><div><strong>{badge.name}</strong><span>{badge.achieved ? "Doseženo" : <><LockKeyhole size={11} aria-hidden="true" /> {Math.min(badge.progress, badge.target)} / {badge.target}</>}</span>{!compact && <p>{badge.description}</p>}</div></li>;
    })}</ul>{compact ? <a className={styles.link} href="#profile">Vsi dosežki v mojem profilu<ArrowRight size={14} aria-hidden="true" /></a> : <p className={styles.note}>Značke in streak ne prinašajo dodatnih točk. Uporabljena je samo preverljiva evidenca.</p>}
  </section>;
}
function Breakdown({ metrics, name, aggregate }: { metrics: ScoreMetrics; name: string; aggregate: boolean }) {
  const categories = [
    { name: "Zaključene naloge", points: metrics.taskPoints, max: 50, detail: `${metrics.completedTasks} različnih nalog · 10 točk na nalogo, največ 50 na teden` },
    { name: "Prostovoljske ure", points: metrics.hoursPoints, max: 30, detail: `${number(metrics.hours)} / ${number(metrics.target)} h` },
    { name: "Udeležba na sestankih", points: metrics.attendancePoints, max: 20, detail: `${metrics.attended} / ${metrics.meetings} relevantnih · ${metrics.excused} opravičenih` },
  ];
  return <section className={styles.breakdown} aria-label={`Razčlenitev: ${name}`}><h3 className={styles.subheading}>Razčlenitev · {name}</h3><dl>{categories.map((c) => <div key={c.name}><dt>{c.name}<small>{c.points === null ? "Brez relevantnih sestankov" : c.detail}</small></dt><dd>{c.points === null ? "N/A" : `${score(c.points)} / ${c.max}`}</dd></div>)}</dl><p className={styles.note}>{aggregate ? "Prikazane točke kategorij so tedenska povprečja. Končni rezultat je povprečje posamično normaliziranih tedenskih rezultatov." : `Upoštevanih je ${metrics.applicablePoints} možnih točk. Brez relevantnih sestankov se rezultat nalog in ur preračuna z 80 na 100.`}</p></section>;
}
function Performance({ data }: { data: LeaderboardData }) {
  const { row, rankChange, previousTasks, dailyTasks, streak } = data.personal;
  const m = row?.metrics;
  const delta = m && previousTasks !== null ? m.completedTasks - previousTasks : null;
  return <section aria-label="Moja uspešnost"><h3 className={styles.subheading}>Moja uspešnost <small>Tekoči teden</small></h3><div className={styles.performance}>
    <article data-stat="rank"><Trophy size={19} aria-hidden="true" /><span>Moje mesto</span><strong>{row ? `#${row.rank}` : "—"}</strong><small>med {data.personal.activeMembers} člani ta teden</small><Movement value={rankChange} /></article>
    <article data-stat="tasks"><CheckCheck size={19} aria-hidden="true" /><span>Opravljene naloge</span><strong>{m?.completedTasks ?? "—"}</strong><small>{delta === null ? "Prejšnji teden ni na voljo" : `${delta > 0 ? "+" : ""}${delta} glede na prejšnji teden`}</small><div className={styles.sparkline} aria-label="Zaključitve od ponedeljka do nedelje">{dailyTasks.map((n, i) => <span key={i} title={`${["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"][i]}: ${n}`} style={{ height: `${n / Math.max(1, ...dailyTasks) * 100}%` }} />)}</div></article>
    <article data-stat="hours"><Target size={19} aria-hidden="true" /><span>Napredek ur</span><strong>{m ? number(m.hours) : "—"}<small> / {m ? number(m.target) : "—"} h</small></strong><small>{m ? `${number(m.hours / m.target * 100)} % tedenskega cilja` : "Račun ni povezan s članom"}</small>{m && <progress max={100} value={Math.min(100, m.hours / m.target * 100)} aria-label="Napredek tedenskih ur" />}</article>
    <article data-stat="streak"><span>Weekly Streak</span>{streak ? <><strong><Fire weeks={streak.current} /></strong><small>Zaporedni uspešni zaključeni tedni</small><small>Najdaljši niz: {streak.best === null ? "ni zaključenih tednov" : `${streak.best} tednov`}</small><progress max={streak.next} value={streak.current} aria-label={`Napredek do mejnika ${streak.next} tednov`} /><small>Naslednji mejnik: {streak.next} tednov</small></> : <p className={styles.note}>Račun ni povezan s članom.</p>}</article>
  </div><p className={styles.note}>Uspešen teden: dosežen cilj ur in vsaj ena opravljena naloga ali udeležba na sestanku. Tekoči teden niza ne prekine in se vanj prišteje po nedelji.</p></section>;
}
function AdminAnalytics({ data }: { data: LeaderboardData }) {
  const byTasks = [...data.rows].sort((a, b) => b.summary.tasks - a.summary.tasks).slice(0, 3);
  const behind = data.rows.filter((r) => r.metrics && r.metrics.hours < r.metrics.target);
  return <section className={styles.adminAnalytics} aria-label="Administratorska analitika"><h3 className={styles.subheading}><ShieldCheck size={18} aria-hidden="true" />Admin Analytics</h3><p className={styles.note}>Zaostanki veljajo za izbrano obdobje; tekoči teden še traja.</p><div className={styles.analyticsGrid}>
    <article><h4>Največ opravljenih nalog</h4>{byTasks.map((r) => <p key={r.memberId}>{r.name}<strong>{r.summary.tasks}</strong></p>)}</article>
    <article><h4>Izpolnjevanje ur po članstvih</h4>{["GO!", "Impact", "Core"].map((tier) => { const rows = data.rows.filter((r) => r.tier === tier), target = rows.reduce((n, r) => n + r.summary.target, 0), hours = rows.reduce((n, r) => n + r.summary.hours, 0); return <p key={tier}>Shapers {tier}<strong>{target ? `${number(hours / target * 100)} %` : "Ni podatkov"}</strong></p>; })}</article>
    <article><h4>Člani pod ciljem ur</h4>{behind.length ? behind.map((r) => <p key={r.memberId}>{r.name}<strong>{number(r.summary.hours)} / {number(r.summary.target)} h</strong></p>) : <p>Vsi evidentirani cilji doseženi.</p>}</article>
  </div><h4>Tedenski trendi aktivnosti</h4><div className={styles.trends}>{data.trends?.map((t) => <div key={t.week}><span>{date(t.week)}{t.week === data.currentWeek && " · v teku"}</span><progress value={t.average} max={100} aria-label={`Povprečne točke: ${date(t.week)}`} /><span>{score(t.average)} točk · {t.tasks} nalog · {number(t.hours)} / {number(t.target)} h · udeležba {t.meetings ? `${number(t.attended / t.meetings * 100)} %` : "N/A"}</span></div>)}</div></section>;
}

type Props = { snapshot: Snapshot; now: number; request: (resource: string) => Promise<unknown>; mode?: "full" | "widget" | "achievements" };
export default function Leaderboard({ snapshot, now, request, mode = "full" }: Props) {
  const currentWeek = weekStart(ljubljanaDate(new Date(now)));
  const minute = Math.floor(now / 60000);
  const [period, setPeriod] = useState("current"), [historical, setHistorical] = useState(addDays(currentWeek, -14));
  const [tier, setTier] = useState(""), [search, setSearch] = useState(""), [sort, setSort] = useState("rank"), [selectedMember, setSelectedMember] = useState("");
  const [data, setData] = useState<LeaderboardData | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0), [loadedFor, setLoadedFor] = useState("");
  const week = mode !== "full" || !["previous", "history"].includes(period) ? currentWeek : period === "previous" ? addDays(currentWeek, -7) : historical;
  const aggregate = mode === "full" && (period === "month" || period === "all");
  const query = aggregate ? `period=${period}` : `week=${encodeURIComponent(week)}`;
  const requestKey = `${snapshot.identity.user_id}:${snapshot.identity.role}:${snapshot.identity.member_id}:${query}`;
  useEffect(() => {
    let alive = true;
    void request(`leaderboard?${query}`).then((result) => { if (alive) { setData(result as LeaderboardData); setLoadedFor(requestKey); setError(""); } }).catch((failure) => { if (alive) { setError(failure instanceof Error ? failure.message : "Lestvice ni mogoče prebrati."); setData(null); } });
    return () => { alive = false; };
  }, [request, snapshot, query, retry, requestKey, minute]);
  const ready = data?.week === week && loadedFor === requestKey ? data : null;
  const own = ready?.rows.find((r) => r.memberId === snapshot.identity.member_id);
  const filtered = ready?.rows.filter((r) => (!tier || r.tier === tier) && r.name.toLocaleLowerCase("sl").includes(search.trim().toLocaleLowerCase("sl"))) || [];
  const sorted = [...filtered].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "sl") : sort === "tasks" ? b.summary.tasks - a.summary.tasks || a.rank - b.rank : sort === "hours" ? b.summary.hours / b.summary.target - a.summary.hours / a.summary.target || a.rank - b.rank : sort === "attendance" ? (b.summary.attendance ?? -1) - (a.summary.attendance ?? -1) || a.rank - b.rank : sort === "streak" ? b.summary.streak - a.summary.streak || a.rank - b.rank : a.rank - b.rank);
  const details = isAdmin(snapshot.identity.role) && selectedMember ? ready?.rows.find((r) => r.memberId === selectedMember) : own;
  const headingId = `leaderboard-${mode}`;
  return <section className={`${styles.card} ${mode === "widget" ? styles.widget : ""}`} aria-labelledby={headingId}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>SHAPERS SCORE · 02</span><h2 id={headingId}><Trophy size={21} aria-hidden="true" />{mode === "achievements" ? "Dosežki in vztrajnost" : "Leaderboard"}</h2></div>{mode === "widget" && <a className={styles.link} href="#leaderboard">Celotna lestvica<ArrowRight size={16} aria-hidden="true" /></a>}</div>
    {mode === "full" && <div className={styles.filters}>
      <label>Članski nivo<select aria-label="Članski nivo" value={tier} onChange={(e) => setTier(e.target.value)}><option value="">Vsi člani</option>{["GO!", "Impact", "Core"].map((v) => <option key={v} value={v}>Shapers {v}</option>)}</select></label>
      <label>Obdobje<select aria-label="Obdobje" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="current">This Week · tekoči teden</option><option value="month">This Month · ta mesec</option><option value="all">All Time · vsa evidenca</option><option value="previous">Prejšnji zaključeni teden</option><option value="history">Zgodovinski teden</option></select></label>
      {period === "history" && <label>Ponedeljek tedna<input type="date" min="2000-01-03" max={addDays(currentWeek, -7)} step={7} value={historical} onChange={(e) => setHistorical(e.target.value)} /></label>}
      <label className={styles.search}><span><Search size={13} aria-hidden="true" /> Poišči člana</span><input type="search" aria-label="Poišči člana" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ime ali priimek" /></label>
      <label>Razvrsti po<select aria-label="Razvrsti po" value={sort} onChange={(e) => setSort(e.target.value)}>{[["rank", "Točke"], ["name", "Ime"], ["tasks", "Naloge"], ["hours", "Izpolnjenost ur"], ["attendance", "Udeležba"], ["streak", "Streak"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
    </div>}
    {error && <div role="alert" className={styles.error}><p>{error}</p><button className="button secondary" onClick={() => { setError(""); setData(null); setRetry((n) => n + 1); }}>Poskusi znova naložiti lestvico</button></div>}
    {!error && !ready && <p role="status" className={styles.note}>Nalagam preverjeno lestvico …</p>}
    {ready && <>
      {mode === "full" && <Performance data={ready} />}
      {mode !== "achievements" && <p className={styles.period}>{aggregate ? `${period === "month" ? "Ta mesec" : "Vsa spremljana zgodovina"} · ${ready.weeksCount} tednov` : `${date(week)}–${date(addDays(week, 6))}`}<span>{ready.status === "provisional" ? "Začasni rezultat" : ready.status === "final" ? "Zaključeni rezultat" : "Ni preverljive lestvice"}</span></p>}
      {aggregate && <p className={styles.note}>Povprečje spremljanih tedenskih rezultatov, največ 100 točk. Mesečni pogled zajema tedne, ki se prekrivajo s tem mesecem; tekoči teden je začasen. Starejša nepreverljiva zgodovina je izključena.</p>}
      {ready.status === "unavailable" && mode === "full" ? <p className={styles.empty}>Za ta teden ni zanesljive evidence preteklih nivojev, dodelitev in obveznih sestankov. Prvi v celoti spremljani teden se začne {date(ready.firstFullWeek)}.</p> : mode !== "achievements" && <>
        {mode === "widget" && <div className={styles.ownStats}><div><span>Tvoje mesto</span><strong>{own ? `#${own.rank}` : "—"}</strong></div><div><span>Tvoj rezultat</span><strong>{own ? score(own.score) : "—"}<small> / 100</small></strong></div><div><span>Proti prejšnjemu tednu</span><strong className={styles.delta}>{ready.change === null ? "Ni primerjave" : `${ready.change > 0 ? "+" : ""}${score(ready.change)} točk`}</strong></div></div>}
        {filtered.length ? <><h3 className={styles.subheading}>Najboljši ta {aggregate ? "čas" : "teden"}</h3><ol className={styles.podium} aria-label="Najboljši trije">{filtered.slice(0, 3).map((r, i) => <li key={r.memberId} data-place={i + 1} data-own={r.memberId === snapshot.identity.member_id}><span className={styles.place}><Medal size={18} aria-hidden="true" />#{r.rank}</span><span className={styles.avatar} aria-hidden="true">{initials(r.name)}</span><div><strong>{r.name}</strong><small>Shapers {r.tier}</small></div><strong className={styles.podiumScore}>{score(r.score)}<small> / 100</small></strong><span className={styles.podiumMeta}>{r.summary.tasks} nalog <Fire weeks={r.summary.streak} /></span></li>)}</ol></> : <p className={styles.empty}>V izbranem filtru ni članov.</p>}
        {mode === "full" && filtered.length > 0 && <>
          <div className={styles.tableWrap} role="region" aria-label="Celotna lestvica" tabIndex={0}><table><caption>Celotna lestvica · mesta veljajo za vse člane v izbranem obdobju.</caption><thead><tr>{["Mesto", "Član", "Naloge", "Ure", "Udeležba", "Streak", "Točke"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{sorted.map((r) => <Ranking key={r.memberId} row={r} own={r.memberId === snapshot.identity.member_id} />)}</tbody></table></div>
          <ol className={styles.mobileRankings} aria-label="Lestvica članov">{sorted.map((r) => <li key={r.memberId} data-own={r.memberId === snapshot.identity.member_id}><header><span className={styles.place}>#{r.rank}</span><Member row={r} own={r.memberId === snapshot.identity.member_id} /><strong>{score(r.score)}<small> / 100</small></strong></header><dl><div><dt>Naloge</dt><dd>{r.summary.tasks}</dd></div><div><dt>Ure</dt><dd><Hours row={r} /></dd></div><div><dt>Udeležba</dt><dd>{r.summary.attendance === null ? "N/A" : `${number(r.summary.attendance)} %`}</dd></div><div><dt>Streak</dt><dd><Fire weeks={r.summary.streak} /></dd></div></dl><Movement value={r.summary.rankChange} /></li>)}</ol>
        </>}
        {mode === "full" && isAdmin(snapshot.identity.role) && ready.rows.length > 0 && <label className={styles.adminSelect}>Podrobnosti člana<select aria-label="Podrobnosti člana" value={selectedMember || snapshot.identity.member_id || ""} onChange={(e) => setSelectedMember(e.target.value)}><option value="">Izberi člana</option>{ready.rows.map((r) => <option key={r.memberId} value={r.memberId}>{r.name}</option>)}</select></label>}
        {mode === "full" && details?.metrics && <Breakdown metrics={details.metrics} name={details.name} aggregate={aggregate} />}
        {mode === "full" && isAdmin(snapshot.identity.role) && <AdminAnalytics data={ready} />}
      </>}
      <Achievements badges={ready.achievements} compact={mode === "widget"} />
      {mode === "achievements" && <StreakDetails streak={ready.personal.streak} />}
      {mode === "full" && <details className={styles.rules}><summary>Kako deluje Shapers Score?</summary><p>Naloge: 10 točk za vsako dejansko zaključeno nalogo v tednu, največ 50. Rok ni pogoj. Ponovno odprte in arhivirane naloge ne štejejo. Šteje prva legitimna zaključitev posamezne naloge; podvojeni dogodki ne zvišajo rezultata.</p><p>Ure: do 30 točk · 30 × min(ure / tedenski cilj iz baze, 1). Običajni cilji: GO! 4 h, Impact 10 h, Core 70 h. Uvožene tedenske ure nadomestijo dnevne vnose samo znotraj svojega časovnega pokritja.</p><p>Udeležba: do 20 točk za že končane relevantne sestanke. Present in Remote štejeta, Excused je izvzet, Unexcused in manjkajoča evidenca štejeta kot neudeležba. Prihodnji in odpovedani sestanki ne štejejo. Brez relevantnih sestankov je rezultat (naloge + ure) / 80 × 100.</p><p>Aktivnostni streak raste ob koncu tedna z doseženim ciljem ur in vsaj eno nalogo ali udeležbo. Nedokončan teden ga ne prekine. To je strožji pogoj od obstoječega niza ur na nadzorni plošči.</p><p>Tedni potekajo od ponedeljka do nedelje v Europe/Ljubljana. Zaključeni rezultati ostanejo nespremenljivi. Pred začetkom spremljanja ni zgodovinskih lestvic ali izmišljenih premikov. Točkovanje 2.0 je ločeno od stare formule.</p></details>}
    </>}
  </section>;
}
function StreakDetails({ streak }: { streak: Streak | null }) { return streak && <div className={styles.streakDetails}><Fire weeks={streak.current} /><span>Najdaljši niz: {streak.best === null ? "ni podatkov" : `${streak.best} tednov`}</span><span>Naslednji mejnik: {streak.next} tednov</span><progress max={streak.next} value={streak.current} aria-label="Napredek do naslednjega streak mejnika" /></div>; }
function Member({ row, own }: { row: RankingRow; own: boolean }) { return <span className={styles.memberCell}><span className={styles.avatar} aria-hidden="true">{initials(row.name)}</span><span>{row.name}{own && <span className={styles.you}>Ti</span>}<small>Shapers {row.tier}</small></span></span>; }
function Hours({ row }: { row: RankingRow }) { return <span className={styles.hours}>{number(row.summary.hours)} / {number(row.summary.target)} h<progress max={100} value={Math.min(100, row.summary.hours / row.summary.target * 100)} aria-label={`Ure: ${row.name}`} /></span>; }
function Ranking({ row, own }: { row: RankingRow; own: boolean }) { return <tr data-own={own}><td>#{row.rank}<Movement value={row.summary.rankChange} /></td><th scope="row"><Member row={row} own={own} /></th><td>{row.summary.tasks}</td><td><Hours row={row} /></td><td>{row.summary.attendance === null ? "N/A" : `${number(row.summary.attendance)} %`}</td><td><Fire weeks={row.summary.streak} /></td><td><strong>{score(row.score)} / 100</strong><progress max={100} value={row.score} aria-label={`Shapers Score: ${row.name}`} /></td></tr>; }

