import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  KnowledgeActivity,
  KnowledgeDocument,
  KnowledgeImportOutcome,
  KnowledgeLibrary,
  KnowledgeTrendPoint,
} from "@trail/shared";
import { api } from "../lib/api";
import { OverlayBackdrop } from "../components/OverlayBackdrop";
import { Button, Input, Select, Textarea, cx, portalOverlay } from "../components/ui";
import { useAppStore } from "../stores/app-store";
import {
  KnowledgeHub,
  type KnowledgeAssistantAction,
} from "./knowledge/KnowledgeHub";
import { KnowledgeWorkbench } from "./knowledge/workbench/KnowledgeWorkbench";

type LibraryDraft = {
  name: string;
  description: string;
  semanticEnabled: boolean;
  embeddingProviderId: string;
  embeddingModel: string;
};

const EMPTY_DRAFT: LibraryDraft = {
  name: "",
  description: "",
  semanticEnabled: false,
  embeddingProviderId: "",
  embeddingModel: "",
};

type DetailIntent = {
  autoFocusSearch?: boolean;
  issuesOnly?: boolean;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Knowledge page shell: loads the overview (libraries, recent activity, visit
 * trend), owns the write dialogs, and switches between the hub and one
 * library's detail view. All writes still go through `knowledge.*` RPCs; the
 * renderer never hands host-core an arbitrary import path.
 */
export function KnowledgePage() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [libraries, setLibraries] = useState<KnowledgeLibrary[]>([]);
  const [activities, setActivities] = useState<KnowledgeActivity[]>([]);
  const [trend, setTrend] = useState<KnowledgeTrendPoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailIntent, setDetailIntent] = useState<DetailIntent>({});
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LibraryDraft | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [providers, setProviders] = useState<Array<{ id: string; label: string }>>([]);
  const selectedRef = useRef<string | null>(null);

  selectedRef.current = selectedId;
  const selected = useMemo(
    () => libraries.find((library) => library.id === selectedId) ?? null,
    [libraries, selectedId],
  );

  const loadOverview = useCallback(async (): Promise<void> => {
    const [libraryResult, activityResult, trendResult] = await Promise.all([
      api.knowledgeListLibraries(),
      api.knowledgeListActivities({ limit: 6 }),
      api.knowledgeActivityTrend({ days: 7 }),
    ]);
    setLibraries(libraryResult.libraries);
    setActivities(activityResult.activities);
    setTrend(trendResult.points);
  }, []);

  const loadDocuments = useCallback(async (libraryId: string): Promise<void> => {
    setDocumentsLoading(true);
    try {
      const result = await api.knowledgeListDocuments(libraryId);
      if (selectedRef.current !== libraryId) return;
      setDocuments(result.documents);
    } finally {
      if (selectedRef.current === libraryId) setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadOverview()
      .catch((error: unknown) => showToast(errorText(error), { variant: "error" }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOverview, showToast]);

  useEffect(() => {
    if (!selectedId) {
      setDocuments([]);
      return;
    }
    void loadDocuments(selectedId).catch((error: unknown) => {
      showToast(errorText(error), { variant: "error" });
    });
  }, [selectedId, loadDocuments, showToast]);

  useEffect(() => {
    let cancelled = false;
    void api
      .listProviders()
      .then((result) => {
        if (cancelled) return;
        const rows = (result.providers ?? []) as Array<{ id?: string; name?: string }>;
        setProviders(
          rows
            .filter((row): row is { id: string; name?: string } => Boolean(row.id))
            .map((row) => ({ id: row.id, label: row.name ?? row.id })),
        );
      })
      .catch(() => setProviders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAfterWrite = async (libraryId?: string | null): Promise<void> => {
    await loadOverview();
    if (libraryId && selectedRef.current === libraryId) await loadDocuments(libraryId);
  };

  const openLibrary = (id: string, intent: DetailIntent = {}): void => {
    selectedRef.current = id;
    setDocuments([]);
    setDetailIntent(intent);
    setSelectedId(id);
  };

  const closeLibrary = (): void => {
    selectedRef.current = null;
    setSelectedId(null);
    setDetailIntent({});
  };

  const createLibrary = async (): Promise<void> => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const result = await api.knowledgeCreateLibrary({
        name,
        description: draft.description.trim(),
        semanticEnabled: draft.semanticEnabled,
        embeddingProviderId: draft.embeddingProviderId || null,
        embeddingModel: draft.embeddingModel.trim() || null,
      });
      setDraft(null);
      setLibraries((current) => [...current, result.library]);
      openLibrary(result.library.id);
      await refreshAfterWrite(result.library.id);
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const deleteLibrary = async (library: KnowledgeLibrary): Promise<void> => {
    if (!window.confirm(t("knowledge.confirmDeleteLibrary", { name: library.name }))) return;
    setBusy(true);
    try {
      await api.knowledgeDeleteLibrary(library.id);
      if (selectedRef.current === library.id) closeLibrary();
      await refreshAfterWrite(null);
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (document: KnowledgeDocument): Promise<void> => {
    if (!window.confirm(t("knowledge.confirmDeleteDocument", { title: document.title }))) return;
    const libraryId = selectedRef.current;
    try {
      await api.knowledgeDeleteDocument(document.id);
      if (libraryId) await refreshAfterWrite(libraryId);
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    }
  };

  const reportImport = (outcomes: KnowledgeImportOutcome[]): void => {
    const ready = outcomes.filter((outcome) => outcome.status === "ready").length;
    const duplicate = outcomes.filter((outcome) => outcome.status === "duplicate").length;
    const failed = outcomes.filter((outcome) => outcome.status === "failed");
    if (ready) showToast(t("knowledge.addedDocuments", { count: ready }), { variant: "success" });
    if (duplicate) {
      showToast(t("knowledge.duplicatesSkipped", { count: duplicate }), { variant: "info" });
    }
    for (const outcome of failed.slice(0, 3)) {
      showToast(
        `${outcome.path.split(/[\\/]/).pop() ?? outcome.path}: ${outcome.errorMessage ?? outcome.errorCode ?? ""}`,
        { variant: "error" },
      );
    }
  };

  const importFiles = async (libraryId: string): Promise<void> => {
    setBusy(true);
    try {
      const result = await api.knowledgeImportFiles(libraryId);
      if (result.outcomes.length === 0) return;
      reportImport(result.outcomes);
      await refreshAfterWrite(libraryId);
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async (): Promise<void> => {
    if (!selectedId) return;
    const title = noteTitle.trim();
    const text = noteText.trim();
    if (!title || !text) return;
    setBusy(true);
    try {
      await api.knowledgeImportText({ libraryId: selectedId, title, text });
      setNoteOpen(false);
      setNoteTitle("");
      setNoteText("");
      await refreshAfterWrite(selectedId);
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const runIndex = async (library: KnowledgeLibrary): Promise<void> => {
    setBusy(true);
    try {
      const result = await api.knowledgeIndexLibrary(library.id);
      showToast(
        result.remaining > 0
          ? t("knowledge.indexedPartial", {
              count: result.embedded,
              remaining: result.remaining,
            })
          : t("knowledge.indexed", { count: result.embedded }),
        { variant: "success" },
      );
      await refreshAfterWrite(library.id);
    } catch (error) {
      showToast(errorText(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const runAssistantAction = (action: KnowledgeAssistantAction): void => {
    if (libraries.length === 0) return;
    if (action === "search") {
      openLibrary(libraries[0].id, { autoFocusSearch: true });
      return;
    }
    if (action === "issues") {
      const target =
        libraries.find((library) => library.failedDocumentCount > 0) ?? libraries[0];
      openLibrary(target.id, { issuesOnly: true });
      return;
    }
    const target =
      libraries.find(
        (library) => library.semanticEnabled && library.vectorPendingDocumentCount > 0,
      ) ?? libraries.find((library) => library.semanticEnabled);
    if (!target) {
      showToast(t("knowledge.assistant.noSemanticLibrary"), { variant: "info" });
      return;
    }
    void runIndex(target);
  };

  const refreshActivities = useCallback((): void => {
    void api
      .knowledgeListActivities({ limit: 6 })
      .then((result) => setActivities(result.activities))
      .catch(() => undefined);
    void api
      .knowledgeActivityTrend({ days: 7 })
      .then((result) => setTrend(result.points))
      .catch(() => undefined);
  }, []);

  return (
    <div className="route-scroll">
      <div className={cx("page-frame", "knowledge-page", selected && "is-workbench")}>
        {selected ? (
          <KnowledgeWorkbench
            key={selected.id}
            library={selected}
            documents={documents}
            activities={activities}
            loading={documentsLoading}
            busy={busy}
            autoFocusSearch={detailIntent.autoFocusSearch}
            initialIssuesOnly={detailIntent.issuesOnly}
            onBack={closeLibrary}
            onImport={() => void importFiles(selected.id)}
            onAddNote={() => setNoteOpen(true)}
            onIndex={() => void runIndex(selected)}
            onDeleteLibrary={() => void deleteLibrary(selected)}
            onDeleteDocument={(document) => void deleteDocument(document)}
            onDocumentUpdated={(document) =>
              setDocuments((current) =>
                current.map((row) => (row.id === document.id ? document : row)),
              )
            }
            onSaveFinished={refreshActivities}
          />
        ) : (
          <KnowledgeHub
            libraries={libraries}
            activities={activities}
            trend={trend}
            loading={loading}
            busy={busy}
            onOpen={(id) => openLibrary(id)}
            onCreate={() => setDraft({ ...EMPTY_DRAFT })}
            onRefresh={() => {
              void loadOverview().catch((error: unknown) => {
                showToast(errorText(error), { variant: "error" });
              });
            }}
            onDelete={(library) => void deleteLibrary(library)}
            onIndex={(library) => void runIndex(library)}
            onAssistant={runAssistantAction}
          />
        )}
      </div>

      {draft
        ? portalOverlay(
            <OverlayBackdrop className="overlay knowledge-modal-backdrop" role="presentation">
              <div
                className="dialog knowledge-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("knowledge.newLibrary")}
              >
                <h2>{t("knowledge.newLibrary")}</h2>
                <label className="knowledge-field">
                  <span>{t("knowledge.name")}</span>
                  <Input
                    value={draft.name}
                    autoFocus
                    placeholder={t("knowledge.namePlaceholder")}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label className="knowledge-field">
                  <span>{t("knowledge.description")}</span>
                  <Textarea
                    rows={2}
                    value={draft.description}
                    placeholder={t("knowledge.descriptionPlaceholder")}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </label>
                <label className="knowledge-check">
                  <input
                    type="checkbox"
                    checked={draft.semanticEnabled}
                    onChange={(event) =>
                      setDraft({ ...draft, semanticEnabled: event.target.checked })
                    }
                  />
                  <span>{t("knowledge.semanticToggle")}</span>
                </label>
                {draft.semanticEnabled ? (
                  <div className="knowledge-field-row">
                    <label className="knowledge-field">
                      <span>{t("knowledge.provider")}</span>
                      <Select
                        value={draft.embeddingProviderId}
                        onChange={(event) =>
                          setDraft({ ...draft, embeddingProviderId: event.target.value })
                        }
                      >
                        <option value="">{t("knowledge.providerDefault")}</option>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="knowledge-field">
                      <span>{t("knowledge.model")}</span>
                      <Input
                        value={draft.embeddingModel}
                        placeholder={t("knowledge.modelPlaceholder")}
                        onChange={(event) =>
                          setDraft({ ...draft, embeddingModel: event.target.value })
                        }
                      />
                    </label>
                  </div>
                ) : null}
                <div className="knowledge-modal-actions">
                  <Button size="sm" onClick={() => setDraft(null)}>
                    {t("knowledge.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !draft.name.trim()}
                    onClick={() => void createLibrary()}
                  >
                    {t("knowledge.create")}
                  </Button>
                </div>
              </div>
            </OverlayBackdrop>,
          )
        : null}

      {noteOpen
        ? portalOverlay(
            <OverlayBackdrop className="overlay knowledge-modal-backdrop" role="presentation">
              <div
                className="dialog knowledge-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("knowledge.addNote")}
              >
                <h2>{t("knowledge.addNote")}</h2>
                <label className="knowledge-field">
                  <span>{t("knowledge.noteTitle")}</span>
                  <Input
                    value={noteTitle}
                    autoFocus
                    placeholder={t("knowledge.noteTitlePlaceholder")}
                    onChange={(event) => setNoteTitle(event.target.value)}
                  />
                </label>
                <label className="knowledge-field">
                  <span>{t("knowledge.noteText")}</span>
                  <Textarea
                    rows={6}
                    value={noteText}
                    placeholder={t("knowledge.noteTextPlaceholder")}
                    onChange={(event) => setNoteText(event.target.value)}
                  />
                </label>
                <div className="knowledge-modal-actions">
                  <Button size="sm" onClick={() => setNoteOpen(false)}>
                    {t("knowledge.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !noteTitle.trim() || !noteText.trim()}
                    onClick={() => void saveNote()}
                  >
                    {t("knowledge.save")}
                  </Button>
                </div>
              </div>
            </OverlayBackdrop>,
          )
        : null}
    </div>
  );
}
