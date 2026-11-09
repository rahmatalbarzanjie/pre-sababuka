import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiClientError, clearRolePreview, jsonBody, setCsrfToken, setRolePreview } from "./api";
import type { CurrentUser, MenuItem } from "./types";

interface LoginInput {
  identifier: string;
  password: string;
}

interface AuthState {
  user: CurrentUser | null;
  menu: MenuItem[];
  loading: boolean;
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  startPreview(role: "bapperida" | "kominfo" | "pembina_statistik" | "opd" | "pimpinan", organizationId?: string): Promise<void>;
  stopPreview(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Pengguna berperan ganda menerima entri menu yang sama dari beberapa peran; satu kode cukup tampil sekali.
function uniqueMenu(items: MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.code) && seen.add(item.code)).map((item) => ({ ...item, children: uniqueMenu(item.children ?? []) }));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const current = await api<CurrentUser>("/me");
      const effectiveMenu = await api<{ data: MenuItem[] }>("/me/menu");
      setUser(current);
      setMenu(uniqueMenu(effectiveMenu.data));
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
      setUser(null);
      setMenu([]);
      setCsrfToken(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    clearRolePreview();
    const session = await api<{ user: CurrentUser; csrf_token: string }>("/auth/login", {
      method: "POST",
      body: jsonBody(input),
    });
    setCsrfToken(session.csrf_token);
    setUser(session.user);
    const effectiveMenu = await api<{ data: MenuItem[] }>("/me/menu");
    setMenu(uniqueMenu(effectiveMenu.data));
    window.sessionStorage.setItem("sababuka.just_logged_in", "true");
  }, []);

  const logout = useCallback(async () => {
    try {
      clearRolePreview();
      await api<void>("/auth/logout", { method: "POST", mutation: true });
    } finally {
      window.sessionStorage.removeItem("sababuka.just_logged_in");
      setCsrfToken(null);
      setUser(null);
      setMenu([]);
    }
  }, []);

  const startPreview = useCallback(async (role: "bapperida" | "kominfo" | "pembina_statistik" | "opd" | "pimpinan", organizationId?: string) => {
    setRolePreview(role, organizationId);
    try { await refresh(); }
    catch (error) { clearRolePreview(); await refresh(); throw error; }
  }, [refresh]);

  const stopPreview = useCallback(async () => { clearRolePreview(); await refresh(); }, [refresh]);

  const value = useMemo(() => ({ user, menu, loading, login, logout, refresh, startPreview, stopPreview }), [user, menu, loading, login, logout, refresh, startPreview, stopPreview]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus digunakan di dalam AuthProvider.");
  return context;
}
