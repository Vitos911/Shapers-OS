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
import { addDays, isAdmin, ljubljanaDate, type Snapshot } from "@/lib/organization";
import { calendarConfigured, syncCalendar } from "@/lib/google-calendar";
import { timerCommand, adminWorkCommand, workRpcError } from "@/lib/work-timer-server";
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
    if (resource === "workspace-settings") {
      const [groups,settings]=await Promise.all([client.from("organization_groups").select("id,name,weekly_hours"),client.from("organization_settings").select("*").single()]);
      if(groups.error||settings.error)throw new HttpError(503,"Nastavitve prostora niso dostopne.");
      return response({groups:groups.data,settings:settings.data});
    }
    if (resource === "work-timer") {
      const result = await client.rpc("org_work_state");
      if (result.error) throw workRpcError(result.error.code);
      return response(result.data);
    }
    if (resource === "work-audit") {
      requireRole(identity);
      const result = await client.from("org_audit").select("*").eq("entity", "org_work_entries").order("occurred_at", { ascending: false }).limit(100);
      if (result.error) throw new HttpError(503, "Revizije ur ni mogoče prebrati.");
      return response(result.data);
    }
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
      ].map(async (t) => {
        if (t !== "org_work_entries") return allRows(client, t);
        const result = await client.rpc("org_work_state");
        if (result.error) throw workRpcError(result.error.code);
        return result.data.work;
      }),
    );
    const [directory, progress] = await Promise.all([client.rpc("org_project_directory"), client.rpc("org_project_progress")]);
    const missing = directory.error?.code === "PGRST202" && progress.error?.code === "PGRST202";
    if (!missing && (directory.error || progress.error)) throw new HttpError(503, "Projektni pregled ni na voljo. Preveri migracije.");
    const [joinRequests, membershipHistory] = missing ? [[], []] : await Promise.all([
      allRows(client, "org_project_join_requests"), allRows(client, "org_project_membership_history"),
    ]);
    const setting = settings[0] || {
      name: "WemryOS for Business",
      calendar_id: "",
      timezone: "Europe/Ljubljana",
    };
    const taskDirectory = await client.rpc("org_task_directory");
    if (taskDirectory.error) throw new HttpError(503, "Imenik projekta ni pripravljen. Preveri organizacijsko migracijo.");
    const [workspaceDirectory,features]=identity.organization_id ? await Promise.all([client.rpc("wemry_member_directory"),client.from("organization_settings").select("weekly_hours_enabled,attendance_enabled,leaderboard_enabled,gamification_enabled").single()]) : [{data:[],error:null},{data:undefined,error:null}];
    if(workspaceDirectory.error||features.error)throw new HttpError(503,"Nastavitve prostora niso pripravljene.");
    return response({
      workspaceDirectory:workspaceDirectory.data,
      features:features.data,
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
      collaboration: { ready: !missing },
      projectDirectory: directory.data || [],
      projectProgress: progress.data || [],
      joinRequests,
      membershipHistory,
      taskDirectory: taskDirectory.data,
      meetingMembers,
      settings: setting,
      calendar: {
        configured: calendarConfigured(
          (identity.organization_id && identity.organization_id!=="00000000-0000-4000-8000-000000000001"?"":process.env.GOOGLE_CALENDAR_ID) || String(setting.calendar_id),
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
    if (resource === "work-timer") {
      if (partial) throw new HttpError(405, "Časovnik uporablja POST.");
      const result = await client.rpc("org_work_timer", timerCommand(body));
      if (result.error) throw workRpcError(result.error.code);
      return response(result.data);
    }
    if (resource === "work") {
      requireRole(identity);
      const result = await client.rpc("org_admin_work", adminWorkCommand(body, partial));
      if (result.error) throw workRpcError(result.error.code);
      return response(result.data, partial ? 200 : 201);
    }
    if (resource === "calendar") {
      requireRole(identity);
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
      if (!isAdmin(identity.role)) {
        const owner=await client.from("org_projects").select("created_by").eq("id",uuid(body.project_id)).maybeSingle();
        if(owner.error || owner.data?.created_by!==identity.user_id)throw new HttpError(403,"Potreben je lastnik projekta.");
      }
      const changed = await client.rpc("org_project_membership", {
        p_project: uuid(body.project_id), p_member: uuid(body.member_id), p_action: body.remove === true ? "remove" : "add",
      });
      if (changed.error?.code === "PGRST202") {
        requireRole(identity);
        // Preserve the existing administrator API while the additive migration is pending.
        const project_id = uuid(body.project_id), member_id = uuid(body.member_id);
        const legacy = body.remove === true
          ? await client.from("org_project_members").delete().eq("project_id", project_id).eq("member_id", member_id)
          : await client.from("org_project_members").insert({ project_id, member_id });
        if (legacy.error) throw new HttpError(409, "Članstva projekta ni mogoče spremeniti.");
        return response({ saved: true });
      }
      if (changed.error) throw new HttpError(409, "Članstva ni mogoče spremeniti. Najprej predaj odprte naloge.");
      return response({ saved: true });
    }
    if (resource === "membership") {
      if (partial || Object.keys(body).some(k => !["project_id", "member_id", "action"].includes(k)) || !["join","leave","approve","reject"].includes(String(body.action))) throw new HttpError(400, "Neveljavna sprememba članstva.");
      if (["join","leave"].includes(String(body.action)) && "member_id" in body && !isAdmin(identity.role)) throw new HttpError(403,"Član spreminja le svoje članstvo.");
      if (["approve","reject"].includes(String(body.action)) && !isAdmin(identity.role)) {
        const owner=await client.from("org_projects").select("created_by").eq("id",uuid(body.project_id)).maybeSingle();
        if(owner.error || owner.data?.created_by!==identity.user_id)throw new HttpError(403,"Potreben je lastnik projekta.");
      }
      const changed = await client.rpc("org_project_membership", { p_project: uuid(body.project_id), p_action: body.action, p_member: "member_id" in body ? uuid(body.member_id) : null });
      if (changed.error) throw new HttpError(changed.error.code === "42501" ? 403 : 409, changed.error.message.includes("Pred izstopom") ? "Pred izstopom predaj ali zaključi odprte naloge." : "Članstva ni mogoče spremeniti. Preveri dostop, način pridružitve in status projekta.");
      return response({ status: changed.data });
    }
    if (resource === "claim-task") {
      if (partial || Object.keys(body).some(k => k !== "task_id")) throw new HttpError(400, "Neveljaven prevzem.");
      if (!identity.member_id) throw new HttpError(403, "Potreben je članski profil.");
      const claimed = await client.rpc("org_claim_task", { p_task: uuid(body.task_id) });
      if (claimed.error) throw new HttpError(claimed.error.code === "42501" ? 403 : 409, "Naloge ni mogoče prevzeti. Preveri članstvo in osveži seznam; morda je že prevzeta.");
      return response({ claimed: claimed.data });
    }
    const table = tables[resource];
    if (!table) throw new HttpError(404, "Neznan vir.");
    if (resource === "settings") requireRole(identity);
    const { id, expected_updated_at, ...input } = body;
    if (expected_updated_at !== undefined && (resource !== "tasks" || !partial)) throw new HttpError(400, "Neveljaven pogoj posodobitve.");
    if (resource === "tasks" && partial && (typeof expected_updated_at !== "string" || !Number.isFinite(Date.parse(expected_updated_at)))) throw new HttpError(400, "Osveži nalogo pred urejanjem.");
    const data = fields(resource, input, partial);
    if (resource === "tasks" && !partial && "archived" in data)
      throw new HttpError(400, "Arhiviranje zahteva obstoječo nalogo.");
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
    if (resource === "tasks" && partial) query.eq("updated_at", expected_updated_at);
    const changed = await query.select().single();
    if (changed.error)
      throw new HttpError(
        changed.error.code === "42501" ? 403 : 409,
        resource === "tasks" && partial && changed.error.code === "PGRST116"
          ? "Naloga je bila medtem spremenjena ali ni več na voljo. Osveži podatke pred ponovnim urejanjem."
          : changed.error.code === "23505"
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
