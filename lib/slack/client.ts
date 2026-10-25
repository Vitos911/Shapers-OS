// Internal server implementation. Application code must import ./index.ts.
// The injectable transport is for isolated tests; the API origin is never configurable.
export type SlackErrorCode =
  | "not_configured" | "invalid_configuration" | "invalid_message"
  | "authentication_failed" | "channel_unavailable" | "rate_limited"
  | "unavailable" | "invalid_response" | "delivery_unknown" | "slack_rejected";

export class SlackError extends Error {
  readonly code: SlackErrorCode;
  readonly status: number;
  readonly retryAfter?: number;
  constructor(
    code: SlackErrorCode,
    message: string,
    status = 502,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "SlackError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

type Transport = (url: string, options: RequestInit) => Promise<Response>;
type Options = { env?: NodeJS.ProcessEnv; fetcher?: Transport };
export type SlackService = ReturnType<typeof createSlackService>;

export function createSlackService({ env = process.env, fetcher = fetch }: Options = {}) {
  function configuration() {
    const token = env.SLACK_BOT_TOKEN?.trim(), channel = env.SLACK_CHANNEL_ID?.trim();
    if (!token || !channel)
      throw new SlackError("not_configured", "Slack ni nastavljen na strežniku.", 503);
    if (!/^xoxb-[A-Za-z0-9-]+$/.test(token) || !/^[CG][A-Z0-9]{8,}$/.test(channel))
      throw new SlackError("invalid_configuration", "Preveri strežniški Slack bot token in ID kanala.", 503);
    return { token, channel };
  }

  async function call(method: "auth.test" | "chat.postMessage", body: Record<string, unknown>) {
    const { token } = configuration();
    let response: Response;
    try {
      response = await fetcher(`https://slack.com/api/${method}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new SlackError(method === "chat.postMessage" ? "delivery_unknown" : "unavailable",
        method === "chat.postMessage"
          ? "Dostava ni potrjena. Pred ponovitvijo preveri Slack kanal."
          : "Slack ni dosegljiv ali je zahteva potekla.", 504);
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      const retryAfter = Number.isInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : 60;
      throw new SlackError("rate_limited", "Slack omejuje zahteve. Poskusi po navedenem času.", 429, retryAfter);
    }
    if (!response.ok)
      throw new SlackError(method === "chat.postMessage" ? "delivery_unknown" : "unavailable",
        "Slack ni potrdil zahteve. Pošiljanja ne ponavljaj samodejno.");
    let data: Record<string, unknown>;
    try {
      data = await response.json();
      if (!data || Array.isArray(data) || typeof data !== "object" || typeof data.ok !== "boolean") throw new Error();
    } catch {
      throw new SlackError(method === "chat.postMessage" ? "delivery_unknown" : "invalid_response",
        "Slack ni vrnil veljavne potrditve. Pred ponovnim pošiljanjem preveri kanal.");
    }
    if (!data.ok) {
      if (["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive"].includes(String(data.error)))
        throw new SlackError("authentication_failed", "Slack je zavrnil bot poverilnico.");
      if (["missing_scope", "not_in_channel", "channel_not_found", "is_archived", "restricted_action"].includes(String(data.error)))
        throw new SlackError("channel_unavailable", "Preveri pravico chat:write, kanal in članstvo bota.");
      if (data.error === "ratelimited")
        throw new SlackError("rate_limited", "Slack omejuje zahteve. Poskusi kasneje.", 429, 60);
      throw new SlackError("slack_rejected", "Slack ni potrdil operacije. Pošiljanja ne ponavljaj samodejno.");
    }
    return data;
  }

  return {
    async checkConnection() {
      const data = await call("auth.test", {});
      if (typeof data.team_id !== "string" || !/^T[A-Z0-9]+$/.test(data.team_id) ||
          typeof data.bot_id !== "string" || !/^B[A-Z0-9]+$/.test(data.bot_id))
        throw new SlackError("invalid_response", "Slack ni potrdil identitete bota.");
      return { connected: true as const, teamId: data.team_id, botId: data.bot_id };
    },
    async sendMessage(text: string) {
      if (typeof text !== "string" || !text.trim() || text.length > 4000)
        throw new SlackError("invalid_message", "Sporočilo mora vsebovati od 1 do 4000 znakov.", 400);
      const { channel } = configuration();
      const plain = text.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const data = await call("chat.postMessage", {
        channel, text: plain, mrkdwn: false, parse: "none", unfurl_links: false, unfurl_media: false,
      });
      if (data.channel !== channel || typeof data.ts !== "string" || !/^\d+\.\d+$/.test(data.ts))
        throw new SlackError("delivery_unknown", "Slack ni vrnil pričakovane potrditve dostave. Preveri kanal.");
      return { sent: true as const, timestamp: data.ts };
    },
  };
}
