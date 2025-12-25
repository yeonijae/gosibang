import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { AuthState } from '../types';

interface AuthStore {
  authState: AuthState | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  authState: null,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const authState: AuthState = {
        is_authenticated: true,
        user_email: data.user?.email,
      };
      set({ authState, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  signup: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // 회원가입 성공 시 바로 로그인 상태로 설정
      if (data.user) {
        const authState: AuthState = {
          is_authenticated: true,
          user_email: data.user.email,
        };
        set({ authState, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
      set({ authState: null });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const authState: AuthState = {
          is_authenticated: true,
          user_email: session.user.email,
        };
        set({ authState, isLoading: false });
      } else {
        set({ authState: null, isLoading: false });
      }
    } catch (error) {
      set({ authState: null, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
