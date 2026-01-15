import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { supabase } from '../lib/supabase';
import type { AuthState } from '../types';

// 회원가입 추가 정보
interface SignupMetadata {
  name: string;
  phone: string;
  lectureId: string;
}

interface AuthStore {
  authState: AuthState | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, metadata: SignupMetadata) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<AuthState | null>;
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

      // 승인 상태 확인
      const { data: profile } = await supabase
        .from('gosibang_user_profiles')
        .select('is_approved')
        .eq('id', data.user?.id)
        .single();

      if (!profile?.is_approved) {
        // 승인되지 않은 경우 로그아웃 처리
        await supabase.auth.signOut();
        throw new Error('PENDING_APPROVAL');
      }

      const authState: AuthState = {
        is_authenticated: true,
        user: {
          id: data.user!.id,
          email: data.user?.email,
        },
        user_email: data.user?.email,
      };

      // 암호화된 사용자별 데이터베이스 초기화
      if (data.session?.access_token) {
        try {
          await invoke('initialize_encrypted_db', {
            accessToken: data.session.access_token,
            userId: data.user!.id,
          });
          console.log('Encrypted database initialized');
        } catch (dbError) {
          console.error('Failed to initialize encrypted DB:', dbError);
          // DB 초기화 실패해도 로그인은 진행 (오프라인 모드 대비)
        }
      }

      set({ authState, isLoading: false });

      // 로그인 성공 후 페이지 새로고침 (사용자별 DB 로드)
      window.location.reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  signup: async (email: string, password: string, metadata: SignupMetadata) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: metadata.name,
            phone: metadata.phone,
            lecture_id: metadata.lectureId,
          },
        },
      });

      if (error) throw error;

      // 회원가입 성공 시 바로 로그아웃 (승인 대기 상태)
      if (data.user) {
        await supabase.auth.signOut();
        set({ isLoading: false });
        // 승인 대기 상태를 알리기 위해 특별한 에러 throw
        throw new Error('SIGNUP_SUCCESS_PENDING_APPROVAL');
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
      set({ authState: null });
      // 로그아웃 후 페이지 새로고침 (DB 초기화)
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // 암호화된 사용자별 데이터베이스 초기화
        if (session.access_token) {
          try {
            await invoke('initialize_encrypted_db', {
              accessToken: session.access_token,
              userId: session.user.id,
            });
            console.log('Encrypted database initialized on auth check');
          } catch (dbError) {
            console.error('Failed to initialize encrypted DB:', dbError);
            // DB 초기화 실패 시 오프라인 모드 시도
            try {
              await invoke('initialize_offline', { userId: session.user.id });
              console.log('Initialized with cached key (offline mode)');
            } catch {
              console.warn('Offline initialization also failed');
            }
          }
        }

        // 구독 정보 조회
        let subscription = undefined;
        try {
          const { data: subData } = await supabase
            .from('gosibang_subscriptions')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('status', 'active')
            .single();

          if (subData) {
            subscription = {
              user_id: subData.user_id,
              plan: subData.plan_type || 'beginner',
              status: subData.status,
              expires_at: subData.expires_at,
            };
          }
        } catch {
          // 구독 정보 없으면 기본값 사용
        }

        const authState: AuthState = {
          is_authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
          },
          user_email: session.user.email,
          subscription: subscription || {
            user_id: session.user.id,
            plan: 'beginner',
            status: 'active',
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
        };
        set({ authState, isLoading: false });
        return authState;
      } else {
        set({ authState: null, isLoading: false });
        return null;
      }
    } catch (error) {
      set({ authState: null, isLoading: false });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));
