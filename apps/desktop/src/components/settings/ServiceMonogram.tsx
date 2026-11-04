/**
 * The tile that leads an AI service (D625): its brand mark where this build
 * carries one, otherwise the first letter of its name, and the generic server
 * glyph when the name holds no letter at all.
 *
 * Only the host's own table supplies a mark, never a service or a plugin, so
 * nothing outside this repository paints host chrome. Monochrome marks use the
 * tile's text colour, coloured marks carry their own, and one brand whose colour
 * only reads on one plate resolves through a theme token instead.
 */
import { useId } from "react";
import { IconServer, withScaledIconStyle } from "../icons";
import type { BrandGlyph } from "./provider-brand-icons";
import { monogramLetter } from "./service-row-status";

/** A mark reads at a glance without crowding the 28px tile. */
const MARK_SIZE = 16;

export type ServiceMonogramProps = {
  name: string;
  glyph?: BrandGlyph;
};

export function ServiceMonogram({ name, glyph }: ServiceMonogramProps) {
  const letter = monogramLetter(name);
  return (
    <span className="service-monogram" aria-hidden>
      {glyph ? <BrandMark glyph={glyph} /> : letter || <IconServer size={14} />}
    </span>
  );
}

function BrandMark({ glyph }: { glyph: BrandGlyph }) {
  // Gradient ids are document-global and one mark can sit on a row, a tile and
  // the form chip at once, so each tile scopes its own <defs>.
  const scope = useId().replace(/[^A-Za-z0-9_-]/g, "");
  return (
    <svg viewBox={glyph.viewBox} style={withScaledIconStyle(MARK_SIZE)}>
      {glyph.gradients ? (
        <defs>
          {glyph.gradients.map((gradient) => (
            <linearGradient
              key={gradient.id}
              id={`pi-brand-${gradient.id}-${scope}`}
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
          /* Paint through `style`, not the `fill` attribute: a theme token in a
             presentation attribute is not substituted, and one mark is themed. */
          style={{
            fill: path.gradient
              ? `url(#pi-brand-${path.gradient}-${scope})`
              : (path.fill ?? "currentColor"),
          }}
          fillRule={path.fillRule}
        />
      ))}
    </svg>
  );
}
