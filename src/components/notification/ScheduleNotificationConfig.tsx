import { useState, useEffect } from 'react';
import { Bell, Clock, Save, Loader2, RotateCcw } from 'lucide-react';
import { getScheduleNotificationSettings, updateScheduleNotificationSettings } from '../../lib/localDb';
import type { NotificationSettings } from '../../types';

interface ScheduleNotificationConfigProps {
  scheduleId: string;
  scheduleName?: string;
}

// 사전 리마인더 시간 옵션
const PRE_REMINDER_OPTIONS = [
  { value: 5, label: '5분 전' },
  { value: 10, label: '10분 전' },
  { value: 15, label: '15분 전' },
  { value: 30, label: '30분 전' },
];

export function ScheduleNotificationConfig({
  scheduleId,
  scheduleName,
}: ScheduleNotificationConfigProps) {
  const [settings, setSettings] = useState<Partial<NotificationSettings>>({
    enabled: true,
    pre_reminder_minutes: 10,
    missed_reminder_enabled: true,
    missed_reminder_delay_minutes: 30,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [useGlobalSettings, setUseGlobalSettings] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, [scheduleId]);

  const loadSettings = () => {
    setIsLoading(true);
    try {
      const scheduleSettings = getScheduleNotificationSettings(scheduleId);
      if (scheduleSettings) {
        setSettings(scheduleSettings);
        setUseGlobalSettings(false);
      } else {
        setUseGlobalSettings(true);
      }
    } catch (error) {
      console.error('설정 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const success = updateScheduleNotificationSettings(scheduleId, settings);
      if (success) {
        setMessage({ type: 'success', text: '알림 설정이 저장되었습니다.' });
        setUseGlobalSettings(false);
      } else {
        throw new Error('저장 실패');
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
      setMessage({ type: 'error', text: '설정 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToGlobal = () => {
    if (confirm('전역 설정으로 초기화하시겠습니까?')) {
      setSettings({
        enabled: true,
        pre_reminder_minutes: 10,
        missed_reminder_enabled: true,
        missed_reminder_delay_minutes: 30,
      });
      setUseGlobalSettings(true);
      setMessage({ type: 'success', text: '전역 설정으로 초기화되었습니다.' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-600" />
          <h4 className="font-medium text-gray-900">
            알림 설정 {scheduleName && <span className="text-gray-500">- {scheduleName}</span>}
          </h4>
        </div>
        {!useGlobalSettings && (
          <button
            onClick={handleResetToGlobal}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <RotateCcw className="w-4 h-4" />
            초기화
          </button>
        )}
      </div>

      {/* 메시지 */}
      {message && (
        <div
          className={`p-2 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 전역 설정 사용 여부 */}
      {useGlobalSettings && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            현재 전역 알림 설정을 사용 중입니다.
            <br />
            아래에서 이 일정만의 설정을 지정할 수 있습니다.
          </p>
        </div>
      )}

      {/* 알림 활성화 */}
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium text-gray-700">알림 활성화</p>
          <p className="text-xs text-gray-500">이 복약 일정의 알림</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled ?? true}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
        </label>
      </div>

      {/* 사전 알림 */}
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-700">사전 알림</p>
          <p className="text-xs text-gray-500">복약 시간 전 알림</p>
        </div>
        <select
          value={settings.pre_reminder_minutes ?? 10}
          onChange={(e) => handleChange('pre_reminder_minutes', Number(e.target.value))}
          className="input-field w-28 text-sm"
          disabled={!settings.enabled}
        >
          {PRE_REMINDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 미복용 알림 */}
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-700">미복용 알림</p>
          <p className="text-xs text-gray-500">복약하지 않았을 때 알림</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.missed_reminder_enabled ?? true}
            onChange={(e) => handleChange('missed_reminder_enabled', e.target.checked)}
            className="sr-only peer"
            disabled={!settings.enabled}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 disabled:opacity-50"></div>
        </label>
      </div>

      {/* 저장 버튼 */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full btn-primary flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          저장
        </button>
      </div>
    </div>
  );
}

export default ScheduleNotificationConfig;
