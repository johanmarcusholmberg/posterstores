export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data: AuthResponse = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function registerUser(email: string, password: string): Promise<{ user: AuthUser } | { error: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Registration failed" };
  return { user: data.user };
}

export async function loginUser(email: string, password: string): Promise<{ user: AuthUser } | { error: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Login failed" };
  return { user: data.user };
}

export async function logoutUser(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}
