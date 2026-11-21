import { useTranslation } from "react-i18next";
import type { AssetCenterSummary } from "./asset-center-model";
import { assetCenterCounts, memoryEntries } from "./asset-center-model";
import type { AssetCenterTab } from "./asset-center-tabs";
import { AgentProjectPicker, type AgentProjectOption } from "../../components/settings/AgentCapabilityLayout";
import { Button } from "../../components/ui";
import {
  IconBookOpen,
  IconBot,
  IconChevronRight,
  IconDatabase,
  IconPlus,
  IconSparkles,
} from "../../components/icons";

export function AssetOverview({
  project,
  projects,
  projectDisabled,
  summary,
  loading,
  onProjectChange,
  onOpenTab,
  onAddMemory,
}: {
  project: AgentProjectOption | null;
  projects: readonly AgentProjectOption[];
  projectDisabled: boolean;
  summary: AssetCenterSummary;
  loading: boolean;
  onProjectChange: (path: string) => void;
  onOpenTab: (tab: AssetCenterTab) => void;
  onAddMemory: () => void;
}) {
  const { t } = useTranslation();
  const counts = assetCenterCounts(summary);
  const memories = memoryEntries(summary.memory);
  const tiles = [
    {
      id: "memory" as const,
      icon: <IconSparkles size={18} />,
      label: t("assets.memory"),
      value: counts.memories,
      detail: project?.name ?? t("assets.noProject"),
    },
    {
      id: "skills" as const,
      icon: <IconBookOpen size={18} />,
      label: t("assets.skills"),
      value: counts.skills,
      detail: t("assets.enabledCount", { enabled: counts.enabledSkills, total: counts.skills }),
    },
    {
      id: "subagents" as const,
      icon: <IconBot size={18} />,
      label: t("assets.subagents"),
      value: counts.subagents,
      detail: t("assets.enabledCount", {
        enabled: counts.enabledSubagents,
        total: counts.subagents,
      }),
    },
  ];
  const guides = [
    { title: t("assets.guideMemoryTitle"), body: t("assets.guideMemoryBody") },
    { title: t("assets.guideSkillsTitle"), body: t("assets.guideSkillsBody") },
    { title: t("assets.guideAgentsTitle"), body: t("assets.guideAgentsBody") },
  ];

  return (
    <div className="asset-overview">
      <section className="asset-hero">
        <div className="asset-hero-icon" aria-hidden><IconDatabase size={28} /></div>
        <div className="asset-hero-copy">
          <span className="asset-eyebrow">{t("assets.localFirst")}</span>
          <h2>{t("assets.heroTitle")}</h2>
          <p>{t("assets.heroDescription")}</p>
          <div className="asset-hero-actions">
            <Button variant="primary" size="sm" disabled={!project} onClick={onAddMemory}>
              <IconPlus size={14} />{t("assets.addMemory")}
            </Button>
            <Button size="sm" onClick={() => onOpenTab("skills")}>
              <IconBookOpen size={14} />{t("assets.manageSkills")}
            </Button>
          </div>
        </div>
        <div className="asset-hero-project">
          <span>{t("assets.projectContext")}</span>
          <AgentProjectPicker
            value={project?.path ?? null}
            options={projects}
            label={t("assets.projectContext")}
            disabled={projectDisabled}
            onChange={onProjectChange}
          />
        </div>
      </section>

      <div className="asset-stat-grid">
        {tiles.map((tile) => (
          <button
            type="button"
            className="asset-stat-card"
            key={tile.id}
            onClick={() => onOpenTab(tile.id)}
          >
            <span className="asset-stat-icon" aria-hidden>{tile.icon}</span>
            <span className="asset-stat-copy">
              <span className="asset-stat-label">{tile.label}</span>
              <strong className="asset-stat-value">{loading ? "—" : tile.value}</strong>
              <span className="asset-stat-detail">{tile.detail}</span>
            </span>
            <IconChevronRight size={15} aria-hidden />
          </button>
        ))}
      </div>

      <div className="asset-overview-columns">
        <section className="asset-panel">
          <div className="asset-panel-heading">
            <div>
              <h3>{t("assets.recentMemory")}</h3>
              <p>{t("assets.recentMemoryDescription")}</p>
            </div>
            <Button variant="ghost" size="sm" disabled={!project} onClick={() => onOpenTab("memory")}>
              {t("assets.viewAll")}
            </Button>
          </div>
          {memories.length > 0 ? (
            <div className="asset-memory-preview-list">
              {memories.slice(-4).reverse().map((entry) => (
                <button type="button" key={entry.id} onClick={() => onOpenTab("memory")}>
                  <IconSparkles size={14} aria-hidden />
                  <span>
                    <strong>{entry.title || t("assets.untitledMemory")}</strong>
                    <small>{entry.content}</small>
                  </span>
                  <IconChevronRight size={14} aria-hidden />
                </button>
              ))}
            </div>
          ) : (
            <div className="asset-panel-empty">
              <IconSparkles size={20} aria-hidden />
              <p>{project ? t("assets.noMemory") : t("assets.noProject")}</p>
            </div>
          )}
        </section>

        <section className="asset-panel">
          <div className="asset-panel-heading">
            <div>
              <h3>{t("assets.storageScopes")}</h3>
              <p>{t("assets.storageScopesDescription")}</p>
            </div>
          </div>
          <dl className="asset-scope-list">
            <div><dt>{t("assets.globalSkills")}</dt><dd>~/.agents/skills</dd></div>
            <div><dt>{t("assets.globalSubagents")}</dt><dd>~/.agents/subagents</dd></div>
            <div><dt>{t("assets.projectSkills")}</dt><dd>{project ? `${project.path}/.agents/skills` : t("assets.noProject")}</dd></div>
          </dl>
        </section>
      </div>

      <section className="asset-guide">
        <h3>{t("assets.howItWorks")}</h3>
        <div className="asset-guide-grid">
          {guides.map((guide, index) => (
            <article key={guide.title}>
              <span>{index + 1}</span>
              <h4>{guide.title}</h4>
              <p>{guide.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
