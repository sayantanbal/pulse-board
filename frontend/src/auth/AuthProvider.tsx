import type {
  AuthUserWire,
  LoginBody,
  RegisterBody,
} from "@pulse-board/shared";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient } from "../data/api/client";

type AuthContextValue = {
  user: AuthUserWire | null;
  loading: boolean;
  login: (body: LoginBody) => Promise<AuthUserWire>;
  register: (body: RegisterBody) => Promise<AuthUserWire>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserWire | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ user: AuthUserWire }>("/auth/me");
      setUser(data.user);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback(async (body: LoginBody) => {
    const { data } = await apiClient.post<{ user: AuthUserWire }>(
      "/auth/login",
      body,
    );
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (body: RegisterBody) => {
    const { data } = await apiClient.post<{ user: AuthUserWire }>(
      "/auth/register",
      body,
    );
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post("/auth/logout");
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, reload }),
    [user, loading, login, register, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
