#!/usr/bin/env python3
"""Derive Trail platform icon resources from the canonical logo.

The tracked ``apps/desktop/build/icon_1024.png`` file is the brand raster: a
flat render of the ``docs/public/brand-mark.svg`` vector master. This script
preserves that file and emits:

  apps/desktop/build/icon.iconset/  - all macOS iconset sizes
  apps/desktop/build/icon.icns      - via `iconutil` (macOS only)
  apps/desktop/build/icon.ico       - multi-size Windows application icon
  apps/desktop/build/icon.png       - 512px Windows/Linux package icon
  apps/desktop/build/logo_dark.png  - 1254px documentation brand lockup
  apps/desktop/build/tray-icon-mac.png - transparent macOS template icon

Run: python3 scripts/make-icon.py
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "apps" / "desktop" / "build"
SOURCE = BUILD / "icon_1024.png"

BASE = 1024


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"canonical logo is missing: {SOURCE}")

    with Image.open(SOURCE) as source:
        master = source.convert("RGBA")
    if master.size != (BASE, BASE):
        raise ValueError(
            f"canonical logo must be {BASE}x{BASE}, got {master.width}x{master.height}"
        )

    BUILD.mkdir(parents=True, exist_ok=True)
    windows_icon = BUILD / "icon.ico"
    master.save(
        windows_icon,
        format="ICO",
        sizes=[
            (16, 16),
            (24, 24),
            (32, 32),
            (48, 48),
            (64, 64),
            (128, 128),
            (256, 256),
        ],
    )
    package_icon = BUILD / "icon.png"
    master.resize((512, 512), Image.LANCZOS).save(package_icon)
    logo_dark = BUILD / "logo_dark.png"
    master.resize((1254, 1254), Image.LANCZOS).save(logo_dark)

    # macOS menu bar icons are template images: the system tints every opaque
    # pixel, so the silhouette has to be the bar glyph alone. Reusing the app
    # icon would fill the menu bar with the black plate. The plate is pure
    # black, which makes the bars exactly the pixels that carry light.
    bar_alpha = master.convert("L").point(lambda value: min(255, value * 6))
    tray_alpha = ImageChops.multiply(bar_alpha, master.getchannel("A"))
    glyph_bounds = tray_alpha.getbbox()
    if glyph_bounds is None:
        raise ValueError("canonical logo does not contain the bar glyph")
    glyph = tray_alpha.crop(glyph_bounds)
    # Normalise the ink box to three quarters of the tile so the glyph keeps the
    # same menu bar weight the app icon has, then centre it.
    glyph_scale = (BASE * 3 / 4) / max(glyph.size)
    glyph = glyph.resize(
        (
            round(glyph.width * glyph_scale),
            round(glyph.height * glyph_scale),
        ),
        Image.LANCZOS,
    )
    tray_canvas = Image.new("L", master.size, 0)
    tray_canvas.paste(
        glyph,
        ((BASE - glyph.width) // 2, (BASE - glyph.height) // 2),
    )
    tray_icon_mac = Image.new("RGBA", master.size, (0, 0, 0, 0))
    tray_icon_mac.putalpha(tray_canvas)
    tray_icon_mac_path = BUILD / "tray-icon-mac.png"
    tray_icon_mac.save(tray_icon_mac_path)

    iconset = BUILD / "icon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()
    sizes = [16, 32, 128, 256, 512]
    for sz in sizes:
        master.resize((sz, sz), Image.LANCZOS).save(iconset / f"icon_{sz}x{sz}.png")
        master.resize((sz * 2, sz * 2), Image.LANCZOS).save(
            iconset / f"icon_{sz}x{sz}@2x.png"
        )

    iconutil = shutil.which("iconutil")
    if iconutil is None:
        print(f"used {SOURCE}")
        print(f"wrote {windows_icon}")
        print(f"wrote {package_icon}")
        print(f"wrote {logo_dark}")
        print(f"wrote {tray_icon_mac_path}")
        print("skipped icon.icns (iconutil is unavailable)")
        return

    icns = BUILD / "icon.icns"
    subprocess.run(
        [iconutil, "-c", "icns", str(iconset), "-o", str(icns)], check=True
    )
    print(f"used {SOURCE}")
    print(f"wrote {windows_icon}")
    print(f"wrote {package_icon}")
    print(f"wrote {logo_dark}")
    print(f"wrote {tray_icon_mac_path}")
    print(f"wrote {icns}")


if __name__ == "__main__":
    main()
