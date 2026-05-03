import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { fetchCurrentUser, loginUser, registerUser, logoutUser, type AuthUser } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  pendingFavoriteId: number | null;
  setPendingFavoriteId: (id: number | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<number | null>(null);

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser(email, password);
    if ("error" in result) return { error: result.error };
    setUser(result.user);
    return {};
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const result = await registerUser(email, password);
    if ("error" in result) return { error: result.error };
    setUser(result.user);
    return {};
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, pendingFavoriteId, setPendingFavoriteId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
