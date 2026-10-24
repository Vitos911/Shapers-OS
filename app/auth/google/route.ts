import "server-only";
import { startGoogle } from "@/lib/google-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return startGoogle(request);
}
