import { HttpError } from "./org-server.ts";
import { InputError, uuid } from "./org-validation.ts";
import { isDate } from "./model.ts";

function allow(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some(k => !keys.includes(k))) throw new InputError("Zahteva vsebuje nedovoljeno polje.");
}
function text(value: unknown, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new InputError("Vnesi veljavno besedilo in obvezen razlog.");
  return value.trim();
}
export function timerCommand(body: Record<string, unknown>) {
  allow(body, ["action", "session_id", "expected_version", "project_id", "description"]);
  if (!["start", "pause", "resume", "stop"].includes(String(body.action))) throw new InputError("Neveljavno dejanje časovnika.");
  const p_session_id = uuid(body.session_id);
  if (body.action === "start") {
    if (body.expected_version !== undefined) throw new InputError("Začetek nima različice.");
    return { p_action: "start", p_session_id, p_project_id: body.project_id ? uuid(body.project_id) : null, p_description: text(body.description ?? "", 2000) };
  }
  if (body.project_id !== undefined || body.description !== undefined || !Number.isSafeInteger(body.expected_version) || Number(body.expected_version) < 1) throw new InputError("Osveži stanje časovnika.");
  return { p_action: String(body.action), p_session_id, p_expected_version: Number(body.expected_version) };
}
export function adminWorkCommand(body: Record<string, unknown>, partial: boolean) {
  allow(body, ["id", "member_id", "date", "hours", "description", "project_id", "reason", "expected_updated_at", "deleted"]);
  if (typeof body.date !== "string" || !isDate(body.date) || typeof body.hours !== "number" || !Number.isFinite(body.hours) || body.hours < 0 || body.hours > 25) throw new InputError("Vnesi veljaven datum in 0–25 ur.");
  if (body.deleted !== undefined && typeof body.deleted !== "boolean") throw new InputError("Neveljavno stanje.");
  if (partial && (typeof body.expected_updated_at !== "string" || !Number.isFinite(Date.parse(body.expected_updated_at)))) throw new InputError("Pred popravkom osveži vnos.");
  if (!partial && (body.id !== undefined || body.expected_updated_at !== undefined || body.deleted)) throw new InputError("Neveljavno začetno stanje.");
  return {
    p_id: partial ? uuid(body.id) : null,
    p_member_id: uuid(body.member_id), p_date: body.date, p_hours: body.hours,
    p_description: text(body.description ?? "", 2000), p_project_id: body.project_id ? uuid(body.project_id) : null,
    p_reason: text(body.reason, 2000, true),
    p_expected_updated_at: partial ? body.expected_updated_at : null, p_deleted: body.deleted ?? false,
  };
}
export function workRpcError(code: string) {
  const status = code === "42501" ? 403 : ["23505", "40001", "23514"].includes(code) ? 409 : ["22023", "23503", "23502"].includes(code) ? 400 : 503;
  return new HttpError(status, status === 403 ? "Za to dejanje nimaš dovoljenja." : status === 409 ? "Stanje je bilo spremenjeno, seja je že aktivna ali datum pokrivajo uvožene ure. Osveži podatke." : status === 400 ? "Preveri polja, datum in obvezen razlog." : "Storitev ur ni pripravljena. Preveri povezavo in migracijo časovnika.");
}
