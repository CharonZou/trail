import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useBlockingOverlay } from "../lib/blocking-overlay";
import { ProjectMemoryEditor, type ProjectMemoryProject } from "./ProjectMemoryEditor";
import { OverlayBackdrop, TooltipButton } from "./ui";
import { IconClose, IconSparkles } from "./icons";

export function ProjectMemoryDialog({
  project,
  onClose,
  onSaved,
  onError,
}: {
  project: ProjectMemoryProject;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  useBlockingOverlay();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const dialog = (
    <OverlayBackdrop
      className="overlay project-instructions-dialog-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="dialog project-instructions-dialog project-memory-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-memory-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="project-instructions-dialog-head">
          <div>
            <h3 id="project-memory-dialog-title" className="project-instructions-dialog-title">
              <IconSparkles size={17} aria-hidden />
              {t("project.editMemory")}
            </h3>
            <div className="project-instructions-dialog-project">{project.name}</div>
          </div>
          <TooltipButton
            type="button"
            className="project-instructions-dialog-close"
            tooltip={t("settings.cancel")}
            ariaLabel={t("settings.cancel")}
            disabled={saving}
            onClick={onClose}
          >
            <IconClose size={16} />
          </TooltipButton>
        </div>
        <p className="project-memory-dialog-description">{t("project.memoryDescription")}</p>
        <ProjectMemoryEditor
          project={project}
          onSaved={onSaved}
          onError={onError}
          onCancel={onClose}
          onSavingChange={setSaving}
        />
      </div>
    </OverlayBackdrop>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
