import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORAGE_KEY,
  emptyWorkspace,
  parseWorkspace,
  type WorkspaceData,
} from "./model.ts";

export type Snapshot = { data: WorkspaceData; name: string; editable: boolean };
export type WorkspaceStore = {
  kind: "local" | "supabase";
  load: () => Promise<Snapshot>;
  save: (data: WorkspaceData, name: string) => Promise<Snapshot>;
};

export function localStore(): WorkspaceStore {
  return {
    kind: "local",
    async load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      return {
        data: raw ? parseWorkspace(raw) : emptyWorkspace(),
        name: localStorage.getItem("shapers-os.hub") || "Naša skupnost",
        editable: true,
      };
    },
    async save(data, name) {
      parseWorkspace(JSON.stringify(data));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem("shapers-os.hub", name);
      return { data, name, editable: true };
    },
  };
}

export function cloudStore(client: SupabaseClient, id: string): WorkspaceStore {
  let revision: number | null = null;
  let editable = false;
  return {
    kind: "supabase",
    async load() {
      const { data, error } = await client
        .from("shapers_workspaces")
        .select("name,payload,revision")
        .eq("id", id)
        .single();
      if (error)
        throw new Error(
          "Prostora ni mogoče odpreti. Preveri povezavo in dovoljenja ter poskusi znova.",
        );
      const permission = await client.rpc("shapers_workspace_can_edit", {
        workspace: id,
      });
      if (permission.error)
        throw new Error(
          "Pravic prostora ni mogoče preveriti. Poskusi osvežiti podatke.",
        );
      editable = permission.data === true;
      const payload = parseWorkspace(JSON.stringify(data.payload));
      revision = data.revision;
      return { data: payload, name: data.name, editable };
    },
    async save(payload, name) {
      if (revision === null) throw new Error("Najprej osveži podatke iz baze.");
      if (!editable)
        throw new Error("Za ta prostor imaš pravico samo za ogled.");
      parseWorkspace(JSON.stringify(payload));
      const { data, error } = await client
        .from("shapers_workspaces")
        .update({ payload, name })
        .eq("id", id)
        .eq("revision", revision)
        .select("name,payload,revision")
        .maybeSingle();
      if (error)
        throw new Error(
          "Shranjevanje v Supabase ni uspelo. Preveri povezavo in pravico za urejanje. Sprememba ni potrjena.",
        );
      if (!data)
        throw new Error(
          "Podatke je spremenil drug uporabnik ali nimaš pravice za urejanje. Osveži iz baze in ponovi spremembo.",
        );
      const result = parseWorkspace(JSON.stringify(data.payload));
      revision = data.revision;
      return { data: result, name: data.name, editable };
    },
  };
}
