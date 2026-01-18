/**
 * 웹 클라이언트용 API 모듈
 * 인트라넷 서버의 REST API와 통신
 */

import type { Patient, Prescription, ChartRecord, ClinicSettings, SurveyTemplate, StaffPermissions } from '../types';

// 세션 토큰 저장 키
const WEB_SESSION_TOKEN_KEY = 'gosibang_web_session_token';
const WEB_API_BASE_KEY = 'gosibang_web_api_base';

// API 응답 타입
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============ 세션 관리 ============

export function getWebSessionToken(): string | null {
  return localStorage.getItem(WEB_SESSION_TOKEN_KEY);
}

export function setWebSessionToken(token: string): void {
  localStorage.setItem(WEB_SESSION_TOKEN_KEY, token);
}

export function clearWebSessionToken(): void {
  localStorage.removeItem(WEB_SESSION_TOKEN_KEY);
}

export function getApiBaseUrl(): string {
  // localStorage에 저장된 값 또는 현재 호스트 사용
  return localStorage.getItem(WEB_API_BASE_KEY) || window.location.origin;
}

export function setApiBaseUrl(url: string): void {
  localStorage.setItem(WEB_API_BASE_KEY, url);
}

// ============ API 호출 헬퍼 ============

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = getWebSessionToken();

  // URL에 토큰 추가
  const url = new URL(`${baseUrl}/api/web${endpoint}`);
  if (token) {
    url.searchParams.set('token', token);
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    throw new Error(result.error || '요청 실패');
  }

  return result.data as T;
}

// ============ 인증 API ============

interface LoginResult {
  token: string;
  username: string;
  display_name: string;
  role: string;
  permissions: StaffPermissions;
}

// 현재 세션 정보 저장
const WEB_SESSION_INFO_KEY = 'gosibang_web_session_info';

export function getWebSessionInfo(): LoginResult | null {
  const info = localStorage.getItem(WEB_SESSION_INFO_KEY);
  return info ? JSON.parse(info) : null;
}

function setWebSessionInfo(info: LoginResult): void {
  localStorage.setItem(WEB_SESSION_INFO_KEY, JSON.stringify(info));
}

function clearWebSessionInfo(): void {
  localStorage.removeItem(WEB_SESSION_INFO_KEY);
}

export async function webLogin(username: string, password: string): Promise<LoginResult> {
  const baseUrl = getApiBaseUrl();

  const response = await fetch(`${baseUrl}/api/web/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const result: ApiResponse<LoginResult> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || '로그인 실패');
  }

  // 토큰 및 세션 정보 저장
  setWebSessionToken(result.data.token);
  setWebSessionInfo(result.data);

  return result.data;
}

export async function webLogout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // 에러 무시
  }
  clearWebSessionToken();
  clearWebSessionInfo();
}

export async function webVerifySession(): Promise<boolean> {
  try {
    return await apiRequest<boolean>('/auth/verify');
  } catch {
    return false;
  }
}

// ============ 환자 관리 API ============

export async function webListPatients(search?: string): Promise<Patient[]> {
  const endpoint = search ? `/patients?search=${encodeURIComponent(search)}` : '/patients';
  return apiRequest<Patient[]>(endpoint);
}

export async function webGetPatient(id: string): Promise<Patient | null> {
  return apiRequest<Patient | null>(`/patients/${id}`);
}

export async function webCreatePatient(patient: Patient): Promise<string> {
  const token = getWebSessionToken();
  return apiRequest<string>('/patients', {
    method: 'POST',
    body: JSON.stringify({ ...patient, token }),
  });
}

export async function webUpdatePatient(patient: Patient): Promise<void> {
  const token = getWebSessionToken();
  await apiRequest<void>(`/patients/${patient.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...patient, token }),
  });
}

export async function webDeletePatient(id: string): Promise<void> {
  await apiRequest<void>(`/patients/${id}`, { method: 'DELETE' });
}

// ============ 처방 관리 API ============

export async function webCreatePrescription(prescription: Prescription): Promise<string> {
  const token = getWebSessionToken();
  return apiRequest<string>('/prescriptions', {
    method: 'POST',
    body: JSON.stringify({ ...prescription, token }),
  });
}

export async function webGetPrescriptionsByPatient(patientId: string): Promise<Prescription[]> {
  return apiRequest<Prescription[]>(`/prescriptions/patient/${patientId}`);
}

// ============ 차트 관리 API ============

export async function webCreateChart(chart: ChartRecord): Promise<string> {
  const token = getWebSessionToken();
  return apiRequest<string>('/charts', {
    method: 'POST',
    body: JSON.stringify({ ...chart, token }),
  });
}

export async function webGetChartsByPatient(patientId: string): Promise<ChartRecord[]> {
  return apiRequest<ChartRecord[]>(`/charts/patient/${patientId}`);
}

// ============ 설정 API ============

export async function webGetSettings(): Promise<ClinicSettings | null> {
  return apiRequest<ClinicSettings | null>('/settings');
}

export async function webSaveSettings(settings: ClinicSettings): Promise<void> {
  const token = getWebSessionToken();
  await apiRequest<void>('/settings', {
    method: 'POST',
    body: JSON.stringify({ ...settings, token }),
  });
}

// ============ 설문 템플릿 API ============

export async function webListSurveyTemplates(): Promise<SurveyTemplate[]> {
  return apiRequest<SurveyTemplate[]>('/survey-templates');
}

export async function webGetSurveyTemplate(id: string): Promise<SurveyTemplate | null> {
  return apiRequest<SurveyTemplate | null>(`/survey-templates/${id}`);
}

export async function webSaveSurveyTemplate(template: Partial<SurveyTemplate> & { name: string }): Promise<string> {
  const token = getWebSessionToken();
  return apiRequest<string>('/survey-templates', {
    method: 'POST',
    body: JSON.stringify({ ...template, token }),
  });
}

export async function webDeleteSurveyTemplate(id: string): Promise<void> {
  await apiRequest<void>(`/survey-templates/${id}`, { method: 'DELETE' });
}

// ============ 설문 응답 API ============

export async function webListSurveyResponses(limit?: number): Promise<unknown[]> {
  const endpoint = limit ? `/survey-responses?limit=${limit}` : '/survey-responses';
  return apiRequest<unknown[]>(endpoint);
}

// ============ 내보내기 API ============

export async function webExportPatientData(patientId: string): Promise<string> {
  return apiRequest<string>(`/export/patient/${patientId}`);
}

export async function webExportAllData(): Promise<string> {
  return apiRequest<string>('/export/all');
}

// ============ 권한 확인 헬퍼 ============

export function canWebRead(feature: 'patients' | 'prescriptions' | 'charts' | 'survey' | 'settings'): boolean {
  const session = getWebSessionInfo();
  if (!session) return false;

  // 관리자는 모든 권한
  if (session.role === 'admin') return true;

  const permissions = session.permissions;
  switch (feature) {
    case 'patients':
      return permissions.patients_read;
    case 'prescriptions':
      return permissions.prescriptions_read;
    case 'charts':
      return permissions.charts_read;
    case 'survey':
      return permissions.survey_read;
    case 'settings':
      return permissions.settings_read;
    default:
      return false;
  }
}

export function canWebWrite(feature: 'patients' | 'prescriptions' | 'charts' | 'survey'): boolean {
  const session = getWebSessionInfo();
  if (!session) return false;

  // 관리자는 모든 권한
  if (session.role === 'admin') return true;

  const permissions = session.permissions;
  switch (feature) {
    case 'patients':
      return permissions.patients_write;
    case 'prescriptions':
      return permissions.prescriptions_write;
    case 'charts':
      return permissions.charts_write;
    case 'survey':
      return permissions.survey_write;
    default:
      return false;
  }
}
