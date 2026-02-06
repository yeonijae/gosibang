import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { getDb, saveDb, generateUUID, queryToObjects, queryOne } from '../lib/localDb';
import { generateSurveyToken, generateExpiresAt, isSessionExpired } from '../lib/surveyUtils';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './authStore';
import type { SurveyTemplate, SurveySession, SurveyResponse, SurveyAnswer, SurveyQuestion, SurveyDisplayMode } from '../types';

// Tauri에서 반환하는 템플릿 구조
interface TauriSurveyTemplate {
  id: string;
  name: string;
  description: string | null;
  questions: SurveyQuestion[];
  display_mode: string | null;
  is_active: boolean;
}

interface SurveyStore {
  // 상태
  templates: SurveyTemplate[];
  sessions: SurveySession[];
  responses: SurveyResponse[];
  isLoading: boolean;
  error: string | null;

  // 템플릿 관련
  loadTemplates: () => Promise<void>;
  getTemplate: (id: string) => SurveyTemplate | null;
  createTemplate: (data: { name: string; description?: string; questions: SurveyQuestion[]; display_mode?: SurveyDisplayMode }) => Promise<SurveyTemplate>;
  updateTemplate: (id: string, data: { name: string; description?: string; questions: SurveyQuestion[]; display_mode?: SurveyDisplayMode; is_active?: boolean }) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  // 세션 관련
  loadSessions: (filters?: { patient_id?: string; status?: string }) => Promise<void>;
  createSession: (patientId: string, templateId: string, createdBy?: string) => Promise<SurveySession>;
  createKioskSession: (templateId: string, patientId: string | null, respondentName: string) => Promise<SurveySession>;
  getSessionByToken: (token: string) => Promise<{ session: SurveySession; template: SurveyTemplate } | null>;
  expireSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // 응답-환자 연결
  linkResponseToPatient: (responseId: string, patientId: string) => Promise<void>;

  // 응답 관련
  loadResponses: (filters?: { patient_id?: string; template_id?: string }) => Promise<void>;
  submitResponse: (sessionId: string, answers: SurveyAnswer[]) => Promise<void>;
  createDirectResponse: (templateId: string, answers: SurveyAnswer[], respondentName?: string) => Promise<void>;
  getResponsesByPatient: (patientId: string) => Promise<SurveyResponse[]>;
  deleteResponse: (id: string) => Promise<void>;
}

export const useSurveyStore = create<SurveyStore>((set, get) => ({
  templates: [],
  sessions: [],
  responses: [],
  isLoading: false,
  error: null,

  // ===== 템플릿 관련 (Tauri 명령어 사용) =====

  loadTemplates: async () => {
    try {
      set({ isLoading: true, error: null });

      // Tauri 명령어로 Rust DB에서 템플릿 조회
      const tauriTemplates = await invoke<TauriSurveyTemplate[]>('list_survey_templates');

      const templates: SurveyTemplate[] = tauriTemplates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description || undefined,
        questions: t.questions,
        display_mode: (t.display_mode || 'one_by_one') as SurveyDisplayMode,
        is_active: t.is_active,
        created_at: new Date().toISOString(), // Rust DB에 없으면 현재 시간
        updated_at: new Date().toISOString(),
      }));

      set({ templates, isLoading: false });
    } catch (error) {
      console.error('[Survey] 템플릿 로드 실패:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  getTemplate: (id: string) => {
    // 이미 로드된 템플릿에서 찾기 (동기식)
    const templates = get().templates;
    return templates.find(t => t.id === id) || null;
  },

  createTemplate: async (data) => {
    // Tauri 명령어로 Rust DB에 저장
    const templateInput = {
      id: null, // 새로 생성 시 null
      name: data.name,
      description: data.description || null,
      questions: data.questions,
      display_mode: data.display_mode || 'one_by_one',
      is_active: true,
    };

    const newId = await invoke<string>('save_survey_template', { template: templateInput });

    const template: SurveyTemplate = {
      id: newId,
      name: data.name,
      description: data.description,
      questions: data.questions,
      display_mode: data.display_mode || 'one_by_one',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 템플릿 목록 다시 로드
    await get().loadTemplates();
    return template;
  },

  updateTemplate: async (id, data) => {
    const templateInput = {
      id,
      name: data.name,
      description: data.description || null,
      questions: data.questions,
      display_mode: data.display_mode || 'one_by_one',
      is_active: data.is_active ?? true,
    };

    await invoke<string>('save_survey_template', { template: templateInput });

    // 템플릿 목록 다시 로드
    await get().loadTemplates();
  },

  deleteTemplate: async (id) => {
    await invoke('delete_survey_template', { id });

    // 템플릿 목록 다시 로드
    await get().loadTemplates();
  },

  // ===== 세션 관련 =====

  loadSessions: async (filters) => {
    try {
      set({ isLoading: true, error: null });
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 템플릿 목록이 비어있으면 먼저 로드
      let templates = get().templates;
      if (templates.length === 0) {
        await get().loadTemplates();
        templates = get().templates;
      }
      const templateMap = new Map(templates.map(t => [t.id, t.name]));

      let sql = `
        SELECT s.*, p.name as patient_name
        FROM survey_sessions s
        LEFT JOIN patients p ON s.patient_id = p.id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (filters?.patient_id) {
        sql += ' AND s.patient_id = ?';
        params.push(filters.patient_id);
      }
      if (filters?.status) {
        sql += ' AND s.status = ?';
        params.push(filters.status);
      }

      sql += ' ORDER BY s.created_at DESC';

      const rawSessions = queryToObjects<SurveySession>(db, sql, params);

      // 만료된 세션 상태 업데이트 및 템플릿 이름 추가
      const sessions = rawSessions.map(session => {
        if (session.status === 'pending' && isSessionExpired(session.expires_at)) {
          session.status = 'expired';
          db.run('UPDATE survey_sessions SET status = ? WHERE id = ?', ['expired', session.id]);
        }
        return {
          ...session,
          template_name: templateMap.get(session.template_id) || '알 수 없는 템플릿',
        };
      });
      saveDb();

      set({ sessions, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createSession: async (patientId, templateId, createdBy) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    const id = generateUUID();
    const token = generateSurveyToken();
    const expiresAt = generateExpiresAt(24);
    const now = new Date().toISOString();

    // 환자 이름 가져오기 (sql.js에서)
    const patient = queryOne<{ name: string }>(db, 'SELECT name FROM patients WHERE id = ?', [patientId]);

    // 템플릿 정보 가져오기 (Tauri 명령어로 Rust DB에서)
    const localTemplate = await invoke<TauriSurveyTemplate | null>('get_survey_template', { id: templateId });

    if (!localTemplate) throw new Error('템플릿을 찾을 수 없습니다.');

    // 로컬 DB에 세션 저장
    db.run(
      `INSERT INTO survey_sessions (id, token, patient_id, template_id, status, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, token, patientId, templateId, expiresAt, createdBy || null, now]
    );
    saveDb();

    // Supabase 동기화
    const authState = useAuthStore.getState().authState;
    const userId = authState?.user?.id;

    if (userId) {
      try {
        // 1. 템플릿이 Supabase에 있는지 확인하고, 없으면 생성
        const { data: existingTemplate } = await supabase
          .from('survey_templates')
          .select('id')
          .eq('id', templateId)
          .single();

        if (!existingTemplate) {
          // 템플릿 업로드 (Tauri에서 가져온 템플릿은 이미 파싱됨)
          await supabase.from('survey_templates').insert({
            id: templateId,
            user_id: userId,
            name: localTemplate.name,
            description: localTemplate.description || null,
            questions: localTemplate.questions,
            display_mode: localTemplate.display_mode || 'one_by_one',
            is_active: localTemplate.is_active,
          });
        }

        // 2. 세션 업로드
        await supabase.from('survey_sessions').insert({
          id,
          user_id: userId,
          template_id: templateId,
          token,
          patient_id: patientId,
          respondent_name: patient?.name || null,
          status: 'pending',
          expires_at: expiresAt,
        });

        console.log('[Survey] Supabase 동기화 완료:', { sessionId: id, token });
      } catch (error) {
        console.error('[Survey] Supabase 동기화 실패:', error);
        // 로컬에는 저장되었으므로 에러를 throw하지 않음
      }
    }

    const session: SurveySession = {
      id,
      token,
      patient_id: patientId,
      template_id: templateId,
      status: 'pending',
      expires_at: expiresAt,
      created_by: createdBy,
      created_at: now,
      patient_name: patient?.name,
      template_name: localTemplate.name,
    };

    set({ sessions: [session, ...get().sessions] });
    return session;
  },

  getSessionByToken: async (token) => {
    const db = getDb();
    if (!db) return null;

    const session = queryOne<SurveySession>(
      db,
      `SELECT s.*, p.name as patient_name
       FROM survey_sessions s
       LEFT JOIN patients p ON s.patient_id = p.id
       WHERE s.token = ?`,
      [token]
    );

    if (!session) return null;

    // 만료 확인
    if (session.status === 'pending' && isSessionExpired(session.expires_at)) {
      db.run('UPDATE survey_sessions SET status = ? WHERE id = ?', ['expired', session.id]);
      saveDb();
      session.status = 'expired';
    }

    if (session.status !== 'pending') {
      return null;
    }

    // 템플릿은 상태에서 가져오기 (Rust DB에서 로드됨)
    const template = get().getTemplate(session.template_id);
    if (!template) return null;

    // 세션에 템플릿 이름 추가
    session.template_name = template.name;

    return { session, template };
  },

  expireSession: async (id) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    db.run('UPDATE survey_sessions SET status = ? WHERE id = ?', ['expired', id]);
    saveDb();

    set({
      sessions: get().sessions.map(s =>
        s.id === id ? { ...s, status: 'expired' as const } : s
      ),
    });
  },

  deleteSession: async (id) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    // 로컬 DB에서 삭제
    db.run('DELETE FROM survey_sessions WHERE id = ?', [id]);
    saveDb();

    // Supabase에서도 삭제 (동기화)
    try {
      await supabase.from('survey_sessions').delete().eq('id', id);
    } catch (error) {
      console.error('[Survey] Supabase 세션 삭제 실패:', error);
    }

    // 상태에서 제거
    set({
      sessions: get().sessions.filter(s => s.id !== id),
    });
  },

  // 키오스크용 세션 생성 (환자 미등록 지원)
  createKioskSession: async (templateId, patientId, respondentName) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    const id = generateUUID();
    const token = generateSurveyToken();
    const expiresAt = generateExpiresAt(24);
    const now = new Date().toISOString();

    // 템플릿 정보 가져오기
    const localTemplate = await invoke<TauriSurveyTemplate | null>('get_survey_template', { id: templateId });
    if (!localTemplate) throw new Error('템플릿을 찾을 수 없습니다.');

    // 로컬 DB에 세션 저장
    db.run(
      `INSERT INTO survey_sessions (id, token, patient_id, template_id, respondent_name, status, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 'kiosk', ?)`,
      [id, token, patientId, templateId, respondentName, expiresAt, now]
    );
    saveDb();

    const session: SurveySession = {
      id,
      token,
      patient_id: patientId || undefined,
      template_id: templateId,
      respondent_name: respondentName,
      status: 'pending',
      expires_at: expiresAt,
      created_by: 'kiosk',
      created_at: now,
      patient_name: respondentName,
      template_name: localTemplate.name,
    };

    set({ sessions: [session, ...get().sessions] });
    return session;
  },

  // 응답-환자 연결
  linkResponseToPatient: async (responseId, patientId) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    // 환자 이름 가져오기
    const patient = queryOne<{ name: string }>(db, 'SELECT name FROM patients WHERE id = ?', [patientId]);
    if (!patient) throw new Error('환자를 찾을 수 없습니다.');

    // 응답의 patient_id 업데이트
    db.run(
      'UPDATE survey_responses SET patient_id = ? WHERE id = ?',
      [patientId, responseId]
    );

    // 관련 세션도 업데이트
    const response = queryOne<{ session_id: string | null }>(db, 'SELECT session_id FROM survey_responses WHERE id = ?', [responseId]);
    if (response?.session_id) {
      db.run(
        'UPDATE survey_sessions SET patient_id = ? WHERE id = ?',
        [patientId, response.session_id]
      );
    }

    saveDb();

    // 응답 목록 새로고침
    await get().loadResponses();
  },

  // ===== 응답 관련 =====

  loadResponses: async (filters) => {
    try {
      set({ isLoading: true, error: null });
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      // 템플릿 목록이 비어있으면 먼저 로드
      let templates = get().templates;
      if (templates.length === 0) {
        await get().loadTemplates();
        templates = get().templates;
      }
      const templateMap = new Map(templates.map(t => [t.id, t.name]));

      let sql = `
        SELECT r.*,
          COALESCE(p.name, r.respondent_name) as patient_name
        FROM survey_responses r
        LEFT JOIN patients p ON r.patient_id = p.id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (filters?.patient_id) {
        sql += ' AND r.patient_id = ?';
        params.push(filters.patient_id);
      }
      if (filters?.template_id) {
        sql += ' AND r.template_id = ?';
        params.push(filters.template_id);
      }

      sql += ' ORDER BY r.submitted_at DESC';

      const responses = queryToObjects<SurveyResponse & { answers: string }>(db, sql, params).map(r => ({
        ...r,
        answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers,
        template_name: templateMap.get(r.template_id) || '알 수 없는 템플릿',
      }));

      set({ responses, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  submitResponse: async (sessionId, answers) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    // 세션 정보 가져오기
    const session = queryOne<SurveySession>(
      db,
      'SELECT * FROM survey_sessions WHERE id = ?',
      [sessionId]
    );

    if (!session) throw new Error('세션을 찾을 수 없습니다.');
    if (session.status !== 'pending') throw new Error('이미 완료되었거나 만료된 세션입니다.');

    const id = generateUUID();
    const now = new Date().toISOString();

    // 응답 저장
    db.run(
      `INSERT INTO survey_responses (id, session_id, patient_id, template_id, answers, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, sessionId, session.patient_id, session.template_id, JSON.stringify(answers), now]
    );

    // 세션 완료 처리
    db.run(
      'UPDATE survey_sessions SET status = ?, completed_at = ? WHERE id = ?',
      ['completed', now, sessionId]
    );

    saveDb();
  },

  getResponsesByPatient: async (patientId) => {
    const db = getDb();
    if (!db) return [];

    // 템플릿 목록을 먼저 로드 (Rust DB에서)
    const templates = get().templates;
    const templateMap = new Map(templates.map(t => [t.id, t.name]));

    const responses = queryToObjects<SurveyResponse & { answers: string }>(
      db,
      `SELECT r.*
       FROM survey_responses r
       WHERE r.patient_id = ?
       ORDER BY r.submitted_at DESC`,
      [patientId]
    ).map(r => ({
      ...r,
      answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers,
      template_name: templateMap.get(r.template_id) || '알 수 없는 템플릿',
    }));

    return responses;
  },

  // 환자 등록 없이 직접 응답 생성
  createDirectResponse: async (templateId, answers, respondentName) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    const id = generateUUID();
    const now = new Date().toISOString();

    // 응답 저장 (patient_id는 null, respondent_name 컬럼 활용)
    db.run(
      `INSERT INTO survey_responses (id, session_id, patient_id, template_id, answers, respondent_name, submitted_at)
       VALUES (?, NULL, NULL, ?, ?, ?, ?)`,
      [id, templateId, JSON.stringify(answers), respondentName || null, now]
    );
    saveDb();

    // 응답 목록 새로고침
    await get().loadResponses();
  },

  // 응답 삭제
  deleteResponse: async (id) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    db.run('DELETE FROM survey_responses WHERE id = ?', [id]);
    saveDb();

    // 응답 목록에서 제거
    set({ responses: get().responses.filter(r => r.id !== id) });
  },
}));
