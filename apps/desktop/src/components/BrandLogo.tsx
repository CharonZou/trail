import { useEffect, useState } from "react";
// Renderer-sized copies of the brand marks. The 1024px masters in build/ are
// installer icons for electron-builder; BrandLogo never renders above 64px.
import brandLogoUrlLight from "../assets/brand/logo-light.png";
import brandLogoUrlDark from "../assets/brand/logo-dark.png";
import { appIconUrl } from "../lib/app-icon-favicon";
import { useAppIconState } from "../lib/app-icon-store";

/**
 * The in-app brand mark. It follows the selected app icon style and appearance
 * so the sidebar and startup logo match the icon the user picked, and falls
 * back to the shipped brand mark when the record has not loaded yet.
 */
export function BrandLogo({ size = 16 }: { size?: number }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme !== "light");
  const icon = useAppIconState();

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setDark(el.dataset.theme !== "light");
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const src = icon
    ? appIconUrl(icon.style, icon.appearance, dark)
    : dark
      ? brandLogoUrlDark
      : brandLogoUrlLight;

  return (
    <img
      className="brand-logo"
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
    />
  );
}
