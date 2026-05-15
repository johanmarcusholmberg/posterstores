import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { storefronts } from "@/config/storefronts";

const ADMIN_STORE_KEY = "admin_active_store";

const DEFAULT_STORE_KEY = Object.keys(storefronts)[0] ?? "postsofspain";

interface AdminTokenContextValue {
  isAuthenticated: boolean | null;
  login: () => void;
  logout: () => void;
  adminStoreKey: string;
  setAdminStoreKey: (key: string) => void;
}

const AdminTokenContext = createContext<AdminTokenContextValue | null>(null);

export const AdminTokenProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [adminStoreKey, setAdminStoreKeyState] = useState<string>(() => {
    const stored = localStorage.getItem(ADMIN_STORE_KEY);
    return stored && stored.length > 0 ? stored : DEFAULT_STORE_KEY;
  });

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "include" })
      .then((res) => setIsAuthenticated(res.ok))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const login = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    fetch("/api/admin/logout", { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => setIsAuthenticated(false));
  }, []);

  const setAdminStoreKey = useCallback((key: string) => {
    localStorage.setItem(ADMIN_STORE_KEY, key);
    setAdminStoreKeyState(key);
  }, []);

  return (
    <AdminTokenContext.Provider value={{ isAuthenticated, login, logout, adminStoreKey, setAdminStoreKey }}>
      {children}
    </AdminTokenContext.Provider>
  );
};

export const useAdminToken = () => {
  const ctx = useContext(AdminTokenContext);
  if (!ctx) throw new Error("useAdminToken must be used within AdminTokenProvider");
  return ctx;
};
