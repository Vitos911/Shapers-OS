import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAdmin, type Identity, type Role } from "./organization.ts";
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function publicConfig() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith("sb_publishable_"))
    throw new HttpError(503, "Supabase ni nastavljen.");
  return { url, key };
}
export function serviceClient() {
  const { url } = publicConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new HttpError(503, "Manjka strežniški SUPABASE_SECRET_KEY.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function getCurrentUser(
  request: Request,
): Promise<{ client: SupabaseClient; identity: Identity }> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.match(/^Bearer [^\s]+$/))
    throw new HttpError(401, "Prijavi se v Shapers OS.");
  const { url, key } = publicConfig();
  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (
    error ||
    !data.user ||
    !data.user.email_confirmed_at ||
    data.user.is_anonymous
  )
    throw new HttpError(401, "Prijava ni veljavna ali e-pošta ni potrjena.");
  const context = await client.rpc("org_context");
  if (context.error)
    throw new HttpError(503, "Organizacijske migracije niso pripravljene.");
  if (!context.data)
    throw new HttpError(
      403,
      "Račun nima aktivnega dostopa do organizacije. Obrni se na superadministracijo.",
    );
  return { client, identity: context.data as Identity };
}
export const requireAuth = getCurrentUser;
export function requireRole(
  actor: Identity,
  roles: Role[] = ["ADMIN", "SUPERADMIN"],
) {
  if (!roles.includes(actor.role))
    throw new HttpError(403, "Za dejanje nimaš dovoljenja.");
}
export function requireAdmin(actor: Identity) {
  if (!isAdmin(actor.role))
    throw new HttpError(403, "Potrebna je administratorska vloga.");
}
export async function allRows(client: SupabaseClient, table: string) {
  const rows: Record<string, unknown>[] = [];
  const order =
    table === "org_leaderboard_weeks"
      ? "week_start"
      : table === "org_project_members"
      ? "project_id"
      : table === "org_meeting_members"
        ? "meeting_id"
        : "id";
  for (let start = 0; start < 50000; start += 500) {
    let query = client.from(table).select("*").order(order);
    if (table === "org_leaderboard_weeks") query = query.order("version");
    if (table.endsWith("_members")) query = query.order("member_id");
    const { data, error } = await query.range(start, start + 499);
    if (error) throw new HttpError(503, `Branje ${table} ni uspelo.`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw new HttpError(
    503,
    "Preveč podatkov za en pregled. Potrebno je ožje obdobje.",
  );
}
export async function jsonBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Manjka JSON.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 20000) {
        await reader.cancel();
        throw new HttpError(413, "Zahteva je prevelika.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Neveljaven JSON.");
  }
  if (!body || Array.isArray(body) || typeof body !== "object")
    throw new HttpError(400, "Pričakovan je objekt.");
  return body as Record<string, unknown>;
}
export function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(e: unknown) {
  if (e instanceof HttpError) return response({ error: e.message }, e.status);
  console.error(
    "Organization request failed:",
    e instanceof Error ? e.name : "unknown",
  );
  return response(
    { error: "Operacija ni uspela. Sprememba ni potrjena." },
    500,
  );
}
