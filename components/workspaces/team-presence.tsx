"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace-context";
import styles from "./workspaces.module.css";
type Person = {
    user_id: string;
    member_id: string;
    name: string;
    hidden: boolean;
    status: "online" | "idle" | "offline" | "unknown";
};
const labels = { online: "Na spletu", idle: "Nedejaven", offline: "Brez povezave", unknown: "Neznano / skrito" };
export default function TeamPresence({ userId }: {
    userId: string;
}) {
    const context = useWorkspace(), [people, setPeople] = useState<Person[]>([]), [known, setKnown] = useState(false), [busy, setBusy] = useState(false);
    const interaction = useRef(0);
    const request = context?.request;
    useEffect(() => {
        if (!request)
            return;
        let disposed = false, pending = false;
        const connection = crypto.randomUUID();
        interaction.current = Date.now();
        const interact = () => { interaction.current = Date.now(); };
        const update = async (disconnect = false) => {
            if (pending)
                return;
            pending = true;
            try {
                const data = await request("/api/workspaces/presence", { connection_id: connection, active: document.visibilityState === "visible" && Date.now() - interaction.current < 5 * 60000, disconnect }) as Person[];
                if (!disposed) {
                    setPeople(data);
                    setKnown(true);
                }
            }
            catch {
                if (!disposed)
                    setKnown(false);
            }
            finally {
                pending = false;
            }
        };
        const visible = () => { void update(); };
        // Only an interaction timestamp is retained; event content is never collected.
        window.addEventListener("pointerdown", interact, { passive: true });
        window.addEventListener("keydown", interact);
        document.addEventListener("visibilitychange", visible);
        void update();
        const timer = setInterval(() => void update(), 30000);
        return () => { disposed = true; clearInterval(timer); window.removeEventListener("pointerdown", interact); window.removeEventListener("keydown", interact); document.removeEventListener("visibilitychange", visible); void update(true); };
    }, [request]);
    if (!context)
        return null;
    const own = people.find(p => p.user_id === userId), online = known ? people.filter(p => p.status === "online").length : 0;
    return <details className={`${styles.switcher} ${styles.presence}`}><summary aria-label="Povezanost ekipe"><span className={styles.avatarStack}>{people.filter(p => known && p.status === "online").slice(0, 3).map(p => <span className={styles.presenceAvatar} key={p.user_id} aria-hidden="true">{p.name.split(" ").map(n => n[0]).slice(0, 2).join("")}<i className={styles.dot} data-status="online"/></span>)}</span><span>{known ? `${online} na spletu` : "Prisotnost neznana"}</span></summary><div className={styles.popover}><strong>Povezanost ekipe</strong><p>Stanje povezave s to aplikacijo. Ne meri opravljenega dela. Po izgubi povezave lahko prikaz zamuja do 90 sekund.</p><ul>{people.map(p => <li key={p.user_id}><span>{p.name}</span><small><span className={styles.dot} data-status={known ? p.status : "unknown"}/>{labels[known ? p.status : "unknown"]}</small></li>)}</ul><label><input type="checkbox" checked={own?.hidden || false} disabled={busy || !known} onChange={async (e) => { setBusy(true); try {
        await context.request("/api/workspaces", { action: "privacy", hidden: e.target.checked });
        setPeople(previous => previous.map(p => p.user_id === userId ? { ...p, hidden: !own?.hidden, status: "unknown" } : p));
    }
    catch {
        setKnown(false);
    }
    finally {
        setBusy(false);
    } }}/> Skrij mojo prisotnost</label><a href="#members">Vsi člani</a></div></details>;
}
