import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentApplication,
  AgentApplicationKind,
  AgentApplicationCreateInput,
} from "@trail/shared";
import { api } from "../lib/api";
import { browserPluginTab } from "../lib/work-panel-tabs";
import { OverlayBackdrop } from "../components/OverlayBackdrop";
import { Button, Input, Textarea, TooltipButton, cx, portalOverlay } from "../components/ui";
import { IconBrowser, IconFolder, IconLink, IconPlus, IconRefresh, IconTrash } from "../components/icons";
import { useAppStore } from "../stores/app-store";

type Draft = {
  id: string | null;
  name: string;
  description: string;
  kind: AgentApplicationKind;
  entry: string;
  icon: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  description: "",
  kind: "remote",
  entry: "",
  icon: "",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Agent application gallery. An application is only a registered entry point:
 * the desktop opens its `openUrl` in the existing work panel browser tab, so no
 * second web runtime is invented here.
 */
export function AgentAppsPage() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const openWorkPanelTab = useAppStore((state) => state.openWorkPanelTab);
  const [apps, setApps] = useState<AgentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useMemo(
    () => async (): Promise<void> => {
      const result = await api.agentAppsList();
      setApps(result.apps);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((error: unknown) => {
        if (!cancelled) showToast(errorText(error), { variant: "error" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, showToast]);

  const openApp = async (app: AgentApplication): Promise<void> => {
    if (!app.openUrl) {
      showToast(app.unavailableReason ?? t("agentApps.unavailable"), { variant: "error" });
      return;
    }
    openWorkPanelTab(browserPluginTab(app.openUrl));
    try {
      await api.agentAppsMarkOpened(app.id);
      await load();
    } catch {
      // Opening already succeeded; a bookkeeping failure is not user-visible.
    }
  };

  const pickFolder = async (): Promise<void> => {
    if (!draft) return;
    try {
      const folder = await api.agentAppsPickFolder();
      if (folder) setDraft({ ...draft, entry: folder });
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    }
  };

  const save = async (): Promise<void> => {
    if (!draft) return;
    const name = draft.name.trim();
    const entry = draft.entry.trim();
    if (!name || !entry) return;
    setBusy(true);
    try {
      const input: AgentApplicationCreateInput = {
        name,
        description: draft.description.trim(),
        kind: draft.kind,
        entry,
        icon: draft.icon.trim() || null,
      };
      if (draft.id) {
        await api.agentAppsUpdate({ id: draft.id, ...input });
      } else {
        await api.agentAppsCreate(input);
      }
      setDraft(null);
      await load();
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (app: AgentApplication): Promise<void> => {
    if (!window.confirm(t("agentApps.confirmDelete", { name: app.name }))) return;
    try {
      await api.agentAppsDelete(app.id);
      setApps((current) => current.filter((item) => item.id !== app.id));
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    }
  };

  const startEdit = (app: AgentApplication): void => {
    setDraft({
      id: app.id,
      name: app.name,
      description: app.description,
      kind: app.kind,
      entry: app.entry,
      icon: app.icon ?? "",
    });
  };

  return (
    <div className="route-scroll">
      <div className="page-frame agent-apps-page">
        <header className="page-header agent-apps-header">
          <div className="agent-apps-title-block">
            <span className="agent-apps-title-icon" aria-hidden>
              <IconBrowser size={16} />
            </span>
            <div>
              <h1 className="page-title">{t("agentApps.title")}</h1>
              <p>{t("agentApps.subtitle")}</p>
            </div>
          </div>
          <div className="agent-apps-header-actions">
            <TooltipButton
              tooltip={t("agentApps.refresh")}
              ariaLabel={t("agentApps.refresh")}
              disabled={loading}
              onClick={() => {
                void load().catch((error: unknown) => {
                  showToast(errorText(error), { variant: "error" });
                });
              }}
            >
              <IconRefresh size={15} />
            </TooltipButton>
            <Button size="sm" variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <IconPlus size={14} />
              {t("agentApps.add")}
            </Button>
          </div>
        </header>

        {apps.length === 0 ? (
          <div className="agent-apps-empty">
            <IconBrowser size={22} aria-hidden />
            <p className="agent-apps-empty-title">{t("agentApps.empty")}</p>
            <p>{t("agentApps.emptyHint")}</p>
          </div>
        ) : (
          <ul className="agent-apps-grid">
            {apps.map((app) => (
              <li key={app.id} className={cx("agent-app-card", !app.available && "is-unavailable")}>
                <div className="agent-app-card-head">
                  <span className={cx("agent-app-icon", app.kind === "folder" && "is-folder")}>
                    {app.icon ? app.icon : initials(app.name)}
                  </span>
                  <div className="agent-app-card-title">
                    <span className="agent-app-name">{app.name}</span>
                    <span className="agent-app-kind">
                      {app.kind === "remote" ? (
                        <IconLink size={11} aria-hidden />
                      ) : (
                        <IconFolder size={11} aria-hidden />
                      )}
                      {t(`agentApps.kind.${app.kind}`)}
                    </span>
                  </div>
                </div>
                {app.description ? <p className="agent-app-desc">{app.description}</p> : null}
                <p className="agent-app-entry" title={app.entry}>
                  {app.entry}
                </p>
                {!app.available ? (
                  <p className="agent-app-unavailable">
                    {app.unavailableReason ?? t("agentApps.unavailable")}
                  </p>
                ) : null}
                <div className="agent-app-card-actions">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!app.available}
                    onClick={() => void openApp(app)}
                  >
                    {t("agentApps.open")}
                  </Button>
                  <Button size="sm" onClick={() => startEdit(app)}>
                    {t("agentApps.edit")}
                  </Button>
                  <TooltipButton
                    tooltip={t("agentApps.delete")}
                    ariaLabel={t("agentApps.delete")}
                    onClick={() => void remove(app)}
                  >
                    <IconTrash size={13} />
                  </TooltipButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft
        ? portalOverlay(
            <OverlayBackdrop className="overlay knowledge-modal-backdrop" role="presentation">
              <div
                className="dialog knowledge-modal"
                role="dialog"
                aria-modal="true"
                aria-label={draft.id ? t("agentApps.edit") : t("agentApps.add")}
              >
                <h2>{draft.id ? t("agentApps.edit") : t("agentApps.add")}</h2>
                <label className="knowledge-field">
                  <span>{t("agentApps.name")}</span>
                  <Input
                    value={draft.name}
                    autoFocus
                    placeholder={t("agentApps.namePlaceholder")}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label className="knowledge-field">
                  <span>{t("agentApps.description")}</span>
                  <Textarea
                    rows={2}
                    value={draft.description}
                    placeholder={t("agentApps.descriptionPlaceholder")}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </label>
                <fieldset className="knowledge-field agent-apps-kind-field">
                  <span>{t("agentApps.kindLabel")}</span>
                  <div className="agent-apps-kind-options">
                    <label className={cx("agent-apps-kind", draft.kind === "remote" && "active")}>
                      <input
                        type="radio"
                        name="agent-app-kind"
                        checked={draft.kind === "remote"}
                        onChange={() => setDraft({ ...draft, kind: "remote", entry: "" })}
                      />
                      {t("agentApps.kind.remote")}
                    </label>
                    <label className={cx("agent-apps-kind", draft.kind === "folder" && "active")}>
                      <input
                        type="radio"
                        name="agent-app-kind"
                        checked={draft.kind === "folder"}
                        onChange={() => setDraft({ ...draft, kind: "folder", entry: "" })}
                      />
                      {t("agentApps.kind.folder")}
                    </label>
                  </div>
                </fieldset>
                {draft.kind === "remote" ? (
                  <label className="knowledge-field">
                    <span>{t("agentApps.url")}</span>
                    <Input
                      value={draft.entry}
                      type="url"
                      placeholder={t("agentApps.urlPlaceholder")}
                      onChange={(event) => setDraft({ ...draft, entry: event.target.value })}
                    />
                  </label>
                ) : (
                  <label className="knowledge-field">
                    <span>{t("agentApps.folder")}</span>
                    <div className="agent-apps-folder-row">
                      <Input
                        value={draft.entry}
                        placeholder={t("agentApps.folderPlaceholder")}
                        onChange={(event) => setDraft({ ...draft, entry: event.target.value })}
                      />
                      <Button size="sm" onClick={() => void pickFolder()}>
                        {t("agentApps.chooseFolder")}
                      </Button>
                    </div>
                    <small className="knowledge-hint">{t("agentApps.folderHint")}</small>
                  </label>
                )}
                <label className="knowledge-field">
                  <span>{t("agentApps.icon")}</span>
                  <Input
                    value={draft.icon}
                    placeholder={t("agentApps.iconPlaceholder")}
                    maxLength={8}
                    onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
                  />
                </label>
                <div className="knowledge-modal-actions">
                  <Button size="sm" onClick={() => setDraft(null)}>
                    {t("agentApps.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !draft.name.trim() || !draft.entry.trim()}
                    onClick={() => void save()}
                  >
                    {t("agentApps.save")}
                  </Button>
                </div>
              </div>
            </OverlayBackdrop>,
          )
        : null}
    </div>
  );
}
