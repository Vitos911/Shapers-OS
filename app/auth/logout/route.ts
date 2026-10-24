import "server-only";
import { clearGoogleCookies } from "@/lib/google-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return clearGoogleCookies(request);
}
