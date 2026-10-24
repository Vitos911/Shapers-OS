import "server-only";
import {
  personalCalendar,
  disconnectPersonalCalendar,
} from "@/lib/personal-calendar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return personalCalendar(request);
}
export async function DELETE(request: Request) {
  return disconnectPersonalCalendar(request);
}
