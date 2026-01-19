/**
 * 웹 클라이언트 대시보드
 */

import { useEffect, useState } from 'react';
import { Users, FileText, ClipboardList, Loader2 } from 'lucide-react';
import { listPatients, getSurveyResponses } from '../lib/webApiClient';
import { useWebAuthStore, hasPermission } from '../store/webAuthStore';
import type { Patient, SurveyResponse } from '../types';

export function WebDashboard() {
  const { user } = useWebAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayPatients: 0,
    pendingSurveys: 0,
  });
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 환자 목록 가져오기
      const patients = await listPatients();
      const today = new Date().toISOString().split('T')[0];
      const todayPatients = patients.filter(p =>
        p.created_at?.startsWith(today)
      );

      // 설문 응답 가져오기
      let pendingSurveys = 0;
      if (hasPermission(user, 'survey_read')) {
        try {
          const responses = await getSurveyResponses() as SurveyResponse[];
          pendingSurveys = responses?.length || 0;
        } catch {
          // 설문 권한이 없거나 에러 시 무시
        }
      }

      setStats({
        totalPatients: patients.length,
        todayPatients: todayPatients.length,
        pendingSurveys,
      });

      // 최근 환자 5명
      setRecentPatients(
        [...patients]
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, 5)
      );
    } catch (err) {
      console.error('대시보드 로딩 실패:', err);
      setError(err instanceof Error ? err.message : '데이터를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadDashboardData}
          className="mt-2 text-sm text-red-600 hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 환영 메시지 */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">안녕하세요, {user?.display_name}님</h1>
        <p className="text-primary-100 mt-1">오늘도 좋은 하루 되세요.</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">전체 환자</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPatients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">오늘 등록</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayPatients}</p>
            </div>
          </div>
        </div>

        {hasPermission(user, 'survey_read') && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">미확인 설문</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingSurveys}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 최근 환자 */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">최근 등록 환자</h2>
        </div>
        <div className="p-4">
          {recentPatients.length === 0 ? (
            <p className="text-gray-500 text-center py-8">등록된 환자가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {recentPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{patient.name}</p>
                    <p className="text-sm text-gray-500">
                      {patient.gender === 'M' ? '남' : patient.gender === 'F' ? '여' : '-'} / {patient.birth_date || '-'}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {patient.created_at ? new Date(patient.created_at).toLocaleDateString('ko-KR') : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
