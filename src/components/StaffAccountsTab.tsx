/**
 * 원내 서버 관리 탭 컴포넌트
 * 원내 HTTP 서버 관리 및 직원용 접속 비밀번호를 설정합니다.
 */

import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, X, Eye, EyeOff, Server, Play, Square, Copy, ExternalLink, Lock } from 'lucide-react';
import { usePlanLimits } from '../hooks/usePlanLimits';

// 서버 상태 타입
interface ServerStatus {
  running: boolean;
  port: number | null;
  local_ip: string | null;
  url: string | null;
}

export function StaffAccountsTab() {
  const { planInfo, canUseFeature } = usePlanLimits();

  // 서버 관련 상태
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ running: false, port: null, local_ip: null, url: null });
  const [serverPort, setServerPort] = useState(8787);
  const [serverAutostart, setServerAutostart] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);

  // 비밀번호 관련 상태
  const [hasPassword, setHasPassword] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // 비밀번호 설정 여부 확인
  const checkHasPassword = useCallback(async () => {
    setIsLoadingPassword(true);
    try {
      const result = await invoke<boolean>('has_staff_password');
      setHasPassword(result);
    } catch (error) {
      console.error('비밀번호 확인 실패:', error);
    } finally {
      setIsLoadingPassword(false);
    }
  }, []);

  useEffect(() => {
    loadServerStatus();
    loadServerAutostart();
    checkHasPassword();
  }, [loadServerStatus, loadServerAutostart, checkHasPassword]);

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

  // 비밀번호 저장
  const handleSavePassword = async () => {
    if (!newPassword) {
      setMessage({ type: 'error', text: '비밀번호를 입력하세요.' });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: '비밀번호는 4자 이상이어야 합니다.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '비밀번호가 일치하지 않습니다.' });
      return;
    }

    setIsSavingPassword(true);
    try {
      await invoke('set_staff_password', { password: newPassword });
      setHasPassword(true);
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: '직원용 비밀번호가 설정되었습니다.' });
    } catch (error) {
      setMessage({ type: 'error', text: `비밀번호 설정 실패: ${error}` });
    } finally {
      setIsSavingPassword(false);
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

      {/* 직원용 비밀번호 설정 */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">직원용 접속 비밀번호</h2>
            <p className="text-sm text-gray-500">직원이 원내 서버(/staff)에 로그인할 때 사용하는 비밀번호</p>
          </div>
        </div>

        {isLoadingPassword ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* 현재 상태 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">비밀번호 상태:</span>
                {hasPassword ? (
                  <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">설정됨</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">미설정</span>
                )}
              </div>
              <button
                onClick={() => {
                  setShowPasswordForm(!showPasswordForm);
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowPassword(false);
                }}
                className="btn-secondary text-sm"
              >
                {hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
              </button>
            </div>

            {!hasPassword && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
                비밀번호가 설정되지 않았습니다. 직원용 페이지에 접속하려면 비밀번호를 설정하세요.
              </div>
            )}

            {/* 비밀번호 입력 폼 */}
            {showPasswordForm && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {hasPassword ? '새 비밀번호' : '비밀번호'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input w-full pr-10"
                      placeholder="4자 이상 입력"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호 확인
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input w-full"
                    placeholder="비밀번호 재입력"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="btn-secondary text-sm"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {isSavingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                    저장
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
