export function GET() {
  return Response.json({ status: "ok", application: "shapers-os", version: "0.1.0" });
}
