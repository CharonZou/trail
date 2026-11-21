import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentCapabilityLevel, ProjectMemory, UserSkillRecord } from "@trail/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { useHostCollection } from "../../hooks/use-host-collection";
import type { AgentProjectOption } from "../../components/settings/AgentCapabilityLayout";
import { fetchSubagentPageData } from "../../components/settings/subagent-settings";
import {
  createAssetBackup,
  downloadAssetBackup,
  EMPTY_ASSET_CENTER_SUMMARY,
} from "./asset-center-model";

export function useAssetCenterSummary(project: AgentProjectOption | null) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const projectPath = project?.path ?? null;
  const groupId = project?.groupId;
  const legacy = project?.legacy;
  const fetchSummary = useCallback(async () => {
    const memoryRequest: Promise<{ memory: ProjectMemory } | null> = !projectPath
      ? Promise.resolve(null)
      : groupId && !legacy
        ? api.getProjectGroupMemory(groupId)
        : api.getProjectMemory(projectPath);
    const [memory, builtins, globalSkills, projectSkills, subagents] = await Promise.all([
      memoryRequest,
      api.listBuiltinSkills(),
      api.listUserSkills({ level: "global" }),
      projectPath
        ? api.listUserSkills({ level: "project", projectPath })
        : Promise.resolve({ skills: [] as UserSkillRecord[] }),
      fetchSubagentPageData(),
    ]);
    return {
      memory: memory?.memory ?? null,
      skills: {
        builtins: builtins.builtins ?? [],
        global: globalSkills.skills ?? [],
        project: projectSkills.skills ?? [],
      },
      subagents,
    };
  }, [groupId, legacy, projectPath]);
  const collection = useHostCollection(
    fetchSummary,
    EMPTY_ASSET_CENTER_SUMMARY,
    (error) => showToast(error instanceof Error ? error.message : String(error), { variant: "error" }),
  );
  const [exporting, setExporting] = useState(false);

  const exportBackup = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Export from a fresh host snapshot, not a possibly stale overview.
      const summary = await fetchSummary();
      const ownedSkills: { level: AgentCapabilityLevel; skill: UserSkillRecord }[] = [
        ...summary.skills.global.map((skill) => ({ level: "global" as const, skill })),
        ...summary.skills.project.map((skill) => ({ level: "project" as const, skill })),
      ];
      const [skills, subagents] = await Promise.all([
        Promise.all(ownedSkills.map(async ({ level, skill }) => {
          const result = await api.readUserSkill(skill.id, {
            level,
            ...(level === "project" && projectPath ? { projectPath } : {}),
          });
          return { level, skill, body: result.body ?? "" };
        })),
        Promise.all(summary.subagents.owned.map(async (subagent) => {
          const result = await api.readUserSubagent(subagent.id);
          return { subagent, body: result.body ?? "" };
        })),
      ]);
      const backup = createAssetBackup({
        projectName: project?.name ?? null,
        projectPath,
        summary,
        skills,
        subagents,
        exportedAt: new Date().toISOString(),
      });
      downloadAssetBackup(backup);
      showToast(t("assets.exportSuccess"), { variant: "success" });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setExporting(false);
    }
  }, [exporting, fetchSummary, project?.name, projectPath, showToast, t]);

  return { ...collection, exporting, exportBackup };
}
