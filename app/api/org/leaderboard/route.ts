import { failure, HttpError, requireAuth, response } from "@/lib/org-server";
import { leaderboardWeek, loadLeaderboard } from "@/lib/leaderboard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { identity } = await requireAuth(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => !["week", "period"].includes(key)) || params.getAll("week").length > 1 || params.getAll("period").length > 1) throw new HttpError(400, "Neveljaven filter lestvice.");
    const period = params.get("period") ?? "week";
    if (period !== "week" && period !== "month" && period !== "all" || period !== "week" && params.has("week")) throw new HttpError(400, "Neveljavno obdobje lestvice.");
    const now = new Date();
    return response(await loadLeaderboard(identity, leaderboardWeek(params.get("week"), now), now, period));
  } catch (error) { return failure(error); }
}
