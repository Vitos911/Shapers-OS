import { isDate, validateHours } from "./model.ts";
import { PRIORITIES, TASK_STATUSES } from "./organization.ts";
export class InputError extends Error {}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
      value,
    )
  )
    throw new InputError("Neveljaven identifikator.");
  return value;
}
function text(v: unknown, max: number, required = false) {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new InputError("Neveljavno besedilo.");
  return v.trim();
}
function choice(v: unknown, values: string[]) {
  if (typeof v !== "string" || !values.includes(v))
    throw new InputError("Neveljavna izbira.");
  return v;
}
export function fields(
  resource: string,
  body: Record<string, unknown>,
  partial = false,
): Record<string, unknown> {
  const schemas: Record<string, Record<string, (v: unknown) => unknown>> = {
    projects: {
      name: (v) => text(v, 160, true),
      description: (v) => text(v, 5000),
      status: (v) => choice(v, ["planning", "active", "done", "archived"]),
      visibility: (v) => choice(v, ["private", "organization"]),
      join_policy: (v) => choice(v, ["open", "approval", "closed"]),
      goal: (v) => text(v, 2000),
    },
    tasks: {
      project_id: uuid,
      title: (v) => text(v, 200, true),
      description: (v) => text(v, 5000),
      assignee_id: (v) => (v === null ? null : uuid(v)),
      status: (v) => choice(v, TASK_STATUSES),
      priority: (v) => choice(v, PRIORITIES),
      due_date: (v) => {
        if (v === null || v === "") return null;
        if (typeof v !== "string" || !isDate(v))
          throw new InputError("Neveljaven datum.");
        return v;
      },
      archived: (v) => {
        if (typeof v !== "boolean") throw new InputError("Neveljavno stanje.");
        return v;
      },
    },
    work: {
      project_id: (v) => (v === null || v === "" ? null : uuid(v)),
      date: (v) => {
        if (typeof v !== "string" || !isDate(v))
          throw new InputError("Neveljaven datum.");
        return v;
      },
      hours: validateHours,
      description: (v) => text(v, 2000),
      deleted: (v) => {
        if (typeof v !== "boolean") throw new InputError("Neveljavno stanje.");
        return v;
      },
    },
    attendance: {
      meeting_id: uuid,
      member_id: uuid,
      status: (v) => choice(v, ["present", "remote", "excused", "unexcused"]),
      note: (v) => text(v, 2000),
    },
    profile: { name: (v) => text(v, 160, true) },
    settings: {
      name: (v) => text(v, 80, true),
      calendar_id: (v) => text(v, 500),
    },
  };
  const schema = schemas[resource];
  if (!schema) throw new InputError("Neznana vrsta podatkov.");
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!schema[k]) throw new InputError(`Polje ${k} ni dovoljeno.`);
    try {
      result[k] = schema[k](v);
    } catch (e) {
      throw new InputError(
        e instanceof Error ? e.message : "Neveljavno polje.",
      );
    }
  }
  if (!Object.keys(result).length) throw new InputError("Ni sprememb.");
  if (!partial) {
    const required: Record<string, string[]> = {
      projects: ["name"],
      tasks: ["project_id", "title"],
      work: ["date", "hours"],
      attendance: ["meeting_id", "member_id", "status"],
    };
    for (const k of required[resource] || [])
      if (!(k in result)) throw new InputError(`Manjka ${k}.`);
  }
  return result;
}
