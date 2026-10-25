import "server-only";
import { slack } from "@/lib/slack";
import { createSlackTestHandlers } from "@/lib/slack/test-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createSlackTestHandlers(slack);
export const GET = handlers.GET;
export const POST = handlers.POST;
