/**
 * Canonical list of font choices used across the admin UI.
 * Used in Store Settings / Brand & Typography and the Homepage Editor.
 */
export const STORE_FONT_OPTIONS = [
  "System default",
  "Playfair Display",
  "Cormorant Garamond",
  "Lora",
  "Libre Baskerville",
  "Merriweather",
  "Inter",
  "DM Sans",
  "Source Sans 3",
  "Manrope",
] as const;

export type StoreFontOption = (typeof STORE_FONT_OPTIONS)[number];

/** Sentinel value used in Select components to represent "no override / inherit". */
export const INHERIT_FONT_VALUE = "__inherit__" as const;
