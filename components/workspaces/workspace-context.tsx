"use client";
import { createContext, useContext } from "react";
export type BusinessWorkspace = {
    id: string;
    name: string;
    description: string;
    logo_url: string;
    accent_color: string;
    member_count: number;
    role: string;
};
export type WorkspaceContextValue = {
    active: BusinessWorkspace | null;
    workspaces: BusinessWorkspace[];
    select: (id: string) => void;
    reload: () => Promise<BusinessWorkspace[]>;
    request: (path: string, body?: unknown) => Promise<unknown>;
};
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export const useWorkspace = () => useContext(WorkspaceContext);
