"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Identity, OrgProject, WorkState } from "../../lib/organization";
import styles from "./live-work-timer.module.css";

type Request = (resource: string, method?: string, body?: unknown, signal?: AbortSignal) => Promise<unknown>;
export function LiveWorkTimer({ identity, projects, request, onState, onSaved }: {
  identity: Identity; projects: OrgProject[]; request: Request;
  onState: (state: WorkState) => void; onSaved: () => Promise<unknown>;
}) {
  const [state, setState] = useState<WorkState | null>(null);
  const [busy, setBusy] = useState(false), [connected, setConnected] = useState(true);
  const [uncertain, setUncertain] = useState(true), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [elapsed, setElapsed] = useState(0);
  const anchor = useRef(0), epoch = useRef(0), writing = useRef(false), mounted = useRef(true);
  const startId = useRef<string | null>(null);
  const read = useCallback(async () => {
    const version = ++epoch.current;
    try {
      const next = await request("work-timer", "GET", undefined, AbortSignal.timeout(15000)) as WorkState;
      if (!mounted.current || version !== epoch.current) return;
      anchor.current = performance.now();
      if (next.sessions.some(s => s.user_id === identity.user_id) || next.work.some(w => w.session_id === startId.current)) startId.current = null;
      setElapsed(0); setState(next); onState(next); setUncertain(false); setError("");
      return next;
    } catch (e) {
      if (mounted.current && version === epoch.current) {
        setUncertain(true); setError(e instanceof Error ? e.message : "Stanja ni mogoče preveriti.");
      }
    }
  }, [request, onState, identity.user_id]);
  useEffect(() => {
    mounted.current = true;
    const sync = () => { setConnected(navigator.onLine); if (!writing.current) void read(); };
    const offline = () => { setConnected(false); setUncertain(true); };
    sync();
    const poll = setInterval(sync, 15000), display = setInterval(() => setElapsed(Math.max(0, performance.now() - anchor.current) / 1000), 1000);
    window.addEventListener("online", sync); window.addEventListener("offline", offline); window.addEventListener("focus", sync);
    return () => {
      mounted.current = false; clearInterval(poll); clearInterval(display);
      window.removeEventListener("online", sync); window.removeEventListener("offline", offline); window.removeEventListener("focus", sync);
    };
  }, [read]);
  const session = state?.sessions.find(s => s.user_id === identity.user_id);
  // Only the display advances locally. Every authoritative instant and duration is from SQL.
  const seconds = Math.max(0, Number(session?.elapsed_seconds || 0) + (session?.state === "running" ? elapsed : 0));
  const whole = Math.floor(seconds), clock = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(v => String(v).padStart(2, "0")).join(":");
  const disabled = busy || !connected || uncertain;
  async function command(action: "start" | "pause" | "resume" | "stop", metadata?: Record<string, unknown>) {
    if (writing.current || disabled) return;
    writing.current = true; ++epoch.current; setBusy(true); setError(""); setNotice("");
    if (action === "start") startId.current ??= crypto.randomUUID();
    try {
      await request("work-timer", "POST", action === "start" ? { action, session_id: startId.current, ...metadata } : { action, session_id: session!.id, expected_version: session!.version }, AbortSignal.timeout(15000));
      if (action === "start") startId.current = null;
      const confirmed = await read();
      if (confirmed) {
        await onSaved();
        setNotice(action === "stop" ? "Delo je zaključeno. Trajanje je izračunal in shranil strežnik." : "Stanje časovnika je potrjeno na strežniku.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ukaz ni potrjen.";
      await read(); // Resolve a response lost after the server committed; never replay offline commands.
      setError(`${message} Preveri prikazano stanje pred ponovnim ukazom.`);
    } finally { writing.current = false; if (mounted.current) setBusy(false); }
  }
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void command("start", { project_id: form.get("project_id") || null, description: form.get("description") || "" });
  }
  return <section className={`card ${styles.timer}`} aria-labelledby="live-work-title" aria-busy={busy}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>DELOVNA SEJA</span><h2 id="live-work-title">Časovnik dela</h2></div>
      <span className={styles.status}>{session?.state === "running" ? "● Delo poteka" : session ? "Ⅱ Premor" : "Pripravljeno"}</span></div>
    <div className={styles.clock} role="timer" aria-label="Pretečeni čas dela">{clock}</div>
    <p>{session ? `Začetek: ${new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }).format(new Date(session.started_at))} · ${session.description || "Brez opisa"}` : "Začni, ko začneš delati. Premori se ne štejejo v opravljene ure."}</p>
    {!identity.member_id ? <p>Za časovnik potrebuješ povezan članski profil.</p> : session ? <div className={styles.actions}>
      {session.state === "running" ? <button className="button secondary" disabled={disabled} onClick={() => void command("pause")}>PAUSE · Premor</button> : <button className="button primary" disabled={disabled} onClick={() => void command("resume")}>RESUME · Nadaljuj</button>}
      <button className="button primary" disabled={disabled} onClick={() => void command("stop")}>STOP · Zaključi delo</button>
    </div> : <form onSubmit={start} className={styles.form}>
      <label>Projekt (neobvezno)<select name="project_id" disabled={disabled}><option value="">Brez projekta</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Opis dela<input name="description" maxLength={2000} disabled={disabled} placeholder="Na čem delaš?" /></label>
      <button className="button primary" disabled={disabled}>START · Začni delo</button>
    </form>}
    {(!connected || uncertain) && <p role="status" className={styles.warning}>{!connected ? "Povezava je prekinjena. Zadnja potrjena seja ostane shranjena na strežniku; prikaz je začasen. Ukazi bodo na voljo po ponovni povezavi." : "Preverjam stanje na strežniku. Dokler stanje ni potrjeno, ukazi niso na voljo."}</p>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    {uncertain && connected && <button className="button secondary" disabled={busy} onClick={() => void read()}>Ponovno preveri stanje</button>}
    {notice && <p role="status">{notice}</p>}
    <small>Aktivni čas se v seštevkih prikazuje začasno. Ob zaključku ga nadomesti trajna evidenca. Ročne popravke lahko z razlogom opravi administrator.</small>
  </section>;
}
