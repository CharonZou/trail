import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useId } from "react";
import { ComposerModelList } from "./ComposerModelList";
import { AnchoredMenu } from "../../../components/settings/AnchoredMenu";
import { IconBot, IconChevronDown, IconZap } from "../../../components/icons";
import { TooltipButton } from "../../../components/ui";
import { useAppStore } from "../../../stores/app-store";
import { brandGlyphForProvider, type BrandGlyph } from "../../../components/settings/provider-brand-icons";
import type { useComposerModelMenu } from "./hooks/useComposerModelMenu";
import { ThinkingLevelSlider } from "./ThinkingLevelSlider";

type ModelMenuController = ReturnType<typeof useComposerModelMenu>;

export type ComposerModelPickerProps = {
  t: TFunction;
  controller: ModelMenuController;
  modelLabel: string;
  thinkingLabel: string;
  thinkingLevel: string;
  /** The selected model asks for OpenAI's priority tier (ADR 0334). */
  fastMode?: boolean;
  selectedProviderId?: string;
  selectedModelId?: string;
  controlsBlocked: boolean;
  onCloseOtherMenus: () => void;
  rootActions?: ReactNode;
};

/** Model/reasoning picker with its keyboard and focus contract intact. */
export function ComposerModelPicker({
  t,
  controller,
  modelLabel,
  thinkingLabel,
  thinkingLevel,
  fastMode = false,
  selectedProviderId,
  selectedModelId,
  controlsBlocked,
  onCloseOtherMenus,
  rootActions,
}: ComposerModelPickerProps) {
  const {
    open,
    setOpen,
    otherModelsExpanded,
    setOtherModelsExpanded,
    hasOtherModels,
    query,
    setQuery,
    modelHighlight,
    setModelHighlight,
    modelSearchRef,
    modelListRef,
    modelGroups,
    recentEntries,
    thinkingMenuLevels,
    selectModel,
    commitThinkingLevel,
    onMenuKeyDown,
  } = controller;
  const fastSuffix = fastMode ? ` · ${t("chat.fastModeBadge")}` : "";
  const providers = useAppStore((s) => s.providers);
  const activeProvider = providers.find((p) => p.id === selectedProviderId);
  const brandGlyph = activeProvider ? brandGlyphForProvider(activeProvider) : undefined;
  const brandScope = useId().replace(/[^A-Za-z0-9_-]/g, "");

  return (
    <AnchoredMenu
      className="composer-model-thinking"
      open={open}
      onClose={() => setOpen(false)}
      menuClassName="composer-model-menu composer-model-thinking-menu"
      label={`${t("chat.model")} ${t("chat.reasoningLevel")}`}
      role="menu"
      align="end"
      side="top"
      initialFocus="input"
      onMenuKeyDown={onMenuKeyDown}
      trigger={(ref) => (
        <TooltipButton
          ref={ref}
          type="button"
          className={`icon-btn composer-model-thinking-chip ${open ? "active" : ""}`}
          tooltip={`${modelLabel} · ${t("chat.reasoningLevel")}: ${thinkingLabel}${fastSuffix}`}
          ariaLabel={`${t("chat.model")}: ${modelLabel}. ${t("chat.reasoningLevel")}: ${thinkingLabel}${fastSuffix}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={controlsBlocked}
          onClick={() => {
            onCloseOtherMenus();
            if (!open) {
              setOtherModelsExpanded(false);
              setQuery("");
              setModelHighlight(-1);
            }
            setOpen((current) => !current);
          }}
        >
          <span className="composer-model-thinking-icon" aria-hidden="true">
            {brandGlyph ? <BrandMarkInline glyph={brandGlyph} scope={brandScope} size={14} /> : <IconBot size={14} />}
          </span>
          <span className="composer-model-thinking-model">{modelLabel}</span>
          {thinkingLevel !== "off" ? (
            <span className="composer-model-thinking-level">{thinkingLabel}</span>
          ) : null}
          {fastMode ? (
            <span className="composer-model-thinking-fast" aria-hidden="true">
              <IconZap size={12} />
            </span>
          ) : null}
          <IconChevronDown size={12} aria-hidden="true" className="composer-model-thinking-chevron" />
        </TooltipButton>
      )}
    >
      <div className="composer-menu-root" onMouseMove={() => setModelHighlight(-1)} onMouseLeave={() => setModelHighlight(-1)}>
        {rootActions}
        <ComposerModelList
          t={t} query={query} setQuery={setQuery}
          modelSearchRef={modelSearchRef} modelListRef={modelListRef}
          modelGroups={modelGroups} modelHighlight={modelHighlight}
          recentEntries={recentEntries} hasOtherModels={hasOtherModels}
          otherModelsExpanded={otherModelsExpanded}
          setOtherModelsExpanded={setOtherModelsExpanded}
          setModelHighlight={setModelHighlight} selectModel={selectModel}
          selectedProviderId={selectedProviderId} selectedModelId={selectedModelId}
        />
        {thinkingMenuLevels.length > 1 ? (
          <ThinkingLevelSlider
            key={`${selectedProviderId}:${selectedModelId}:${thinkingMenuLevels.join("|")}`}
            levels={thinkingMenuLevels}
            level={thinkingLevel}
            label={t("chat.reasoningLevel")}
            title={t("chat.thinkingLevelTitle")}
            displayLabel={thinkingLabel}
            commit={commitThinkingLevel}
          />
        ) : null}
      </div>
    </AnchoredMenu>
  );
}

function BrandMarkInline({ glyph, scope, size }: { glyph: BrandGlyph; scope: string; size: number }) {
  return (
    <svg viewBox={glyph.viewBox} width={size} height={size} aria-hidden="true">
      {glyph.gradients ? (
        <defs>
          {glyph.gradients.map((gradient) => (
            <linearGradient
              key={gradient.id}
              id={`composer-brand-${gradient.id}-${scope}`}
              gradientUnits="userSpaceOnUse"
              x1={gradient.x1}
              y1={gradient.y1}
              x2={gradient.x2}
              y2={gradient.y2}
            >
              {gradient.stops.map((stop, index) => (
                <stop
                  key={index}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={stop.opacity}
                />
              ))}
            </linearGradient>
          ))}
        </defs>
      ) : null}
      {glyph.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          style={{
            fill: path.gradient
              ? `url(#composer-brand-${path.gradient}-${scope})`
              : (path.fill ?? "currentColor"),
          }}
          fillRule={path.fillRule}
        />
      ))}
    </svg>
  );
}
