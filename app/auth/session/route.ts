import "server-only";
import { finishGoogle } from "@/lib/google-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return finishGoogle(request);
}
