import { useEffect, useState, useRef } from 'react';
import { Save, Download, Upload, Loader2, Crown, Check, X, Users, FileText, ClipboardList, Cloud, HardDrive, RefreshCw } from 'lucide-react';
import { getDb, saveDb, queryToObjects, queryOne } from '../lib/localDb';
import { PRESCRIPTION_DEFINITIONS } from '../lib/prescriptionData';
import { useClinicStore } from '../store/clinicStore';
import { useAuthStore } from '../store/authStore';
import type { ClinicSettings, Subscription } from '../types';

// 구독 플랜 정의
const PLANS = [
  {
    id: 'free',
    name: '무료',
    price: 0,
    priceLabel: '₩0',
    period: '',
    features: {
      patients: 50,
      prescriptions: 100,
      backup: '수동 백업만',
      support: '이메일',
    },
    featureList: [
      { text: '환자 50명까지', included: true },
      { text: '처방전 100개까지', included: true },
      { text: 'JSON 내보내기/가져오기', included: true },
      { text: 'Google Drive 백업', included: false },
      { text: '자동 백업', included: false },
      { text: '우선 지원', included: false },
    ],
  },
  {
    id: 'basic',
    name: '베이직',
    price: 29000,
    priceLabel: '₩29,000',
    period: '/월',
    features: {
      patients: 500,
      prescriptions: 2000,
      backup: 'Google Drive',
      support: '이메일 + 채팅',
    },
    featureList: [
      { text: '환자 500명까지', included: true },
      { text: '처방전 2,000개까지', included: true },
      { text: 'JSON 내보내기/가져오기', included: true },
      { text: 'Google Drive 백업', included: true },
      { text: '자동 백업 (매일)', included: true },
      { text: '우선 지원', included: false },
    ],
    recommended: true,
  },
  {
    id: 'premium',
    name: '프리미엄',
    price: 59000,
    priceLabel: '₩59,000',
    period: '/월',
    features: {
      patients: -1, // unlimited
      prescriptions: -1,
      backup: 'Google Drive + 클라우드',
      support: '전화 + 우선 지원',
    },
    featureList: [
      { text: '환자 무제한', included: true },
      { text: '처방전 무제한', included: true },
      { text: 'JSON 내보내기/가져오기', included: true },
      { text: 'Google Drive 백업', included: true },
      { text: '자동 백업 (실시간)', included: true },
      { text: '우선 지원 + 전화 상담', included: true },
    ],
  },
];

interface UsageStats {
  patients: number;
  prescriptions: number;
  initialCharts: number;
  progressNotes: number;
}

export function Settings() {
  const { settings, isLoading, loadSettings, saveSettings } = useClinicStore();
  const { authState } = useAuthStore();
  const [formData, setFormData] = useState<Partial<ClinicSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResettingPrescriptions, setIsResettingPrescriptions] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ patients: 0, prescriptions: 0, initialCharts: 0, progressNotes: 0 });
  const [activeTab, setActiveTab] = useState<'clinic' | 'subscription' | 'data' | 'backup'>('clinic');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 현재 구독 정보 (실제로는 Supabase에서 가져옴)
  const currentSubscription: Subscription = authState?.subscription || {
    user_id: authState?.user_email || '',
    plan: 'free',
    status: 'active',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const currentPlan = PLANS.find(p => p.id === currentSubscription.plan) || PLANS[0];

  useEffect(() => {
    loadSettings();
    loadUsageStats();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const loadUsageStats = () => {
    try {
      const db = getDb();
      if (!db) return;

      const patientsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM patients');
      const prescriptionsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescriptions');
      const initialChartsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM initial_charts');
      const progressNotesCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM progress_notes');

      setUsageStats({
        patients: patientsCount?.cnt || 0,
        prescriptions: prescriptionsCount?.cnt || 0,
        initialCharts: initialChartsCount?.cnt || 0,
        progressNotes: progressNotesCount?.cnt || 0,
      });
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const now = new Date().toISOString();
      const settingsData: ClinicSettings = {
        id: settings?.id || crypto.randomUUID(),
        clinic_name: formData.clinic_name || '',
        clinic_address: formData.clinic_address || undefined,
        clinic_phone: formData.clinic_phone || undefined,
        doctor_name: formData.doctor_name || undefined,
        license_number: formData.license_number || undefined,
        created_at: settings?.created_at || now,
        updated_at: now,
      };

      await saveSettings(settingsData);
      setMessage({ type: 'success', text: '설정이 저장되었습니다.' });
    } catch (error) {
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    }
    setIsSaving(false);
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 로컬 DB에서 데이터 가져오기
      const patients = queryToObjects(db, 'SELECT * FROM patients');
      const prescriptions = queryToObjects(db, 'SELECT * FROM prescriptions');
      const chartRecords = queryToObjects(db, 'SELECT * FROM chart_records');
      const clinicSettings = queryToObjects(db, 'SELECT * FROM clinic_settings');

      const exportData = {
        exported_at: new Date().toISOString(),
        patients,
        prescriptions,
        chart_records: chartRecords,
        clinic_settings: clinicSettings,
      };

      // 파일 다운로드 (Blob 사용)
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gosibang-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: '데이터가 내보내기되었습니다.' });
    } catch (error) {
      setMessage({ type: 'error', text: '내보내기에 실패했습니다.' });
    }
    setIsExporting(false);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 환자 데이터 가져오기
      if (importData.patients && Array.isArray(importData.patients)) {
        for (const patient of importData.patients) {
          try {
            db.run(
              `INSERT OR REPLACE INTO patients (id, name, chart_number, birth_date, gender, phone, address, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [patient.id, patient.name, patient.chart_number, patient.birth_date, patient.gender,
               patient.phone, patient.address, patient.notes, patient.created_at, patient.updated_at]
            );
          } catch (e) { /* skip duplicates */ }
        }
      }

      // 처방 데이터 가져오기
      if (importData.prescriptions && Array.isArray(importData.prescriptions)) {
        for (const rx of importData.prescriptions) {
          try {
            db.run(
              `INSERT OR REPLACE INTO prescriptions (id, patient_id, patient_name, chart_number, formula, merged_herbs, final_herbs,
               total_doses, days, doses_per_day, total_packs, pack_volume, water_amount, total_dosage, final_total_amount,
               notes, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [rx.id, rx.patient_id, rx.patient_name, rx.chart_number, rx.formula,
               typeof rx.merged_herbs === 'string' ? rx.merged_herbs : JSON.stringify(rx.merged_herbs || []),
               typeof rx.final_herbs === 'string' ? rx.final_herbs : JSON.stringify(rx.final_herbs || []),
               rx.total_doses, rx.days, rx.doses_per_day, rx.total_packs, rx.pack_volume, rx.water_amount,
               rx.total_dosage, rx.final_total_amount, rx.notes, rx.status, rx.created_at, rx.updated_at]
            );
          } catch (e) { /* skip duplicates */ }
        }
      }

      // 초진차트 가져오기
      if (importData.initial_charts && Array.isArray(importData.initial_charts)) {
        for (const chart of importData.initial_charts) {
          try {
            db.run(
              `INSERT OR REPLACE INTO initial_charts (id, patient_id, doctor_name, chart_date, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [chart.id, chart.patient_id, chart.doctor_name, chart.chart_date, chart.notes, chart.created_at, chart.updated_at]
            );
          } catch (e) { /* skip */ }
        }
      }

      // 경과기록 가져오기
      if (importData.progress_notes && Array.isArray(importData.progress_notes)) {
        for (const note of importData.progress_notes) {
          try {
            db.run(
              `INSERT OR REPLACE INTO progress_notes (id, patient_id, doctor_name, note_date, subjective, objective, assessment, plan, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [note.id, note.patient_id, note.doctor_name, note.note_date, note.subjective, note.objective,
               note.assessment, note.plan, note.notes, note.created_at, note.updated_at]
            );
          } catch (e) { /* skip */ }
        }
      }

      saveDb();
      loadUsageStats();
      setMessage({ type: 'success', text: '데이터를 성공적으로 가져왔습니다.' });
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: '데이터 가져오기에 실패했습니다. 파일 형식을 확인해주세요.' });
    }
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpgradePlan = (planId: string) => {
    // TODO: 실제 결제 연동
    alert(`${PLANS.find(p => p.id === planId)?.name} 플랜 업그레이드 기능은 준비 중입니다.\n\n문의: support@gosibang.com`);
  };

  const handleResetPrescriptionDefinitions = async () => {
    if (!confirm('기존 처방 정의를 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setIsResettingPrescriptions(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 기존 처방 정의 삭제
      db.run('DELETE FROM prescription_definitions');

      // 새 처방 정의 삽입
      PRESCRIPTION_DEFINITIONS.forEach(p => {
        try {
          db.run(
            'INSERT INTO prescription_definitions (name, alias, category, source, composition) VALUES (?, ?, ?, ?, ?)',
            [p.name, p.alias || null, p.category || null, p.source || null, p.composition]
          );
        } catch (e) { /* ignore */ }
      });

      saveDb();
      const count = PRESCRIPTION_DEFINITIONS.length;
      setMessage({ type: 'success', text: count > 0 ? `처방 정의가 ${count}개로 초기화되었습니다.` : '처방 정의가 모두 삭제되었습니다.' });
    } catch (error) {
      console.error('처방 정의 초기화 실패:', error);
      setMessage({ type: 'error', text: '처방 정의 초기화에 실패했습니다.' });
    }
    setIsResettingPrescriptions(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">활성</span>;
      case 'trial':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">체험판</span>;
      case 'expired':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">만료</span>;
      case 'cancelled':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">취소됨</span>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      {/* 알림 메시지 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('clinic')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'clinic'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            한의원 정보
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
              activeTab === 'subscription'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Crown className="w-4 h-4" />
            구독 관리
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'data'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            데이터 관리
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
              activeTab === 'backup'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Cloud className="w-4 h-4" />
            백업
          </button>
        </nav>
      </div>

      {/* 한의원 정보 탭 */}
      {activeTab === 'clinic' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">한의원 정보</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                한의원 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.clinic_name || ''}
                onChange={(e) => setFormData({ ...formData, clinic_name: e.target.value })}
                className="input-field"
                placeholder="예: 고시방한의원"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                원장님 성함
              </label>
              <input
                type="text"
                value={formData.doctor_name || ''}
                onChange={(e) => setFormData({ ...formData, doctor_name: e.target.value })}
                className="input-field"
                placeholder="예: 홍길동"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                면허번호
              </label>
              <input
                type="text"
                value={formData.license_number || ''}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                className="input-field"
                placeholder="한의사 면허번호"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                주소
              </label>
              <input
                type="text"
                value={formData.clinic_address || ''}
                onChange={(e) => setFormData({ ...formData, clinic_address: e.target.value })}
                className="input-field"
                placeholder="한의원 주소"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                전화번호
              </label>
              <input
                type="tel"
                value={formData.clinic_phone || ''}
                onChange={(e) => setFormData({ ...formData, clinic_phone: e.target.value })}
                className="input-field"
                placeholder="02-0000-0000"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 구독 관리 탭 */}
      {activeTab === 'subscription' && (
        <div className="space-y-6">
          {/* 현재 플랜 및 사용량 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 현재 구독 정보 */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">현재 플랜</h2>
                {getStatusBadge(currentSubscription.status)}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{currentPlan.name}</p>
                  <p className="text-sm text-gray-500">
                    {currentPlan.priceLabel}{currentPlan.period}
                  </p>
                </div>
              </div>
              {currentSubscription.status === 'active' && (
                <p className="text-sm text-gray-600">
                  만료일: {new Date(currentSubscription.expires_at).toLocaleDateString('ko-KR')}
                </p>
              )}
            </div>

            {/* 사용량 통계 */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">사용량</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">환자</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {usageStats.patients}
                    <span className="text-sm font-normal text-gray-500">
                      /{currentPlan.features.patients === -1 ? '∞' : currentPlan.features.patients}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">처방전</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {usageStats.prescriptions}
                    <span className="text-sm font-normal text-gray-500">
                      /{currentPlan.features.prescriptions === -1 ? '∞' : currentPlan.features.prescriptions}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <ClipboardList className="w-4 h-4" />
                    <span className="text-sm">초진차트</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{usageStats.initialCharts}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <ClipboardList className="w-4 h-4" />
                    <span className="text-sm">경과기록</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{usageStats.progressNotes}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 플랜 비교 */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">플랜 비교</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border-2 p-6 transition-all ${
                    plan.id === currentSubscription.plan
                      ? 'border-primary-500 bg-primary-50'
                      : plan.recommended
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {plan.recommended && plan.id !== currentSubscription.plan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                        추천
                      </span>
                    </div>
                  )}
                  {plan.id === currentSubscription.plan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-primary-600 text-white text-xs font-medium rounded-full">
                        현재 플랜
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-3xl font-bold text-gray-900">{plan.priceLabel}</span>
                      <span className="text-gray-500">{plan.period}</span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.featureList.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        {feature.included ? (
                          <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                        )}
                        <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {plan.id === currentSubscription.plan ? (
                    <button
                      disabled
                      className="w-full py-2 px-4 bg-gray-100 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                    >
                      현재 사용 중
                    </button>
                  ) : plan.price > (currentPlan?.price || 0) ? (
                    <button
                      onClick={() => handleUpgradePlan(plan.id)}
                      className="w-full py-2 px-4 bg-gradient-to-r from-primary-600 to-purple-600 text-white rounded-lg font-medium hover:from-primary-700 hover:to-purple-700 transition-all"
                    >
                      업그레이드
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgradePlan(plan.id)}
                      className="w-full py-2 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    >
                      다운그레이드
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 문의 안내 */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-600">
              구독 관련 문의: <a href="mailto:support@gosibang.com" className="text-primary-600 font-medium hover:underline">support@gosibang.com</a>
            </p>
          </div>
        </div>
      )}

      {/* 데이터 관리 탭 */}
      {activeTab === 'data' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">데이터 관리</h2>
          <p className="text-sm text-gray-600 mb-6">
            모든 환자 데이터와 처방 기록을 JSON 파일로 내보내거나 가져올 수 있습니다.
            <br />
            <span className="text-primary-600 font-medium">데이터는 이 브라우저에 로컬로 저장됩니다.</span>
          </p>

          <div className="space-y-4">
            {/* 내보내기 */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Download className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">데이터 내보내기</p>
                  <p className="text-sm text-gray-500">모든 데이터를 JSON 파일로 다운로드</p>
                </div>
              </div>
              <button
                onClick={handleExportAll}
                disabled={isExporting}
                className="btn-secondary flex items-center gap-2"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                내보내기
              </button>
            </div>

            {/* 가져오기 */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Upload className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">데이터 가져오기</p>
                  <p className="text-sm text-gray-500">JSON 백업 파일에서 데이터 복원</p>
                </div>
              </div>
              <label className="btn-secondary flex items-center gap-2 cursor-pointer">
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                가져오기
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  disabled={isImporting}
                />
              </label>
            </div>
          </div>

          {/* 처방 정의 초기화 */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">처방 정의 초기화</p>
                  <p className="text-sm text-gray-500">모든 처방 정의 삭제</p>
                </div>
              </div>
              <button
                onClick={handleResetPrescriptionDefinitions}
                disabled={isResettingPrescriptions}
                className="btn-secondary flex items-center gap-2"
              >
                {isResettingPrescriptions ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                초기화
              </button>
            </div>

          {/* 주의사항 */}
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>주의:</strong> 브라우저 데이터 삭제 시 로컬 데이터가 손실될 수 있습니다.
              정기적으로 데이터를 내보내기하여 백업하세요.
            </p>
          </div>
        </div>
      )}

      {/* 백업 탭 */}
      {activeTab === 'backup' && (
        <div className="space-y-6 max-w-2xl">
          {/* Google Drive 백업 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Google Drive 백업</h2>
                <p className="text-sm text-gray-500">자동으로 Google Drive에 백업</p>
              </div>
            </div>

            {currentSubscription.plan === 'free' ? (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-gray-600 mb-3">Google Drive 백업은 베이직 플랜부터 사용 가능합니다.</p>
                <button
                  onClick={() => setActiveTab('subscription')}
                  className="text-primary-600 font-medium hover:underline"
                >
                  플랜 업그레이드 →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">Google 계정 연결</p>
                    <p className="text-sm text-gray-500">백업을 저장할 Google 계정을 연결하세요</p>
                  </div>
                  <button
                    onClick={() => alert('Google Drive 연동 기능은 준비 중입니다.')}
                    className="btn-primary"
                  >
                    연결하기
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg opacity-50">
                  <div>
                    <p className="font-medium text-gray-900">자동 백업</p>
                    <p className="text-sm text-gray-500">Google 계정 연결 후 사용 가능</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-not-allowed">
                    <input type="checkbox" disabled className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer"></div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* 로컬 저장소 정보 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">로컬 저장소</h2>
                <p className="text-sm text-gray-500">브라우저 로컬 스토리지에 저장됨</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                현재 데이터는 브라우저의 localStorage에 저장됩니다.
                브라우저 데이터를 삭제하면 데이터가 손실될 수 있으므로,
                정기적으로 <button onClick={() => setActiveTab('data')} className="font-medium underline">데이터 내보내기</button>를 통해 백업하세요.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
