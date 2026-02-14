// 로컬 백업 유틸리티
// File System Access API를 사용하여 로컬 폴더에 백업

import { getDb, saveDb } from './localDb';
import { listImageFiles, readImageFile, writeImageFile } from './imageStorage';

const DB_KEY = 'gosibang_db';
const BACKUP_SETTINGS_KEY = 'gosibang_backup_settings';
const BACKUP_HISTORY_KEY = 'gosibang_backup_history';

// 백업 정리 설정
const MAX_BACKUP_COUNT = 10; // 이 개수 이상이면 정리 권유
const DAYS_TO_KEEP = 5; // 유지할 일수

export interface BackupSettings {
  autoBackupEnabled: boolean;
  autoBackupInterval: 'daily' | 'weekly' | 'manual';
  lastBackupAt: string | null;
  backupFolderName: string | null;
}

export interface BackupHistoryItem {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
  type: 'manual' | 'auto';
}

// 기본 백업 설정
const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackupEnabled: false,
  autoBackupInterval: 'daily',
  lastBackupAt: null,
  backupFolderName: null,
};

// 백업 설정 로드
export function loadBackupSettings(): BackupSettings {
  try {
    const saved = localStorage.getItem(BACKUP_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_BACKUP_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load backup settings:', e);
  }
  return DEFAULT_BACKUP_SETTINGS;
}

// 백업 설정 저장
export function saveBackupSettings(settings: BackupSettings): void {
  try {
    localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save backup settings:', e);
  }
}

// 백업 히스토리 로드
export function loadBackupHistory(): BackupHistoryItem[] {
  try {
    const saved = localStorage.getItem(BACKUP_HISTORY_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load backup history:', e);
  }
  return [];
}

// 백업 히스토리 저장
export function saveBackupHistory(history: BackupHistoryItem[]): void {
  try {
    // 최근 50개만 유지
    const trimmed = history.slice(0, 50);
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save backup history:', e);
  }
}

// 백업 히스토리에 추가
export function addBackupToHistory(item: Omit<BackupHistoryItem, 'id'>): void {
  const history = loadBackupHistory();
  const newItem: BackupHistoryItem = {
    ...item,
    id: crypto.randomUUID(),
  };
  history.unshift(newItem);
  saveBackupHistory(history);
}

// 백업 파일 이름 생성
export function generateBackupFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `gosibang_backup_${dateStr}_${timeStr}.db`;
}

// DB 데이터를 Uint8Array로 내보내기
export function exportDbToBytes(): Uint8Array | null {
  const db = getDb();
  if (!db) return null;

  // 먼저 현재 상태 저장
  saveDb();

  return db.export();
}

// DB 데이터를 Blob으로 변환
export function exportDbToBlob(): Blob | null {
  const data = exportDbToBytes();
  if (!data) return null;

  // Uint8Array를 새 ArrayBuffer로 복사하여 Blob 생성
  const buffer = new ArrayBuffer(data.length);
  const view = new Uint8Array(buffer);
  view.set(data);
  return new Blob([buffer], { type: 'application/x-sqlite3' });
}

// File System Access API 지원 여부 확인
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

// 폴더 선택 및 백업 (File System Access API)
export async function selectFolderAndBackup(): Promise<{ success: boolean; filename?: string; error?: string }> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, error: '이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.' };
  }

  try {
    // 폴더 선택 다이얼로그
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });

    // 백업 파일 생성
    const filename = generateBackupFilename();
    const blob = exportDbToBlob();

    if (!blob) {
      return { success: false, error: '데이터베이스를 내보내는데 실패했습니다.' };
    }

    // 파일 생성 및 쓰기
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // 설정 업데이트
    const settings = loadBackupSettings();
    settings.lastBackupAt = new Date().toISOString();
    settings.backupFolderName = dirHandle.name;
    saveBackupSettings(settings);

    // 히스토리 추가
    addBackupToHistory({
      filename,
      createdAt: new Date().toISOString(),
      size: blob.size,
      type: 'manual',
    });

    return { success: true, filename };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: false, error: '폴더 선택이 취소되었습니다.' };
    }
    console.error('Backup failed:', e);
    return { success: false, error: `백업 실패: ${e.message}` };
  }
}

// 다운로드 방식 백업 (File System Access API 미지원 브라우저용)
export function downloadBackup(): { success: boolean; filename?: string; error?: string } {
  try {
    const blob = exportDbToBlob();
    if (!blob) {
      return { success: false, error: '데이터베이스를 내보내는데 실패했습니다.' };
    }

    const filename = generateBackupFilename();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 설정 업데이트
    const settings = loadBackupSettings();
    settings.lastBackupAt = new Date().toISOString();
    saveBackupSettings(settings);

    // 히스토리 추가
    addBackupToHistory({
      filename,
      createdAt: new Date().toISOString(),
      size: blob.size,
      type: 'manual',
    });

    return { success: true, filename };
  } catch (e: any) {
    console.error('Download backup failed:', e);
    return { success: false, error: `백업 다운로드 실패: ${e.message}` };
  }
}

// 백업 파일에서 복원 (파일 선택)
export async function restoreFromBackup(file: File): Promise<{ success: boolean; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // 데이터 유효성 검사 (SQLite 매직 넘버 체크)
    const header = new TextDecoder().decode(data.slice(0, 16));
    if (!header.startsWith('SQLite format 3')) {
      return { success: false, error: '유효한 SQLite 백업 파일이 아닙니다.' };
    }

    // localStorage에 저장
    const CHUNK_SIZE = 0x8000; // 32KB
    let binary = '';
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    localStorage.setItem(DB_KEY, base64);

    return { success: true };
  } catch (e: any) {
    console.error('Restore failed:', e);
    return { success: false, error: `복원 실패: ${e.message}` };
  }
}

// 자동 백업 필요 여부 확인
export function needsAutoBackup(): boolean {
  const settings = loadBackupSettings();

  if (!settings.autoBackupEnabled) return false;
  if (!settings.lastBackupAt) return true;

  const lastBackup = new Date(settings.lastBackupAt);
  const now = new Date();
  const diffMs = now.getTime() - lastBackup.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  switch (settings.autoBackupInterval) {
    case 'daily':
      return diffHours >= 24;
    case 'weekly':
      return diffHours >= 24 * 7;
    case 'manual':
    default:
      return false;
  }
}

// 백업 파일 크기 포맷
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 상대 시간 포맷
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toLocaleDateString('ko-KR');
}

// 백업 정리 필요 여부 확인
export function needsBackupCleanup(): boolean {
  const history = loadBackupHistory();
  return history.length >= MAX_BACKUP_COUNT;
}

// 백업 정리 정보 가져오기
export interface CleanupInfo {
  totalCount: number;
  toDeleteCount: number;
  toKeepCount: number;
  threshold: number;
}

export function getCleanupInfo(): CleanupInfo {
  const history = loadBackupHistory();
  const { toKeep } = analyzeBackupsForCleanup(history);

  return {
    totalCount: history.length,
    toDeleteCount: history.length - toKeep.length,
    toKeepCount: toKeep.length,
    threshold: MAX_BACKUP_COUNT,
  };
}

// 백업 파일 분석 (날짜별로 그룹화하고 각 날짜의 마지막 백업만 유지)
function analyzeBackupsForCleanup(history: BackupHistoryItem[]): {
  toKeep: BackupHistoryItem[];
  toDelete: BackupHistoryItem[];
} {
  if (history.length === 0) {
    return { toKeep: [], toDelete: [] };
  }

  // 날짜별로 그룹화
  const byDate = new Map<string, BackupHistoryItem[]>();

  for (const item of history) {
    const date = new Date(item.createdAt);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(item);
  }

  // 각 날짜별로 가장 늦게 생성된 백업만 선택
  const latestPerDay: BackupHistoryItem[] = [];

  for (const [, items] of byDate) {
    // 시간순 정렬 (늦은 것이 앞으로)
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    latestPerDay.push(items[0]); // 가장 늦은 것만 선택
  }

  // 날짜순 정렬 (최신이 앞으로)
  latestPerDay.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 최근 N일만 유지
  const toKeep = latestPerDay.slice(0, DAYS_TO_KEEP);
  const toKeepIds = new Set(toKeep.map(item => item.id));

  // 삭제 대상
  const toDelete = history.filter(item => !toKeepIds.has(item.id));

  return { toKeep, toDelete };
}

// 백업 히스토리 정리 (히스토리에서만 삭제 - 실제 파일은 사용자가 관리)
export function cleanupBackupHistory(): {
  success: boolean;
  deletedCount: number;
  keptCount: number;
} {
  try {
    const history = loadBackupHistory();
    const { toKeep, toDelete } = analyzeBackupsForCleanup(history);

    // 히스토리 업데이트 (유지할 것만 저장)
    saveBackupHistory(toKeep);

    return {
      success: true,
      deletedCount: toDelete.length,
      keptCount: toKeep.length,
    };
  } catch (e) {
    console.error('Cleanup failed:', e);
    return {
      success: false,
      deletedCount: 0,
      keptCount: 0,
    };
  }
}

// ZIP 백업 파일 이름 생성
export function generateZipBackupFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `gosibang_backup_${dateStr}_${timeStr}.zip`;
}

// ZIP 내보내기 (DB + 이미지)
export async function exportToZip(userId?: string): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // 1. DB 내보내기
    const dbBytes = exportDbToBytes();
    if (!dbBytes) {
      return { success: false, error: '데이터베이스를 내보내는데 실패했습니다.' };
    }
    zip.file('gosibang.db', dbBytes);

    // 2. 이미지 파일 추가
    const imageFiles = await listImageFiles(userId);
    let imageCount = 0;
    for (const filename of imageFiles) {
      const data = await readImageFile(filename, userId);
      if (data) {
        zip.file(`images/${filename}`, data);
        imageCount++;
      }
    }

    // 3. 메타데이터 추가
    const metadata = {
      version: 1,
      imageCount,
      exportedAt: new Date().toISOString(),
      userId: userId || null,
    };
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 4. ZIP 생성 및 다운로드
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const filename = generateZipBackupFilename();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 설정 업데이트
    const settings = loadBackupSettings();
    settings.lastBackupAt = new Date().toISOString();
    saveBackupSettings(settings);

    // 히스토리 추가
    addBackupToHistory({
      filename,
      createdAt: new Date().toISOString(),
      size: blob.size,
      type: 'manual',
    });

    return { success: true, filename };
  } catch (e: any) {
    console.error('ZIP 내보내기 실패:', e);
    return { success: false, error: `ZIP 내보내기 실패: ${e.message}` };
  }
}

// ZIP에서 복원 (DB + 이미지)
export async function restoreFromZip(file: File, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);

    // 1. gosibang.db 확인 및 복원
    const dbFile = zip.file('gosibang.db');
    if (!dbFile) {
      return { success: false, error: 'ZIP에 gosibang.db 파일이 없습니다.' };
    }

    const dbData = await dbFile.async('uint8array');

    // SQLite 헤더 검증
    const header = new TextDecoder().decode(dbData.slice(0, 16));
    if (!header.startsWith('SQLite format 3')) {
      return { success: false, error: 'ZIP의 DB 파일이 유효한 SQLite 파일이 아닙니다.' };
    }

    // DB → localStorage 저장
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < dbData.length; i += CHUNK_SIZE) {
      const chunk = dbData.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    localStorage.setItem(DB_KEY, base64);

    // 2. 이미지 파일 복원
    const imageFolder = zip.folder('images');
    if (imageFolder) {
      const imageEntries: { name: string; file: { async(type: 'uint8array'): Promise<Uint8Array> } }[] = [];
      imageFolder.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
          imageEntries.push({ name: relativePath, file: zipEntry });
        }
      });

      for (const entry of imageEntries) {
        const data = await entry.file.async('uint8array');
        await writeImageFile(entry.name, data, userId);
      }
    }

    return { success: true };
  } catch (e: any) {
    console.error('ZIP 복원 실패:', e);
    return { success: false, error: `ZIP 복원 실패: ${e.message}` };
  }
}

// 폴더 기반 백업 파일 정리 (File System Access API 사용 시 실제 파일 삭제)
export async function cleanupBackupFolder(): Promise<{
  success: boolean;
  deletedCount: number;
  keptCount: number;
  error?: string;
}> {
  if (!isFileSystemAccessSupported()) {
    // File System Access API 미지원 시 히스토리만 정리
    const result = cleanupBackupHistory();
    return {
      ...result,
      error: result.success ? undefined : '정리 실패',
    };
  }

  try {
    // 폴더 선택
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });

    // 폴더 내 백업 파일 목록 가져오기
    const backupFiles: { name: string; handle: any; date: Date }[] = [];

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.startsWith('gosibang_backup_') && entry.name.endsWith('.db')) {
        // 파일명에서 날짜 추출: gosibang_backup_2024-01-15_10-30-00.db
        const match = entry.name.match(/gosibang_backup_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.db/);
        if (match) {
          const dateStr = match[1];
          const timeStr = match[2].replace(/-/g, ':');
          const date = new Date(`${dateStr}T${timeStr}`);
          backupFiles.push({ name: entry.name, handle: entry, date });
        }
      }
    }

    if (backupFiles.length === 0) {
      return { success: true, deletedCount: 0, keptCount: 0 };
    }

    // 날짜별로 그룹화
    const byDate = new Map<string, typeof backupFiles>();

    for (const file of backupFiles) {
      const dateKey = file.date.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(file);
    }

    // 각 날짜별로 가장 늦게 생성된 파일만 유지
    const latestPerDay: typeof backupFiles = [];

    for (const [, files] of byDate) {
      files.sort((a, b) => b.date.getTime() - a.date.getTime());
      latestPerDay.push(files[0]);
    }

    // 날짜순 정렬 후 최근 N일만 유지
    latestPerDay.sort((a, b) => b.date.getTime() - a.date.getTime());
    const toKeep = new Set(latestPerDay.slice(0, DAYS_TO_KEEP).map(f => f.name));

    // 삭제 대상 파일
    const toDelete = backupFiles.filter(f => !toKeep.has(f.name));

    // 파일 삭제
    for (const file of toDelete) {
      await dirHandle.removeEntry(file.name);
    }

    // 히스토리도 정리
    cleanupBackupHistory();

    return {
      success: true,
      deletedCount: toDelete.length,
      keptCount: toKeep.size,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: false, deletedCount: 0, keptCount: 0, error: '폴더 선택이 취소되었습니다.' };
    }
    console.error('Cleanup failed:', e);
    return { success: false, deletedCount: 0, keptCount: 0, error: `정리 실패: ${e.message}` };
  }
}
