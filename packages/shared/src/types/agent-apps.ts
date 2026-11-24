/**
 * Agent application wire types (schema v28).
 *
 * An application is a registered entry the desktop opens in the work panel.
 * `openUrl` is computed by host-core at read time; when the entry disappeared
 * the row stays with `available: false` and a reason for the UI to show.
 */

export type AgentApplicationKind = "remote" | "folder";

export type AgentApplication = {
  id: string;
  name: string;
  description: string;
  kind: AgentApplicationKind;
  entry: string;
  icon: string | null;
  enabled: boolean;
  sortOrder: number;
  lastOpenedAt: string | null;
  openUrl: string | null;
  available: boolean;
  unavailableReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentApplicationCreateInput = {
  name: string;
  description?: string;
  kind: AgentApplicationKind;
  entry: string;
  icon?: string | null;
  enabled?: boolean;
};

export type AgentApplicationUpdateInput = {
  id: string;
  name?: string;
  description?: string;
  kind?: AgentApplicationKind;
  entry?: string;
  icon?: string | null;
  enabled?: boolean;
};
