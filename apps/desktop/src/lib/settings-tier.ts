import type { AppSettings } from "@trail/shared";

/** The Settings page size tier, as the shell and the page both see it. */
export type SettingsTier = NonNullable<AppSettings["settingsLayout"]>;

/**
 * An absent preference is the shipped full-window takeover, so upgrading never
 * changes what an existing profile already sees. One resolver because two
 * surfaces read the same persisted field: the page restyles itself and the
 * shell decides whether the app tree keeps painting under the scrim.
 */
export function settingsTierOf(
  settings: Pick<AppSettings, "settingsLayout"> | null | undefined,
): SettingsTier {
  return settings?.settingsLayout === "compact" ? "compact" : "full";
}

/** The tier one press on the swap control moves to. */
export function nextSettingsTier(tier: SettingsTier): SettingsTier {
  return tier === "compact" ? "full" : "compact";
}
