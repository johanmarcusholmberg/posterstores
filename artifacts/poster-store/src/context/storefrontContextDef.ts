import { createContext } from 'react';
import type { StorefrontConfig } from '../config/storefronts';

export interface StorefrontContextValue extends StorefrontConfig {
  isLoadingFromDb: boolean;
  resolvedRoutePrefix: string | null;
}

/**
 * Defined in its own module so the context object identity is stable across
 * Vite HMR reloads of StorefrontContext.tsx. If createContext were called
 * inside StorefrontContext.tsx, every HMR invalidation would produce a new
 * context object while the mounted Provider still held the old one, causing
 * "useStorefront must be used within a StorefrontProvider" errors.
 */
export const StorefrontContext = createContext<StorefrontContextValue | null>(null);
