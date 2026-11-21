import type { ChangelogEntry } from "./changelog.js";

export const enEntries: ChangelogEntry[] = [
  {
    version: "1.0.4",
    date: "2026-11-20",
    highlights: [
      "Adds Asset Center as a first-class sidebar destination, bringing Overview, Memory, Skills and Subagents into one unified workspace instead of sending each management task through a separate settings route.",
      "Overview summarizes built-in and user-owned assets, distinguishes global from project scope, and surfaces current memory and capability counts before you drill into a tab.",
      "Memory supports project and project-group selection, search, quick entry creation, editing and saving, using the same host-owned memory as the existing project memory dialog.",
      "The shared memory editor migrates legacy text into structured entries, normalizes IDs and empty items, and protects unsaved drafts by blocking project changes while edits are pending.",
      "Skills uses the complete existing capability manager for global and project skills, including creation, editing, enablement, import, movement and directory management rather than a read-only summary.",
      "Subagents provides the full built-in and user-agent catalog with its existing creation, editing and enablement workflows, so asset management no longer splits between multiple pages.",
      "Visited tabs remain mounted and the Asset Center route is lazy-loaded, letting you switch between overview and editors without clearing drafts or reloading the whole workbench.",
      "Versioned JSON backup captures a fresh host snapshot on export, including current project or project-group memory plus user skills and user subagents in global and current-project scopes.",
      "Backups include user skill and subagent content needed for restoration while excluding built-in documents and credentials; no second renderer-owned persistence store is introduced.",
      "Ships with localized copy in all nine interface languages, responsive layouts and reduced-motion styling, plus regression coverage for navigation, migration, backup and host boundaries.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-11-17",
    highlights: [
      "Settings › General › Appearance introduces a window layout switch: whole-window mode keeps one continuous workbench, while floating-card mode raises the main area into a rounded card above the sidebar ground.",
      "Floating-card mode also brings the right work panel into the same rounded surface, so the dock reads as part of the workspace rather than a separate column.",
      "The Settings page has its own full-page or floating-layer presentation, selectable from the same Appearance section without changing the conversation layout preference.",
      "The thinking slider gains a clearer header with the current level and Ctrl+T hint, a green-to-blue gradient rail with six stops, and flowing light particles at the highest level.",
      "Ctrl+T cycles through thinking levels directly from the composer, making keyboard-only model adjustment possible without opening the model menu.",
      "The composer model chip now uses each provider's own brand mark, making similarly named models easier to distinguish at a glance.",
      "Project folders can open from the sidebar in VS Code, Trae or IntelliJ IDEA, with editor discovery through PATH, common install locations or Windows App Paths.",
      "Opening a project with an unavailable editor now reports the problem explicitly instead of guessing another executable or failing without a useful explanation.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-06",
    highlights: [
      "Each project can have its own workspace icon and colour, shown directly on its sidebar row so projects are easier to recognize than with one repeated folder glyph.",
      "Project creation and editing expose an independent workspace-index switch, allowing indexing to be disabled only for the projects that do not need it.",
      "When workspace indexing is off, @ suggestions stop listing files while paths already referenced in conversations continue to resolve normally.",
      "The home screen adds a Token usage card above the composer with a 12-month total and a day-by-day heat strip for spotting activity patterns.",
      "The same usage card can break the total down by model, making it easier to understand which models account for recent consumption.",
      "A new Window card in Settings provides direct minimize and full-screen actions without relying on the operating-system menu bar.",
      "Provider lists display official marks for more services, including Mistral, Kimi and Moonshot, improving recognition across model configuration.",
      "The application icon is unified as a clean brand mark across window surfaces, including the Windows taskbar and Alt+Tab application switcher.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-04",
    highlights: [
      "Initial Trail release: a local-first desktop workspace for AI agents where projects, sessions, reviews, previews and agents share one persistent environment.",
      "Runs as a standalone application rather than an IDE extension or terminal front end, with workspace data kept on your own computer.",
      "Connects cloud models, local models, custom endpoints and compatible APIs through one workflow, so changing providers does not require rebuilding the workspace.",
      "Stores conversations with per-turn token usage and elapsed time, keeping both the transcript and its execution context available when you return.",
      "Supports parallel conversations within one project, each isolated in its own Git worktree to reduce conflicts between concurrent tasks.",
      "Delegates work to subagents and coordinates multiple worker sessions in parallel while preserving the main conversation as the coordination surface.",
      "Extends the workspace through plugins that can contribute panels, views, tools, MCP servers, themes and background services.",
      "Available on macOS, Windows and Linux, providing the same local-first agent workflow across all three desktop platforms.",
    ],
  },
];
