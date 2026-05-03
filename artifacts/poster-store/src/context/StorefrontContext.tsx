// @refresh reset
import React, { ReactNode, useState, useEffect, useContext } from 'react';
import { getActiveStore, DEFAULT_STORE_KEY } from '../config/activeStore';
import { StorefrontConfig } from '../config/storefronts';
import { StorefrontContext, StorefrontContextValue } from './storefrontContextDef';

export type { StorefrontContextValue };
export { StorefrontContext };

interface StoreSummary {
  storeKey: string;
  primaryDomain: string | null;
  domainAliases: string[] | null;
  routePrefix: string | null;
  active: boolean;
}

async function fetchAllActiveStores(): Promise<StoreSummary[]> {
  try {
    const res = await fetch('/api/stores');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchDbStoreConfig(storeKey: string): Promise<StorefrontConfig | null> {
  try {
    const res = await fetch(`/api/stores/${encodeURIComponent(storeKey)}/config`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Resolves the active storeKey and any route prefix from the current URL.
 *
 * Priority:
 *   1. Route prefix  — first path segment matches a store's routePrefix
 *   2. Domain mapping — hostname matches primaryDomain or domainAliases
 *   3. Env/default fallback — DEFAULT_STORE_KEY / 'postsofspain'
 */
function resolveStore(
  stores: StoreSummary[],
  hostname: string,
  pathname: string
): { storeKey: string; routePrefix: string | null } {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  // 1. Route prefix — skip known top-level pages, admin, and policy pages
  const SKIP_SEGMENTS = new Set([
    'admin', 'shop', 'posters', 'poster', 'cart', 'checkout',
    'order', 'favorites', 'login', 'register', 'account',
    'shipping', 'returns', 'privacy', 'terms', 'contact', 'about',
  ]);

  if (firstSegment && !SKIP_SEGMENTS.has(firstSegment)) {
    const byPrefix = stores.find((s) => s.routePrefix === firstSegment);
    if (byPrefix) {
      return { storeKey: byPrefix.storeKey, routePrefix: firstSegment };
    }
  }

  // 2. Domain mapping
  const cleanHost = hostname.replace(/^www\./i, '').toLowerCase();
  if (cleanHost && cleanHost !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+/.test(cleanHost)) {
    const byDomain = stores.find((s) => {
      const pd = s.primaryDomain?.replace(/^www\./i, '').toLowerCase();
      if (pd && pd === cleanHost) return true;
      const aliases = s.domainAliases ?? [];
      return aliases.some((a) => a.replace(/^www\./i, '').toLowerCase() === cleanHost);
    });
    if (byDomain) {
      return { storeKey: byDomain.storeKey, routePrefix: null };
    }
  }

  // 3. Default fallback
  return { storeKey: DEFAULT_STORE_KEY, routePrefix: null };
}

export const StorefrontProvider = ({ children }: { children: ReactNode }) => {
  const staticConfig = getActiveStore();
  const [storeConfig, setStoreConfig] = useState<StorefrontConfig>(staticConfig);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(true);
  const [resolvedRoutePrefix, setResolvedRoutePrefix] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stores = await fetchAllActiveStores();

      if (cancelled) return;

      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

      const { storeKey, routePrefix } = resolveStore(stores, hostname, pathname);

      if (!cancelled) {
        setResolvedRoutePrefix(routePrefix);
      }

      const dbConfig = await fetchDbStoreConfig(storeKey);

      if (!cancelled) {
        if (dbConfig) {
          setStoreConfig(dbConfig);
        } else {
          const { storefronts } = await import('../config/storefronts');
          const staticFallback = storefronts[storeKey];
          if (staticFallback) setStoreConfig(staticFallback);
        }
        setIsLoadingFromDb(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StorefrontContext.Provider value={{ ...storeConfig, isLoadingFromDb, resolvedRoutePrefix }}>
      {children}
    </StorefrontContext.Provider>
  );
};

export const useStorefront = (): StorefrontContextValue => {
  const context = useContext(StorefrontContext);
  if (!context) {
    throw new Error('useStorefront must be used within a StorefrontProvider');
  }
  return context;
};
