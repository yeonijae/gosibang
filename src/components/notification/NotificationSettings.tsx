import { useEffect, useState } from 'react';
import { Bell, Clock, Volume2, VolumeX, Moon, Save, Loader2 } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import type { NotificationSettings as NotificationSettingsType } from '../../types';

// 사전 리마인더 시간 옵션
const PRE_REMINDER_OPTIONS = [
  { value: 5, label: '5분 전' },
  { value: 10, label: '10분 전' },
  { value: 15, label: '15분 전' },
  { value: 30, label: '30분 전' },
];

// 미복용 알림 지연 옵션
const MISSED_DELAY_OPTIONS = [
  { value: 15, label: '15분 후' },
  { value: 30, label: '30분 후' },
  { value: 60, label: '1시간 후' },
];

// 사운드 프리셋 옵션
const SOUND_PRESETS = [
  { value: 'default', label: '기본' },
  { value: 'gentle', label: '부드러운' },
  { value: 'alert', label: '경고음' },
  { value: 'none', label: '무음' },
];

export function NotificationSettings() {
  const { settings, loadSettings, updateSettings } = useNotificationStore();
  const [localSettings, setLocalSettings] = useState<Partial<NotificationSettingsType>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleChange = <K extends keyof NotificationSettingsType>(
    key: K,
    value: NotificationSettingsType[K]
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      updateSettings(localSettings);
      setMessage({ type: 'success', text: '알림 설정이 저장되었습니다.' });
    } catch (error) {
      console.error('설정 저장 실패:', error);
      setMessage({ type: 'error', text: '설정 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 메시지 */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 알림 활성화 */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">알림 활성화</p>
              <p className="text-sm text-gray-500">모든 알림을 켜거나 끕니다</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.enabled ?? true}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>
      </div>

      {/* 복약 알림 설정 */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">복약 알림</h3>
            <p className="text-sm text-gray-500">복약 시간 관련 알림 설정</p>
          </div>
        </div>

        {/* 사전 알림 */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">사전 알림</p>
            <p className="text-xs text-gray-500">복약 시간 전 미리 알림</p>
          </div>
          <select
            value={localSettings.pre_reminder_minutes ?? 10}
            onChange={(e) => handleChange('pre_reminder_minutes', Number(e.target.value))}
            className="input-field w-32 text-sm"
            disabled={!localSettings.enabled}
          >
            {PRE_REMINDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 미복용 알림 */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">미복용 알림</p>
            <p className="text-xs text-gray-500">복약하지 않았을 때 다시 알림</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.missed_reminder_enabled ?? true}
              onChange={(e) => handleChange('missed_reminder_enabled', e.target.checked)}
              className="sr-only peer"
              disabled={!localSettings.enabled}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 disabled:opacity-50"></div>
          </label>
        </div>

        {localSettings.missed_reminder_enabled && (
          <div className="flex items-center justify-between py-3 border-t border-gray-100 pl-4">
            <p className="text-sm text-gray-600">알림 간격</p>
            <select
              value={localSettings.missed_reminder_delay_minutes ?? 30}
              onChange={(e) => handleChange('missed_reminder_delay_minutes', Number(e.target.value))}
              className="input-field w-32 text-sm"
              disabled={!localSettings.enabled}
            >
              {MISSED_DELAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 일일 요약 */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">일일 요약</p>
            <p className="text-xs text-gray-500">하루 복약 현황 요약 알림</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.daily_summary_enabled ?? false}
              onChange={(e) => handleChange('daily_summary_enabled', e.target.checked)}
              className="sr-only peer"
              disabled={!localSettings.enabled}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 disabled:opacity-50"></div>
          </label>
        </div>

        {localSettings.daily_summary_enabled && (
          <div className="flex items-center justify-between py-3 border-t border-gray-100 pl-4">
            <p className="text-sm text-gray-600">요약 시간</p>
            <input
              type="time"
              value={localSettings.daily_summary_time ?? '21:00'}
              onChange={(e) => handleChange('daily_summary_time', e.target.value)}
              className="input-field w-32 text-sm"
              disabled={!localSettings.enabled}
            />
          </div>
        )}
      </div>

      {/* 소리 설정 */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            {localSettings.sound_enabled ? (
              <Volume2 className="w-5 h-5 text-purple-600" />
            ) : (
              <VolumeX className="w-5 h-5 text-purple-600" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-gray-900">소리 설정</h3>
            <p className="text-sm text-gray-500">알림음 관련 설정</p>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">알림음</p>
            <p className="text-xs text-gray-500">알림 시 소리 재생</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.sound_enabled ?? true}
              onChange={(e) => handleChange('sound_enabled', e.target.checked)}
              className="sr-only peer"
              disabled={!localSettings.enabled}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 disabled:opacity-50"></div>
          </label>
        </div>

        {localSettings.sound_enabled && (
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <p className="text-sm text-gray-600">알림음 종류</p>
            <select
              value={localSettings.sound_preset ?? 'default'}
              onChange={(e) => handleChange('sound_preset', e.target.value)}
              className="input-field w-32 text-sm"
              disabled={!localSettings.enabled}
            >
              {SOUND_PRESETS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 방해 금지 시간 */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Moon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">방해 금지 시간</h3>
            <p className="text-sm text-gray-500">특정 시간대에 알림 끄기</p>
          </div>
        </div>

        <div className="flex items-center gap-4 py-3 border-t border-gray-100">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">시작 시간</label>
            <input
              type="time"
              value={localSettings.do_not_disturb_start ?? '22:00'}
              onChange={(e) => handleChange('do_not_disturb_start', e.target.value)}
              className="input-field text-sm"
              disabled={!localSettings.enabled}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">종료 시간</label>
            <input
              type="time"
              value={localSettings.do_not_disturb_end ?? '07:00'}
              onChange={(e) => handleChange('do_not_disturb_end', e.target.value)}
              className="input-field text-sm"
              disabled={!localSettings.enabled}
            />
          </div>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
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
    </div>
  );
}

export default NotificationSettings;
