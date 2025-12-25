import { create } from 'zustand';
import { getDb, saveDb, generateUUID, queryToObjects, queryOne } from '../lib/localDb';
import { generateSurveyToken, generateExpiresAt, isSessionExpired } from '../lib/surveyUtils';
import type { SurveyTemplate, SurveySession, SurveyResponse, SurveyAnswer, SurveyQuestion, SurveyDisplayMode } from '../types';

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
  getSessionByToken: (token: string) => Promise<{ session: SurveySession; template: SurveyTemplate } | null>;
  expireSession: (id: string) => Promise<void>;

  // 응답 관련
  loadResponses: (filters?: { patient_id?: string; template_id?: string }) => Promise<void>;
  submitResponse: (sessionId: string, answers: SurveyAnswer[]) => Promise<void>;
  getResponsesByPatient: (patientId: string) => Promise<SurveyResponse[]>;
}

export const useSurveyStore = create<SurveyStore>((set, get) => ({
  templates: [],
  sessions: [],
  responses: [],
  isLoading: false,
  error: null,

  // ===== 템플릿 관련 =====

  loadTemplates: async () => {
    try {
      set({ isLoading: true, error: null });
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const templates = queryToObjects<SurveyTemplate & { questions: string }>(
        db,
        'SELECT * FROM survey_templates ORDER BY created_at DESC'
      ).map(t => ({
        ...t,
        questions: typeof t.questions === 'string' ? JSON.parse(t.questions) : t.questions,
        display_mode: t.display_mode || 'one_by_one',
        is_active: Boolean(t.is_active),
      }));

      set({ templates, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  getTemplate: (id: string) => {
    const db = getDb();
    if (!db) return null;

    const template = queryOne<SurveyTemplate & { questions: string }>(
      db,
      'SELECT * FROM survey_templates WHERE id = ?',
      [id]
    );

    if (!template) return null;

    return {
      ...template,
      questions: typeof template.questions === 'string' ? JSON.parse(template.questions) : template.questions,
      display_mode: template.display_mode || 'one_by_one',
      is_active: Boolean(template.is_active),
    };
  },

  createTemplate: async (data) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    const id = generateUUID();
    const now = new Date().toISOString();
    const displayMode = data.display_mode || 'one_by_one';

    db.run(
      `INSERT INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, data.name, data.description || null, JSON.stringify(data.questions), displayMode, now, now]
    );
    saveDb();

    const template: SurveyTemplate = {
      id,
      name: data.name,
      description: data.description,
      questions: data.questions,
      display_mode: displayMode,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    set({ templates: [template, ...get().templates] });
    return template;
  },

  updateTemplate: async (id, data) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    const now = new Date().toISOString();
    const displayMode = data.display_mode || 'one_by_one';

    db.run(
      `UPDATE survey_templates SET name = ?, description = ?, questions = ?, display_mode = ?, is_active = ?, updated_at = ? WHERE id = ?`,
      [data.name, data.description || null, JSON.stringify(data.questions), displayMode, data.is_active ? 1 : 0, now, id]
    );
    saveDb();

    await get().loadTemplates();
  },

  deleteTemplate: async (id) => {
    const db = getDb();
    if (!db) throw new Error('DB가 초기화되지 않았습니다.');

    db.run('DELETE FROM survey_templates WHERE id = ?', [id]);
    saveDb();

    set({ templates: get().templates.filter(t => t.id !== id) });
  },

  // ===== 세션 관련 =====

  loadSessions: async (filters) => {
    try {
      set({ isLoading: true, error: null });
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      let sql = `
        SELECT s.*, p.name as patient_name, t.name as template_name
        FROM survey_sessions s
        LEFT JOIN patients p ON s.patient_id = p.id
        LEFT JOIN survey_templates t ON s.template_id = t.id
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

      const sessions = queryToObjects<SurveySession>(db, sql, params);

      // 만료된 세션 상태 업데이트
      sessions.forEach(session => {
        if (session.status === 'pending' && isSessionExpired(session.expires_at)) {
          session.status = 'expired';
          db.run('UPDATE survey_sessions SET status = ? WHERE id = ?', ['expired', session.id]);
        }
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

    db.run(
      `INSERT INTO survey_sessions (id, token, patient_id, template_id, status, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, token, patientId, templateId, expiresAt, createdBy || null, now]
    );
    saveDb();

    // 환자 이름, 템플릿 이름 가져오기
    const patient = queryOne<{ name: string }>(db, 'SELECT name FROM patients WHERE id = ?', [patientId]);
    const template = queryOne<{ name: string }>(db, 'SELECT name FROM survey_templates WHERE id = ?', [templateId]);

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
      template_name: template?.name,
    };

    set({ sessions: [session, ...get().sessions] });
    return session;
  },

  getSessionByToken: async (token) => {
    const db = getDb();
    if (!db) return null;

    const session = queryOne<SurveySession>(
      db,
      `SELECT s.*, p.name as patient_name, t.name as template_name
       FROM survey_sessions s
       LEFT JOIN patients p ON s.patient_id = p.id
       LEFT JOIN survey_templates t ON s.template_id = t.id
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

    const template = get().getTemplate(session.template_id);
    if (!template) return null;

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

  // ===== 응답 관련 =====

  loadResponses: async (filters) => {
    try {
      set({ isLoading: true, error: null });
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      let sql = `
        SELECT r.*, p.name as patient_name, t.name as template_name
        FROM survey_responses r
        LEFT JOIN patients p ON r.patient_id = p.id
        LEFT JOIN survey_templates t ON r.template_id = t.id
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

    const responses = queryToObjects<SurveyResponse & { answers: string }>(
      db,
      `SELECT r.*, t.name as template_name
       FROM survey_responses r
       LEFT JOIN survey_templates t ON r.template_id = t.id
       WHERE r.patient_id = ?
       ORDER BY r.submitted_at DESC`,
      [patientId]
    ).map(r => ({
      ...r,
      answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers,
    }));

    return responses;
  },
}));
