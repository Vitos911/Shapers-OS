// Server-only orchestration; browser components must not import this module.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError, jsonBody } from "./org-server.ts";
type Env = NodeJS.ProcessEnv;
type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
type Factory = (env: Env, storage: Storage) => SupabaseClient;
type Pending = {
  storage: Record<string, string>;
  flow: string;
  next: string;
  expires: number;
};
type Handoff = {
  access_token: string;
  refresh_token: string;
  next: string;
  expires: number;
};
const FLOW = "shapers-oauth-flow",
  HANDOFF = "shapers-oauth-handoff";
const headers = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const loopback = (url: URL) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
export function authOrigin(request: Request, env: Env = process.env) {
  const url = new URL(env.APP_URL || request.url);
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    (!loopback(url) && url.protocol !== "https:")
  )
    throw new HttpError(503, "APP_URL mora biti varen naslov aplikacije.");
  if (!env.APP_URL && !loopback(url))
    throw new HttpError(
      503,
      "Na produkcijskem strežniku nastavi APP_URL na točno domeno aplikacije.",
    );
  if (env.APP_URL && (url.pathname !== "/" || url.search || url.hash))
    throw new HttpError(503, "APP_URL mora vsebovati samo izvor aplikacije.");
  return url.origin;
}
function config(env: Env) {
  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || "") ||
    !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
  )
    throw new HttpError(503, "Supabase ni pravilno nastavljen.");
  return { url: env.SUPABASE_URL!, key: env.SUPABASE_PUBLISHABLE_KEY };
}
function cookieKey(env: Env) {
  if (!env.AUTH_COOKIE_SECRET || env.AUTH_COOKIE_SECRET.length < 32)
    throw new HttpError(
      503,
      "Na strežniku nastavi naključni AUTH_COOKIE_SECRET z vsaj 32 znaki.",
    );
  return createHash("sha256").update(env.AUTH_COOKIE_SECRET).digest();
}
function seal(data: unknown, env: Env) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", cookieKey(env), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
function unseal<T extends { expires: number }>(value: string, env: Env): T {
  try {
    if (value.length > 3800) throw new Error();
    const bytes = Buffer.from(value, "base64url"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        cookieKey(env),
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (!Number.isFinite(data.expires) || data.expires < Date.now())
      throw new Error();
    return data as T;
  } catch {
    throw new HttpError(
      400,
      "Prijava je potekla ali ni veljavna. Začni znova v istem brskalniku.",
    );
  }
}
function cookieName(name: string, origin: string) {
  return origin.startsWith("https:") ? "__Host-" + name : name;
}
function cookie(name: string, value: string, origin: string, seconds: number) {
  if (value.length > 3800)
    throw new HttpError(503, "Seja je prevelika za varen prenos.");
  return `${cookieName(name, origin)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${origin.startsWith("https:") ? "; Secure" : ""}`;
}
function readCookie(request: Request, name: string, origin: string) {
  const matches = (request.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(cookieName(name, origin) + "="));
  if (matches.length !== 1)
    throw new HttpError(
      400,
      "Manjka veljaven prijavni piškotek. Začni znova v istem brskalniku.",
    );
  return matches[0].slice(matches[0].indexOf("=") + 1);
}
function sameOrigin(request: Request, origin: string) {
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "Prijavo začni neposredno v ShapersOS.");
}
function safeNext(value: unknown) {
  if (value !== "/" && value !== "/legacy")
    throw new HttpError(400, "Neveljavna povratna stran.");
  return value;
}
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Google prijava ni uspela. Poskusi znova ali uporabi e-poštno prijavo.",
    },
    { status: error instanceof HttpError ? error.status : 502, headers },
  );
}
function factory(env: Env, storage: Storage) {
  const { url, key } = config(env);
  return createClient(url, key, {
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: false,
      storage,
    },
  });
}

export function clearGoogleCookies(request: Request, env: Env = process.env) {
  try {
    const origin = authOrigin(request, env);
    sameOrigin(request, origin);
    const result = Response.json({ cleared: true }, { headers });
    result.headers.append("Set-Cookie", cookie(FLOW, "", origin, 0));
    result.headers.append("Set-Cookie", cookie(HANDOFF, "", origin, 0));
    return result;
  } catch (e) {
    return failure(e);
  }
}
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    verifier: () =>
      [...values].find(([k]) => k.endsWith("-code-verifier"))?.[1],
    snapshot: () => Object.fromEntries(values),
  };
}

export async function startGoogle(
  request: Request,
  env: Env = process.env,
  makeClient: Factory = factory,
  fetcher: typeof fetch = fetch,
) {
  try {
    const origin = authOrigin(request, env);
    sameOrigin(request, origin);
    cookieKey(env);
    const body = await jsonBody(request);
    if (Object.keys(body).some((k) => k !== "next"))
      throw new HttpError(400, "Neveljavna prijavna zahteva.");
    const next = safeNext(body.next === undefined ? "/" : body.next);
    const { url, key } = config(env);
    const settings = await fetcher(url + "/auth/v1/settings", {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!settings.ok)
      throw new HttpError(502, "Supabase Auth ni dosegljiv. Poskusi znova.");
    const enabled = await settings.json();
    if (enabled.external?.google !== true)
      throw new HttpError(
        503,
        "Google prijava še ni nastavljena. Skrbnik mora omogočiti Google v Supabase Auth. E-poštna in demo prijava ostajata na voljo.",
      );
    const storage = memoryStorage(),
      client = makeClient(env, storage),
      flow = randomBytes(24).toString("base64url");
    const result = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: origin + "/auth/callback?flow=" + flow,
        scopes: "openid email profile",
        queryParams: { prompt: "select_account" },
      },
    });
    if (result.error || !result.data.url || !storage.verifier())
      throw new HttpError(
        502,
        "Google prijave ni mogoče začeti. Preveri nastavitve ponudnika.",
      );
    const target = new URL(result.data.url);
    if (
      target.origin !== url ||
      target.pathname !== "/auth/v1/authorize" ||
      target.searchParams.get("code_challenge_method")?.toLowerCase() !== "s256"
    )
      throw new HttpError(502, "Ponudnik ni vrnil varne PKCE prijave.");
    const response = Response.json({ url: target.href }, { headers });
    response.headers.append(
      "Set-Cookie",
      cookie(
        FLOW,
        seal(
          {
            storage: storage.snapshot(),
            flow,
            next,
            expires: Date.now() + 600000,
          },
          env,
        ),
        origin,
        600,
      ),
    );
    response.headers.append("Set-Cookie", cookie(HANDOFF, "", origin, 0));
    return response;
  } catch (e) {
    return failure(e);
  }
}

export async function googleCallback(
  request: Request,
  env: Env = process.env,
  makeClient: Factory = factory,
) {
  let origin: string;
  try {
    origin = authOrigin(request, env);
  } catch (e) {
    return failure(e);
  }
  const result = new Response(null, {
    status: 303,
    headers: { ...headers, Location: origin + "/auth/complete?error=callback" },
  });
  result.headers.append("Set-Cookie", cookie(FLOW, "", origin, 0));
  result.headers.append("Set-Cookie", cookie(HANDOFF, "", origin, 0));
  try {
    const url = new URL(request.url),
      pending = unseal<Pending>(readCookie(request, FLOW, origin), env);
    if (
      !pending.flow ||
      url.searchParams.get("flow") !== pending.flow ||
      !pending.storage ||
      typeof pending.storage !== "object"
    )
      throw new Error("Invalid flow");
    if (url.searchParams.has("error")) {
      result.headers.set("Location", origin + "/auth/complete?error=cancelled");
      return result;
    }
    const code = url.searchParams.get("code");
    if (
      !code ||
      code.length > 4096 ||
      url.searchParams.getAll("code").length !== 1
    )
      throw new Error("Missing code");
    const client = makeClient(env, memoryStorage(pending.storage));
    const exchanged = await client.auth.exchangeCodeForSession(code);
    if (exchanged.error || !exchanged.data.session)
      throw new Error("Exchange failed");
    const session = exchanged.data.session,
      user = await client.auth.getUser(session.access_token);
    if (
      user.error ||
      !user.data.user?.email_confirmed_at ||
      user.data.user.is_anonymous
    )
      throw new Error("Unverified user");
    // Google provider tokens are discarded; only the existing Supabase session is transferred.
    const handoff = seal(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        next: safeNext(pending.next),
        expires: Date.now() + 90000,
      },
      env,
    );
    result.headers.append("Set-Cookie", cookie(HANDOFF, handoff, origin, 90));
    result.headers.set("Location", origin + "/auth/complete");
    return result;
  } catch {
    return result;
  }
}

export async function finishGoogle(
  request: Request,
  env: Env = process.env,
  makeClient: Factory = factory,
) {
  let origin: string;
  try {
    origin = authOrigin(request, env);
    sameOrigin(request, origin);
  } catch (e) {
    return failure(e);
  }
  let result: Response;
  try {
    const data = unseal<Handoff>(readCookie(request, HANDOFF, origin), env);
    safeNext(data.next);
    if (
      typeof data.access_token !== "string" ||
      typeof data.refresh_token !== "string"
    )
      throw new Error();
    const client = makeClient(env, memoryStorage()),
      verified = await client.auth.getUser(data.access_token);
    if (
      verified.error ||
      !verified.data.user?.email_confirmed_at ||
      verified.data.user.is_anonymous
    )
      throw new HttpError(401, "Prijavna seja ni veljavna. Začni znova.");
    result = Response.json(
      {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        next: data.next,
      },
      { headers },
    );
  } catch (e) {
    result = failure(e);
  }
  result.headers.append("Set-Cookie", cookie(HANDOFF, "", origin, 0));
  return result;
}
