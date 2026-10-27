"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Send, Sparkles, X } from "lucide-react";
import styles from "./ask-shaper.module.css";
import { useWorkspace } from "./workspaces/workspace-context";

type Answer = { question: string; answer: string; period: string | null; sources: string[] };
const suggestions = [
  "Katere naloge imam?",
  "Katere moje naloge zamujajo?",
  "Koliko ur sem opravil ta teden?",
  "Koliko mi še manjka do tedenskega cilja?",
  "Kdaj imam naslednji sestanek?",
  "Kakšna je moja prisotnost?",
];
export default function AskShaper({ client, admin }: { client: SupabaseClient; admin: boolean }) {
  const workspace=useWorkspace()?.active?.id;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  function close() {
    controller.current?.abort();
    dialog.current?.close();
    trigger.current?.focus();
  }
  async function ask(value: string) {
    if (inFlight.current || !value.trim()) return;
    inFlight.current = true;
    const active = new AbortController();
    controller.current = active;
    setLoading(true); setError("");
    try {
      const { data } = await client.auth.getSession();
      if (!data.session?.access_token) throw new Error("Prijava je potekla. Prijavi se znova.");
      if (active.signal.aborted) return;
      const result = await fetch("/api/ask-shaper", {
        method: "POST", cache: "no-store", signal: active.signal,
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json", ...(workspace?{"x-workspace-id":workspace}:{}) },
        body: JSON.stringify({ question: value.trim() }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Ask Wemry trenutno ni na voljo.");
      setAnswers(previous => [...previous.slice(-9), { question: value.trim(), answer: body.answer, period: body.period, sources: body.sources }]);
      setQuestion("");
    } catch (e) {
      if (!active.signal.aborted) setError(e instanceof Error ? e.message : "Zahteva ni uspela. Poskusi znova.");
    } finally {
      setLoading(false); inFlight.current = false;
      input.current?.focus();
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  return <>
    <button ref={trigger} className={styles.trigger} type="button" aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); input.current?.focus(); }}>
      <Sparkles size={17} aria-hidden="true" /> Ask Wemry
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="ask-shaper-title" onCancel={close}>
      <div className={styles.header}>
        <div><span className={styles.eyebrow}>WEMRY AI</span><h2 id="ask-shaper-title"><Sparkles size={22} aria-hidden="true" /> Ask Wemry</h2></div>
        <button className={styles.close} type="button" aria-label="Zapri Ask Wemry" onClick={close}><X size={21} /></button>
      </div>
      <p className={styles.description}>Tvoje naloge, ure in sestanki na enem mestu. Vprašaj v slovenščini.</p>
      <div className={styles.content}>
        <div className={styles.suggestions} aria-label="Predlagana vprašanja">
          {[...suggestions, ...(admin ? ["Kateri člani zaostajajo za tedenskim ciljem?", "Koliko nalog je bilo zaključenih prejšnji teden?", "Kateri projekti imajo odprte naloge?", "Kakšna je bila udeležba na seriji Shape Talks?"] : [])].map(value =>
            <button key={value} type="button" disabled={loading} onClick={() => void ask(value)}>{value}</button>)}
        </div>
        <div className={styles.answers} role="log" aria-label="Odgovori Ask Wemry" aria-live="polite" aria-relevant="additions">
          {answers.map((entry, index) => <article key={index} className={styles.answer}>
            <h3>{entry.question}</h3><p>{entry.answer}</p>
            {entry.period && <small>Obdobje: {entry.period}</small>}
            {!!entry.sources.length && <small>Vir: Supabase · {entry.sources.join(", ")}</small>}
          </article>)}
        </div>
        {loading && <p className={styles.loading} role="status"><LoaderCircle size={17} className={styles.spinner} /> Pripravljam odgovor iz dovoljenih podatkov …</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="ask-shaper-question">Tvoje vprašanje</label>
        <textarea ref={input} id="ask-shaper-question" value={question} maxLength={1000} rows={2} disabled={loading} placeholder="Koliko ur sem opravil ta teden?" onChange={e => setQuestion(e.target.value)} required />
        <div><small>Vsako vprašanje je samostojno. Ask Wemry podatke samo bere.</small><button type="submit" disabled={loading || !question.trim()}><Send size={16} aria-hidden="true" /> Vprašaj</button></div>
      </form>
    </dialog>
  </>;
}
