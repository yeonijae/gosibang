/**
 * 플랫폼 감지 유틸리티
 * Tauri 환경인지 웹 브라우저 환경인지 감지합니다.
 */

// Tauri 환경 여부 확인
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// 웹 브라우저 환경 여부 확인
export function isWeb(): boolean {
  return !isTauri();
}

// 웹 클라이언트 환경 여부 확인 (내부 직원용 웹 인터페이스)
export function isWebClient(): boolean {
  return !isTauri();
}

// 현재 플랫폼 타입
export type Platform = 'tauri' | 'web';

export function getPlatform(): Platform {
  return isTauri() ? 'tauri' : 'web';
}

// API 베이스 URL (웹 환경에서 사용)
export function getApiBaseUrl(): string {
  // 같은 호스트의 /api/web 사용
  return '/api/web';
}
