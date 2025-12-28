import { useEffect, useCallback, useState } from 'react';
import {
  loadBackupSettings,
  saveBackupSettings,
  needsAutoBackup,
  downloadBackup,
} from '../lib/backup';
import type { BackupSettings } from '../lib/backup';

interface UseAutoBackupReturn {
  settings: BackupSettings;
  updateSettings: (updates: Partial<BackupSettings>) => void;
  triggerBackup: () => { success: boolean; filename?: string; error?: string };
  isBackingUp: boolean;
}

export function useAutoBackup(): UseAutoBackupReturn {
  const [settings, setSettings] = useState<BackupSettings>(loadBackupSettings);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // 설정 업데이트
  const updateSettings = useCallback((updates: Partial<BackupSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      saveBackupSettings(newSettings);
      return newSettings;
    });
  }, []);

  // 수동 백업 트리거
  const triggerBackup = useCallback(() => {
    setIsBackingUp(true);
    const result = downloadBackup();
    if (result.success) {
      setSettings((prev) => ({
        ...prev,
        lastBackupAt: new Date().toISOString(),
      }));
    }
    setIsBackingUp(false);
    return result;
  }, []);

  // 자동 백업 체크 (앱 시작 시 및 주기적으로)
  useEffect(() => {
    if (!settings.autoBackupEnabled) return;

    const checkAndBackup = () => {
      if (needsAutoBackup()) {
        console.log('[AutoBackup] Starting automatic backup...');
        const result = downloadBackup();
        if (result.success) {
          console.log('[AutoBackup] Backup completed:', result.filename);
          setSettings((prev) => ({
            ...prev,
            lastBackupAt: new Date().toISOString(),
          }));
        } else {
          console.error('[AutoBackup] Backup failed:', result.error);
        }
      }
    };

    // 앱 시작 시 체크 (5초 후)
    const initialTimer = setTimeout(checkAndBackup, 5000);

    // 1시간마다 체크
    const intervalTimer = setInterval(checkAndBackup, 60 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [settings.autoBackupEnabled]);

  return {
    settings,
    updateSettings,
    triggerBackup,
    isBackingUp,
  };
}
