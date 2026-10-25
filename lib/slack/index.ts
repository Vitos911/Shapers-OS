import "server-only";
import { createSlackService } from "./client.ts";

// No credentials are read and no requests run until a method is explicitly called.
export const slack = createSlackService();
export { SlackError } from "./client.ts";
export type { SlackService } from "./client.ts";
