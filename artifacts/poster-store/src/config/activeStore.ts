import { storefronts, StorefrontConfig } from "./storefronts";

export const ACTIVE_STORE_KEY = "postsofspain";

export const getActiveStore = (): StorefrontConfig => {
  return storefronts[ACTIVE_STORE_KEY] || storefronts["postsofspain"];
};
