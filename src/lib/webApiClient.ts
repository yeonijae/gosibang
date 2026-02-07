/**
 * 웹 API 클라이언트
 * 내부 HTTP 서버의 REST API를 호출합니다.
 */

import { getApiBaseUrl } from './platform';
import type { Patient, Prescription, ChartRecord, ClinicSettings, SurveyTemplate, SurveyResponse, SurveyQuestion, InitialChart, ProgressNote, MedicationSchedule, MedicationLog, MedicationStats, Notification, NotificationSettings } from '../types';

// 인증 토큰 저장
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('web_auth_token', token);
  } else {
    localStorage.removeItem('web_auth_token');
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('web_auth_token');
  }
  return authToken;
}

// API 응답 타입 (서버의 ApiResponse 구조와 일치)
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// 공통 fetch 래퍼
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 204 No Content인 경우
  if (response.status === 204) {
    return null as T;
  }

  const json: ApiResponse<T> = await response.json();

  // 에러 처리
  if (!json.success || json.error) {
    throw new Error(json.error || `HTTP ${response.status}`);
  }

  return json.data as T;
}

// ============ 인증 API ============

export interface WebLoginRequest {
  username: string;
  password: string;
}

export interface WebLoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    role: string;
    permissions: Record<string, boolean>;
  };
}

export async function webLogin(username: string, password: string): Promise<WebLoginResponse> {
  const result = await apiFetch<WebLoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAuthToken(result.token);
  return result;
}

export async function webLogout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    setAuthToken(null);
  }
}

export interface WebVerifyResponse {
  valid: boolean;
  user?: {
    id: string;
    username: string;
    display_name: string;
    role: string;
    permissions: Record<string, boolean>;
  };
}

export async function webVerify(): Promise<WebVerifyResponse> {
  return apiFetch<WebVerifyResponse>('/auth/verify');
}

// ============ 환자 API ============

export async function listPatients(): Promise<Patient[]> {
  return apiFetch<Patient[]>('/patients');
}

export async function getPatient(id: string): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}`);
}

export async function createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'updated_at'>): Promise<Patient> {
  return apiFetch<Patient>('/patients', {
    method: 'POST',
    body: JSON.stringify(patient),
  });
}

export async function updatePatient(id: string, patient: Partial<Patient>): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patient),
  });
}

export async function deletePatient(id: string): Promise<void> {
  return apiFetch<void>(`/patients/${id}`, { method: 'DELETE' });
}

// ============ 처방 API ============

export async function getPatientPrescriptions(patientId: string): Promise<Prescription[]> {
  return apiFetch<Prescription[]>(`/prescriptions/patient/${patientId}`);
}

export async function createPrescription(prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>): Promise<Prescription> {
  return apiFetch<Prescription>('/prescriptions', {
    method: 'POST',
    body: JSON.stringify(prescription),
  });
}

// ============ 차트 API ============

export async function getPatientChartRecords(patientId: string): Promise<ChartRecord[]> {
  return apiFetch<ChartRecord[]>(`/charts/patient/${patientId}`);
}

export async function createChartRecord(chart: Omit<ChartRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ChartRecord> {
  return apiFetch<ChartRecord>('/charts', {
    method: 'POST',
    body: JSON.stringify(chart),
  });
}

// ============ 초진차트 API ============

export interface InitialChartWithPatient extends InitialChart {
  patient_name: string;
}

export async function listInitialCharts(): Promise<InitialChartWithPatient[]> {
  return apiFetch<InitialChartWithPatient[]>('/initial-charts');
}

export async function getInitialChart(id: string): Promise<InitialChart | null> {
  return apiFetch<InitialChart | null>(`/initial-charts/${id}`);
}

export async function getInitialChartsByPatient(patientId: string): Promise<InitialChart[]> {
  return apiFetch<InitialChart[]>(`/initial-charts/patient/${patientId}`);
}

export async function createInitialChart(chart: Partial<InitialChart>): Promise<string> {
  return apiFetch<string>('/initial-charts', {
    method: 'POST',
    body: JSON.stringify(chart),
  });
}

export async function updateInitialChart(id: string, chart: Partial<InitialChart>): Promise<void> {
  return apiFetch<void>(`/initial-charts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(chart),
  });
}

export async function deleteInitialChart(id: string): Promise<void> {
  return apiFetch<void>(`/initial-charts/${id}`, { method: 'DELETE' });
}

// ============ 경과기록 API ============

export async function getProgressNote(id: string): Promise<ProgressNote | null> {
  return apiFetch<ProgressNote | null>(`/progress-notes/${id}`);
}

export async function getProgressNotesByPatient(patientId: string): Promise<ProgressNote[]> {
  return apiFetch<ProgressNote[]>(`/progress-notes/patient/${patientId}`);
}

export async function createProgressNote(note: Partial<ProgressNote>): Promise<string> {
  return apiFetch<string>('/progress-notes', {
    method: 'POST',
    body: JSON.stringify(note),
  });
}

export async function updateProgressNote(id: string, note: Partial<ProgressNote>): Promise<void> {
  return apiFetch<void>(`/progress-notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(note),
  });
}

export async function deleteProgressNote(id: string): Promise<void> {
  return apiFetch<void>(`/progress-notes/${id}`, { method: 'DELETE' });
}

// ============ 설정 API ============

export async function getSettings(): Promise<ClinicSettings | null> {
  return apiFetch<ClinicSettings | null>('/settings');
}

export async function saveSettings(settings: ClinicSettings): Promise<void> {
  return apiFetch<void>('/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

// ============ 설문 API ============

export async function getSurveyTemplates(): Promise<SurveyTemplate[]> {
  return apiFetch<SurveyTemplate[]>('/survey-templates');
}

export async function getSurveyResponses(): Promise<SurveyResponse[]> {
  return apiFetch<SurveyResponse[]>('/survey-responses');
}

export async function deleteSurveyResponse(id: string): Promise<void> {
  return apiFetch<void>(`/survey-responses/${id}`, { method: 'DELETE' });
}

export async function linkSurveyResponseToPatient(responseId: string, patientId: string): Promise<void> {
  return apiFetch<void>(`/survey-responses/${responseId}/link`, {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId }),
  });
}

// 설문 템플릿 저장
export interface SaveSurveyTemplateRequest {
  id?: string;
  name: string;
  description?: string;
  questions: SurveyQuestion[];
  display_mode?: string;
  is_active?: boolean;
}

export async function saveSurveyTemplate(template: SaveSurveyTemplateRequest): Promise<string> {
  return apiFetch<string>('/survey-templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
}

export async function deleteSurveyTemplate(id: string): Promise<void> {
  return apiFetch<void>(`/survey-templates/${id}`, { method: 'DELETE' });
}

// ============ 내보내기 API ============

export async function exportPatient(id: string): Promise<Blob> {
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();

  const response = await fetch(`${baseUrl}/export/patient/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error('내보내기 실패');
  }

  return response.blob();
}

export async function exportAll(): Promise<Blob> {
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();

  const response = await fetch(`${baseUrl}/export/all`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error('내보내기 실패');
  }

  return response.blob();
}

// ============ 복약 관리 API ============

// 복약 일정
export async function listMedicationSchedules(): Promise<MedicationSchedule[]> {
  return apiFetch<MedicationSchedule[]>('/medications/schedules');
}

export async function getMedicationSchedule(id: string): Promise<MedicationSchedule | null> {
  return apiFetch<MedicationSchedule | null>(`/medications/schedules/${id}`);
}

export async function getMedicationSchedulesByPatient(patientId: string): Promise<MedicationSchedule[]> {
  return apiFetch<MedicationSchedule[]>(`/medications/schedules/patient/${patientId}`);
}

export async function createMedicationSchedule(
  data: Omit<MedicationSchedule, 'id' | 'created_at'>
): Promise<string> {
  return apiFetch<string>('/medications/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMedicationSchedule(
  id: string,
  data: Partial<MedicationSchedule>
): Promise<void> {
  return apiFetch<void>(`/medications/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMedicationSchedule(id: string): Promise<void> {
  return apiFetch<void>(`/medications/schedules/${id}`, {
    method: 'DELETE',
  });
}

// 복약 기록
export async function listMedicationLogs(): Promise<MedicationLog[]> {
  return apiFetch<MedicationLog[]>('/medications/logs');
}

export async function getMedicationLog(id: string): Promise<MedicationLog | null> {
  return apiFetch<MedicationLog | null>(`/medications/logs/${id}`);
}

export async function getMedicationLogsBySchedule(scheduleId: string): Promise<MedicationLog[]> {
  return apiFetch<MedicationLog[]>(`/medications/logs/schedule/${scheduleId}`);
}

export async function createMedicationLog(
  data: Omit<MedicationLog, 'id'>
): Promise<string> {
  return apiFetch<string>('/medications/logs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMedicationLog(
  id: string,
  data: Partial<MedicationLog>
): Promise<void> {
  return apiFetch<void>(`/medications/logs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// 복약 통계
export async function getMedicationStatsByPatient(patientId: string): Promise<MedicationStats> {
  return apiFetch<MedicationStats>(`/medications/stats/patient/${patientId}`);
}

// ============ 알림 API ============

// 알림 목록 조회
export async function listNotifications(limit?: number): Promise<Notification[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiFetch<Notification[]>(`/notifications${query}`);
}

// 읽지 않은 알림 조회
export async function listUnreadNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>('/notifications/unread');
}

// 읽지 않은 알림 수 조회
export async function getUnreadNotificationCount(): Promise<number> {
  return apiFetch<number>('/notifications/unread/count');
}

// 알림 읽음 처리
export async function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${id}/read`, {
    method: 'POST',
  });
}

// 알림 삭제 (dismiss)
export async function dismissNotification(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${id}/dismiss`, {
    method: 'POST',
  });
}

// 모든 알림 읽음 처리
export async function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/notifications/read-all', {
    method: 'POST',
  });
}

// 알림 설정 조회
export async function getNotificationSettings(): Promise<NotificationSettings | null> {
  return apiFetch<NotificationSettings | null>('/notifications/settings');
}

// 알림 설정 업데이트
export async function updateNotificationSettings(
  settings: Partial<NotificationSettings>
): Promise<void> {
  return apiFetch<void>('/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
