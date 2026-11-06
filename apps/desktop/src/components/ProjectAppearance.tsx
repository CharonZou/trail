import type { ComponentType, CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectGroupAppearance } from "@trail/shared";
import {
  PROJECT_COLOR_CHOICES,
  PROJECT_ICON_CHOICES,
  projectAppearanceStyle,
  resolveProjectColor,
  type ProjectIconShape,
} from "../lib/project-appearance";
import { PROJECT_UPLOADED_ICON_SHAPES } from "../lib/project-icon-shapes";
import type { IconProps } from "./icons";
import {
  IconBell,
  IconBot,
  IconBug,
  IconCake,
  IconCat,
  IconCoffee,
  IconFlask,
  IconFlower,
  IconFolder,
  IconGhost,
  IconLeaf,
  IconMartini,
  IconMoon,
  IconRocket,
  IconSailboat,
} from "./icons";
import { TooltipButton } from "./ui";

/** Stored icon id -> glyph. An unknown or absent id draws the folder default. */
const PROJECT_ICON_GLYPHS: Record<string, ComponentType<IconProps>> = {
  coffee: IconCoffee,
  martini: IconMartini,
  cake: IconCake,
  moon: IconMoon,
  sailboat: IconSailboat,
  bot: IconBot,
  flower: IconFlower,
  bug: IconBug,
  leaf: IconLeaf,
  cat: IconCat,
  ghost: IconGhost,
  rocket: IconRocket,
  bell: IconBell,
  flask: IconFlask,
};

function projectIconComponent(
  value?: string | null,
): ComponentType<IconProps> {
  return (value ? PROJECT_ICON_GLYPHS[value] : undefined) ?? IconFolder;
}

/**
 * A glyph that ships as path data rather than a Lucide component.
 *
 * Every path paints `currentColor`, so the project's stored tint reaches it the
 * same way it reaches a stroke icon; the source colour only survives as opacity.
 */
function UploadedProjectGlyph({
  shape,
  size,
  style,
}: {
  shape: ProjectIconShape;
  size: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={shape.viewBox}
      aria-hidden
      focusable="false"
      style={style}
    >
      {shape.paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          fill="currentColor"
          fillOpacity={path.opacity}
        />
      ))}
    </svg>
  );
}

/** The artwork behind one stored icon id: a supplied glyph, else a Lucide one. */
function ProjectGlyph({
  value,
  size,
  style,
}: {
  value?: string | null;
  size: number;
  style?: CSSProperties;
}) {
  const shape = value ? PROJECT_UPLOADED_ICON_SHAPES[value] : undefined;
  if (shape) return <UploadedProjectGlyph shape={shape} size={size} style={style} />;
  const Icon = projectIconComponent(value);
  return <Icon size={size} aria-hidden style={style} />;
}

/**
 * The glyph one project row draws: the stored icon in the stored tint.
 *
 * Both halves fall back independently, so a record that only ever carried a
 * colour still gets the folder, and an unknown icon id still gets a tint.
 */
export function ProjectAppearanceGlyph({
  appearance,
  size = 13,
}: {
  appearance?: ProjectGroupAppearance | null;
  size?: number;
}) {
  return (
    <ProjectGlyph
      value={appearance?.icon}
      size={size}
      style={projectAppearanceStyle(appearance)}
    />
  );
}

/**
 * Icon and colour rows for the project dialogs.
 *
 * Create and edit share one component so the tile order, the selected state
 * and the stored pair cannot drift apart between the two entry points.
 */
export function ProjectAppearancePicker({
  appearance,
  idPrefix,
  disabled = false,
  onChange,
}: {
  appearance: ProjectGroupAppearance;
  idPrefix: string;
  disabled?: boolean;
  onChange: (appearance: ProjectGroupAppearance) => void;
}) {
  const { t } = useTranslation();
  const iconHeadingId = `${idPrefix}-appearance-icon-heading`;
  const colorHeadingId = `${idPrefix}-appearance-color-heading`;
  return (
    <>
      <section
        className="project-create-dialog-section project-appearance-section"
        aria-labelledby={iconHeadingId}
      >
        <div className="project-create-dialog-section-head">
          <h3
            id={iconHeadingId}
            className="project-create-dialog-section-title"
          >
            {t("project.appearance.iconLabel")}
          </h3>
        </div>
        <div
          className="project-appearance-row"
          role="group"
          aria-label={t("project.appearance.iconLabel")}
        >
          {PROJECT_ICON_CHOICES.map((choice, index) => {
            const selected =
              index === 0 ? !appearance.icon : appearance.icon === choice.value;
            return (
              <TooltipButton
                key={choice.value ?? "default"}
                type="button"
                className={`project-appearance-tile${
                  selected ? " is-selected" : ""
                }`}
                tooltip={t(choice.labelKey)}
                ariaLabel={`${t("project.appearance.iconLabel")}: ${t(choice.labelKey)}`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onChange({ ...appearance, icon: choice.value })}
              >
                <ProjectGlyph value={choice.value} size={15} />
              </TooltipButton>
            );
          })}
        </div>
      </section>

      <section
        className="project-create-dialog-section project-appearance-section"
        aria-labelledby={colorHeadingId}
      >
        <div className="project-create-dialog-section-head">
          <h3
            id={colorHeadingId}
            className="project-create-dialog-section-title"
          >
            {t("project.appearance.colorLabel")}
          </h3>
        </div>
        <div
          className="project-appearance-row"
          role="group"
          aria-label={t("project.appearance.colorLabel")}
        >
          {PROJECT_COLOR_CHOICES.map((choice, index) => {
            const tint = resolveProjectColor(choice.value);
            const selected =
              index === 0 ? !appearance.color : appearance.color === choice.value;
            return (
              <TooltipButton
                key={choice.value ?? "auto"}
                type="button"
                className={`project-appearance-swatch${
                  selected ? " is-selected" : ""
                }`}
                tooltip={t(choice.labelKey)}
                ariaLabel={`${t("project.appearance.colorLabel")}: ${t(choice.labelKey)}`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onChange({ ...appearance, color: choice.value })}
              >
                <span
                  className="project-appearance-swatch-dot"
                  aria-hidden
                  style={tint ? { background: tint } : undefined}
                />
              </TooltipButton>
            );
          })}
        </div>
      </section>
    </>
  );
}
