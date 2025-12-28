import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { Prescriptions } from './pages/Prescriptions';
import { PrescriptionDefinitions } from './pages/PrescriptionDefinitions';
import { Charts } from './pages/Charts';
import { Medications } from './pages/Medications';
import { Settings } from './pages/Settings';
import { SurveyTemplates } from './pages/SurveyTemplates';
import { SurveyResponses } from './pages/SurveyResponses';
import { PatientSurvey } from './pages/PatientSurvey';
import { SubscriptionAdmin } from './pages/SubscriptionAdmin';

import { useAuthStore } from './store/authStore';
import { useClinicStore } from './store/clinicStore';
import { useFeatureStore } from './store/featureStore';
import { initLocalDb, ensureSampleData } from './lib/localDb';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const { authState, checkAuth } = useAuthStore();
  const { loadSettings } = useClinicStore();
  const { loadFeatures } = useFeatureStore();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 인증 상태 확인 (Supabase) - 먼저 사용자 확인
        const authResult = await checkAuth();

        // 로컬 DB 초기화 (사용자별 분리)
        const userId = authResult?.user?.id;
        await initLocalDb(userId);

        // 기본 처방 템플릿 확인 및 삽입
        ensureSampleData();

        // 기능 권한 로드 (플랜에 따라)
        const planType = authResult?.subscription?.plan || 'free';
        await loadFeatures(planType);

        // 설정 로드 (로컬 DB)
        await loadSettings();
      } catch (error) {
        console.error('Initialization error:', error);
        setInitError(String(error));
      } finally {
        setIsInitializing(false);
      }
    };

    initializeApp();
  }, [checkAuth, loadSettings, loadFeatures]);

  // 초기화 중
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">시스템을 초기화하는 중입니다...</p>
        </div>
      </div>
    );
  }

  // 초기화 오류
  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="card max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">초기화 오류</h1>
          <p className="text-gray-600 mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 페이지 */}
        <Route
          path="/login"
          element={
            authState?.is_authenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Login />
            )
          }
        />

        {/* 환자용 설문 페이지 (공개) */}
        <Route path="/survey/:token" element={<PatientSurvey />} />

        {/* 인증된 사용자만 접근 가능한 페이지들 */}
        <Route
          element={
            authState?.is_authenticated ? (
              <Layout />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/prescription-definitions" element={<PrescriptionDefinitions />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/survey-templates" element={<SurveyTemplates />} />
          <Route path="/survey-responses" element={<SurveyResponses />} />
          <Route path="/medication" element={<Medications />} />
          <Route path="/admin/subscriptions" element={<SubscriptionAdmin />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
