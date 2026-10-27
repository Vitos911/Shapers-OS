"use client";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/organization";
import { useWorkspace } from "./workspace-context";
import styles from "./workspaces.module.css";
type Group = {
    id: string;
    name: string;
    weekly_hours: number;
};
const featureNames = { weekly_hours_enabled: "Beleženje ur", attendance_enabled: "Udeležba na sestankih", leaderboard_enabled: "Lestvica", gamification_enabled: "Značke in nizi" } as const;
export default function WorkspaceSettings({ snapshot, refresh }: {
    snapshot: Snapshot;
    refresh: () => Promise<unknown>;
}) {
    const context = useWorkspace();
    const [groups, setGroups] = useState<Group[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<Group | null>(null);
    useEffect(() => {
        let alive = true;
        if (context)
            void context.request("/api/org/workspace-settings").then(data => {
                if (alive)
                    setGroups((data as {
                        groups: Group[];
                    }).groups);
            }).catch(() => { if (alive)
                setMessage("Nastavitve skupin niso dostopne."); });
        return () => { alive = false; };
    }, [context]);
    if (!context)
        return null;
    const admin = ["OWNER", "ADMIN", "SUPERADMIN"].includes(snapshot.identity.role);
    async function save(body: unknown) {
        setBusy(true);
        setMessage("");
        try {
            await context!.request("/api/workspaces", body);
            await refresh();
            await context!.reload();
            const data = await context!.request("/api/org/workspace-settings") as {
                groups: Group[];
            };
            setGroups(data.groups);
            setEditing(null);
            setMessage("Nastavitve so shranjene.");
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Shranjevanje ni uspelo.");
        }
        finally {
            setBusy(false);
        }
    }
    return <section className={`panel ${styles.settings}`}>
    <h2>Nastavitve delovnega prostora</h2>
    <p>Skupina določa cilj ur. Dovoljenja določa ločena vloga. Zgodovinske ure in zaključeni rezultati ostanejo ohranjeni.</p>
    {message && <p role="status">{message}</p>}
    <h3>Članske skupine</h3>
    <ul>{groups.map(g => <li key={g.id}>{g.name} · {g.weekly_hours} h / teden {admin && <button className="cloud-text-button" onClick={() => setEditing(g)}>Uredi skupino {g.name}</button>}</li>)}</ul>
    {admin && <>
      <form key={editing?.id || "new"} onSubmit={e => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save({ action: "group", ...(editing ? { id: editing.id } : {}), name: f.get("name"), weekly_hours: Number(f.get("weekly_hours")) });
            }}>
        <label>Ime skupine<input name="name" required maxLength={80} defaultValue={editing?.name || ""}/></label>
        <label>Tedenski cilj (0 = brez zahteve)<input type="number" name="weekly_hours" min="0" max="168" step="0.25" required defaultValue={editing?.weekly_hours ?? 4}/></label>
        <button className="button secondary" disabled={busy}>Shrani skupino</button>
        {editing && <button type="button" className="cloud-text-button" onClick={() => setEditing(null)}>Prekliči urejanje</button>}
      </form>
      <form onSubmit={e => { e.preventDefault(); void save({ action: "assign-group", ...Object.fromEntries(new FormData(e.currentTarget)) }); }}>
        <label>Član<select name="member_id">{snapshot.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>Skupina<select name="group_id">{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <button className="button secondary" disabled={busy || !groups.length}>Dodeli skupino</button>
      </form>
      <h3>Funkcije prostora</h3>
      <form key={JSON.stringify(snapshot.features)} onSubmit={e => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save({ action: "settings", ...Object.fromEntries(Object.keys(featureNames).map(key => [key, f.has(key)])) });
            }}>
        {Object.entries(featureNames).map(([key, label]) => <label key={key}><span><input type="checkbox" name={key} defaultChecked={snapshot.features?.[key as keyof typeof featureNames] !== false}/> {label}</span></label>)}
        <button className="button secondary" disabled={busy}>Shrani funkcije</button>
      </form>
      {context.active?.id !== "00000000-0000-4000-8000-000000000001" && <>
        <h3>Člani prostora</h3>
        <ul>{snapshot.workspaceDirectory?.map(member => <li key={member.user_id}>{member.name} · {member.role} {member.role !== "OWNER" && member.user_id !== snapshot.identity.user_id && <button className="cloud-text-button" disabled={busy} onClick={() => { if(confirm(`Odstraniš člana ${member.name} iz tega prostora?`))void save({action:"remove",user_id:member.user_id}); }}>Odstrani člana</button>}</li>)}</ul>
      </>}
      {snapshot.identity.role === "OWNER" && <>
        <h3>Vloge in lastništvo</h3>
        <form onSubmit={e => { e.preventDefault(); void save({ action: "role", ...Object.fromEntries(new FormData(e.currentTarget)) }); }}>
          <label>Član<select name="user_id">{snapshot.workspaceDirectory?.filter(m => m.user_id !== snapshot.identity.user_id).map(m => <option key={m.user_id} value={m.user_id}>{m.name} · {m.role}</option>)}</select></label>
          <label>Vloga<select name="role"><option value="MEMBER">MEMBER</option><option value="ADMIN">ADMIN</option></select></label>
          <button className="button secondary" disabled={busy || !snapshot.workspaceDirectory?.some(m => m.user_id !== snapshot.identity.user_id)}>Shrani vlogo</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); if (confirm("Preneseš lastništvo na izbranega člana? Postal/a boš administrator."))
                void save({ action: "transfer", user_id: new FormData(e.currentTarget).get("user_id") }); }}>
          <label>Novi lastnik<select name="user_id">{snapshot.workspaceDirectory?.filter(m => m.user_id !== snapshot.identity.user_id).map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label>
          <button className="button secondary" disabled={busy || !snapshot.workspaceDirectory?.some(m => m.user_id !== snapshot.identity.user_id)}>Prenesi lastništvo</button>
        </form>
      </>}
    </>}
  </section>;
}
