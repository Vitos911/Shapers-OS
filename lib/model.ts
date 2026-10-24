export type Project = { id: string; name: string; description: string; category: string; status: string; due: string; createdAt: string };
export type Member = { id: string; name: string; role: string; createdAt: string };
export type Event = { id: string; name: string; date: string; time: string; location: string; attendees: string[]; createdAt: string };
export type Entry = { id: string; projectId: string; memberId: string; date: string; hours: number; note: string; createdAt: string };
export type Task = { id: string; projectId: string; title: string; done: boolean; createdAt: string };
export type WorkspaceData = { version: 1; projects: Project[]; members: Member[]; events: Event[]; entries: Entry[]; tasks: Task[] };
export const STORAGE_KEY = "shapers-os.workspace.v1";
export const PROJECT_STATUSES = ["Načrtovanje", "V teku", "Zaključeno"];
export const CATEGORIES = ["Skupnost", "Izobraževanje", "Trajnost", "Zdravje", "Drugo"];

export function emptyWorkspace(): WorkspaceData {
  return { version: 1, projects: [], members: [], events: [], entries: [], tasks: [] };
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validateHours(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Vnesi veljavno število ur.");
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours < 0.25 || hours > 24 || !Number.isInteger(hours * 4)) {
    throw new Error("Vnesi od 0,25 do 24 ur v korakih po 15 minut.");
  }
  return hours;
}

export function parseWorkspace(raw: string): WorkspaceData {
  const data = JSON.parse(raw);
  const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
  const records = (values: unknown, fields: string[]) => Array.isArray(values) && values.length <= 10000 && values.every(v => object(v) && fields.every(key => typeof v[key] === "string" && (v[key] as string).length <= 5000) && v.id);
  if (!object(data) || data.version !== 1 ||
    !records(data.projects, ["id", "name", "description", "category", "status", "due", "createdAt"]) ||
    !records(data.members, ["id", "name", "role", "createdAt"]) ||
    !records(data.events, ["id", "name", "date", "time", "location", "createdAt"]) ||
    !records(data.entries, ["id", "projectId", "memberId", "date", "note", "createdAt"]) ||
    !records(data.tasks, ["id", "projectId", "title", "createdAt"])) {
    throw new Error("Datoteka nima veljavne oblike Shapers OS (različica 1).");
  }
  const result = data as WorkspaceData;
  for (const collection of [result.projects, result.members, result.events, result.entries, result.tasks]) {
    if (new Set(collection.map(x => x.id)).size !== collection.length) throw new Error("Podatki vsebujejo podvojene identifikatorje.");
  }
  const projects = new Set(result.projects.map(x => x.id));
  const members = new Set(result.members.map(x => x.id));
  if (result.projects.some(x => !x.name.trim() || !PROJECT_STATUSES.includes(x.status) || !CATEGORIES.includes(x.category) || (x.due && !isDate(x.due))) ||
    result.members.some(x => !x.name.trim()) ||
    result.events.some(x => !x.name.trim() || !isDate(x.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) || !Array.isArray(x.attendees) || x.attendees.some(id => !members.has(id)) || new Set(x.attendees).size !== x.attendees.length) ||
    result.entries.some(x => !projects.has(x.projectId) || !members.has(x.memberId) || !isDate(x.date) || typeof x.hours !== "number" || !Number.isFinite(x.hours) || x.hours < 0.25 || x.hours > 24 || !Number.isInteger(x.hours * 4)) ||
    result.tasks.some(x => !projects.has(x.projectId) || !x.title.trim() || typeof x.done !== "boolean")) {
    throw new Error("Preveri datume, ure in povezave med zapisi v podatkih.");
  }
  return result;
}

export function summarize(data: WorkspaceData, today = localDate()) {
  return {
    activeProjects: data.projects.filter(x => x.status !== "Zaključeno").length,
    members: data.members.length,
    upcomingEvents: data.events.filter(x => x.date >= today).length,
    monthlyHours: data.entries.filter(x => x.date.slice(0, 7) === today.slice(0, 7)).reduce((sum, x) => sum + x.hours, 0),
    totalHours: data.entries.reduce((sum, x) => sum + x.hours, 0),
  };
}

export function toCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map(row => row.map(value => {
    let cell = String(value ?? "");
    // Keep untrusted text from becoming a spreadsheet formula.
    if (/^[\s]*[=+\-@]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}
