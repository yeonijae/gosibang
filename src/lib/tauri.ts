/**
 * Tauri API 모듈
 * Tauri 데스크톱 앱에서 Rust 백엔드와 통신하기 위한 래퍼
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core';

// Tauri 환경인지 확인
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Tauri invoke 함수
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('Tauri 환경이 아닙니다');
  }
  return tauriInvoke<T>(cmd, args);
}

// ============ 데이터베이스 API ============

/**
 * 앱 초기화
 */
export async function initializeApp(
  supabaseUrl: string,
  supabaseKey: string,
  dbEncryptionKey: string
): Promise<void> {
  return invoke<void>('initialize_app', {
    supabase_url: supabaseUrl,
    supabase_key: supabaseKey,
    db_encryption_key: dbEncryptionKey,
  });
}
