/**
 * 웹 클라이언트 전용 App
 * 브라우저에서 /app으로 접속 시 사용됩니다.
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { WebLogin } from './pages/WebLogin';
import { WebDashboard } from './pages/WebDashboard';
import { WebPatients } from './pages/WebPatients';
import { WebCharts } from './pages/WebCharts';
import { WebSurveys } from './pages/WebSurveys';
import { WebMedications } from './pages/WebMedications';
import { WebLayout } from './components/WebLayout';
import { useWebAuthStore } from './store/webAuthStore';

// 보호된 라우트 컴포넌트
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useWebAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function WebApp() {
  const { checkAuth } = useWebAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      await checkAuth();
      setIsInitializing(false);
    };
    init();
  }, [checkAuth]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter basename="/app">
      <Routes>
        {/* 로그인 페이지 */}
        <Route path="/login" element={<WebLogin />} />

        {/* 보호된 라우트 */}
        <Route
          element={
            <ProtectedRoute>
              <WebLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<WebDashboard />} />
          <Route path="/patients" element={<WebPatients />} />
          <Route path="/charts" element={<WebCharts />} />
          <Route path="/surveys" element={<WebSurveys />} />
          <Route path="/medications" element={<WebMedications />} />
        </Route>

        {/* 기본 리다이렉트 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
