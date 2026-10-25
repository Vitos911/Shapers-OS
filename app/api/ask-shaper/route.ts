import "server-only";
import { askShaper } from "@/lib/ask-shaper";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return askShaper(request);
}
