"use client";

import { type LoginInput, type Permission, hasPermission } from "@oca/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type SessionUser,
  loginRequest,
  logoutRequest,
  refreshSession,
  setSessionRefreshedHandler,
  setUnauthorizedHandler,
} from "@/lib/api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
}

interface AuthContextValue extends AuthState {
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const UNAUTHENTICATED: AuthState = { status: "unauthenticated", user: null };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  // ຕອນເປີດໜ້າ: ຟື້ນ session ດ້ວຍ refresh cookie. refreshSession ເປັນ single-flight
  // ຈຶ່ງປອດໄພກັບ React Strict Mode ທີ່ mount ສອງຄັ້ງ.
  useEffect(() => {
    let active = true;
    setUnauthorizedHandler(() => {
      queryClient.clear();
      setState(UNAUTHENTICATED);
    });
    setSessionRefreshedHandler((session) => setState({ status: "authenticated", user: session.user }));
    void refreshSession().then((session) => {
      if (active) setState(session ? { status: "authenticated", user: session.user } : UNAUTHENTICATED);
    });
    return () => {
      active = false;
      setUnauthorizedHandler(null);
      setSessionRefreshedHandler(null);
    };
  }, [queryClient]);

  const login = useCallback(async (input: LoginInput) => {
    const session = await loginRequest(input);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // ເຖິງ API ລົ້ມ ກໍລ້າງ session ຝັ່ງ client
    }
    queryClient.clear();
    setState(UNAUTHENTICATED);
  }, [queryClient]);

  const can = useCallback(
    (permission: Permission) => state.user !== null && hasPermission(state.user.permissions, permission),
    [state.user],
  );

  const value = useMemo(() => ({ ...state, login, logout, can }), [state, login, logout, can]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

/** ຕ້ອງມີຄົບທຸກສິດ (all-of); ໃຊ້ກັບໜ້າທີ່ເອີ້ນ API ຫຼາຍສິດ */
export function useCanAll(permissions: readonly Permission[]): boolean {
  const { can } = useAuth();
  return permissions.every((permission) => can(permission));
}

/** ຊ່ອນເມນູ/ປຸ່ມຕາມສິດ. API ຍັງເປັນຜູ້ບັງຄັບສິດຈິງ. */
export function useCan(permission: Permission): boolean {
  return useAuth().can(permission);
}
