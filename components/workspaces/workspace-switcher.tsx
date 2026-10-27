"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Settings2, X } from "lucide-react";
import Image from "next/image";
import { useWorkspace } from "./workspace-context";
import styles from "./workspaces.module.css";
export default function WorkspaceSwitcher({ initialCreate = false }: {
    initialCreate?: boolean;
}) {
    const context = useWorkspace();
    const [mode, setMode] = useState<"create" | "manage" | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [invite, setInvite] = useState("");
    const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (mode)
        dialog.current?.showModal();
    else
        dialog.current?.close(); }, [mode]);
    if (!context)
        return null;
    const { active, workspaces, select, reload, request } = context;
    const admin = active && ["OWNER", "ADMIN", "SUPERADMIN"].includes(active.role);
    async function run(body: unknown) {
        setBusy(true);
        setError("");
        try {
            const result = await request("/api/workspaces", body) as {
                id?: string;
                token?: string;
                organization_id?: string;
            };
            const list = await reload();
            if (result.token) {
                setInvite(new URL("/?invitation=" + result.token, location.origin).href);
            }
            else if (result.id || result.organization_id) {
                select((result.id || result.organization_id)!);
                setMode(null);
            }
            else if ((body as {
                action: string;
            }).action === "leave") {
                if (list.length)
                    select(list[0].id);
                setMode(null);
            }
            else
                setMode(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Sprememba ni potrjena.");
        }
        finally {
            setBusy(false);
        }
    }
    return <>
    <details className={styles.switcher}>
      <summary><span className={styles.workspaceMark} style={{ background: active?.accent_color }}>{active?.logo_url ? <Image src={active.logo_url} alt="" width={27} height={27} unoptimized/> : active?.name.slice(0, 1) || "W"}</span><span>{active?.name || "Tvoji delovni prostori"}</span><ChevronDown size={15}/></summary>
      <div className={styles.popover}><span className="eyebrow">Tvoji delovni prostori</span>{workspaces.map(w => <button key={w.id} aria-current={active?.id === w.id ? "true" : undefined} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); select(w.id); }}><span>{w.name}<small>{w.member_count} / 50 članov</small></span>{active?.id === w.id && <Check size={16}/>}</button>)}<button ref={trigger} onClick={() => { setError(""); setMode("create"); }}><Plus size={16}/> Ustvari delovni prostor</button><button onClick={() => { setError(""); setMode("manage"); }}><Settings2 size={16}/> Upravljaj prostore</button></div>
    </details>
    {initialCreate && <button className="button primary" onClick={() => setMode("create")}><Plus size={17}/> Ustvari delovni prostor</button>}
    <dialog ref={dialog} className={`dialog ${styles.dialog}`} onCancel={e => { if (busy)
        e.preventDefault();
    else
        setMode(null); }} onClose={() => { setMode(null); trigger.current?.focus(); }} aria-labelledby="workspace-dialog-title">
      <div className="dialog-inner"><div className={styles.heading}><h2 id="workspace-dialog-title">{mode === "create" ? "Nov delovni prostor" : "Upravljanje prostorov"}</h2><button className="button secondary" disabled={busy} onClick={() => setMode(null)} aria-label="Zapri"><X size={18}/></button></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {mode === "create" ? <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run({ action: "create", ...Object.fromEntries(f) }); }}><fieldset disabled={busy} className="org-fields"><label>Ime prostora<input name="name" required maxLength={80} autoFocus/></label><label>Opis<textarea name="description" maxLength={2000}/></label><label>Vrsta<select name="organization_type"><option value="association">Društvo</option><option value="nonprofit">Neprofitna organizacija</option><option value="volunteer">Prostovoljska organizacija</option><option value="remote">Oddaljena ekipa</option><option value="other">Drugo</option></select></label><label>Logotip (HTTPS URL, neobvezno)<input name="logo_url" type="url" pattern="https://.*"/></label><label>Barva<input type="color" name="accent_color" defaultValue="#5267df"/></label><button className="button primary">{busy ? "Ustvarjam …" : "Ustvari prostor"}</button></fieldset></form> : <>
        <p>{active?.name} · {active?.member_count || 0} / 50 aktivnih članov</p>
        {admin && <form onSubmit={e => { e.preventDefault(); void run({ action: "invite", email: new FormData(e.currentTarget).get("email") }); }}><label>Povabi člana po e-pošti<input type="email" name="email" required maxLength={254}/></label><button disabled={busy} className="button secondary">Pripravi povezavo za povabilo</button></form>}
        {invite && <p role="status">Povezavo deli z navedenim prejemnikom; velja sedem dni.<input readOnly value={invite} aria-label="Povezava povabila" onFocus={e => e.target.select()}/></p>}
        <form onSubmit={e => { e.preventDefault(); const raw = String(new FormData(e.currentTarget).get("token")); let token = raw; try {
            token = new URL(raw).searchParams.get("invitation") || raw;
        }
        catch { } void run({ action: "accept", token }); }}><label>Sprejmi povabilo<input name="token" required placeholder="Povezava ali koda povabila" defaultValue={typeof location !== "undefined" ? new URL(location.href).searchParams.get("invitation") || "" : ""}/></label><button className="button secondary" disabled={busy}>Pridruži se prostoru</button></form>
        {active && active.role !== "OWNER" && active.id !== "00000000-0000-4000-8000-000000000001" && <button className="button secondary" disabled={busy} onClick={() => { if (confirm("Zapustiš ta delovni prostor?"))
            void run({ action: "leave" }); }}>Zapusti prostor</button>}
      </>}
      </div>
    </dialog>
  </>;
}
