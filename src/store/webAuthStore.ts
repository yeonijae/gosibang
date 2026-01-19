/**
 * 웹 클라이언트 인증 상태 관리
 * 내부계정(Staff Account) 기반 인증
 */

import { create } from 'zustand';
import { webLogin, webLogout, webVerify, getAuthToken, setAuthToken } from '../lib/webApiClient';

export interface WebUser {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'staff' | 'viewer';
  permissions: {
    patients_read: boolean;
    patients_write: boolean;
    prescriptions_read: boolean;
    prescriptions_write: boolean;
    charts_read: boolean;
    charts_write: boolean;
    survey_read: boolean;
    survey_write: boolean;
    settings_read: boolean;
  };
}

interface WebAuthState {
  // 상태
  isAuthenticated: boolean;
  user: WebUser | null;
  isLoading: boolean;
  error: string | null;

  // 액션
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

export const useWebAuthStore = create<WebAuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await webLogin(username, password);
      set({
        isAuthenticated: true,
        user: result.user as WebUser,
        isLoading: false,
      });
      return true;
    } catch (error) {
      set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : '로그인 실패',
      });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await webLogout();
    } catch (error) {
      console.error('로그아웃 오류:', error);
    } finally {
      set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
      });
    }
  },

  checkAuth: async () => {
    const token = getAuthToken();
    if (!token) {
      set({ isAuthenticated: false, user: null, isLoading: false });
      return false;
    }

    set({ isLoading: true });
    try {
      const result = await webVerify();
      if (result.valid && result.user) {
        set({
          isAuthenticated: true,
          user: result.user as WebUser,
          isLoading: false,
        });
        return true;
      } else {
        setAuthToken(null);
        set({
          isAuthenticated: false,
          user: null,
          isLoading: false,
        });
        return false;
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
      setAuthToken(null);
      set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
      });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

// 권한 확인 헬퍼
export function hasPermission(user: WebUser | null, permission: keyof WebUser['permissions']): boolean {
  if (!user) return false;
  return user.permissions[permission] ?? false;
}

// 역할 확인 헬퍼
export function hasRole(user: WebUser | null, role: 'admin' | 'staff' | 'viewer'): boolean {
  if (!user) return false;
  const roleHierarchy = { admin: 3, staff: 2, viewer: 1 };
  return roleHierarchy[user.role] >= roleHierarchy[role];
}
