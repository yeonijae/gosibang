import { useCallback, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AnnouncementBanner } from './AnnouncementBanner';
import { useAuthStore } from '../store/authStore';
import { useSurveyRealtime } from '../hooks/useSurveyRealtime';

// 세션 체크 간격 (60초)
const SESSION_CHECK_INTERVAL = 60 * 1000;

export function Layout() {
  const { authState, verifySession, updateSessionActivity, logout } = useAuthStore();
  const lastCheckRef = useRef<number>(0);

  // Supabase Realtime 구독 - 설문 응답 동기화
  useSurveyRealtime(authState?.user?.id || null);

  // 사용자 활동 시 세션 검증 (throttle 적용)
  const handleUserActivity = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < SESSION_CHECK_INTERVAL) {
      return; // 간격 내 중복 호출 방지
    }
    lastCheckRef.current = now;

    // 세션 검증
    const { valid, message } = await verifySession();
    if (!valid) {
      alert(message || '세션이 만료되었습니다.');
      await logout();
      return;
    }

    // 활동 시간 업데이트
    await updateSessionActivity();
  }, [verifySession, updateSessionActivity, logout]);

  return (
    <div className="flex h-screen bg-gray-100" onClick={handleUserActivity}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <AnnouncementBanner />
        <main className="flex-1 overflow-auto p-6 min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
