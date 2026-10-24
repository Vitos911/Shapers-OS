"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import {
  ArrowRight,
  Cloud,
  Earth,
  LogOut,
  RefreshCw,
  Users,
} from "lucide-react";
import Workspace from "./workspace";
import { cloudStore, localStore } from "@/lib/storage";
import { emptyWorkspace } from "@/lib/model";

type CloudSpace = { id: string; name: string; owner_id: string };

function CloudFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="cloud-entry">
      <a className="brand" href="/">
        <span className="brand-mark">
          <Earth size={26} />
        </span>
        <span>
          shapers<span className="brand-os">OS</span>
        </span>
      </a>
      <section className="cloud-entry-card">{children}</section>
      <p className="cloud-entry-footer">Prostor za skupen učinek.</p>
    </div>
  );
}

export default function CloudApp() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [spaces, setSpaces] = useState<CloudSpace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const localAdapter = useMemo(() => localStore(), []);
  const adapter = useMemo(
    () => (client && selected ? cloudStore(client, selected) : null),
    [client, selected],
  );

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    async function initialize() {
      try {
        const response = await fetch("/api/supabase-config", {
          cache: "no-store",
        });
        const config = await response.json();
        if (!response.ok)
          throw new Error(
            config.error || "Povezave Supabase ni mogoče nastaviti.",
          );
        if (!alive) return;
        if (!config.configured) {
          setLocal(true);
          setLoading(false);
          return;
        }
        const supabase = createClient(config.url, config.publishableKey, {
          auth: { flowType: "implicit", detectSessionInUrl: true },
        });
        setClient(supabase);
        const { data: listener } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (!alive) return;
            setUser(session?.user ?? null);
            if (session) { setMessage(""); setError(""); }
            if (!session) {
              setSelected(null);
              setSpaces([]);
            }
          },
        );
        unsubscribe = () => listener.subscription.unsubscribe();
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (!alive) return;
        if (error && error.name !== "AuthSessionMissingError")
          setError("Prijava ni veljavna ali je potekla. Prijavi se znova.");
        setUser(user);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Povezava ni uspela.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void initialize();
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  async function loadSpaces() {
    if (!client || !user) return;
    const { data, error } = await client
      .from("shapers_workspaces")
      .select("id,name,owner_id")
      .order("created_at");
    if (error) {
      setError(
        "Prostorov ni mogoče naložiti. Preveri povezavo in poskusi osvežiti seznam.",
      );
      return;
    }
    setSpaces(data);
  }
  useEffect(() => {
    if (!client || !user) return;
    let active = true;
    void client
      .from("shapers_workspaces")
      .select("id,name,owner_id")
      .order("created_at")
      .then(({ data, error }) => {
        if (!active) return;
        if (error)
          setError(
            "Prostorov ni mogoče naložiti. Preveri povezavo in dovoljenja.",
          );
        else {
          setSpaces(data);
          const requested = new URLSearchParams(location.search).get(
            "workspace",
          );
          if (data.some((x) => x.id === requested)) setSelected(requested);
        }
      });
    return () => {
      active = false;
    };
  }, [client, user?.id]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const email = String(
      new FormData(event.currentTarget).get("email") || "",
    ).trim();
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: location.origin + "/",
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setMessage(
        "Preveri e-pošto in odpri povezavo za prijavo. Če uporabljaš drug brskalnik, se vrni v aplikacijo v njem.",
      );
    } catch {
      setError(
        "Povezave za prijavo ni bilo mogoče poslati. Preveri e-pošto in poskusi kasneje. Projekt brez lastnega SMTP lahko pošilja le dovoljenim naslovom organizacije Supabase.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !user || busy) return;
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await client
        .from("shapers_workspaces")
        .insert({ name, owner_id: user.id, payload: emptyWorkspace() })
        .select("id,name,owner_id")
        .single();
      if (error) throw error;
      setSpaces((previous) => [...previous, data]);
      openSpace(data.id);
    } catch {
      setError(
        "Prostora ni mogoče ustvariti. Preveri potrjeno prijavo, povezavo in dovoljenja baze.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openSpace(id: string) {
    setSelected(id);
    setError("");
    const url = new URL(location.href);
    url.searchParams.set("workspace", id);
    history.replaceState(null, "", url);
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setError("Odjava ni uspela. Poskusi znova.");
    else {
      setSelected(null);
      setSpaces([]);
      setUser(null);
      history.replaceState(null, "", location.pathname);
    }
  }

  if (loading)
    return (
      <CloudFrame>
        <div className="cloud-entry-icon">
          <Cloud size={28} />
        </div>
        <h1>Odpiram tvoj prostor …</h1>
        <p role="status">Preverjam povezavo in prijavo.</p>
      </CloudFrame>
    );
  if (local)
    return (
      <Workspace
        store={localAdapter}
        accountControls={
          client && (
            <button
              className="button secondary"
              onClick={() => setLocal(false)}
            >
              <Cloud size={16} />
              Poveži Supabase
            </button>
          )
        }
      />
    );
  if (user && client && adapter && selected)
    return (
      <Workspace
        key={`${user.id}:${selected}`}
        store={adapter}
        accountControls={
          <>
            <span>
              <Cloud size={16} />
              {user.email}
            </span>
            <button
              className="button secondary"
              onClick={() => {
                setSelected(null);
                void loadSpaces();
                history.replaceState(null, "", location.pathname);
              }}
            >
              Zamenjaj prostor
            </button>
            <button className="button secondary" onClick={() => void signOut()}>
              <LogOut size={15} />
              Odjava
            </button>
          </>
        }
        sharingPanel={
          <Sharing
            client={client}
            workspaceId={selected}
            owner={spaces.find((x) => x.id === selected)?.owner_id === user.id}
          />
        }
      />
    );

  return (
    <CloudFrame>
      <div className="cloud-entry-icon">
        <Cloud size={28} />
      </div>
      <span className="eyebrow">SHAPERS OS + SUPABASE</span>
      <h1>{user ? "Izberi svoj prostor." : "Skupaj, tudi na spletu."}</h1>
      <p>
        {user
          ? `Prijavljen/a kot ${user.email}. Odpri svoj prostor ali ustvari novega.`
          : "Prijavi se po e-pošti. Svoje projekte, dogodke in ure boš lahko odprl/a tudi na drugi napravi."}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="info-banner" role="status">
          {message}
        </div>
      )}
      {!user ? (
        <form onSubmit={login}>
          <label>
            E-poštni naslov
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="ti@skupnost.si"
            />
          </label>
          <button className="button primary" disabled={busy || !client}>
            {busy ? "Pošiljam …" : "Pošlji povezavo za prijavo"}
            <ArrowRight size={16} />
          </button>
        </form>
      ) : (
        <>
          <div className="cloud-space-list">
            {spaces.map((space) => (
              <button
                key={space.id}
                className="cloud-space-button"
                onClick={() => openSpace(space.id)}
              >
                <span>
                  <strong>{space.name}</strong>
                  <small>
                    {space.owner_id === user.id
                      ? "Tvoj prostor"
                      : "Deljeno s tabo"}
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          <button
            className="button secondary"
            onClick={() => void loadSpaces()}
          >
            <RefreshCw size={15} />
            Osveži seznam
          </button>
          <form onSubmit={createSpace}>
            <label>
              Ime novega delovnega prostora
              <input
                name="name"
                maxLength={80}
                required
                placeholder="Naša skupnost"
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Ustvarjam …" : "Ustvari prostor"}
              <ArrowRight size={16} />
            </button>
          </form>
          <button className="cloud-text-button" onClick={() => void signOut()}>
            Odjava
          </button>
        </>
      )}
      <button
        className="cloud-text-button"
        onClick={() => {
          setLocal(true);
          setError("");
        }}
      >
        Nadaljuj samo v tem brskalniku
      </button>
      <p className="cloud-entry-note">
        Obstoječi lokalni podatki ostanejo ohranjeni. V oblak jih preneseš v
        Nastavitvah po prijavi.
      </p>
    </CloudFrame>
  );
}

function Sharing({
  client,
  workspaceId,
  owner,
}: {
  client: SupabaseClient;
  workspaceId: string;
  owner: boolean;
}) {
  const [access, setAccess] = useState<{ email: string; role: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const { data, error } = await client
      .from("shapers_workspace_access")
      .select("email,role")
      .eq("workspace_id", workspaceId)
      .order("email");
    if (error) setError("Dostopov ni mogoče prebrati.");
    else setAccess(data);
  }
  useEffect(() => {
    if (owner) void refresh();
  }, [workspaceId, owner]);
  if (!owner)
    return (
      <section className="panel settings-panel">
        <h2>Deljeno s tabo</h2>
        <p>
          Dostope do tega prostora upravlja njegov lastnik. Spremembe drugih
          članov naloži z gumbom Osveži iz baze.
        </p>
      </section>
    );
  return (
    <section className="panel settings-panel">
      <span className="stat-icon blue">
        <Users size={21} />
      </span>
      <h2>Dostop do skupnega prostora</h2>
      <p>
        Dostop dodeli samo izbranemu e-poštnemu naslovu. Prejemnik se mora
        prijaviti s potrjenim računom; dodajanje dostopa samo po sebi ne pošlje
        e-pošte.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="cloud-access-list">
        {access.map((item) => (
          <div key={item.email}>
            <span>
              {item.email}
              <small>
                {item.role === "editor" ? "Urejanje" : "Samo ogled"}
              </small>
            </span>
            <button
              disabled={busy}
              className="button secondary"
              onClick={async () => {
                if (!confirm(`Odstranim dostop za ${item.email}?`)) return;
                setBusy(true);
                setError("");
                const { error } = await client
                  .from("shapers_workspace_access")
                  .delete()
                  .eq("workspace_id", workspaceId)
                  .eq("email", item.email);
                if (error) setError("Dostopa ni bilo mogoče odstraniti.");
                else await refresh();
                setBusy(false);
              }}
            >
              Odstrani
            </button>
          </div>
        ))}
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const values = new FormData(form);
          const email = String(values.get("email") || "")
            .trim()
            .toLowerCase();
          const role = String(values.get("role") || "viewer");
          setBusy(true);
          setError("");
          const { error } = await client
            .from("shapers_workspace_access")
            .insert({ workspace_id: workspaceId, email, role });
          if (error)
            setError(
              error.code === "23505"
                ? "Ta naslov že ima dostop. Najprej ga odstrani, če želiš spremeniti pravice."
                : "Dostopa ni mogoče dodati. Preveri naslov in lastništvo prostora.",
            );
          else {
            form.reset();
            await refresh();
          }
          setBusy(false);
        }}
      >
        <label>
          E-pošta sodelavca
          <input
            name="email"
            type="email"
            maxLength={254}
            required
            autoComplete="off"
          />
        </label>
        <label>
          Pravice
          <select name="role" defaultValue="viewer">
            <option value="viewer">Samo ogled</option>
            <option value="editor">Urejanje</option>
          </select>
        </label>
        <button disabled={busy} className="button primary">
          Dodaj dostop
        </button>
      </form>
    </section>
  );
}
