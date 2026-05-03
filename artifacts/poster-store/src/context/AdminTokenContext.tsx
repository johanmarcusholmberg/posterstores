import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { storefronts } from "@/config/storefronts";

const ADMIN_TOKEN_KEY = "admin_token";
const ADMIN_STORE_KEY = "admin_active_store";

const DEFAULT_STORE_KEY = Object.keys(storefronts)[0] ?? "postsofspain";

interface AdminTokenContextValue {
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  adminStoreKey: string;
  setAdminStoreKey: (key: string) => void;
}

const AdminTokenContext = createContext<AdminTokenContextValue | null>(null);

export const AdminTokenProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  });

  const [adminStoreKey, setAdminStoreKeyState] = useState<string>(() => {
    const stored = localStorage.getItem(ADMIN_STORE_KEY);
    // Accept any non-empty stored key — DB stores may not be in the static list
    return stored && stored.length > 0 ? stored : DEFAULT_STORE_KEY;
  });

  const setToken = useCallback((t: string) => {
    localStorage.setItem(ADMIN_TOKEN_KEY, t);
    setTokenState(t);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setTokenState(null);
  }, []);

  const setAdminStoreKey = useCallback((key: string) => {
    localStorage.setItem(ADMIN_STORE_KEY, key);
    setAdminStoreKeyState(key);
  }, []);

  return (
    <AdminTokenContext.Provider value={{ token, setToken, clearToken, adminStoreKey, setAdminStoreKey }}>
      {children}
    </AdminTokenContext.Provider>
  );
};

export const useAdminToken = () => {
  const ctx = useContext(AdminTokenContext);
  if (!ctx) throw new Error("useAdminToken must be used within AdminTokenProvider");
  return ctx;
};
