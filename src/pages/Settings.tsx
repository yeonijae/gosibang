import { useEffect, useState, useRef } from 'react';
import { Save, Download, Upload, Loader2, Crown, Check, X, Users, FileText, ClipboardList, HardDrive, RefreshCw, FolderOpen, RotateCcw, Trash2, Monitor, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { getDb, saveDb, queryOne } from '../lib/localDb';
import { PRESCRIPTION_DEFINITIONS } from '../lib/prescriptionData';
import { FEMALE_HEALTH_SURVEY } from '../lib/surveyData';
import { useClinicStore } from '../store/clinicStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import {
  loadBackupSettings,
  saveBackupSettings,
  loadBackupHistory,
  selectFolderAndBackup,
  downloadBackup,
  restoreFromBackup,
  isFileSystemAccessSupported,
  formatFileSize,
  formatRelativeTime,
  needsBackupCleanup,
  getCleanupInfo,
  cleanupBackupFolder,
  cleanupBackupHistory,
} from '../lib/backup';
import type { BackupSettings, BackupHistoryItem, CleanupInfo } from '../lib/backup';
import type { ClinicSettings, Subscription, FeatureKey } from '../types';
import {
  loadMenuOrder,
  saveMenuOrder,
  resetMenuOrder,
  MENU_ITEMS,
  moveMenuUp,
  moveMenuDown,
} from '../lib/menuConfig';

// DB에서 불러온 플랜 정책을 UI용으로 변환하는 타입
interface PlanDisplay {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  period: string;
  features: {
    patients: number;
    prescriptions: number;
    charts: number;
  };
  featureList: { text: string; included: boolean }[];
  recommended?: boolean;
}

// 기본 플랜 (DB 로드 실패 시 폴백)
const DEFAULT_PLANS: PlanDisplay[] = [
  {
    id: 'free',
    name: '무료',
    price: 0,
    priceLabel: '₩0',
    period: '',
    features: { patients: 10, prescriptions: 20, charts: 20 },
    featureList: [
      { text: '환자 10명까지', included: true },
      { text: '월 처방전 20개까지', included: true },
      { text: '월 차트 20개까지', included: true },
      { text: '대시보드', included: true },
      { text: '환자관리', included: true },
      { text: '처방관리', included: true },
      { text: '처방정의', included: true },
      { text: '차팅관리', included: true },
      { text: '설문관리', included: false },
      { text: '설문응답', included: false },
      { text: '복약관리', included: false },
      { text: '데이터 백업', included: false },
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
  const [isResettingPrescriptions, setIsResettingPrescriptions] = useState(false);
  const [isResettingSurveys, setIsResettingSurveys] = useState(false);
  const [isResettingUserData, setIsResettingUserData] = useState(false);
  const [isCleaningBackup, setIsCleaningBackup] = useState(false);
  const [showCleanupPrompt, setShowCleanupPrompt] = useState(false);
  const [cleanupInfo, setCleanupInfo] = useState<CleanupInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ patients: 0, prescriptions: 0, initialCharts: 0, progressNotes: 0 });
  const [activeTab, setActiveTab] = useState<'clinic' | 'subscription' | 'data' | 'backup' | 'display'>('clinic');
  const [menuOrder, setMenuOrder] = useState<FeatureKey[]>([]);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // 백업 관련 상태
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(loadBackupSettings);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>(loadBackupHistory);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // DB에서 불러온 플랜 정책
  const [plans, setPlans] = useState<PlanDisplay[]>(DEFAULT_PLANS);
  const [plansLoading, setPlansLoading] = useState(true);

  // 현재 구독 정보 (실제로는 Supabase에서 가져옴)
  const currentSubscription: Subscription = authState?.subscription || {
    user_id: authState?.user_email || '',
    plan: 'free',
    status: 'active',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const currentPlan = plans.find(p => p.id === currentSubscription.plan) || plans[0];

  useEffect(() => {
    loadSettings();
    loadUsageStats();
    loadPlanPolicies();
    setMenuOrder(loadMenuOrder());
  }, [loadSettings]);

  // Supabase에서 플랜 정책 불러오기
  const loadPlanPolicies = async () => {
    setPlansLoading(true);
    try {
      const { data, error } = await supabase
        .from('gosibang_plan_policies')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly');

      if (error) throw error;

      if (data && data.length > 0) {
        const transformedPlans: PlanDisplay[] = data.map(policy => {
          const formatLimit = (value: number, unit: string) => {
            if (value === -1) return `${unit} 무제한`;
            return `${unit} ${value}${unit === '환자' ? '명' : '개'}까지`;
          };

          const features = policy.features || {};

          // 기능 목록 생성 (메뉴 기능 포함)
          const featureList = [
            { text: formatLimit(policy.max_patients, '환자'), included: true },
            { text: formatLimit(policy.max_prescriptions_per_month, '월 처방전'), included: true },
            { text: formatLimit(policy.max_charts_per_month, '월 차트'), included: true },
            { text: '대시보드', included: features.dashboard !== false },
            { text: '환자관리', included: features.patients !== false },
            { text: '처방관리', included: features.prescriptions !== false },
            { text: '처방정의', included: features.prescription_definitions !== false },
            { text: '차팅관리', included: features.charts !== false },
            { text: '설문관리', included: features.survey_templates === true },
            { text: '설문응답', included: features.survey_responses === true },
            { text: '복약관리', included: features.medication === true },
            { text: '데이터 백업', included: features.backup === true },
          ];

          return {
            id: policy.plan_type,
            name: policy.display_name,
            price: policy.price_monthly,
            priceLabel: policy.price_monthly === 0 ? '₩0' : `₩${policy.price_monthly.toLocaleString()}`,
            period: policy.price_monthly === 0 ? '' : '/월',
            features: {
              patients: policy.max_patients,
              prescriptions: policy.max_prescriptions_per_month,
              charts: policy.max_charts_per_month,
            },
            featureList,
            recommended: policy.plan_type === 'basic',
          };
        });

        setPlans(transformedPlans);
      }
    } catch (err) {
      console.error('Failed to load plan policies:', err);
      // 에러 시 기본값 유지
    }
    setPlansLoading(false);
  };

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // 백업 탭 열릴 때 정리 필요 여부 체크
  useEffect(() => {
    if (activeTab === 'backup') {
      if (needsBackupCleanup()) {
        const info = getCleanupInfo();
        setCleanupInfo(info);
        setShowCleanupPrompt(true);
      }
    }
  }, [activeTab]);

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

  const handleUpgradePlan = (planId: string) => {
    // TODO: 실제 결제 연동
    alert(`${plans.find(p => p.id === planId)?.name} 플랜 업그레이드 기능은 준비 중입니다.\n\n문의: support@gosibang.com`);
  };

  // 메뉴 순서 변경 핸들러
  const handleMoveMenuUp = (key: FeatureKey) => {
    const newOrder = moveMenuUp(menuOrder, key);
    setMenuOrder(newOrder);
    saveMenuOrder(newOrder);
  };

  const handleMoveMenuDown = (key: FeatureKey) => {
    const newOrder = moveMenuDown(menuOrder, key);
    setMenuOrder(newOrder);
    saveMenuOrder(newOrder);
  };

  const handleResetMenuOrder = () => {
    if (confirm('메뉴 순서를 기본값으로 초기화하시겠습니까?')) {
      const defaultOrder = resetMenuOrder();
      setMenuOrder(defaultOrder);
      setMessage({ type: 'success', text: '메뉴 순서가 초기화되었습니다.' });
    }
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

  const handleResetSurveyTemplates = async () => {
    if (!confirm('기본 설문지 템플릿(여성 종합 건강 설문지)을 복원하시겠습니까?\n\n기존 템플릿은 유지되고, 기본 템플릿이 추가됩니다.')) {
      return;
    }

    setIsResettingSurveys(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 기존 여성 종합 건강 설문지가 있는지 확인
      const existing = queryOne<{ cnt: number }>(db, "SELECT COUNT(*) as cnt FROM survey_templates WHERE name = ?", [FEMALE_HEALTH_SURVEY.name]);

      if (existing && existing.cnt > 0) {
        // 기존 템플릿 업데이트
        db.run(
          `UPDATE survey_templates SET description = ?, questions = ?, display_mode = ?, is_active = ?, updated_at = datetime('now') WHERE name = ?`,
          [
            FEMALE_HEALTH_SURVEY.description || null,
            JSON.stringify(FEMALE_HEALTH_SURVEY.questions),
            FEMALE_HEALTH_SURVEY.display_mode || 'one_by_one',
            FEMALE_HEALTH_SURVEY.is_active ? 1 : 0,
            FEMALE_HEALTH_SURVEY.name
          ]
        );
        setMessage({ type: 'success', text: '여성 종합 건강 설문지가 업데이트되었습니다.' });
      } else {
        // 새 템플릿 삽입
        const id = `template_female_${Date.now()}`;
        db.run(
          `INSERT INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            id,
            FEMALE_HEALTH_SURVEY.name,
            FEMALE_HEALTH_SURVEY.description || null,
            JSON.stringify(FEMALE_HEALTH_SURVEY.questions),
            FEMALE_HEALTH_SURVEY.display_mode || 'one_by_one',
            FEMALE_HEALTH_SURVEY.is_active ? 1 : 0
          ]
        );
        setMessage({ type: 'success', text: '여성 종합 건강 설문지가 추가되었습니다.' });
      }

      saveDb();
    } catch (error) {
      console.error('설문지 템플릿 복원 실패:', error);
      setMessage({ type: 'error', text: '설문지 템플릿 복원에 실패했습니다.' });
    }
    setIsResettingSurveys(false);
  };

  const handleResetUserData = async () => {
    // 백업 여부 확인
    if (!backupSettings.lastBackupAt) {
      const shouldBackup = confirm(
        '⚠️ 백업 기록이 없습니다!\n\n' +
        '백업 생성하러 이동하시겠습니까?'
      );
      if (shouldBackup) {
        setActiveTab('backup');
        return;
      }

      // 백업 없이 진행할 건지 한번 더 확인
      const continueWithoutBackup = confirm(
        '정말 백업 없이 진행하시겠습니까?\n\n' +
        '삭제된 데이터는 복구할 수 없습니다.'
      );
      if (!continueWithoutBackup) return;
    }

    // 최종 확인
    const confirmDelete = confirm(
      '⚠️ 경고: 이 작업은 되돌릴 수 없습니다!\n\n' +
      '다음 데이터가 모두 삭제됩니다:\n' +
      `• 환자 ${usageStats.patients}명\n` +
      `• 처방전 ${usageStats.prescriptions}개\n` +
      `• 초진차트 ${usageStats.initialCharts}개\n` +
      `• 경과기록 ${usageStats.progressNotes}개\n\n` +
      '정말 삭제하시겠습니까?'
    );

    if (!confirmDelete) return;

    // 2차 확인
    const finalConfirm = prompt(
      '최종 확인: 삭제를 진행하려면 "삭제"를 입력하세요.'
    );

    if (finalConfirm !== '삭제') {
      setMessage({ type: 'error', text: '초기화가 취소되었습니다.' });
      return;
    }

    setIsResettingUserData(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 환자, 처방, 차트 데이터 삭제
      db.run('DELETE FROM progress_notes');
      db.run('DELETE FROM initial_charts');
      db.run('DELETE FROM prescriptions');
      db.run('DELETE FROM chart_records');
      db.run('DELETE FROM patients');

      saveDb();
      loadUsageStats();
      setMessage({ type: 'success', text: '환자/처방/차트 데이터가 모두 삭제되었습니다.' });
    } catch (error) {
      console.error('데이터 초기화 실패:', error);
      setMessage({ type: 'error', text: '데이터 초기화에 실패했습니다.' });
    }
    setIsResettingUserData(false);
  };

  // 백업 파일 정리 (폴더 기반)
  const handleCleanupBackup = async () => {
    setIsCleaningBackup(true);
    try {
      if (isFileSystemAccessSupported()) {
        // 폴더 선택 후 실제 파일 삭제
        const result = await cleanupBackupFolder();
        if (result.success) {
          setMessage({
            type: 'success',
            text: `백업 정리 완료: ${result.deletedCount}개 삭제, ${result.keptCount}개 유지`,
          });
          setBackupHistory(loadBackupHistory());
        } else if (result.error) {
          setMessage({ type: 'error', text: result.error });
        }
      } else {
        // 히스토리만 정리
        const result = cleanupBackupHistory();
        if (result.success) {
          setMessage({
            type: 'success',
            text: `백업 기록 정리 완료: ${result.deletedCount}개 삭제, ${result.keptCount}개 유지\n(다운로드 폴더의 파일은 직접 삭제해주세요)`,
          });
          setBackupHistory(loadBackupHistory());
        }
      }
    } catch (e) {
      console.error('Cleanup error:', e);
      setMessage({ type: 'error', text: '정리 중 오류가 발생했습니다.' });
    } finally {
      setIsCleaningBackup(false);
      setShowCleanupPrompt(false);
    }
  };

  // 자동 정리 팝업에서 승인
  const handleCleanupConfirm = async () => {
    await handleCleanupBackup();
  };

  // 자동 정리 팝업 닫기
  const handleCleanupDismiss = () => {
    setShowCleanupPrompt(false);
  };

  // 백업 설정 업데이트
  const updateBackupSettings = (updates: Partial<BackupSettings>) => {
    const newSettings = { ...backupSettings, ...updates };
    setBackupSettings(newSettings);
    saveBackupSettings(newSettings);
  };

  // 폴더 선택 백업 (File System Access API)
  const handleFolderBackup = async () => {
    setIsBackingUp(true);
    setMessage(null);

    const result = await selectFolderAndBackup();

    if (result.success) {
      setMessage({ type: 'success', text: `백업 완료: ${result.filename}` });
      setBackupSettings(loadBackupSettings());
      setBackupHistory(loadBackupHistory());
    } else {
      if (result.error !== '폴더 선택이 취소되었습니다.') {
        setMessage({ type: 'error', text: result.error || '백업 실패' });
      }
    }

    setIsBackingUp(false);
  };

  // 다운로드 백업
  const handleDownloadBackup = () => {
    setIsBackingUp(true);
    setMessage(null);

    const result = downloadBackup();

    if (result.success) {
      setMessage({ type: 'success', text: `백업 파일 다운로드 완료: ${result.filename}` });
      setBackupSettings(loadBackupSettings());
      setBackupHistory(loadBackupHistory());
    } else {
      setMessage({ type: 'error', text: result.error || '백업 실패' });
    }

    setIsBackingUp(false);
  };

  // 백업에서 복원
  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm('현재 데이터를 백업 파일로 복원하시겠습니까?\n\n기존 데이터는 덮어쓰기됩니다.\n복원 후 페이지가 새로고침됩니다.')) {
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = '';
      }
      return;
    }

    setIsRestoring(true);
    setMessage(null);

    const result = await restoreFromBackup(file);

    if (result.success) {
      setMessage({ type: 'success', text: '복원 완료. 페이지를 새로고침합니다...' });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      setMessage({ type: 'error', text: result.error || '복원 실패' });
      setIsRestoring(false);
    }

    if (backupFileInputRef.current) {
      backupFileInputRef.current.value = '';
    }
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
            <HardDrive className="w-4 h-4" />
            백업
          </button>
          <button
            onClick={() => setActiveTab('display')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
              activeTab === 'display'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Monitor className="w-4 h-4" />
            화면설정
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
            {plansLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
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
            )}
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
            기본 데이터를 복원하거나 초기화할 수 있습니다.
          </p>

          <div className="space-y-4">
            {/* 기본 처방 복원 */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">기본 처방 복원</p>
                  <p className="text-sm text-gray-500">기본 처방 정의 데이터로 복원</p>
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
                복원
              </button>
            </div>

            {/* 설문지 템플릿 복원 */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">설문지 템플릿 복원</p>
                  <p className="text-sm text-gray-500">여성 종합 건강 설문지 복원</p>
                </div>
              </div>
              <button
                onClick={handleResetSurveyTemplates}
                disabled={isResettingSurveys}
                className="btn-secondary flex items-center gap-2"
              >
                {isResettingSurveys ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                복원
              </button>
            </div>
          </div>

          {/* 위험 영역 구분선 */}
          <div className="mt-8 pt-6 border-t border-red-200">
            <h3 className="text-sm font-medium text-red-600 mb-4 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              위험 영역
            </h3>

            {/* 환자/처방/차트 초기화 */}
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">환자/처방/차트 초기화</p>
                  <p className="text-sm text-red-600">
                    환자 {usageStats.patients}명, 처방 {usageStats.prescriptions}개, 차트 {usageStats.initialCharts + usageStats.progressNotes}개 삭제
                  </p>
                </div>
              </div>
              <button
                onClick={handleResetUserData}
                disabled={isResettingUserData}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isResettingUserData ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                초기화
              </button>
            </div>
          </div>

          {/* 주의사항 */}
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>주의:</strong> 브라우저 데이터 삭제 시 로컬 데이터가 손실될 수 있습니다.
              정기적으로 백업 탭에서 백업하세요.
            </p>
          </div>
        </div>
      )}

      {/* 백업 탭 */}
      {activeTab === 'backup' && (
        <div className="space-y-6 max-w-2xl">
          {/* 백업 정리 권유 팝업 */}
          {showCleanupPrompt && cleanupInfo && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-amber-900">
                    백업 파일이 {cleanupInfo.totalCount}개 있습니다
                  </h3>
                  <p className="text-sm text-amber-800 mt-1">
                    백업 파일을 자동으로 정리할까요?<br />
                    <span className="text-xs">
                      (하루 중 가장 늦게 생성된 1개만 남기고, 최근 5일분만 유지)
                    </span>
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleCleanupConfirm}
                      disabled={isCleaningBackup}
                      className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isCleaningBackup ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      정리하기
                    </button>
                    <button
                      onClick={handleCleanupDismiss}
                      className="px-3 py-1.5 bg-white text-amber-700 text-sm rounded-lg border border-amber-300 hover:bg-amber-50"
                    >
                      나중에
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 로컬 백업 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">로컬 백업</h2>
                <p className="text-sm text-gray-500">데이터베이스를 로컬에 백업</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* 백업 폴더 설정 (File System Access API 지원 시) */}
              {isFileSystemAccessSupported() && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">백업 폴더 설정</p>
                    <p className="text-sm text-gray-500">
                      {backupSettings.backupFolderName || '폴더가 설정되지 않음'}
                    </p>
                  </div>
                  <button
                    onClick={handleFolderBackup}
                    disabled={isBackingUp}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    폴더 선택
                  </button>
                </div>
              )}

              {/* 지금 백업 파일 생성 */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">지금 백업 파일 생성</p>
                  <p className="text-sm text-gray-500">
                    {backupSettings.lastBackupAt
                      ? `마지막 백업: ${formatRelativeTime(backupSettings.lastBackupAt)}`
                      : '백업 기록 없음'}
                  </p>
                </div>
                <button
                  onClick={handleDownloadBackup}
                  disabled={isBackingUp}
                  className="btn-primary flex items-center gap-2"
                >
                  {isBackingUp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  백업
                </button>
              </div>

              {/* 자동 백업 옵션 */}
              <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">자동 백업</p>
                    <p className="text-sm text-gray-500">앱 시작 시 자동으로 백업</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backupSettings.autoBackupEnabled}
                      onChange={(e) => updateBackupSettings({ autoBackupEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>
                {backupSettings.autoBackupEnabled && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-sm text-gray-600">백업 주기</span>
                    <select
                      value={backupSettings.autoBackupInterval}
                      onChange={(e) => updateBackupSettings({ autoBackupInterval: e.target.value as 'daily' | 'weekly' | 'manual' })}
                      className="input-field w-28 text-sm"
                    >
                      <option value="daily">매일</option>
                      <option value="weekly">매주</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 복원 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">복원</h2>
                <p className="text-sm text-gray-500">백업 파일에서 데이터 복원</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">백업 파일에서 복원</p>
                <p className="text-sm text-gray-500">.db 파일을 선택하여 복원</p>
              </div>
              <label className="btn-secondary flex items-center gap-2 cursor-pointer">
                {isRestoring ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                파일 선택
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".db"
                  onChange={handleRestoreBackup}
                  className="hidden"
                  disabled={isRestoring}
                />
              </label>
            </div>
          </div>

          {/* 백업 파일 정리 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">백업 파일 정리</h2>
                <p className="text-sm text-gray-500">
                  하루 중 마지막 백업만 남기고 최근 5일분 유지
                </p>
              </div>
              <button
                onClick={handleCleanupBackup}
                disabled={isCleaningBackup || backupHistory.length === 0}
                className="btn-secondary flex items-center gap-2"
              >
                {isCleaningBackup ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                정리하기
              </button>
            </div>
            <p className="text-xs text-gray-500">
              백업 파일이 10개 이상이면 자동으로 정리 팝업이 나타납니다.
            </p>
          </div>

          {/* 백업 기록 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                백업 기록 {backupHistory.length > 0 && <span className="text-sm text-gray-500 font-normal">({backupHistory.length}개)</span>}
              </h2>
            </div>
            {backupHistory.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {backupHistory.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.filename}</p>
                        <p className="text-xs text-gray-500">
                          {formatRelativeTime(item.createdAt)} · {formatFileSize(item.size)}
                          {item.type === 'auto' && (
                            <span className="ml-1 px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">자동</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">백업 기록이 없습니다</p>
            )}
          </div>

          {/* 클라우드 동기화 팁 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">클라우드 동기화 팁</h3>
            <p className="text-sm text-blue-800 mb-2">
              백업 폴더를 클라우드 동기화 폴더로 설정하면 자동으로 클라우드에 백업됩니다.
            </p>
            <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
              <li>Google Drive: 데스크톱 앱 → 동기화 폴더 선택</li>
              <li>OneDrive: 문서 폴더 사용</li>
              <li>Dropbox: Dropbox 폴더 내 백업 폴더 생성</li>
            </ul>
          </div>
        </div>
      )}

      {/* 화면설정 탭 */}
      {activeTab === 'display' && (
        <div className="space-y-6 max-w-2xl">
          {/* 메뉴 순서 설정 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <GripVertical className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">메뉴 순서</h2>
                  <p className="text-sm text-gray-500">왼쪽 사이드바 메뉴의 순서를 변경합니다</p>
                </div>
              </div>
              <button
                onClick={handleResetMenuOrder}
                className="btn-secondary text-sm flex items-center gap-1"
              >
                <RotateCcw className="w-4 h-4" />
                초기화
              </button>
            </div>

            <div className="space-y-2">
              {/* 순서 변경 가능한 메뉴 */}
              {menuOrder.map((key, index) => {
                const menuItem = MENU_ITEMS.find(item => item.key === key);
                if (!menuItem) return null;

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-700">{menuItem.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveMenuUp(key)}
                        disabled={index === 0}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="위로 이동"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveMenuDown(key)}
                        disabled={index === menuOrder.length - 1}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="아래로 이동"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 설정 (고정) */}
              <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg opacity-60 mt-4 border-t border-gray-200 pt-4">
                <div className="flex items-center gap-3">
                  <GripVertical className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-gray-700">설정</span>
                </div>
                <span className="text-xs text-gray-500 px-2 py-1 bg-gray-200 rounded">고정</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                변경 사항은 자동으로 저장되며, 페이지를 새로고침하면 적용됩니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
