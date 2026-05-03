import { storefronts, StorefrontConfig } from "./storefronts";

export const DEFAULT_STORE_KEY: string =
  import.meta.env.VITE_ACTIVE_STORE_KEY ?? "postsofspain";

export const ACTIVE_STORE_KEY = DEFAULT_STORE_KEY;

export const getActiveStore = (): StorefrontConfig => {
  return storefronts[DEFAULT_STORE_KEY] || storefronts["postsofspain"];
};
