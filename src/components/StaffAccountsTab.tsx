/**
 * 내부계정 관리 탭 컴포넌트
 * 웹 클라이언트용 직원 계정을 생성/수정/삭제합니다.
 * 원내 HTTP 서버 관리 기능도 포함합니다.
 */

import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Users, Plus, Pencil, Trash2, Loader2, Check, X, Eye, EyeOff, Server, Play, Square, Copy, ExternalLink } from 'lucide-react';
import type { StaffPermissions, StaffRole } from '../types';
import { usePlanLimits } from '../hooks/usePlanLimits';

// 서버 상태 타입
interface ServerStatus {
  running: boolean;
  port: number | null;
  local_ip: string | null;
  url: string | null;
}

// Tauri에서 반환하는 계정 정보 (password_hash 제외)
interface StaffAccountInfo {
  id: string;
  username: string;
  display_name: string;
  role: StaffRole;
  permissions: StaffPermissions;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

// 역할별 기본 권한
const ROLE_PRESETS: Record<StaffRole, StaffPermissions> = {
  admin: {
    patients_read: true,
    patients_write: true,
    prescriptions_read: true,
    prescriptions_write: true,
    charts_read: true,
    charts_write: true,
    survey_read: true,
    survey_write: true,
    settings_read: true,
  },
  staff: {
    patients_read: true,
    patients_write: true,
    prescriptions_read: true,
    prescriptions_write: true,
    charts_read: true,
    charts_write: true,
    survey_read: true,
    survey_write: true,
    settings_read: false,
  },
  viewer: {
    patients_read: true,
    patients_write: false,
    prescriptions_read: true,
    prescriptions_write: false,
    charts_read: true,
    charts_write: false,
    survey_read: true,
    survey_write: false,
    settings_read: false,
  },
};

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: '관리자',
  staff: '직원',
  viewer: '열람자',
};

export function StaffAccountsTab() {
  const { planInfo, canUseFeature } = usePlanLimits();

  // 계정 관련 상태
  const [accounts, setAccounts] = useState<StaffAccountInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StaffAccountInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 서버 관련 상태
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ running: false, port: null, local_ip: null, url: null });
  const [serverPort, setServerPort] = useState(8787);
  const [serverAutostart, setServerAutostart] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);

  // 폼 상태
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    password: '',
    confirmPassword: '',
    role: 'staff' as StaffRole,
    permissions: ROLE_PRESETS.staff,
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);

  // 서버 상태 로드
  const loadServerStatus = useCallback(async () => {
    try {
      const status = await invoke<ServerStatus>('get_server_status');
      setServerStatus(status);
      if (status.port) {
        setServerPort(status.port);
      }
    } catch (error) {
      console.error('서버 상태 확인 실패:', error);
    }
  }, []);

  // 자동 시작 설정 로드
  const loadServerAutostart = useCallback(async () => {
    try {
      const autostart = await invoke<boolean>('get_server_autostart');
      setServerAutostart(autostart);
    } catch (error) {
      console.error('자동시작 설정 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadServerStatus();
    loadServerAutostart();
  }, [loadServerStatus, loadServerAutostart]);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<StaffAccountInfo[]>('list_staff_accounts');
      setAccounts(data);
    } catch (error) {
      console.error('계정 목록 로드 실패:', error);
      setMessage({ type: 'error', text: '계정 목록을 불러오는데 실패했습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  // 서버 시작
  const handleStartServer = async () => {
    setIsStartingServer(true);
    try {
      const url = await invoke<string>('start_http_server', {
        port: serverPort,
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

  // 서버 중지
  const handleStopServer = async () => {
    setIsStoppingServer(true);
    try {
      await invoke('stop_http_server');
      setMessage({ type: 'success', text: 'HTTP 서버가 중지되었습니다.' });
      await loadServerStatus();
    } catch (e) {
      setMessage({ type: 'error', text: `서버 중지 실패: ${e}` });
    } finally {
      setIsStoppingServer(false);
    }
  };

  // 자동 시작 설정 변경
  const handleServerAutostartChange = async (enabled: boolean) => {
    try {
      await invoke('set_server_autostart', { enabled });
      setServerAutostart(enabled);
      setMessage({ type: 'success', text: enabled ? '앱 시작 시 서버가 자동으로 시작됩니다.' : '서버 자동 시작이 해제되었습니다.' });
    } catch (error) {
      console.error('자동시작 설정 실패:', error);
      setMessage({ type: 'error', text: `설정 실패: ${error}` });
    }
  };

  // 클립보드 복사
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: 'success', text: '클립보드에 복사되었습니다.' });
    } catch {
      setMessage({ type: 'error', text: '복사에 실패했습니다.' });
    }
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      username: '',
      display_name: '',
      password: '',
      confirmPassword: '',
      role: 'staff',
      permissions: ROLE_PRESETS.staff,
      is_active: true,
    });
    setUseCustomPermissions(false);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (account: StaffAccountInfo) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      display_name: account.display_name,
      password: '',
      confirmPassword: '',
      role: account.role,
      permissions: account.permissions,
      is_active: account.is_active,
    });
    // 기본 권한과 다르면 커스텀 권한으로 표시
    const preset = ROLE_PRESETS[account.role];
    setUseCustomPermissions(JSON.stringify(preset) !== JSON.stringify(account.permissions));
    setShowPassword(false);
    setShowModal(true);
  };

  const handleRoleChange = (role: StaffRole) => {
    setFormData(prev => ({
      ...prev,
      role,
      permissions: useCustomPermissions ? prev.permissions : ROLE_PRESETS[role],
    }));
  };

  const handlePermissionChange = (key: keyof StaffPermissions) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleSubmit = async () => {
    // 유효성 검사
    if (!formData.username.trim()) {
      setMessage({ type: 'error', text: '아이디를 입력하세요.' });
      return;
    }
    if (!formData.display_name.trim()) {
      setMessage({ type: 'error', text: '이름을 입력하세요.' });
      return;
    }
    if (!editingAccount && !formData.password) {
      setMessage({ type: 'error', text: '비밀번호를 입력하세요.' });
      return;
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setMessage({ type: 'error', text: '비밀번호가 일치하지 않습니다.' });
      return;
    }
    if (formData.password && formData.password.length < 4) {
      setMessage({ type: 'error', text: '비밀번호는 4자 이상이어야 합니다.' });
      return;
    }

    setIsSaving(true);
    try {
      if (editingAccount) {
        // 수정
        await invoke('update_staff_account', {
          input: {
            id: editingAccount.id,
            username: formData.username,
            display_name: formData.display_name,
            password: formData.password || null,
            role: formData.role,
            permissions: formData.permissions,
            is_active: formData.is_active,
          },
        });
        setMessage({ type: 'success', text: '계정이 수정되었습니다.' });
      } else {
        // 생성
        await invoke('create_staff_account', {
          input: {
            username: formData.username,
            display_name: formData.display_name,
            password: formData.password,
            role: formData.role,
          },
        });
        setMessage({ type: 'success', text: '계정이 생성되었습니다.' });
      }
      setShowModal(false);
      loadAccounts();
    } catch (error) {
      console.error('계정 저장 실패:', error);
      setMessage({ type: 'error', text: `저장 실패: ${error}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (account: StaffAccountInfo) => {
    if (!confirm(`"${account.display_name}" 계정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await invoke('delete_staff_account', { id: account.id });
      setMessage({ type: 'success', text: '계정이 삭제되었습니다.' });
      loadAccounts();
    } catch (error) {
      console.error('계정 삭제 실패:', error);
      setMessage({ type: 'error', text: `삭제 실패: ${error}` });
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 메시지 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="float-right text-current opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 원내 서버 */}
      <div className="card border-2 border-blue-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">원내 서버</h2>
            <p className="text-sm text-gray-500">같은 네트워크의 다른 기기에서 접속</p>
          </div>
        </div>

        {/* 서버 상태 + 포트 (한 줄) */}
        <div className="flex items-center gap-3 mb-3">
          {/* 상태 표시 */}
          {serverStatus.running ? (
            <span className="px-3 py-1.5 text-sm font-medium bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              실행 중
            </span>
          ) : (
            <span className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg">
              중지됨
            </span>
          )}

          {/* 포트 입력 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">포트:</span>
            <input
              type="number"
              value={serverPort}
              onChange={(e) => setServerPort(parseInt(e.target.value) || 8787)}
              disabled={serverStatus.running}
              min={1024}
              max={65535}
              className="w-20 input-field text-center text-sm py-1.5"
            />
          </div>

          {/* 시작/중지 버튼 */}
          {serverStatus.running ? (
            <button
              onClick={handleStopServer}
              disabled={isStoppingServer}
              className="btn-secondary flex items-center gap-2 ml-auto text-red-600 border-red-200 hover:bg-red-50"
            >
              {isStoppingServer ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {isStoppingServer ? '중지 중...' : '서버 중지'}
            </button>
          ) : (
            <button
              onClick={handleStartServer}
              disabled={isStartingServer}
              className="btn-primary flex items-center gap-2 ml-auto"
            >
              {isStartingServer ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isStartingServer ? '시작 중...' : '서버 시작'}
            </button>
          )}
        </div>

        {/* 자동 시작 (한 줄) */}
        <div className="flex items-center justify-between py-2 border-t border-gray-100">
          <span className="text-sm text-gray-700">앱 시작 시 자동으로 서버 시작</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={serverAutostart}
              onChange={(e) => handleServerAutostartChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>

        {/* 접속 주소 (서버 실행 중일 때만) */}
        {serverStatus.running && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-900 mb-3">접속 주소</p>
            <div className="space-y-2">
              {/* 웹 앱 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12">웹앱</span>
                <code className="flex-1 text-sm bg-gray-100 px-2 py-1 rounded">{serverStatus.url}/app</code>
                <button onClick={() => copyToClipboard(`${serverStatus.url}/app`)} className="p-1 hover:bg-gray-100 rounded">
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
                <a href={`${serverStatus.url}/app`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-100 rounded">
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                </a>
              </div>
              {/* 직원용 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12">직원용</span>
                <code className="flex-1 text-sm bg-gray-100 px-2 py-1 rounded">{serverStatus.url}/staff</code>
                <button onClick={() => copyToClipboard(`${serverStatus.url}/staff`)} className="p-1 hover:bg-gray-100 rounded">
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
                <a href={`${serverStatus.url}/staff`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-100 rounded">
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                </a>
              </div>
              {/* 설문 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12">설문</span>
                <code className="flex-1 text-sm bg-gray-100 px-2 py-1 rounded">{serverStatus.url}/patient</code>
                <button onClick={() => copyToClipboard(`${serverStatus.url}/patient`)} className="p-1 hover:bg-gray-100 rounded">
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 헤더 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">내부계정 관리</h2>
              <p className="text-sm text-gray-500">
                웹 클라이언트에서 사용할 직원 계정을 관리합니다.
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            계정 추가
          </button>
        </div>

        {/* 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">웹 클라이언트 접속 방법</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>위의 "원내 서버"에서 서버를 시작합니다.</li>
            <li>다른 PC/기기의 웹 브라우저에서 <code className="bg-blue-100 px-1 rounded">http://서버IP:포트/app</code> 으로 접속합니다.</li>
            <li>아래에서 생성한 계정으로 로그인합니다.</li>
          </ol>
        </div>
      </div>

      {/* 계정 목록 */}
      <div className="card">
        <h3 className="font-medium text-gray-900 mb-4">계정 목록</h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>등록된 계정이 없습니다.</p>
            <p className="text-sm mt-1">계정 추가 버튼을 눌러 새 계정을 만드세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-600">이름</th>
                  <th className="pb-2 font-medium text-gray-600">아이디</th>
                  <th className="pb-2 font-medium text-gray-600">역할</th>
                  <th className="pb-2 font-medium text-gray-600">상태</th>
                  <th className="pb-2 font-medium text-gray-600">마지막 로그인</th>
                  <th className="pb-2 font-medium text-gray-600 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{account.display_name}</td>
                    <td className="py-3 text-gray-600">{account.username}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        account.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        account.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {ROLE_LABELS[account.role]}
                      </span>
                    </td>
                    <td className="py-3">
                      {account.is_active ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          활성
                        </span>
                      ) : (
                        <span className="text-gray-400">비활성</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-500">
                      {formatDate(account.last_login_at)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => openEditModal(account)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="수정"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(account)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded ml-1"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingAccount ? '계정 수정' : '계정 추가'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 아이디 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  아이디 *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  className="input w-full"
                  placeholder="영문, 숫자 조합"
                />
              </div>

              {/* 이름 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 *
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                  className="input w-full"
                  placeholder="표시될 이름"
                />
              </div>

              {/* 비밀번호 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 {editingAccount ? '(변경 시에만 입력)' : '*'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="input w-full pr-10"
                    placeholder="4자 이상"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 비밀번호 확인 */}
              {formData.password && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호 확인
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="input w-full"
                    placeholder="비밀번호 재입력"
                  />
                </div>
              )}

              {/* 역할 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  역할
                </label>
                <div className="flex gap-2">
                  {(['admin', 'staff', 'viewer'] as StaffRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleRoleChange(role)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        formData.role === role
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.role === 'admin' && '모든 기능 사용 가능 (설정 포함)'}
                  {formData.role === 'staff' && '환자/처방/차트/설문 관리 가능'}
                  {formData.role === 'viewer' && '조회만 가능 (수정 불가)'}
                </p>
              </div>

              {/* 커스텀 권한 (수정 시에만) */}
              {editingAccount && (
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useCustomPermissions}
                      onChange={(e) => {
                        setUseCustomPermissions(e.target.checked);
                        if (!e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            permissions: ROLE_PRESETS[prev.role],
                          }));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="font-medium text-gray-700">세부 권한 직접 설정</span>
                  </label>

                  {useCustomPermissions && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2 text-sm">
                      {[
                        { key: 'patients_read', label: '환자 조회' },
                        { key: 'patients_write', label: '환자 수정' },
                        { key: 'prescriptions_read', label: '처방 조회' },
                        { key: 'prescriptions_write', label: '처방 수정' },
                        { key: 'charts_read', label: '차트 조회' },
                        { key: 'charts_write', label: '차트 수정' },
                        { key: 'survey_read', label: '설문 조회' },
                        { key: 'survey_write', label: '설문 수정' },
                        { key: 'settings_read', label: '설정 조회' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.permissions[key as keyof StaffPermissions]}
                            onChange={() => handlePermissionChange(key as keyof StaffPermissions)}
                            className="rounded"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 활성 상태 */}
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="font-medium text-gray-700">계정 활성화</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">
                  비활성화된 계정은 로그인할 수 없습니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingAccount ? '수정' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
