import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { getActiveStore } from '../config/activeStore';
import { StorefrontConfig } from '../config/storefronts';

interface StorefrontContextValue extends StorefrontConfig {
  isLoadingFromDb: boolean;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

async function fetchDbStoreConfig(storeKey: string): Promise<StorefrontConfig | null> {
  try {
    const res = await fetch(`/api/stores/${encodeURIComponent(storeKey)}/config`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const StorefrontProvider = ({ children }: { children: ReactNode }) => {
  const staticConfig = getActiveStore();
  const [storeConfig, setStoreConfig] = useState<StorefrontConfig>(staticConfig);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(true);

  useEffect(() => {
    fetchDbStoreConfig(staticConfig.storeKey)
      .then((dbConfig) => {
        if (dbConfig) {
          setStoreConfig(dbConfig);
        }
      })
      .finally(() => setIsLoadingFromDb(false));
  }, [staticConfig.storeKey]);

  return (
    <StorefrontContext.Provider value={{ ...storeConfig, isLoadingFromDb }}>
      {children}
    </StorefrontContext.Provider>
  );
};

export const useStorefront = () => {
  const context = useContext(StorefrontContext);
  if (!context) {
    throw new Error('useStorefront must be used within a StorefrontProvider');
  }
  return context;
};
