"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import Link from "next/link";
import OrganizationApp from "../organization-app";
import BrandLogo from "../brand-logo";
import { WorkspaceContext, type BusinessWorkspace } from "./workspace-context";
import WorkspaceSwitcher from "./workspace-switcher";
import styles from "./workspaces.module.css";
export default function WorkspaceGateway({ client, user, onSignOut }: {
    client: SupabaseClient;
    user: User;
    onSignOut: () => Promise<void>;
}) {
    const [workspaces, setWorkspaces] = useState<BusinessWorkspace[]>([]);
    const [selected, setSelected] = useState("");
    const [ready, setReady] = useState(false), [error, setError] = useState("");
    const active = workspaces.find(w => w.id === selected) || null;
    const request = useCallback(async (path: string, body?: unknown): Promise<unknown> => {
        const token = (await client.auth.getSession()).data.session?.access_token;
        if (!token)
            throw new Error("Prijava je potekla.");
        const response = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + token, ...(selected ? { "x-workspace-id": selected } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.error || "Zahteva ni uspela.");
        return data;
    }, [client, selected]);
    const reload = useCallback(async () => {
        const token = (await client.auth.getSession()).data.session?.access_token;
        if (!token)
            throw new Error("Prijava je potekla.");
        const response = await fetch("/api/workspaces", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.error || "Delovni prostori niso dostopni.");
        setWorkspaces(data);
        return data as BusinessWorkspace[];
    }, [client]);
    const select = useCallback((id: string, preserveView = false) => {
        setSelected(id);
        const url = new URL(location.href);
        url.searchParams.set("workspace", id);
        if (!preserveView)
            url.hash = "overview";
        history.replaceState(null, "", url);
        try {
            localStorage.setItem("wemry-workspace:" + user.id, id);
        }
        catch { /* Preference is optional, never authorization. */ }
    }, [user.id]);
    useEffect(() => {
        let alive = true;
        void Promise.resolve().then(reload).then(list => {
            if (!alive)
                return;
            let preference = new URL(location.href).searchParams.get("workspace");
            try {
                preference ||= localStorage.getItem("wemry-workspace:" + user.id);
            }
            catch { /* Storage may be disabled. */ }
            if (list.length)
                select(list.find(w => w.id === preference)?.id || list[0].id, true);
            setReady(true);
        }).catch(e => { if (alive) {
            setError(e.message);
            setReady(true);
        } });
        return () => { alive = false; };
    }, [reload, select, user.id]);
    const value = { active, workspaces, select, reload, request };
    if (error)
        return <main className={styles.welcome}><BrandLogo /><h1>WemryOS for Business</h1><p role="alert">{error}</p><button className="button primary" onClick={() => location.reload()}>Poskusi znova</button><Link href="/legacy">Prejšnji prostori</Link><button className="button secondary" onClick={() => void onSignOut()}>Odjava</button></main>;
    return <WorkspaceContext.Provider value={value}>
    {!ready ? <main className={styles.welcome}><p role="status">Odpiram tvoje delovne prostore …</p></main> : active ?
            <OrganizationApp key={user.id + ":" + active.id} client={client} user={user} onSignOut={onSignOut} workspaceId={active.id}/> :
            <main className={styles.welcome}><BrandLogo /><span className="eyebrow">WemryOS for Business</span><h1>Your team. One workspace.</h1><p>Ustvari prostor za svojo ekipo ali sprejmi povabilo.</p><WorkspaceSwitcher initialCreate/><button className="button secondary" onClick={() => void onSignOut()}>Odjava</button></main>}
  </WorkspaceContext.Provider>;
}
