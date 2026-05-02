import React, { createContext, useContext, ReactNode } from 'react';
import { getActiveStore } from '../config/activeStore';
import { StorefrontConfig } from '../config/storefronts';

const StorefrontContext = createContext<StorefrontConfig | null>(null);

export const StorefrontProvider = ({ children }: { children: ReactNode }) => {
  const storeConfig = getActiveStore();
  
  return (
    <StorefrontContext.Provider value={storeConfig}>
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
