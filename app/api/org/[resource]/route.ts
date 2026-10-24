import {
  allRows,
  failure,
  HttpError,
  jsonBody,
  requireAuth,
  requireRole,
  response,
  serviceClient,
} from "@/lib/org-server";
import { fields, InputError, uuid } from "@/lib/org-validation";
import { addDays, ljubljanaDate, type Snapshot } from "@/lib/organization";
import { calendarConfigured, syncCalendar } from "@/lib/google-calendar";
import { isDate } from "@/lib/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
const tables: Record<string, string> = {
  projects: "org_projects",
  tasks: "org_tasks",
  work: "org_work_entries",
  attendance: "org_attendance",
  profile: "members",
  settings: "org_settings",
};
export async function GET(request: Request, context: Context) {
  try {
    const { resource } = await context.params;
    const { client, identity } = await requireAuth(request);
    if (resource === "access") {
      requireRole(identity, ["SUPERADMIN"]);
      const result = await client.rpc("org_list_access");
      if (result.error)
        throw new HttpError(503, "Dostopov ni mogoče prebrati.");
      return response(result.data);
    }
    if (resource === "audit") {
      requireRole(identity, ["SUPERADMIN"]);
      return response(await allRows(client, "org_audit"));
    }
    if (resource !== "snapshot") throw new HttpError(404, "Neznan vir.");
    const [
      members,
      projects,
      tasks,
      work,
      meetings,
      attendance,
      history,
      projectMembers,
      meetingMembers,
      settings,
      weeklyHours,
    ] = await Promise.all(
      [
        "members",
        "org_projects",
        "org_tasks",
        "org_work_entries",
        "org_meetings",
        "org_attendance",
        "org_task_history",
        "org_project_members",
        "org_meeting_members",
        "org_settings",
        "org_weekly_hours",
      ].map((t) => allRows(client, t)),
    );
    const setting = settings[0] || {
      name: "Shapers OS",
      calendar_id: "",
      timezone: "Europe/Ljubljana",
    };
    return response({
      identity,
      members,
      projects,
      tasks,
      work,
      weeklyHours,
      meetings,
      attendance,
      history,
      projectMembers,
      meetingMembers,
      settings: setting,
      calendar: {
        configured: calendarConfigured(
          process.env.GOOGLE_CALENDAR_ID || String(setting.calendar_id),
        ),
        syncReady: !!process.env.SUPABASE_SECRET_KEY,
      },
    } as unknown as Snapshot);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  return mutate(request, context, false);
}
export async function PATCH(request: Request, context: Context) {
  return mutate(request, context, true);
}
async function mutate(request: Request, context: Context, partial: boolean) {
  try {
    const { resource } = await context.params;
    const { client, identity } = await requireAuth(request);
    const body = await jsonBody(request);
    if (resource === "calendar") {
      if (
        Object.keys(body).some((k) => !["from", "to"].includes(k)) ||
        ("from" in body && typeof body.from !== "string") ||
        ("to" in body && typeof body.to !== "string")
      )
        throw new HttpError(400, "Neveljavno obdobje.");
      const from =
          typeof body.from === "string"
            ? body.from
            : addDays(ljubljanaDate(), -49),
        to =
          typeof body.to === "string" ? body.to : addDays(ljubljanaDate(), 90);
      if (!isDate(from) || !isDate(to))
        throw new HttpError(400, "Neveljavno obdobje.");
      return response(await syncCalendar(client, identity, from, to));
    }
    if (resource === "access") {
      requireRole(identity, ["SUPERADMIN"]);
      if (
        Object.keys(body).some(
          (k) => !["email", "role", "disabled"].includes(k),
        ) ||
        typeof body.email !== "string" ||
        typeof body.disabled !== "boolean" ||
        !["MEMBER", "ADMIN", "SUPERADMIN"].includes(String(body.role))
      )
        throw new HttpError(400, "Neveljaven dostop.");
      const changed = await client.rpc("org_set_access", {
        target_email: body.email,
        new_role: body.role,
        is_disabled: body.disabled,
      });
      if (changed.error)
        throw new HttpError(
          409,
          "Sprememba dostopa ni uspela; zadnjega superadmina ni mogoče odstraniti.",
        );
      return response({ saved: true });
    }
    if (resource === "invite") {
      requireRole(identity, ["SUPERADMIN"]);
      if (
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        Object.keys(body).some((k) => k !== "email")
      )
        throw new HttpError(400, "Neveljaven naslov.");
      const email = body.email.trim().toLowerCase();
      if (email.endsWith("@sandbox.example"))
        throw new HttpError(
          400,
          "Za sandbox uporabi ločen demo provisioning; ta naslov ne prejema pošte.",
        );
      const access = await client.rpc("org_list_access");
      if (access.error)
        throw new HttpError(503, "Odobrenih računov ni mogoče prebrati.");
      const approved = (
        access.data as {
          email: string;
          disabled: boolean;
          auth_user_id: string | null;
        }[]
      ).find((a) => a.email === email && !a.disabled);
      if (!approved)
        throw new HttpError(
          403,
          "Naslov mora biti najprej izrecno odobren v strežniškem bootstrapu ali obstoječih članih.",
        );
      if (approved.auth_user_id)
        throw new HttpError(
          409,
          "Račun že obstaja. Uporabnik naj uporabi običajno prijavo po e-pošti.",
        );
      const invitation = await serviceClient().auth.admin.inviteUserByEmail(
        email,
        { redirectTo: new URL("/", request.url).href },
      );
      if (invitation.error)
        throw new HttpError(
          502,
          "Supabase povabila ni poslal. Preveri SMTP in morebitni že obstoječi račun.",
        );
      return response({ invited: true });
    }
    if (resource === "project-members") {
      if (
        Object.keys(body).some(
          (k) => !["project_id", "member_id", "remove"].includes(k),
        ) ||
        ("remove" in body && typeof body.remove !== "boolean")
      )
        throw new HttpError(400, "Neveljavno članstvo.");
      requireRole(identity);
      const project_id = uuid(body.project_id),
        member_id = uuid(body.member_id);
      const query =
        body.remove === true
          ? client
              .from("org_project_members")
              .delete()
              .eq("project_id", project_id)
              .eq("member_id", member_id)
          : client
              .from("org_project_members")
              .insert({ project_id, member_id });
      const changed = await query;
      if (changed.error)
        throw new HttpError(409, "Članstva projekta ni mogoče spremeniti.");
      return response({ saved: true });
    }
    const table = tables[resource];
    if (!table) throw new HttpError(404, "Neznan vir.");
    if (resource === "projects" || resource === "settings")
      requireRole(
        identity,
        resource === "settings" ? ["SUPERADMIN"] : ["ADMIN", "SUPERADMIN"],
      );
    if (resource === "tasks" && !partial) requireRole(identity);
    const { id, ...input } = body;
    const data = fields(resource, input, partial);
    if (resource === "tasks" && !partial && "archived" in data)
      throw new HttpError(400, "Arhiviranje zahteva obstoječo nalogo.");
    if (resource === "work" && !partial) {
      if (!identity.member_id)
        throw new HttpError(
          403,
          "Za beleženje ur potrebuješ povezan članski profil.",
        );
      data.member_id = identity.member_id;
      if ("deleted" in data)
        throw new HttpError(400, "Neveljavno začetno stanje.");
    }
    if (resource === "profile") {
      if (!identity.member_id)
        throw new HttpError(403, "Ni članskega profila.");
      const changed = await client
        .from(table)
        .update(data)
        .eq("id", identity.member_id)
        .select()
        .single();
      if (changed.error)
        throw new HttpError(403, "Profila ni mogoče spremeniti.");
      return response(changed.data);
    }
    if (resource === "settings") {
      const changed = await client
        .from(table)
        .update(data)
        .eq("id", true)
        .select()
        .single();
      if (changed.error)
        throw new HttpError(403, "Nastavitev ni mogoče spremeniti.");
      return response(changed.data);
    }
    const query = partial
      ? client.from(table).update(data).eq("id", uuid(id))
      : client.from(table).insert(data);
    const changed = await query.select().single();
    if (changed.error)
      throw new HttpError(
        changed.error.code === "42501" ? 403 : 409,
        changed.error.code === "23505"
          ? "Zapis že obstaja. Osveži podatke in uredi obstoječega."
          : "Shranjevanje ni uspelo. Preveri dovoljenja, datume, dodelitve in okno prijave udeležbe.",
      );
    return response(changed.data, partial ? 200 : 201);
  } catch (e) {
    return e instanceof InputError
      ? response({ error: e.message }, 400)
      : failure(e);
  }
}
