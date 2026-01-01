import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AnnouncementBanner } from './AnnouncementBanner';
import { useAuthStore } from '../store/authStore';
import { useSurveyRealtime } from '../hooks/useSurveyRealtime';

export function Layout() {
  const { authState } = useAuthStore();

  // Supabase Realtime 구독 - 설문 응답 동기화
  useSurveyRealtime(authState?.user?.id || null);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnnouncementBanner />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
