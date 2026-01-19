/**
 * 웹 API 클라이언트
 * 내부 HTTP 서버의 REST API를 호출합니다.
 */

import { getApiBaseUrl } from './platform';
import type { Patient, Prescription, ChartRecord, ClinicSettings, SurveyTemplate, SurveyResponse } from '../types';

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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  // 204 No Content인 경우
  if (response.status === 204) {
    return null as T;
  }

  return response.json();
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
