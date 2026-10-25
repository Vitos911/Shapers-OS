"use client";
import { useEffect, useState } from "react";
type Audit = { id: string; record_id: string; actor_id: string; occurred_at: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> };
export function WorkAudit({ request }: { request: (resource: string) => Promise<unknown> }) {
  const [rows, setRows] = useState<Audit[] | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void request("work-audit").then(data => { if (alive) setRows(data as Audit[]); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [request]);
  return <section className="org-card"><h2>Revizija popravkov ur</h2><p>Zadnjih 100 sprememb evidence. Razlog, izvajalec, čas ter vrednosti pred in po posegu ostanejo v nespremenljivi revizijski sledi.</p>
    {error && <p role="alert">{error}</p>}{!rows && !error && <p role="status">Nalagam revizijo …</p>}
    {rows && <div className="org-table-wrap" tabIndex={0} role="region" aria-label="Revizija ur"><table><thead><tr><th>Čas / izvajalec</th><th>Zapis</th><th>Pred → po</th><th>Razlog</th></tr></thead><tbody>{rows.filter(r => r.new_data.adjustment_reason).map(r => <tr key={r.id}>
      <td>{new Date(r.occurred_at).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}<br /><small>{r.actor_id}</small></td><td><small>{r.record_id}</small><br />{String(r.new_data.date)}</td>
      <td>{r.old_data ? String(r.old_data.hours) : "∅"} → {String(r.new_data.hours)} h{r.new_data.deleted ? " · odstranjeno" : ""}</td><td>{String(r.new_data.adjustment_reason)}</td>
    </tr>)}</tbody></table>{!rows.some(r => r.new_data.adjustment_reason) && <p>Ni administrativnih popravkov.</p>}</div>}
  </section>;
}
