import { failure, HttpError, jsonBody, response, verifiedClient } from "@/lib/org-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const { client } = await verifiedClient(request);
        const result = await client.rpc("wemry_workspaces");
        if (result.error)
            throw new HttpError(503, "Nadgradnja delovnih prostorov čaka na pregledano migracijo.");
        return response(result.data);
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    try {
        const { client } = await verifiedClient(request);
        const body = await jsonBody(request);
        if (body.action === "create") {
            if (Object.keys(body).some(k => !["action", "name", "description", "organization_type", "logo_url", "accent_color"].includes(k)) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 || ["description", "organization_type", "logo_url", "accent_color"].some(k => k in body && typeof body[k] !== "string"))
                throw new HttpError(400, "Preveri podatke delovnega prostora.");
            const result = await client.rpc("wemry_create_workspace", { p_name: body.name, p_description: body.description || "", p_type: body.organization_type || "other", p_logo: body.logo_url || "", p_accent: body.accent_color || "#5267df" });
            if (result.error)
                throw new HttpError(result.error.code === "42501" ? 403 : 409, "Delovni prostor ni ustvarjen. Preveri podatke in omejitev prostorov.");
            return response({ id: result.data }, 201);
        }
        const { action, ...data } = body;
        const allowed: Record<string, string[]> = { accept: ["token"], leave: [], privacy: ["hidden"], invite: ["email"], group: ["name", "weekly_hours"], "assign-group": ["group_id", "member_id"], settings: ["weekly_hours_enabled", "attendance_enabled", "leaderboard_enabled", "gamification_enabled"], remove: ["user_id"], role: ["user_id", "role"], transfer: ["user_id"] };
        if (typeof action !== "string" || !Object.hasOwn(allowed,action) || Object.keys(data).some(k => !allowed[action].includes(k) && !(action === "group" && k === "id")) || allowed[action].some(k => !(k in data)))
            throw new HttpError(400, "Neveljavna sprememba prostora.");
        const result = await client.rpc("wemry_workspace_command", { p_action: action, p_data: data });
        if (result.error)
            throw new HttpError(result.error.code === "42501" ? 403 : 409, "Sprememba ni potrjena. Preveri pravice, povabilo in omejitev 50 članov.");
        return response(result.data);
    }
    catch (e) {
        return failure(e);
    }
}
