import { failure, HttpError, jsonBody, requireAuth, response } from "@/lib/org-server";
import { uuid, InputError } from "@/lib/org-validation";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
    try {
        const { client } = await requireAuth(request);
        const body = await jsonBody(request);
        if (Object.keys(body).some(k => !["connection_id", "active", "disconnect"].includes(k)) || typeof body.active !== "boolean" || typeof body.disconnect !== "boolean")
            throw new HttpError(400, "Neveljavna prisotnost.");
        const result = await client.rpc("wemry_presence", { p_connection: uuid(body.connection_id), p_active: body.active, p_disconnect: body.disconnect });
        if (result.error)
            throw new HttpError(503, "Prisotnost ni znana.");
        return response(result.data);
    }
    catch (e) {
        return e instanceof InputError ? response({ error: e.message }, 400) : failure(e);
    }
}
