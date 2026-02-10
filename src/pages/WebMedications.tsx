/**
 * 웹 클라이언트 복약 관리 페이지
 * 복약 일정 목록, 기록 입력, 통계 탭 제공
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Pill,
  Calendar,
  BarChart3,
  Plus,
  Clock,
  User,
  Search,
  X,
  Loader2,
  Check,
  AlertTriangle,
  SkipForward,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { useWebAuthStore, hasPermission } from '../store/webAuthStore';
import {
  listMedicationSchedules,
  getMedicationLogsBySchedule,
  getMedicationStatsByPatient,
  createMedicationLog,
  deleteMedicationSchedule,
  listPatients,
} from '../lib/webApiClient';
import type { MedicationSchedule, MedicationLog, MedicationStats, MedicationStatus, Patient } from '../types';

// 확장된 일정 타입 (환자 이름 포함)
interface ScheduleWithPatient extends MedicationSchedule {
  patient_name?: string;
}

export function WebMedications() {
  const { user } = useWebAuthStore();
  const [activeTab, setActiveTab] = useState<'schedules' | 'logs' | 'stats'>('schedules');
  const [schedules, setSchedules] = useState<ScheduleWithPatient[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 선택된 일정 상태
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithPatient | null>(null);
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // 통계 상태
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [stats, setStats] = useState<MedicationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 기록 입력 모달 상태
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({
    schedule_id: '',
    taken_at: new Date().toISOString().slice(0, 16),
    status: 'taken' as MedicationStatus,
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // 권한 체크 (처방 권한이 있으면 복약도 가능하도록)
  const canRead = hasPermission(user, 'prescriptions_read');
  const canWrite = hasPermission(user, 'prescriptions_write');

  useEffect(() => {
    if (canRead) {
      loadData();
    }
  }, [canRead]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [schedulesData, patientsData] = await Promise.all([
        listMedicationSchedules(),
        listPatients(),
      ]);

      // 환자 이름 매핑
      const patientMap = new Map(patientsData.map(p => [p.id, p.name]));
      const enrichedSchedules = schedulesData.map(s => ({
        ...s,
        patient_name: patientMap.get(s.patient_id) || '알 수 없음',
      }));

      setSchedules(enrichedSchedules);
      setPatients(patientsData);
    } catch (e) {
      setError('복약 일정을 불러오는데 실패했습니다.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // 검색 필터링
  const filteredSchedules = useMemo(() => {
    if (!searchQuery.trim()) return schedules;

    const query = searchQuery.toLowerCase();
    return schedules.filter(s =>
      s.patient_name?.toLowerCase().includes(query)
    );
  }, [schedules, searchQuery]);

  // 일정 선택 시 기록 로드
  const handleSelectSchedule = async (schedule: ScheduleWithPatient) => {
    setSelectedSchedule(schedule);
    setLogsLoading(true);
    try {
      const logsData = await getMedicationLogsBySchedule(schedule.id);
      setLogs(logsData);
    } catch (e) {
      console.error('기록 로드 실패:', e);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  // 통계 로드
  const loadStats = async (patientId: string) => {
    if (!patientId) {
      setStats(null);
      return;
    }
    setStatsLoading(true);
    try {
      const statsData = await getMedicationStatsByPatient(patientId);
      setStats(statsData);
    } catch (e) {
      console.error('통계 로드 실패:', e);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  // 기록 저장
  const handleSaveLog = async () => {
    if (!logForm.schedule_id) {
      alert('일정을 선택해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      await createMedicationLog({
        schedule_id: logForm.schedule_id,
        taken_at: logForm.taken_at,
        status: logForm.status,
        notes: logForm.notes || undefined,
      });
      alert('복약 기록이 저장되었습니다.');
      setShowLogModal(false);
      setLogForm({
        schedule_id: '',
        taken_at: new Date().toISOString().slice(0, 16),
        status: 'taken',
        notes: '',
      });
      // 선택된 일정의 기록 새로고침
      if (selectedSchedule) {
        handleSelectSchedule(selectedSchedule);
      }
    } catch (e) {
      console.error('기록 저장 실패:', e);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 일정 삭제
  const handleDeleteSchedule = async (schedule: ScheduleWithPatient) => {
    if (!confirm(`${schedule.patient_name}님의 복약 일정을 삭제하시겠습니까?`)) return;

    try {
      await deleteMedicationSchedule(schedule.id);
      alert('복약 일정이 삭제되었습니다.');
      loadData();
      if (selectedSchedule?.id === schedule.id) {
        setSelectedSchedule(null);
        setLogs([]);
      }
    } catch (e) {
      console.error('삭제 실패:', e);
      alert('삭제에 실패했습니다.');
    }
  };

  // 날짜 포맷
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  };

  // 시간 포맷
  const formatTimes = (times: string[]) => {
    const labels: Record<string, string> = {
      '08:00': '아침',
      '12:00': '점심',
      '18:00': '저녁',
      '22:00': '취침전',
    };
    return times.map(t => labels[t] || t).join(', ');
  };

  // 기록 시간 포맷
  const formatLogTime = (takenAt: string) => {
    const date = new Date(takenAt);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 상태 배지
  const StatusBadge = ({ status }: { status: MedicationStatus }) => {
    const config = {
      taken: { bg: 'bg-green-100', text: 'text-green-700', icon: Check, label: '복용' },
      missed: { bg: 'bg-red-100', text: 'text-red-700', icon: X, label: '미복용' },
      skipped: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: SkipForward, label: '건너뜀' },
    };
    const { bg, text, icon: Icon, label } = config[status];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${bg} ${text}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  if (!canRead) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          복약 정보 조회 권한이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Pill className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">복약 관리</h1>
            <p className="text-sm text-gray-500">
              복약 일정 {schedules.length}건
            </p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('schedules')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'schedules'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-1" />
          일정 목록
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'logs'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Pill className="w-4 h-4 inline mr-1" />
          기록 입력
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'stats'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1" />
          통계
        </button>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* 콘텐츠 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : (
        <>
          {/* 일정 목록 탭 */}
          {activeTab === 'schedules' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* 검색 */}
              <div className="p-4 border-b">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="환자명 검색"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 일정 목록 */}
              {filteredSchedules.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">등록된 복약 일정이 없습니다</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredSchedules.map(schedule => (
                    <div
                      key={schedule.id}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleSelectSchedule(schedule)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {schedule.patient_name}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                              {schedule.times_per_day}회/일
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(schedule.start_date)} ~ {formatDate(schedule.end_date)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimes(schedule.medication_times)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteSchedule(schedule);
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 기록 입력 탭 */}
          {activeTab === 'logs' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 왼쪽: 일정 선택 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-900">복약 일정 선택</h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {schedules.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">등록된 일정이 없습니다</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {schedules.map(schedule => (
                        <div
                          key={schedule.id}
                          onClick={() => handleSelectSchedule(schedule)}
                          className={`p-4 cursor-pointer transition-colors ${
                            selectedSchedule?.id === schedule.id
                              ? 'bg-purple-50 border-l-4 border-purple-500'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-medium text-gray-900">{schedule.patient_name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(schedule.start_date)} ~ {formatDate(schedule.end_date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 오른쪽: 기록 목록 및 입력 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <h3 className="font-semibold text-gray-900">
                    {selectedSchedule
                      ? `${selectedSchedule.patient_name}님의 기록`
                      : '일정을 선택하세요'}
                  </h3>
                  {selectedSchedule && canWrite && (
                    <button
                      onClick={() => {
                        setLogForm(prev => ({
                          ...prev,
                          schedule_id: selectedSchedule.id,
                          taken_at: new Date().toISOString().slice(0, 16),
                        }));
                        setShowLogModal(true);
                      }}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      기록 추가
                    </button>
                  )}
                </div>

                {!selectedSchedule ? (
                  <div className="text-center py-12">
                    <Pill className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">왼쪽에서 일정을 선택하세요</p>
                  </div>
                ) : logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-12">
                    <Pill className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">기록이 없습니다</p>
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto divide-y">
                    {logs.map(log => (
                      <div key={log.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">
                              {new Date(log.taken_at).toLocaleDateString('ko-KR')}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {formatLogTime(log.taken_at)}
                            </span>
                            <StatusBadge status={log.status} />
                          </div>
                        </div>
                        {log.notes && (
                          <p className="text-sm text-gray-500 mt-1">{log.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 통계 탭 */}
          {activeTab === 'stats' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  환자 선택
                </label>
                <select
                  value={selectedPatientId}
                  onChange={e => {
                    setSelectedPatientId(e.target.value);
                    loadStats(e.target.value);
                  }}
                  className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="">환자를 선택하세요</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-6">
                {!selectedPatientId ? (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">환자를 선택하면 통계를 볼 수 있습니다</p>
                  </div>
                ) : statsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  </div>
                ) : !stats ? (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">통계 데이터가 없습니다</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 연속 미복용 경고 */}
                    {stats.consecutive_missed >= 3 && (
                      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-800">연속 미복용 경고</p>
                          <p className="text-sm text-red-600">
                            {stats.consecutive_missed}일 연속 복약을 하지 않았습니다.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 순응률 원형 차트 */}
                    <div className="flex items-center justify-center py-4">
                      <div className="relative">
                        <svg width="140" height="140" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="8"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke={
                              stats.adherence_rate >= 80
                                ? '#22c55e'
                                : stats.adherence_rate >= 60
                                ? '#eab308'
                                : '#ef4444'
                            }
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 45}
                            strokeDashoffset={
                              2 * Math.PI * 45 - (stats.adherence_rate / 100) * 2 * Math.PI * 45
                            }
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-gray-900">
                            {Math.round(stats.adherence_rate)}%
                          </span>
                          <span className="text-sm text-gray-500">순응률</span>
                        </div>
                      </div>
                    </div>

                    {/* 상세 통계 */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                        <p className="text-2xl font-bold text-green-600">{stats.taken_count}</p>
                        <p className="text-xs text-green-700">복용완료</p>
                      </div>

                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <X className="w-4 h-4 text-red-600" />
                        </div>
                        <p className="text-2xl font-bold text-red-600">{stats.missed_count}</p>
                        <p className="text-xs text-red-700">미복용</p>
                      </div>

                      <div className="text-center p-4 bg-yellow-50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <SkipForward className="w-4 h-4 text-yellow-600" />
                        </div>
                        <p className="text-2xl font-bold text-yellow-600">{stats.skipped_count}</p>
                        <p className="text-xs text-yellow-700">건너뜀</p>
                      </div>
                    </div>

                    {/* 추가 정보 */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-600">
                        <TrendingUp className="w-4 h-4" />
                        <span>총 복약 횟수</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {stats.taken_count + stats.missed_count + stats.skipped_count}회
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 기록 입력 모달 */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">복약 기록 추가</h2>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  복약 시간 *
                </label>
                <input
                  type="datetime-local"
                  value={logForm.taken_at}
                  onChange={e => setLogForm(prev => ({ ...prev, taken_at: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  상태 *
                </label>
                <div className="flex gap-2">
                  {(['taken', 'missed', 'skipped'] as MedicationStatus[]).map(status => {
                    const config = {
                      taken: { label: '복용', bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' },
                      missed: { label: '미복용', bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700' },
                      skipped: { label: '건너뜀', bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-700' },
                    };
                    const c = config[status];
                    const isSelected = logForm.status === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setLogForm(prev => ({ ...prev, status }))}
                        className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                          isSelected
                            ? `${c.bg} ${c.border} ${c.text}`
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메모
                </label>
                <textarea
                  value={logForm.notes}
                  onChange={e => setLogForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  rows={3}
                  placeholder="메모를 입력하세요 (선택)"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveLog}
                  disabled={isSaving}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WebMedications;
