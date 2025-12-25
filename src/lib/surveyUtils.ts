// 설문 관련 유틸리티 함수

// URL-safe 토큰 생성 (8자리)
export function generateSurveyToken(): string {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 8)
    .toUpperCase();
}

// 설문 링크 생성
export function generateSurveyLink(token: string): string {
  return `${window.location.origin}/survey/${token}`;
}

// 만료 시간 생성 (기본 24시간)
export function generateExpiresAt(hours: number = 24): string {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

// 세션 만료 여부 확인
export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// QR 코드 URL 생성 (외부 API 사용)
export function generateQRCodeUrl(data: string, size: number = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

// 질문 ID 생성
export function generateQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}
