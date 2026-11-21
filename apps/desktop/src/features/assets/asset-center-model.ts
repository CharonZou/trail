import type {
  AgentCapabilityLevel,
  BuiltinSkillRecord,
  ProjectMemory,
  ProjectMemoryEntry,
  UserSkillRecord,
  UserSubagentRecord,
} from "@trail/shared";
import type { BuiltinSubagentRow } from "../../components/settings/subagent-settings";
import { projectMemoryEntries } from "../../lib/project-memory";

export type AssetCenterSummary = {
  memory: ProjectMemory | null;
  skills: {
    builtins: BuiltinSkillRecord[];
    global: UserSkillRecord[];
    project: UserSkillRecord[];
  };
  subagents: {
    owned: UserSubagentRecord[];
    builtins: BuiltinSubagentRow[];
  };
};

export const EMPTY_ASSET_CENTER_SUMMARY: AssetCenterSummary = {
  memory: null,
  skills: { builtins: [], global: [], project: [] },
  subagents: { owned: [], builtins: [] },
};

export function memoryEntries(memory: ProjectMemory | null): ProjectMemoryEntry[] {
  return projectMemoryEntries(memory);
}

export function assetCenterCounts(summary: AssetCenterSummary) {
  const ownedSkills = [...summary.skills.global, ...summary.skills.project];
  const allSkills = [...summary.skills.builtins, ...ownedSkills];
  const allSubagents = [...summary.subagents.owned, ...summary.subagents.builtins];
  return {
    memories: memoryEntries(summary.memory).length,
    skills: allSkills.length,
    enabledSkills: allSkills.filter((skill) => skill.enabled).length,
    ownedSkills: ownedSkills.length,
    subagents: allSubagents.length,
    enabledSubagents: allSubagents.filter((subagent) => subagent.enabled).length,
    ownedSubagents: summary.subagents.owned.length,
  };
}

export type SkillBackupDocument = {
  level: AgentCapabilityLevel;
  skill: UserSkillRecord;
  body: string;
};

export type SubagentBackupDocument = {
  subagent: UserSubagentRecord;
  body: string;
};

/** Versioned, portable user data. Builtins and credentials are never included. */
export function createAssetBackup({
  projectName,
  projectPath,
  summary,
  skills,
  subagents,
  exportedAt,
}: {
  projectName: string | null;
  projectPath: string | null;
  summary: AssetCenterSummary;
  skills: readonly SkillBackupDocument[];
  subagents: readonly SubagentBackupDocument[];
  exportedAt: string;
}) {
  return {
    format: "trail.asset-center" as const,
    version: 1 as const,
    exportedAt,
    project: projectPath ? { name: projectName ?? projectPath, path: projectPath } : null,
    memory: memoryEntries(summary.memory),
    skills: skills.map(({ level, skill, body }) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? "",
      body,
      enabled: skill.enabled,
      scope: skill.scope,
      level,
      ...(level === "project" ? { projectPath: skill.projectPath ?? projectPath } : {}),
    })),
    subagents: subagents.map(({ subagent, body }) => ({
      id: subagent.id,
      name: subagent.name,
      description: subagent.description,
      body,
      tools: subagent.tools,
      model: subagent.model ?? "",
      fallbackModels: subagent.fallbackModels ?? [],
      thinkingLevel: subagent.thinkingLevel ?? "",
      maxTokens: subagent.maxTokens ?? 0,
      enabled: subagent.enabled,
      scope: subagent.scope,
    })),
  };
}

export type AssetBackup = ReturnType<typeof createAssetBackup>;

export function downloadAssetBackup(backup: AssetBackup) {
  const date = backup.exportedAt.slice(0, 10).replaceAll(/[^0-9-]/g, "");
  const link = document.createElement("a");
  let url: string | undefined;
  try {
    url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }),
    );
    link.href = url;
    link.download = `trail-assets-${date || "backup"}.json`;
    link.style.display = "none";
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    if (url) URL.revokeObjectURL(url);
  }
}
