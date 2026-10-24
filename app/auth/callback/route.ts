import "server-only";
import { googleCallback } from "@/lib/google-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return googleCallback(request);
}
