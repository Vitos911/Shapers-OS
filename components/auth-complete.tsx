"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
async function complete() {
  const error = new URLSearchParams(location.search).get("error");
  history.replaceState(null, "", "/auth/complete");
  if (error)
    throw new Error(
      error === "cancelled"
        ? "Google prijava je bila preklicana. Lahko poskusiš znova."
        : "Povezava za Google prijavo je potekla ali ni veljavna. Začni prijavo znova.",
    );
  const [response, configResponse] = await Promise.all([
    fetch("/auth/session", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    }),
    fetch("/api/supabase-config", { cache: "no-store" }),
  ]);
  const data = await response.json(),
    config = await configResponse.json();
  if (!response.ok) throw new Error(data.error || "Google prijava ni uspela.");
  if (!configResponse.ok || !config.configured)
    throw new Error("Supabase ni pravilno nastavljen.");
  const client = createClient(config.url, config.publishableKey, {
    auth: { flowType: "implicit", detectSessionInUrl: false },
  });
  const saved = await client.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (saved.error)
    throw new Error(
      "Prijavne seje ni mogoče shraniti. Dovoli shranjevanje strani in začni znova.",
    );
  const verified = await client.auth.getUser();
  if (
    verified.error ||
    !verified.data.user?.email_confirmed_at ||
    verified.data.user.is_anonymous
  ) {
    await client.auth.signOut({ scope: "local" });
    throw new Error("Identitete ni mogoče potrditi. Začni znova.");
  }
  location.replace(data.next === "/legacy" ? "/legacy" : "/");
}
export default function AuthComplete() {
  const [error, setError] = useState("");
  const work = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let alive = true;
    work.current ??= complete();
    void work.current.catch((e) => {
      if (alive)
        setError(e instanceof Error ? e.message : "Prijava ni uspela.");
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <main className="cloud-entry">
      <section className="cloud-entry-card">
        <span className="eyebrow">SHAPERS OS</span>
        <h1>
          {error ? "Prijava ni zaključena" : "Zaključujem Google prijavo …"}
        </h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">
            Preverjam identiteto in varno shranjujem Supabase sejo.
          </p>
        )}
        <Link className="button secondary" href="/" prefetch={false}>
          Nazaj na prijavo
        </Link>
      </section>
    </main>
  );
}
