import { dialog, type BrowserWindow } from "electron";
import { IPC } from "@trail/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";

export type KnowledgeIpcDependencies = {
  registrar: IpcRegistrar;
  getHost: () => HostProcess | null;
  getMainWindow: () => BrowserWindow | null;
};

/**
 * The picker filter mirrors the host's accepted extensions rather than a
 * second hand-written list: the host is authoritative, and a file the picker
 * hides is a file the user cannot import.
 */
function importFilters(extensions: string[]) {
  return [
    { name: "Documents", extensions },
    { name: "All files", extensions: ["*"] },
  ];
}

function requireHost(getHost: () => HostProcess | null): HostProcess {
  const host = getHost();
  if (!host) throw new Error("host unavailable");
  return host;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} required`);
  return value.trim();
}

/**
 * The renderer never supplies import paths: `knowledge.importFiles` opens the
 * native picker here and forwards the user-chosen absolute paths to host-core,
 * which validates them again.
 */
export function registerKnowledgeIpc({
  registrar,
  getHost,
  getMainWindow,
}: KnowledgeIpcDependencies): void {
  registrar.handle(IPC.invoke.knowledgeListLibraries, async () =>
    requireHost(getHost).call("knowledge.listLibraries"),
  );

  registrar.handle(IPC.invoke.knowledgeCreateLibrary, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("library input required");
    return requireHost(getHost).call("knowledge.createLibrary", input);
  });

  registrar.handle(IPC.invoke.knowledgeUpdateLibrary, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("library input required");
    return requireHost(getHost).call("knowledge.updateLibrary", input);
  });

  registrar.handle(IPC.invoke.knowledgeDeleteLibrary, async (id: unknown) =>
    requireHost(getHost).call("knowledge.deleteLibrary", { id: requireString(id, "id") }),
  );

  registrar.handle(IPC.invoke.knowledgeListDocuments, async (libraryId: unknown) =>
    requireHost(getHost).call("knowledge.listDocuments", {
      libraryId: requireString(libraryId, "libraryId"),
    }),
  );

  registrar.handle(IPC.invoke.knowledgeGetDocument, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("document query required");
    const { libraryId, documentId } = input as {
      libraryId?: unknown;
      documentId?: unknown;
    };
    return requireHost(getHost).call("knowledge.getDocument", {
      libraryId: requireString(libraryId, "libraryId"),
      documentId: requireString(documentId, "documentId"),
    });
  });

  registrar.handle(IPC.invoke.knowledgeGetDocumentContent, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("document query required");
    const { libraryId, documentId } = input as {
      libraryId?: unknown;
      documentId?: unknown;
    };
    return requireHost(getHost).call("knowledge.getDocumentContent", {
      libraryId: requireString(libraryId, "libraryId"),
      documentId: requireString(documentId, "documentId"),
    });
  });

  registrar.handle(IPC.invoke.knowledgeSaveDocumentContent, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("document body required");
    const { libraryId, documentId, content } = input as {
      libraryId?: unknown;
      documentId?: unknown;
      content?: unknown;
    };
    if (typeof content !== "string") throw new Error("content required");
    // The body is forwarded byte-for-byte: trimming it here would silently
    // rewrite the user's Markdown before the host rechunks it.
    return requireHost(getHost).call("knowledge.saveDocumentContent", {
      libraryId: requireString(libraryId, "libraryId"),
      documentId: requireString(documentId, "documentId"),
      content,
    });
  });

  registrar.handle(IPC.invoke.knowledgeImportFiles, async (libraryId: unknown) => {
    const id = requireString(libraryId, "libraryId");
    const host = requireHost(getHost);
    const supported = await host.call<{ extensions: string[] }>(
      "knowledge.supportedExtensions",
    );
    const filters = importFilters(supported.extensions);
    const window = getMainWindow();
    const selection = window
      ? await dialog.showOpenDialog(window, {
          title: "Import to knowledge base",
          properties: ["openFile", "multiSelections"],
          filters,
        })
      : await dialog.showOpenDialog({
          title: "Import to knowledge base",
          properties: ["openFile", "multiSelections"],
          filters,
        });
    if (selection.canceled || selection.filePaths.length === 0) return { outcomes: [] };
    return host.call("knowledge.importFiles", { libraryId: id, paths: selection.filePaths });
  });

  registrar.handle(IPC.invoke.knowledgeImportText, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("text input required");
    return requireHost(getHost).call("knowledge.importText", input);
  });

  registrar.handle(IPC.invoke.knowledgeDeleteDocument, async (id: unknown) =>
    requireHost(getHost).call("knowledge.deleteDocument", { id: requireString(id, "id") }),
  );

  registrar.handle(IPC.invoke.knowledgeSearch, async (input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("search input required");
    return requireHost(getHost).call("knowledge.search", input);
  });

  registrar.handle(IPC.invoke.knowledgeIndexLibrary, async (libraryId: unknown) =>
    requireHost(getHost).call("knowledge.indexLibrary", {
      libraryId: requireString(libraryId, "libraryId"),
    }),
  );

  registrar.handle(IPC.invoke.knowledgeSupportedExtensions, async () =>
    requireHost(getHost).call("knowledge.supportedExtensions"),
  );

  registrar.handle(IPC.invoke.knowledgeListActivities, async (input: unknown) => {
    if (input !== undefined && (input === null || typeof input !== "object")) {
      throw new Error("activity query must be an object");
    }
    return requireHost(getHost).call("knowledge.listActivities", input ?? {});
  });

  registrar.handle(IPC.invoke.knowledgeActivityTrend, async (input: unknown) => {
    if (input !== undefined && (input === null || typeof input !== "object")) {
      throw new Error("trend query must be an object");
    }
    return requireHost(getHost).call("knowledge.activityTrend", input ?? {});
  });
}
