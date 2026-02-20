import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { supabase } from '../lib/supabase';
import type { AuthState, UserSession } from '../types';

// 현재 앱 버전 (package.json과 동기화)
const APP_VERSION = '0.2.43';

// 버전 비교: a < b이면 true
function isVersionOlderThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return true;
    if (na > nb) return false;
  }
  return false;
}

// 최소 버전 체크 (Supabase gosibang_app_settings 테이블)
async function checkMinimumVersion(): Promise<void> {
  try {
    const { data } = await supabase
      .from('gosibang_app_settings')
      .select('value')
      .eq('key', 'minimum_version')
      .single();

    if (data?.value && isVersionOlderThan(APP_VERSION, data.value)) {
      throw new Error(`VERSION_TOO_OLD:${data.value}:${APP_VERSION}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('VERSION_TOO_OLD')) {
      throw error;
    }
    // 테이블이 없거나 네트워크 오류 시 무시 (로그인 허용)
    console.log('[Version] 버전 체크 스킵:', error);
  }
}

// 회원가입 추가 정보
interface SignupMetadata {
  name: string;
  phone: string;
  lectureId: string;
}

// 세션 토큰 localStorage 키
const SESSION_TOKEN_KEY = 'gosibang_session_token';

// 세션 토큰 생성
const generateSessionToken = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

// 기기 이름 추출
const getDeviceName = () => {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('Linux')) return 'Linux PC';
  return 'Unknown Device';
};

// 현재 세션 토큰 가져오기
const getCurrentSessionToken = () => localStorage.getItem(SESSION_TOKEN_KEY);

// 세션 토큰 저장
const saveSessionToken = (token: string) => localStorage.setItem(SESSION_TOKEN_KEY, token);

// 세션 토큰 삭제
const clearSessionToken = () => localStorage.removeItem(SESSION_TOKEN_KEY);

interface AuthStore {
  authState: AuthState | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string, forceLogoutOthers?: boolean) => Promise<void>;
  signup: (email: string, password: string, metadata: SignupMetadata) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<AuthState | null>;
  resetPassword: (email: string, name: string, phone: string) => Promise<string>;
  clearError: () => void;

  // Session management
  verifySession: () => Promise<{ valid: boolean; message?: string }>;
  updateSessionActivity: () => Promise<void>;
  loadUserSessions: () => Promise<UserSession[]>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  authState: null,
  isLoading: false,
  isLoggingOut: false,
  error: null,

  login: async (email: string, password: string, forceLogoutOthers?: boolean) => {
    set({ isLoading: true, error: null });
    try {
      // 최소 버전 체크 (구버전 로그인 차단)
      await checkMinimumVersion();

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

      const userId = data.user!.id;

      // ===== 세션 관리 =====
      // 1. max_sessions 조회
      let maxSessions = 1;
      try {
        const { data: subData } = await supabase
          .from('gosibang_subscriptions')
          .select('plan_type')
          .eq('user_id', userId)
          .single();

        if (subData?.plan_type) {
          const { data: policyData } = await supabase
            .from('gosibang_plan_policies')
            .select('max_sessions')
            .eq('plan_type', subData.plan_type)
            .single();

          maxSessions = policyData?.max_sessions ?? 1;
        }
      } catch (e) {
        console.log('[Session] Failed to get max_sessions, using default 1');
      }

      // 2. 현재 활성 세션 수 확인
      const { data: existingSessions } = await supabase
        .from('user_sessions')
        .select('id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // 3. max_sessions 도달 시 처리
      if (existingSessions && existingSessions.length >= maxSessions) {
        if (forceLogoutOthers) {
          // 강제 로그아웃: 모든 기존 세션 삭제
          for (const session of existingSessions) {
            await supabase.from('user_sessions').delete().eq('id', session.id);
          }
          console.log(`[Session] Force logout: deleted ${existingSessions.length} session(s)`);
        } else {
          // 사용자 확인 필요
          throw new Error(`SESSION_LIMIT_CONFIRM:${maxSessions}:${existingSessions.length}`);
        }
      }

      // 4. 새 세션 생성
      const sessionToken = generateSessionToken();
      const deviceName = getDeviceName();

      await supabase.from('user_sessions').insert({
        user_id: userId,
        session_token: sessionToken,
        device_name: deviceName,
      });

      // 5. 세션 토큰 저장
      saveSessionToken(sessionToken);
      console.log('[Session] New session created:', sessionToken);
      // ===== 세션 관리 끝 =====

      const authState: AuthState = {
        is_authenticated: true,
        user: {
          id: userId,
          email: data.user?.email,
        },
        user_email: data.user?.email,
      };

      // 암호화된 사용자별 데이터베이스 초기화
      if (data.session?.access_token) {
        try {
          await invoke('initialize_encrypted_db', {
            accessToken: data.session.access_token,
            userId: userId,
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
    // 로그아웃 중 플래그 설정
    set({ isLoggingOut: true });

    // 현재 세션 삭제 (실패해도 계속 진행)
    try {
      const sessionToken = getCurrentSessionToken();
      if (sessionToken) {
        await supabase.from('user_sessions').delete().eq('session_token', sessionToken);
        console.log('[Session] Session deleted on logout');
      }
    } catch (error) {
      console.error('[Session] Failed to delete session:', error);
    }

    // 세션 토큰 삭제 (항상 실행)
    clearSessionToken();

    // Supabase 로그아웃 (실패해도 계속 진행)
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('[Session] Failed to sign out:', error);
    }

    // Supabase localStorage 세션 데이터 강제 삭제
    // Supabase는 'sb-<project-ref>-auth-token' 형식으로 저장
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
        console.log('[Session] Removed Supabase auth token:', key);
      }
    });

    // 상태 초기화
    set({ authState: null, isLoggingOut: false });

    // 페이지 새로고침 (항상 실행)
    window.location.reload();
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      // 최소 버전 체크 (구버전이면 로그인 차단)
      try {
        await checkMinimumVersion();
      } catch (versionError) {
        if (versionError instanceof Error && versionError.message.startsWith('VERSION_TOO_OLD')) {
          await supabase.auth.signOut({ scope: 'local' });
          set({ authState: null, isLoading: false, error: versionError.message });
          return null;
        }
      }

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

  resetPassword: async (email: string, name: string, phone: string) => {
    set({ isLoading: true, error: null });
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name, phone }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '비밀번호 초기화에 실패했습니다.');
      }

      set({ isLoading: false });
      return result.tempPassword;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  // ===== 세션 관리 함수 =====

  // 세션 유효성 검증 (사용 중 호출)
  verifySession: async () => {
    // 로그아웃 중이면 검증 건너뛰기
    if (get().isLoggingOut) {
      return { valid: true };
    }

    const sessionToken = getCurrentSessionToken();
    if (!sessionToken) {
      return { valid: false, message: '세션이 만료되었습니다. 다시 로그인해주세요.' };
    }

    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('session_token', sessionToken)
        .single();

      if (error || !data) {
        return {
          valid: false,
          message: '다른 기기에서 로그아웃 처리되었습니다. 다시 로그인해주세요.',
        };
      }

      return { valid: true };
    } catch (e) {
      console.error('[Session] Verify error:', e);
      return { valid: true }; // 네트워크 오류 시 일단 유효로 처리
    }
  },

  // 세션 활동 시간 업데이트
  updateSessionActivity: async () => {
    const sessionToken = getCurrentSessionToken();
    if (!sessionToken) return;

    try {
      await supabase
        .from('user_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('session_token', sessionToken);
    } catch (e) {
      console.error('[Session] Update activity error:', e);
    }
  },

  // 사용자의 모든 세션 로드
  loadUserSessions: async (): Promise<UserSession[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const currentToken = getCurrentSessionToken();

    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('last_active_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(s => ({
        ...s,
        is_current: s.session_token === currentToken,
      }));
    } catch (e) {
      console.error('[Session] Load sessions error:', e);
      return [];
    }
  },

  // 특정 세션 삭제 (원격 로그아웃)
  deleteSession: async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
      console.log('[Session] Remote logout:', sessionId);
    } catch (e) {
      console.error('[Session] Delete session error:', e);
      throw e;
    }
  },
}));
