"use client";

import type { User } from "@supabase/supabase-js";
import { BadgeCheck, Mail, UserRound } from "lucide-react";
import type { Snapshot } from "@/lib/organization";
import { ownProfile } from "@/lib/user-profile";
import styles from "./user-profile.module.css";

const roleNames = { MEMBER: "Član", ADMIN: "Administrator", SUPERADMIN: "Superadministrator", OWNER: "Lastnik prostora" };
function date(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Ni podatka";
  return new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }).format(new Date(value));
}

export default function UserProfile({ snapshot, user, busy, onSaveName }: {
  snapshot: Snapshot;
  user: User;
  busy: boolean;
  onSaveName: (name: string) => Promise<boolean | undefined>;
}) {
  const profile = ownProfile(snapshot, user);
  if (!profile) return <p role="alert">Profila ni mogoče potrditi. Osveži podatke ali se prijavi znova.</p>;
  const member = profile.member;
  const series = member?.series.split(";").map((s) => s.trim()).filter(Boolean) || [];
  return (
    <div className={styles.profile}>
      <section className={styles.hero} aria-labelledby="profile-name">
        <span className={styles.avatar} aria-hidden="true">{profile.initials}</span>
        <div className={styles.identity}>
          <span className={styles.eyebrow}>TVOJ RAČUN</span>
          <h2 id="profile-name">{profile.name}</h2>
          <p><Mail size={16} aria-hidden="true" />{profile.email}</p>
          <div className={styles.badges}>
            <span>{roleNames[profile.role]}</span>
            {profile.emailConfirmed && <span><BadgeCheck size={15} aria-hidden="true" />Potrjena e-pošta</span>}
          </div>
        </div>
      </section>
      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="profile-account">
          <h2 id="profile-account">Podatki računa</h2>
          <dl className={styles.details}>
            <div><dt>E-poštni naslov</dt><dd>{profile.email}</dd></div>
            <div><dt>Organizacija</dt><dd>{profile.organization}</dd></div>
            <div><dt>Vloga</dt><dd>{roleNames[profile.role]}</dd></div>
            <div><dt>Način prijave</dt><dd>{profile.providers.join(", ") || "Ni podatka"}</dd></div>
            <div><dt>Račun ustvarjen</dt><dd>{date(profile.createdAt)}</dd></div>
            <div><dt>Zadnja prijava</dt><dd>{date(profile.lastSignInAt)}</dd></div>
          </dl>
          <p className={styles.note}>Dostop in vlogo upravlja skrbnik organizacije.</p>
        </section>
        <section className={styles.card} aria-labelledby="profile-membership">
          <h2 id="profile-membership">Članski profil</h2>
          {member ? <>
            <dl className={styles.details}>
              <div><dt>Ime člana</dt><dd>{member.name}</dd></div>
              <div><dt>Članska e-pošta</dt><dd>{member.email}</dd></div>
              <div><dt>Raven članstva</dt><dd>{member.tier || "Ni določena"}</dd></div>
              <div><dt>Tedenski cilj</dt><dd>{new Intl.NumberFormat("sl-SI").format(Number(member.weekly_hours))} h</dd></div>
              <div><dt>Serije</dt><dd>{series.length ? series.join(" · ") : "Ni izbranih serij"}</dd></div>
            </dl>
            <form className={styles.form} onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("name") || "").trim();
              if (name) void onSaveName(name);
            }}>
              <label htmlFor="profile-display-name">Prikazno ime</label>
              <input key={member.name} id="profile-display-name" name="name" defaultValue={member.name} autoComplete="name" required maxLength={160} disabled={busy} />
              <button className="button primary" disabled={busy}>{busy ? "Shranjujem …" : "Shrani ime"}</button>
            </form>
          </> : <div className={styles.empty}>
            <UserRound size={30} aria-hidden="true" />
            <h3>Račun še ni povezan s članom</h3>
            <p>Tvoj račun je aktiven. Za prikaz članstva, osebnih ur in nalog naj skrbnik organizacije poveže račun s tvojim članskim profilom.</p>
          </div>}
        </section>
      </div>
    </div>
  );
}
