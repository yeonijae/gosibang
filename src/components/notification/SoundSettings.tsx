/**
 * 알림 소리 설정 컴포넌트
 * 볼륨 슬라이더, 프리셋 선택, 테스트 버튼 제공
 */

import { useState, useCallback } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { notificationSound, type SoundPreset } from '../../lib/notificationSound';
import { useNotificationStore } from '../../store/notificationStore';

// 사운드 프리셋 옵션
const SOUND_PRESETS: { value: SoundPreset; label: string; description: string }[] = [
  { value: 'default', label: '기본', description: '두 음의 차임' },
  { value: 'gentle', label: '부드러운', description: '단일 톤, 긴 감쇠' },
  { value: 'urgent', label: '긴급', description: '3회 비프' },
  { value: 'silent', label: '무음', description: '소리 없음' },
];

interface SoundSettingsProps {
  className?: string;
}

export function SoundSettings({ className = '' }: SoundSettingsProps) {
  const { settings, updateSettings } = useNotificationStore();
  const [volume, setVolume] = useState(() => notificationSound.getVolume());
  const [isMuted, setIsMuted] = useState(() => notificationSound.isMutedState());
  const [testingPreset, setTestingPreset] = useState<SoundPreset | null>(null);

  const soundEnabled = settings?.sound_enabled ?? true;
  const currentPreset = (settings?.sound_preset as SoundPreset) ?? 'default';

  // 볼륨 변경
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    notificationSound.setVolume(newVolume);
  }, []);

  // 음소거 토글
  const handleMuteToggle = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    notificationSound.setMuted(newMuted);
  }, [isMuted]);

  // 사운드 활성화/비활성화 토글
  const handleSoundEnabledChange = useCallback((enabled: boolean) => {
    updateSettings({ sound_enabled: enabled });
    if (!enabled) {
      notificationSound.setMuted(true);
      setIsMuted(true);
    } else {
      notificationSound.setMuted(false);
      setIsMuted(false);
    }
  }, [updateSettings]);

  // 프리셋 변경
  const handlePresetChange = useCallback((preset: SoundPreset) => {
    updateSettings({ sound_preset: preset });
  }, [updateSettings]);

  // 사운드 테스트
  const handleTestSound = useCallback(async (preset: SoundPreset) => {
    if (preset === 'silent') return;

    setTestingPreset(preset);
    await notificationSound.test(preset);
    setTestingPreset(null);
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 소리 활성화 토글 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            {soundEnabled && !isMuted ? (
              <Volume2 className="w-5 h-5 text-purple-600" />
            ) : (
              <VolumeX className="w-5 h-5 text-purple-600" />
            )}
          </div>
          <div>
            <p className="font-medium text-gray-900">알림음 활성화</p>
            <p className="text-sm text-gray-500">알림 시 소리 재생</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => handleSoundEnabledChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
        </label>
      </div>

      {soundEnabled && (
        <>
          {/* 볼륨 슬라이더 */}
          <div className="py-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">볼륨</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMuteToggle}
                  className={`p-1.5 rounded ${
                    isMuted
                      ? 'bg-gray-100 text-gray-400'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title={isMuted ? '음소거 해제' : '음소거'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <span className="text-sm text-gray-500 w-10 text-right">
                  {isMuted ? '0' : Math.round(volume * 100)}%
                </span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              disabled={isMuted}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
            />
          </div>

          {/* 프리셋 선택 */}
          <div className="py-3 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-3">알림음 종류</p>
            <div className="space-y-2">
              {SOUND_PRESETS.map((preset) => (
                <div
                  key={preset.value}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    currentPreset === preset.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="sound-preset"
                      value={preset.value}
                      checked={currentPreset === preset.value}
                      onChange={() => handlePresetChange(preset.value)}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {preset.label}
                      </p>
                      <p className="text-xs text-gray-500">{preset.description}</p>
                    </div>
                  </label>
                  {preset.value !== 'silent' && (
                    <button
                      onClick={() => handleTestSound(preset.value)}
                      disabled={testingPreset === preset.value}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                      title="테스트 재생"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SoundSettings;
