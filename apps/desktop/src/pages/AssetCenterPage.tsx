import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentSkillsPage } from "../components/settings/AgentSkillsPage";
import { AgentSubagentsPage } from "../components/settings/AgentSubagentsPage";
import { AgentProjectPicker, useAgentProjects } from "../components/settings/AgentCapabilityLayout";
import { ProjectMemoryEditor } from "../components/ProjectMemoryEditor";
import { Button, Input, TooltipButton, cx } from "../components/ui";
import {
  IconBookOpen,
  IconBot,
  IconDatabase,
  IconDownload,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconX,
} from "../components/icons";
import { useAppStore } from "../stores/app-store";
import { AssetOverview } from "../features/assets/AssetOverview";
import type { AssetCenterTab } from "../features/assets/asset-center-tabs";
import { useAssetCenterSummary } from "../features/assets/useAssetCenterSummary";

export function AssetCenterPage() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [tab, setTab] = useState<AssetCenterTab>("overview");
  const [visited, setVisited] = useState<ReadonlySet<AssetCenterTab>>(new Set(["overview"]));
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryDirty, setMemoryDirty] = useState(false);
  const [autoCreateMemory, setAutoCreateMemory] = useState(false);
  const { selectedProjectPath, setSelectedProjectPath, options } = useAgentProjects();
  const project = useMemo(
    () => options.find((option) => option.path === selectedProjectPath) ?? null,
    [options, selectedProjectPath],
  );
  const { data, loading, refreshing, reload, exporting, exportBackup } = useAssetCenterSummary(project);
  const tabs: { id: AssetCenterTab; label: string; icon: ReactNode }[] = [
    { id: "overview", label: t("assets.overview"), icon: <IconDatabase size={15} /> },
    { id: "memory", label: t("assets.memory"), icon: <IconSparkles size={15} /> },
    { id: "skills", label: t("assets.skills"), icon: <IconBookOpen size={15} /> },
    { id: "subagents", label: t("assets.subagents"), icon: <IconBot size={15} /> },
  ];
  const selectTab = (next: AssetCenterTab) => {
    setTab(next);
    setVisited((current) => new Set([...current, next]));
    if (next === "overview") void reload();
  };
  const onMemoryDirtyChange = useCallback((dirty: boolean) => setMemoryDirty(dirty), []);
  const onAutoCreateHandled = useCallback(() => setAutoCreateMemory(false), []);
  const prepareMemoryCreate = useCallback(() => setMemorySearch(""), []);
  const onMemoryError = useCallback((error: unknown) => {
    showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
  }, [showToast]);
  const addMemory = () => {
    if (!project) return;
    setAutoCreateMemory(true);
    selectTab("memory");
  };

  return (
    <div className="route-scroll">
      <div className="page-frame asset-center-page">
        <header className="page-header asset-center-header">
          <div className="asset-title-block">
            <span className="asset-title-icon" aria-hidden><IconDatabase size={17} /></span>
            <div>
              <h1 className="page-title">{t("assets.title")}</h1>
              <p>{t("assets.subtitle")}</p>
            </div>
          </div>
          <div className="asset-header-actions">
            <TooltipButton
              tooltip={t("assets.refresh")}
              ariaLabel={t("assets.refresh")}
              disabled={refreshing}
              onClick={() => void reload()}
            >
              <IconRefresh size={15} />
            </TooltipButton>
            <Button size="sm" disabled={exporting} onClick={() => void exportBackup()}>
              <IconDownload size={14} />
              {exporting ? t("assets.exporting") : t("assets.export")}
            </Button>
          </div>
        </header>

        <div className="asset-tabs" role="tablist" aria-label={t("assets.title")}>
          {tabs.map((item) => (
            <button
              type="button"
              role="tab"
              id={`asset-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`asset-panel-${item.id}`}
              className={cx("asset-tab", tab === item.id && "active")}
              key={item.id}
              onClick={() => selectTab(item.id)}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </div>

        <div
          id="asset-panel-overview"
          role="tabpanel"
          aria-labelledby="asset-tab-overview"
          hidden={tab !== "overview"}
        >
          <AssetOverview
            project={project}
            projects={options}
            projectDisabled={memoryDirty}
            summary={data}
            loading={loading}
            onProjectChange={setSelectedProjectPath}
            onOpenTab={selectTab}
            onAddMemory={addMemory}
          />
        </div>

        {visited.has("memory") ? (
          <section
            id="asset-panel-memory"
            role="tabpanel"
            aria-labelledby="asset-tab-memory"
            className="asset-memory-panel"
            hidden={tab !== "memory"}
          >
            <div className="asset-section-toolbar">
              <AgentProjectPicker
                value={project?.path ?? null}
                options={options}
                label={t("assets.projectContext")}
                disabled={memoryDirty}
                onChange={setSelectedProjectPath}
              />
              <label className="asset-memory-search">
                <IconSearch size={14} aria-hidden />
                <Input
                  type="search"
                  value={memorySearch}
                  placeholder={t("assets.searchMemory")}
                  aria-label={t("assets.searchMemory")}
                  onChange={(event) => setMemorySearch(event.target.value)}
                />
                {memorySearch ? (
                  <TooltipButton
                    tooltip={t("assets.clearSearch")}
                    ariaLabel={t("assets.clearSearch")}
                    onClick={() => setMemorySearch("")}
                  >
                    <IconX size={12} />
                  </TooltipButton>
                ) : null}
              </label>
            </div>
            {memoryDirty ? <p className="asset-unsaved-hint">{t("assets.unsavedProjectLock")}</p> : null}
            {project ? (
              <ProjectMemoryEditor
                key={`${project.groupId ?? "project"}:${project.path}`}
                project={project}
                variant="page"
                search={memorySearch}
                autoCreate={autoCreateMemory}
                onAutoCreateHandled={onAutoCreateHandled}
                onBeforeCreate={prepareMemoryCreate}
                onDirtyChange={onMemoryDirtyChange}
                onSaved={() => {
                  showToast(t("assets.memorySaved"), { variant: "success" });
                  void reload();
                }}
                onError={onMemoryError}
              />
            ) : (
              <div className="asset-page-empty">{t("assets.noProject")}</div>
            )}
          </section>
        ) : null}

        {visited.has("skills") ? (
          <section
            id="asset-panel-skills"
            role="tabpanel"
            aria-labelledby="asset-tab-skills"
            className="asset-capability-panel"
            hidden={tab !== "skills"}
          >
            <AgentSkillsPage />
          </section>
        ) : null}

        {visited.has("subagents") ? (
          <section
            id="asset-panel-subagents"
            role="tabpanel"
            aria-labelledby="asset-tab-subagents"
            className="asset-capability-panel"
            hidden={tab !== "subagents"}
          >
            <AgentSubagentsPage />
          </section>
        ) : null}
      </div>
    </div>
  );
}
