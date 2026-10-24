export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const headers = { "Cache-Control": "no-store" };
  if (!url && !publishableKey) return Response.json({ configured: false }, { headers });
  // Only a publishable key may cross the browser boundary. Never accept a secret
  // or service-role JWT accidentally placed in this environment variable.
  if (!url?.match(/^https:\/\/[a-z0-9-]+\.supabase\.co$/) || !publishableKey?.startsWith("sb_publishable_")) {
    return Response.json({ error: "Nastavitev Supabase ni veljavna. Preveri URL in publishable ključ na strežniku." }, { status: 503, headers });
  }
  return Response.json({ configured: true, url, publishableKey }, { headers });
}
