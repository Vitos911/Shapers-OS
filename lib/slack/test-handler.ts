import { authOrigin, sameOrigin } from "../google-auth.ts";
import { HttpError, jsonBody, requireAuth, requireRole } from "../org-server.ts";
import type { Identity } from "../organization.ts";
import { SlackError, type SlackService } from "./client.ts";

export const TEST_MESSAGE = "Shapers OS: preverjanje Slack povezave. To je ročno sproženo testno sporočilo.";
type Options = {
  env?: NodeJS.ProcessEnv;
  authenticate?: (request: Request) => Promise<{ identity: Identity }>;
  now?: () => number;
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  if (error instanceof SlackError)
    return Response.json({ error: error.message, code: error.code }, {
      status: error.status,
      headers: { ...headers, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) },
    });
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status, headers });
  return Response.json({ error: "Slack preizkus ni potrjen." }, { status: 500, headers });
}

export function createSlackTestHandlers(service: SlackService, {
  env = process.env, authenticate = requireAuth, now = Date.now,
}: Options = {}) {
  // Per-instance accidental-repeat protection, not a distributed rate limiter.
  let nextSendAt = 0;
  async function authorize(request: Request) {
    const { identity } = await authenticate(request);
    requireRole(identity, ["SUPERADMIN"]);
  }
  return {
    async GET(request: Request) {
      try {
        await authorize(request);
        return Response.json(await service.checkConnection(), { headers });
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      try {
        await authorize(request);
        if (env.SLACK_TEST_ENABLED !== "true")
          throw new HttpError(403, "Testno Slack pošiljanje ni omogočeno na strežniku.");
        sameOrigin(request, authOrigin(request, env));
        if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
          throw new HttpError(415, "Zahtevan je application/json.");
        const body = await jsonBody(request);
        if (Object.keys(body).length !== 1 || body.confirm !== "send-test-message")
          throw new HttpError(400, "Potrdi pošiljanje z confirm: send-test-message. Druga polja niso dovoljena.");
        const instant = now();
        if (instant < nextSendAt)
          throw new SlackError("rate_limited", "Počakaj pred ponovnim testom.", 429, Math.ceil((nextSendAt - instant) / 1000));
        nextSendAt = instant + 60000;
        return Response.json(await service.sendMessage(TEST_MESSAGE), { headers });
      } catch (error) { return failure(error); }
    },
  };
}
