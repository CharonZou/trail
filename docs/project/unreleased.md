# Unreleased changes

Nothing is merged-but-unreleased after 1.0.5 (2026-11-24). The five items this
file carried — Fast mode, runtime-rebuild prompt cache, Chinese IME slash alias,
regenerated-prompt ordering, and visualization preload — shipped in that release
and now live in the in-app changelog (`packages/shared/src/changelog-*.ts`)
instead of here.

Add an entry here only when a merge is user-visible and has not shipped yet, and
move it into the next changelog entry when that version ships.

## Knowledge document workbench (P1)

Opening a knowledge library now lands on a three-column document workbench
instead of a list page: a document/outline catalog on the left, a reader with
hero stats and editable Markdown in the middle, and a rail with a computed
document health gauge, document information, index status, related documents,
and the document's own activity trail. Markdown and plain-text bodies are stored
in the database, backfilled on first read for existing rows, and editable with
`knowledge.saveDocumentContent`, which re-chunks the document and clears its
vectors. The Ask AI, Wiki, and Graph tabs are explicit next-phase placeholders.
