import { useEffect, useState, useRef } from 'react';
import { Save, Download, Upload, Loader2, Crown, Check, X, Users, FileText, ClipboardList, HardDrive, FolderOpen, RotateCcw, Trash2, UserX, AlertTriangle, User, Mail, Phone, GraduationCap, FileDown, Globe, Server, Play, Copy, ExternalLink, Key } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getDb, saveDb, queryOne, queryToObjects, resetPrescriptionDefinitions, getTrashItems, getTrashCount, restoreFromTrash, permanentDelete, emptyTrash, type TrashItem } from '../lib/localDb';
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
import type { ClinicSettings, Subscription, DisplayConfig } from '../types';
import { usePlanLimits } from '../hooks/usePlanLimits';

// 기본 표시 설정
const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  show_price: false,
  show_patient_limit: false,
  show_prescription_limit: false,
  show_chart_limit: false,
};

// 기능 레이블 매핑 (gosibang-admin과 동기화)
const FEATURE_LABELS: Record<string, string> = {
  dashboard: '대시보드',
  patients: '환자관리',
  prescriptions: '처방관리',
  prescription_definitions: '처방정의',
  prescription_definitions_edit: '처방정의변경',
  charts: '차트관리',
  survey_templates: '설문템플릿',
  survey_responses: '설문관리',
  survey_internal: '원내설문지',
  survey_external: '온라인설문지',
  medication: '복약관리',
  homework: '나의숙제',
  backup: '백업',
  export: '내보내기',
  multiUser: '다중사용자',
};

// 기능 표시 순서 (플랜 비교에서 표시할 기능)
const DISPLAY_FEATURES: string[] = [
  'dashboard',
  'patients',
  'prescriptions',
  'prescription_definitions',
  'charts',
  'survey_templates',
  'survey_responses',
  'survey_internal',
  'survey_external',
  'medication',
  'homework',
  'backup',
];

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
  displayConfig: DisplayConfig;
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
    features: { patients: -1, prescriptions: -1, charts: -1 },
    displayConfig: DEFAULT_DISPLAY_CONFIG,
    featureList: [
      { text: '대시보드', included: true },
      { text: '환자관리', included: true },
      { text: '처방관리', included: true },
      { text: '처방정의', included: true },
      { text: '차트관리', included: true },
      { text: '설문템플릿', included: false },
      { text: '설문관리', included: false },
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
  const { canUseFeature, planInfo } = usePlanLimits();
  const [formData, setFormData] = useState<Partial<ClinicSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingUserData, setIsResettingUserData] = useState(false);
  const [isCleaningBackup, setIsCleaningBackup] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showCleanupPrompt, setShowCleanupPrompt] = useState(false);
  const [cleanupInfo, setCleanupInfo] = useState<CleanupInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ patients: 0, prescriptions: 0, initialCharts: 0, progressNotes: 0 });
  const [activeTab, setActiveTab] = useState<'profile' | 'clinic' | 'subscription' | 'survey' | 'data' | 'backup'>('profile');
  const [serverAutostart, setServerAutostart] = useState(false);
  const [isRestoringTemplates, setIsRestoringTemplates] = useState(false);

  // 내 정보 관련 상태
  interface UserProfile {
    name: string;
    phone: string;
    lecture_id: string;
    is_approved: boolean;
    approved_at?: string;
    created_at?: string;
  }
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', phone: '', lecture_id: '', is_approved: false });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  // 휴지통 관련 상태
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashCount, setTrashCount] = useState({ total: 0, patients: 0, prescriptions: 0, charts: 0 });
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // 백업 관련 상태
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(loadBackupSettings);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>(loadBackupHistory);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // HTTP 서버 관련 상태
  interface ServerStatus {
    running: boolean;
    port: number | null;
    local_ip: string | null;
    url: string | null;
  }
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ running: false, port: null, local_ip: null, url: null });
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [staffPassword, setStaffPassword] = useState('');
  const [hasStaffPw, setHasStaffPw] = useState(false);

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

  useEffect(() => {
    loadSettings();
    loadUsageStats();
    loadPlanPolicies();
    loadUserProfile();
    loadServerStatus();
    checkStaffPassword();
    loadServerAutostart();
  }, [loadSettings]);

  // 서버 자동 시작 설정 로드
  const loadServerAutostart = async () => {
    try {
      const enabled = await invoke<boolean>('get_server_autostart');
      setServerAutostart(enabled);
    } catch (e) {
      console.error('서버 자동 시작 설정 로드 실패:', e);
    }
  };

  // 서버 자동 시작 설정 저장
  const handleServerAutostartChange = async (enabled: boolean) => {
    try {
      await invoke('set_server_autostart', { enabled });
      setServerAutostart(enabled);
      setMessage({ type: 'success', text: enabled ? '앱 시작 시 서버가 자동으로 시작됩니다.' : '서버 자동 시작이 해제되었습니다.' });
    } catch (e) {
      setMessage({ type: 'error', text: `설정 저장 실패: ${e}` });
    }
  };

  // 기본 설문 템플릿 복원
  const handleRestoreTemplates = async () => {
    if (!confirm('기본 설문지를 복원하시겠습니까?\n\n삭제된 기본 설문지(여성, 소아)가 다시 생성됩니다.')) {
      return;
    }
    setIsRestoringTemplates(true);
    try {
      await invoke('restore_default_survey_templates');
      setMessage({ type: 'success', text: '기본 설문지가 복원되었습니다.' });
    } catch (e) {
      setMessage({ type: 'error', text: `복원 실패: ${e}` });
    } finally {
      setIsRestoringTemplates(false);
    }
  };

  // HTTP 서버 상태 확인
  const loadServerStatus = async () => {
    try {
      const status = await invoke<ServerStatus>('get_server_status');
      setServerStatus(status);
    } catch (e) {
      console.error('서버 상태 확인 실패:', e);
    }
  };

  // 직원 비밀번호 설정 여부 확인
  const checkStaffPassword = async () => {
    try {
      const hasPw = await invoke<boolean>('has_staff_password');
      setHasStaffPw(hasPw);
    } catch (e) {
      console.error('직원 비밀번호 확인 실패:', e);
    }
  };

  // HTTP 서버 시작
  const handleStartServer = async () => {
    setIsStartingServer(true);
    try {
      const url = await invoke<string>('start_http_server', {
        port: 3030,
        planType: planInfo.type,
        surveyExternal: canUseFeature('survey_external'),
      });
      setMessage({ type: 'success', text: `HTTP 서버가 시작되었습니다: ${url}` });
      await loadServerStatus();
    } catch (e) {
      setMessage({ type: 'error', text: `서버 시작 실패: ${e}` });
    } finally {
      setIsStartingServer(false);
    }
  };

  // 직원 비밀번호 설정
  const handleSetStaffPassword = async () => {
    if (!staffPassword || staffPassword.length < 4) {
      setMessage({ type: 'error', text: '비밀번호는 4자 이상이어야 합니다.' });
      return;
    }
    try {
      await invoke('set_staff_password', { password: staffPassword });
      setMessage({ type: 'success', text: '직원 비밀번호가 설정되었습니다.' });
      setStaffPassword('');
      setHasStaffPw(true);
    } catch (e) {
      setMessage({ type: 'error', text: `비밀번호 설정 실패: ${e}` });
    }
  };

  // URL 복사
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'URL이 클립보드에 복사되었습니다.' });
  };

  // 사용자 프로필 불러오기
  const loadUserProfile = async () => {
    if (!authState?.user?.id) return;

    setIsLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from('gosibang_user_profiles')
        .select('name, phone, lecture_id, is_approved, approved_at, created_at')
        .eq('id', authState.user.id)
        .single();

      if (error) throw error;

      if (data) {
        setUserProfile({
          name: data.name || '',
          phone: data.phone || '',
          lecture_id: data.lecture_id || '',
          is_approved: data.is_approved || false,
          approved_at: data.approved_at,
          created_at: data.created_at,
        });
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // 사용자 프로필 저장
  const handleSaveProfile = async () => {
    if (!authState?.user?.id) {
      setMessage({ type: 'error', text: '로그인 상태를 확인해주세요.' });
      return;
    }

    setIsSavingProfile(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('gosibang_user_profiles')
        .update({
          name: userProfile.name || null,
          phone: userProfile.phone || null,
          lecture_id: userProfile.lecture_id || null,
        })
        .eq('id', authState.user.id);

      if (error) throw error;

      setMessage({ type: 'success', text: '내 정보가 저장되었습니다.' });
    } catch (error) {
      console.error('Failed to save profile:', error);
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // 비밀번호 변경
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '새 비밀번호는 6자 이상이어야 합니다.' });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setMessage({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' });
      return;
    }

    setIsChangingPassword(true);
    setMessage(null);

    try {
      // 현재 비밀번호로 로그인 시도하여 검증
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authState?.user_email || '',
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('현재 비밀번호가 올바르지 않습니다.');
      }

      // 비밀번호 업데이트
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: '비밀번호가 변경되었습니다.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      console.error('Password change error:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Supabase에서 플랜 정책 불러오기
  const loadPlanPolicies = async () => {
    setPlansLoading(true);
    try {
      const { data, error } = await supabase
        .from('gosibang_plan_policies')
        .select('*')
        .eq('is_active', true)
        .order('id');

      if (error) throw error;

      if (data && data.length > 0) {
        const transformedPlans: PlanDisplay[] = data.map(policy => {
          const formatLimit = (value: number, unit: string) => {
            if (value === -1) return `${unit} 무제한`;
            return `${unit} ${value}${unit === '환자' ? '명' : '개'}까지`;
          };

          const features = policy.features || {};
          const displayConfig: DisplayConfig = policy.display_config || DEFAULT_DISPLAY_CONFIG;

          // 기능 목록 동적 생성 (display_config 기반)
          const featureList: { text: string; included: boolean }[] = [];

          // 제한 표시 (display_config에 따라 조건부)
          if (displayConfig.show_patient_limit) {
            featureList.push({ text: formatLimit(policy.max_patients, '환자'), included: true });
          }
          if (displayConfig.show_prescription_limit) {
            featureList.push({ text: formatLimit(policy.max_prescriptions_per_month, '월 처방전'), included: true });
          }
          if (displayConfig.show_chart_limit) {
            featureList.push({ text: formatLimit(policy.max_charts_per_month, '월 차트'), included: true });
          }

          // DISPLAY_FEATURES 순서대로 동적으로 추가
          for (const featureKey of DISPLAY_FEATURES) {
            const label = FEATURE_LABELS[featureKey];
            if (!label) continue;

            // 모든 기능은 명시적으로 true일 때만 포함
            const included = features[featureKey] === true;

            featureList.push({ text: label, included });
          }

          const price = policy.price_monthly ?? 0;
          return {
            id: policy.plan_type,
            name: policy.display_name,
            price,
            priceLabel: price === 0 ? '₩0' : `₩${price.toLocaleString()}`,
            period: price === 0 ? '' : '/월',
            features: {
              patients: policy.max_patients,
              prescriptions: policy.max_prescriptions_per_month,
              charts: policy.max_charts_per_month,
            },
            displayConfig,
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

      const patientsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM patients WHERE deleted_at IS NULL');
      const prescriptionsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescriptions WHERE deleted_at IS NULL');
      const initialChartsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM initial_charts WHERE deleted_at IS NULL');
      const progressNotesCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM progress_notes WHERE deleted_at IS NULL');

      setUsageStats({
        patients: patientsCount?.cnt || 0,
        prescriptions: prescriptionsCount?.cnt || 0,
        initialCharts: initialChartsCount?.cnt || 0,
        progressNotes: progressNotesCount?.cnt || 0,
      });

      // 휴지통 개수도 업데이트
      setTrashCount(getTrashCount());
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };

  // 휴지통 항목 로드
  const loadTrashItems = () => {
    setIsLoadingTrash(true);
    try {
      const items = getTrashItems();
      setTrashItems(items);
      setTrashCount(getTrashCount());
    } catch (error) {
      console.error('Failed to load trash items:', error);
    } finally {
      setIsLoadingTrash(false);
    }
  };

  // 휴지통에서 복원
  const handleRestore = (item: TrashItem) => {
    const tableMap = {
      patient: 'patients',
      prescription: 'prescriptions',
      initial_chart: 'initial_charts',
      progress_note: 'progress_notes',
    } as const;

    const success = restoreFromTrash(tableMap[item.type], item.id);
    if (success) {
      loadTrashItems();
      loadUsageStats();
      setMessage({ type: 'success', text: `${item.name}이(가) 복원되었습니다.` });
    } else {
      setMessage({ type: 'error', text: '복원에 실패했습니다.' });
    }
  };

  // 영구 삭제
  const handlePermanentDelete = (item: TrashItem) => {
    if (!confirm(`"${item.name}"을(를) 영구 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;

    const tableMap = {
      patient: 'patients',
      prescription: 'prescriptions',
      initial_chart: 'initial_charts',
      progress_note: 'progress_notes',
    } as const;

    const success = permanentDelete(tableMap[item.type], item.id);
    if (success) {
      loadTrashItems();
      setMessage({ type: 'success', text: `${item.name}이(가) 영구 삭제되었습니다.` });
    } else {
      setMessage({ type: 'error', text: '삭제에 실패했습니다.' });
    }
  };

  // 휴지통 비우기
  const handleEmptyTrash = () => {
    if (!confirm('휴지통을 비우시겠습니까?\n\n모든 항목이 영구 삭제되며 복구할 수 없습니다.')) return;

    const result = emptyTrash();
    loadTrashItems();
    loadUsageStats();
    setMessage({
      type: 'success',
      text: `휴지통이 비워졌습니다. (환자 ${result.patients}명, 처방 ${result.prescriptions}개, 차트 ${result.charts}개 삭제)`,
    });
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

  const handleResetUserData = async () => {
    // 백업 기능이 있는 사용자만 백업 여부 확인
    if (canUseFeature('backup') && !backupSettings.lastBackupAt) {
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

      // 처방정의 초기화 (265개로 복원)
      const prescriptionCount = resetPrescriptionDefinitions();

      saveDb();
      loadUsageStats();
      setMessage({ type: 'success', text: `초기화 완료: 모든 데이터 삭제, 처방정의 ${prescriptionCount}개로 복원` });
    } catch (error) {
      console.error('데이터 초기화 실패:', error);
      setMessage({ type: 'error', text: '데이터 초기화에 실패했습니다.' });
    }
    setIsResettingUserData(false);
  };

  // JSON 다운로드 헬퍼
  const downloadJSON = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 전체 데이터 내보내기 (JSON)
  const handleExportAll = () => {
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const patients = queryToObjects(db, 'SELECT * FROM patients');
      const prescriptions = queryToObjects(db, 'SELECT * FROM prescriptions');
      const initialCharts = queryToObjects(db, 'SELECT * FROM initial_charts');
      const progressNotes = queryToObjects(db, 'SELECT * FROM progress_notes');
      const prescriptionDefinitions = queryToObjects(db, 'SELECT * FROM prescription_definitions');
      const surveyTemplates = queryToObjects(db, 'SELECT * FROM survey_templates');
      const surveyResponses = queryToObjects(db, 'SELECT * FROM survey_responses');
      const clinicSettings = queryToObjects(db, 'SELECT * FROM clinic_settings');

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        data: {
          patients,
          prescriptions,
          initial_charts: initialCharts,
          progress_notes: progressNotes,
          prescription_definitions: prescriptionDefinitions,
          survey_templates: surveyTemplates,
          survey_responses: surveyResponses,
          clinic_settings: clinicSettings,
        },
        counts: {
          patients: patients.length,
          prescriptions: prescriptions.length,
          initial_charts: initialCharts.length,
          progress_notes: progressNotes.length,
          prescription_definitions: prescriptionDefinitions.length,
        }
      };

      downloadJSON(exportData, 'gosibang_full_export');
      setMessage({ type: 'success', text: '전체 데이터를 내보냈습니다.' });
    } catch (error) {
      console.error('Export all error:', error);
      setMessage({ type: 'error', text: '전체 데이터 내보내기에 실패했습니다.' });
    }
  };

  // 회원탈퇴 처리
  const handleWithdraw = async () => {
    if (!authState?.user?.id) {
      setMessage({ type: 'error', text: '로그인 상태를 확인해주세요.' });
      return;
    }

    // 1차 경고
    const firstConfirm = confirm(
      '⚠️ 회원 탈퇴 경고\n\n' +
      '탈퇴 시 다음 데이터가 모두 삭제됩니다:\n\n' +
      '• 로컬 데이터 (환자, 처방, 차트 등)\n' +
      '• 서버 계정 정보\n' +
      '• 구독 정보\n\n' +
      '이 작업은 되돌릴 수 없습니다.\n' +
      '정말 탈퇴하시겠습니까?'
    );

    if (!firstConfirm) return;

    // 2차 확인
    const finalConfirm = prompt(
      '최종 확인: 탈퇴를 진행하려면 "탈퇴"를 입력하세요.'
    );

    if (finalConfirm !== '탈퇴') {
      setMessage({ type: 'error', text: '탈퇴가 취소되었습니다.' });
      return;
    }

    setIsWithdrawing(true);
    try {
      const userId = authState.user.id;

      // 1. Supabase에서 사용자 데이터 삭제 (프로필, 구독)
      const { error: profileError } = await supabase
        .from('gosibang_user_profiles')
        .delete()
        .eq('id', userId);

      if (profileError) {
        console.error('Profile delete error:', profileError);
      }

      const { error: subscriptionError } = await supabase
        .from('gosibang_subscriptions')
        .delete()
        .eq('user_id', userId);

      if (subscriptionError) {
        console.error('Subscription delete error:', subscriptionError);
      }

      // 2. Edge Function으로 auth.users 삭제 요청
      const { error: withdrawError } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userId }
      });

      if (withdrawError) {
        console.error('Auth delete error:', withdrawError);
        // Edge Function 실패해도 계속 진행 (로컬 데이터라도 삭제)
      }

      // 3. 로컬 데이터 삭제 (localStorage)
      const currentDbKey = `gosibang_db_${userId}`;
      localStorage.removeItem(currentDbKey);
      localStorage.removeItem('gosibang_db'); // 기본 키도 삭제
      localStorage.removeItem('gosibang_backup_settings');
      localStorage.removeItem('gosibang_backup_history');
      localStorage.removeItem('gosibang_menu_order');

      // 4. 로그아웃
      await supabase.auth.signOut();

      alert('회원 탈퇴가 완료되었습니다.\n이용해주셔서 감사합니다.');
      window.location.reload();

    } catch (error) {
      console.error('Withdraw error:', error);
      setMessage({ type: 'error', text: '탈퇴 처리 중 오류가 발생했습니다.' });
    } finally {
      setIsWithdrawing(false);
    }
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
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
              activeTab === 'profile'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <User className="w-4 h-4" />
            내 정보
          </button>
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
          {canUseFeature('survey_internal') && (
            <button
              onClick={() => setActiveTab('survey')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                activeTab === 'survey'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              설문지
            </button>
          )}
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
          {canUseFeature('backup') && (
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
          )}
        </nav>
      </div>

      {/* 내 정보 탭 */}
      {activeTab === 'profile' && (
        <div className="space-y-6 max-w-2xl">
          {/* 계정 정보 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">내 정보</h2>
                <p className="text-sm text-gray-500">{authState?.user_email || '이메일 없음'}</p>
              </div>
              {userProfile.is_approved ? (
                <span className="ml-auto px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  승인됨
                </span>
              ) : (
                <span className="ml-auto px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                  승인 대기
                </span>
              )}
            </div>

            {isLoadingProfile ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* 이메일 (읽기전용) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      이메일
                    </span>
                  </label>
                  <input
                    type="email"
                    value={authState?.user_email || ''}
                    disabled
                    className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">이메일은 변경할 수 없습니다</p>
                </div>

                {/* 이름 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      이름
                    </span>
                  </label>
                  <input
                    type="text"
                    value={userProfile.name}
                    onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                    className="input-field"
                    placeholder="이름을 입력하세요"
                  />
                </div>

                {/* 연락처 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      연락처
                    </span>
                  </label>
                  <input
                    type="tel"
                    value={userProfile.phone}
                    onChange={(e) => setUserProfile({ ...userProfile, phone: e.target.value })}
                    className="input-field"
                    placeholder="010-0000-0000"
                  />
                </div>

                {/* 강의 아이디 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-4 h-4" />
                      강의 아이디
                    </span>
                  </label>
                  <input
                    type="text"
                    value={userProfile.lecture_id}
                    onChange={(e) => setUserProfile({ ...userProfile, lecture_id: e.target.value })}
                    className="input-field"
                    placeholder="수강 중인 강의 아이디"
                  />
                </div>

                {/* 가입일/승인일 정보 */}
                <div className="pt-4 border-t border-gray-200 text-sm text-gray-500 space-y-1">
                  {userProfile.created_at && (
                    <p>가입일: {new Date(userProfile.created_at).toLocaleDateString('ko-KR')}</p>
                  )}
                  {userProfile.approved_at && (
                    <p>승인일: {new Date(userProfile.approved_at).toLocaleDateString('ko-KR')}</p>
                  )}
                </div>

                {/* 저장 버튼 */}
                <div className="pt-4">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isSavingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    저장
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 비밀번호 변경 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Key className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">비밀번호 변경</h2>
                <p className="text-sm text-gray-500">계정 비밀번호를 변경합니다</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  현재 비밀번호
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field"
                  placeholder="현재 비밀번호 입력"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field"
                  placeholder="새 비밀번호 입력 (6자 이상)"
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="input-field"
                  placeholder="새 비밀번호 다시 입력"
                  minLength={6}
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                  className="btn-primary flex items-center gap-2"
                >
                  {isChangingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  비밀번호 변경
                </button>
              </div>
            </div>
          </div>

          {/* 회원탈퇴 */}
          <div className="card border-red-200 bg-red-50/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">회원 탈퇴</h2>
                <p className="text-sm text-red-600">계정과 모든 데이터가 영구 삭제됩니다</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-2">탈퇴 시 삭제되는 정보:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>로컬 데이터 (환자 {usageStats.patients}명, 처방전 {usageStats.prescriptions}개, 차트 {usageStats.initialCharts + usageStats.progressNotes}개)</li>
                    <li>계정 정보 및 로그인 정보</li>
                    <li>구독 정보</li>
                  </ul>
                  <p className="mt-2 font-medium">이 작업은 되돌릴 수 없습니다.</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="w-full py-3 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  탈퇴 처리 중...
                </>
              ) : (
                <>
                  <UserX className="w-4 h-4" />
                  회원 탈퇴
                </>
              )}
            </button>
          </div>
        </div>
      )}

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
                    {plan.displayConfig?.show_price && (
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-3xl font-bold text-gray-900">{plan.priceLabel}</span>
                        <span className="text-gray-500">{plan.period}</span>
                      </div>
                    )}
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

                  {plan.id === currentSubscription.plan && (
                    <button
                      disabled
                      className="w-full py-2 px-4 bg-gray-100 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                    >
                      현재 사용 중
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

      {/* 설문지 탭 */}
      {activeTab === 'survey' && canUseFeature('survey_internal') && (
        <div className="space-y-6 max-w-2xl">
          {/* 설문지 복원 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">설문지 복원</h2>
                <p className="text-sm text-gray-500">삭제된 기본 설문지를 복원합니다</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">기본 설문지 복원</p>
                <p className="text-sm text-gray-500">기본설문지-여성, 기본설문지-소아</p>
              </div>
              <button
                onClick={handleRestoreTemplates}
                disabled={isRestoringTemplates}
                className="btn-secondary flex items-center gap-2"
              >
                {isRestoringTemplates ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                복원
              </button>
            </div>
          </div>

          {/* 원내 서버 */}
          <div className="card border-2 border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Server className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">원내 서버</h2>
                <p className="text-sm text-gray-500">같은 네트워크의 다른 기기에서 설문/대시보드 접속</p>
              </div>
            </div>

            {/* 자동 시작 설정 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">앱 시작 시 자동으로 서버 시작</p>
                  <p className="text-sm text-gray-500">앱을 열면 서버가 자동으로 시작됩니다</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serverAutostart}
                    onChange={(e) => handleServerAutostartChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>

            {/* 서버 상태 및 시작/중지 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900">서버 상태</p>
                  <p className="text-sm text-gray-500">
                    {serverStatus.running
                      ? `실행 중: ${serverStatus.url}`
                      : '서버가 중지되어 있습니다'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {serverStatus.running ? (
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      실행 중
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                      중지됨
                    </span>
                  )}
                </div>
              </div>

              {!serverStatus.running ? (
                <button
                  onClick={handleStartServer}
                  disabled={isStartingServer || !hasStaffPw}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {isStartingServer ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      시작 중...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      서버 시작
                    </>
                  )}
                </button>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    서버를 중지하려면 앱을 재시작해주세요.
                  </p>
                </div>
              )}

              {!hasStaffPw && !serverStatus.running && (
                <p className="text-xs text-amber-600 mt-2">
                  서버를 시작하려면 먼저 직원 비밀번호를 설정해주세요.
                </p>
              )}
            </div>

            <div className="text-xs text-gray-500">
              <p>• 같은 Wi-Fi/네트워크에 연결된 기기에서만 접속 가능합니다</p>
              <p>• 앱을 종료하면 서버도 함께 종료됩니다</p>
            </div>
          </div>

          {/* 설문지 관리 - 직원 비밀번호 설정 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">설문지 관리</h2>
                <p className="text-sm text-gray-500">직원 대시보드 접근 설정</p>
              </div>
            </div>

            {/* 직원 비밀번호 설정 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900">직원 비밀번호</p>
                  <p className="text-sm text-gray-500">
                    {hasStaffPw ? '비밀번호가 설정되어 있습니다' : '비밀번호를 먼저 설정해주세요'}
                  </p>
                </div>
                {hasStaffPw && (
                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    설정됨
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder={hasStaffPw ? '새 비밀번호 입력' : '비밀번호 입력 (4자 이상)'}
                  className="input-field flex-1"
                />
                <button
                  onClick={handleSetStaffPassword}
                  className="btn-secondary"
                >
                  {hasStaffPw ? '변경' : '설정'}
                </button>
              </div>
            </div>
          </div>

          {/* 원내 설문지 - 접속 주소 */}
          {serverStatus.running && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Server className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">원내 설문지</h2>
                <p className="text-sm text-gray-500">같은 네트워크에서 접속할 수 있는 주소</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* 직원 대시보드 링크 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 flex-shrink-0 w-16">직원용:</span>
                <input
                  type="text"
                  value={`${serverStatus.url}/staff`}
                  readOnly
                  className="input-field flex-1 bg-white text-sm"
                />
                <button
                  onClick={() => serverStatus.url && copyToClipboard(`${serverStatus.url}/staff`)}
                  className="btn-secondary flex items-center gap-1"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <a
                  href={`${serverStatus.url}/staff`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* 설문 페이지 링크 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 flex-shrink-0 w-16">설문:</span>
                <input
                  type="text"
                  value={`${serverStatus.url}/patient`}
                  readOnly
                  className="input-field flex-1 bg-white text-sm"
                />
                <button
                  onClick={() => serverStatus.url && copyToClipboard(`${serverStatus.url}/patient`)}
                  className="btn-secondary flex items-center gap-1"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
          )}

          {/* 온라인 설문지 */}
          {canUseFeature('survey_external') ? (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Globe className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">온라인 설문지</h2>
                <p className="text-sm text-gray-500">환자에게 온라인으로 설문 링크를 전달</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-900">서비스 활성화됨</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                설문 관리 페이지에서 "온라인 링크 생성" 버튼을 클릭하면<br />
                환자에게 전달할 수 있는 설문 링크가 생성됩니다.
              </p>
              <div className="text-xs text-gray-500">
                • 링크는 24시간 동안 유효합니다<br />
                • 환자가 응답을 제출하면 자동으로 동기화됩니다
              </div>
            </div>
          </div>
          ) : (
          <div className="card border-2 border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                <Globe className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-500">온라인 설문지</h2>
                <p className="text-sm text-gray-400">프리미엄 플랜에서 사용 가능</p>
              </div>
              <span className="ml-auto px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                <Crown className="w-3 h-3" />
                프리미엄
              </span>
            </div>
            <p className="text-sm text-gray-500">
              환자에게 온라인 설문 링크를 전달하고, 응답을 자동으로 수집할 수 있습니다.
            </p>
          </div>
          )}
        </div>
      )}

      {/* 데이터 관리 탭 */}
      {activeTab === 'data' && (
        <div className="space-y-6 max-w-2xl">
          {/* 데이터 내보내기 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <FileDown className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">내보내기</h2>
                <p className="text-sm text-gray-500">전체 데이터를 JSON 파일로 내보냅니다</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">전체 데이터</p>
                <p className="text-sm text-gray-500">
                  환자 {usageStats.patients}명 · 처방 {usageStats.prescriptions}개 · 차트 {usageStats.initialCharts + usageStats.progressNotes}개
                </p>
              </div>
              <button
                onClick={handleExportAll}
                className="btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                내보내기
              </button>
            </div>
          </div>

          {/* 휴지통 */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">휴지통</h2>
                <p className="text-sm text-gray-500">삭제된 데이터를 복원하거나 영구 삭제합니다</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">삭제된 항목</p>
                <p className="text-sm text-gray-500">
                  환자 {trashCount.patients}명 · 처방 {trashCount.prescriptions}개 · 차트 {trashCount.charts}개
                </p>
              </div>
              <div className="flex items-center gap-2">
                {trashCount.total > 0 && (
                  <button
                    onClick={handleEmptyTrash}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    비우기
                  </button>
                )}
                <button
                  onClick={() => {
                    loadTrashItems();
                    setShowTrashModal(true);
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  열기
                </button>
              </div>
            </div>
          </div>

          {/* 초기화 */}
          <div className="card border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">초기화</h2>
                <p className="text-sm text-red-600">모든 기록을 삭제하고 초기 상태로 되돌립니다</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800">
                <strong>삭제되는 데이터:</strong> 환자 {usageStats.patients}명, 처방 {usageStats.prescriptions}개, 차트 {usageStats.initialCharts + usageStats.progressNotes}개, 처방정의, 설문지 등 모든 데이터
              </p>
            </div>

            <button
              onClick={handleResetUserData}
              disabled={isResettingUserData}
              className="w-full py-3 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isResettingUserData ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  초기화 중...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  초기화
                </>
              )}
            </button>
          </div>

          {/* 주의사항 */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>주의:</strong> 브라우저 데이터 삭제 시 로컬 데이터가 손실될 수 있습니다.
              정기적으로 백업 탭에서 백업하세요.
            </p>
          </div>
        </div>
      )}

      {/* 백업 탭 */}
      {activeTab === 'backup' && canUseFeature('backup') && (
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

      {/* 휴지통 모달 */}
      {showTrashModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">휴지통</h2>
                  <p className="text-sm text-gray-500">
                    총 {trashCount.total}개 항목
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTrashModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingTrash ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : trashItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Trash2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>휴지통이 비어있습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trashItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          item.type === 'patient' ? 'bg-blue-100' :
                          item.type === 'prescription' ? 'bg-green-100' :
                          'bg-purple-100'
                        }`}>
                          {item.type === 'patient' ? (
                            <Users className="w-4 h-4 text-blue-600" />
                          ) : item.type === 'prescription' ? (
                            <FileText className="w-4 h-4 text-green-600" />
                          ) : (
                            <ClipboardList className="w-4 h-4 text-purple-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.extra_info && `${item.extra_info} · `}
                            {new Date(item.deleted_at).toLocaleString()} 삭제
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRestore(item)}
                          className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          복원
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(item)}
                          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border-t bg-gray-50">
              <div className="text-sm text-gray-500">
                {trashCount.total > 0 && (
                  <span>환자 {trashCount.patients}명 · 처방 {trashCount.prescriptions}개 · 차트 {trashCount.charts}개</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {trashCount.total > 0 && (
                  <button
                    onClick={() => {
                      handleEmptyTrash();
                      setShowTrashModal(false);
                    }}
                    className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    휴지통 비우기
                  </button>
                )}
                <button
                  onClick={() => setShowTrashModal(false)}
                  className="btn-secondary"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
