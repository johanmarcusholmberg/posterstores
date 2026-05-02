import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { storefronts } from "@/config/storefronts";

const ADMIN_TOKEN_KEY = "admin_token";
const ADMIN_STORE_KEY = "admin_active_store";

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
    const keys = Object.keys(storefronts);
    return stored && keys.includes(stored) ? stored : keys[0] ?? "postsofspain";
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
