// @ts-ignore
import initSqlJs, { Database } from 'sql.js';
import { PRESCRIPTION_DEFINITIONS } from './prescriptionData';
import { SURVEY_TEMPLATES } from './surveyData';

let db: Database | null = null;
let currentDbKey: string = 'gosibang_db'; // 사용자별 키

// DB 키 생성 (사용자별 분리)
function getDbKey(userId?: string): string {
  return userId ? `gosibang_db_${userId}` : 'gosibang_db';
}

// SQL.js 초기화 및 DB 로드
export async function initLocalDb(userId?: string): Promise<Database> {
  const newDbKey = getDbKey(userId);

  // 다른 사용자로 전환된 경우 DB 리셋
  if (db && currentDbKey !== newDbKey) {
    db.close();
    db = null;
  }

  currentDbKey = newDbKey;

  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });

  // localStorage에서 기존 DB 로드 (사용자별)
  const savedDb = localStorage.getItem(currentDbKey);
  if (savedDb) {
    const data = Uint8Array.from(atob(savedDb), (c) => c.charCodeAt(0));
    db = new SQL.Database(data);
    // 기존 DB에 새 테이블이 없을 수 있으므로 마이그레이션 실행
    migrateDatabase(db);
  } else {
    db = new SQL.Database();
    createTables(db);
  }

  return db;
}

// 휴지통 관련 타입
export interface TrashItem {
  id: string;
  type: 'patient' | 'prescription' | 'initial_chart' | 'progress_note';
  name: string;
  deleted_at: string;
  extra_info?: string;
}

// 기존 DB 마이그레이션 (새 테이블 추가)
function migrateDatabase(database: Database) {
  // deleted_at 컬럼 추가 (휴지통 기능)
  try {
    database.run('ALTER TABLE patients ADD COLUMN deleted_at TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN deleted_at TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE initial_charts ADD COLUMN deleted_at TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE progress_notes ADD COLUMN deleted_at TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  // prescription_categories 테이블 생성 (없으면)
  database.run(`
    CREATE TABLE IF NOT EXISTS prescription_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3b82f6',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // herbs 테이블 생성 (없으면)
  database.run(`
    CREATE TABLE IF NOT EXISTS herbs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_dosage REAL,
      unit TEXT DEFAULT 'g',
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // prescription_definitions 테이블 생성 (없으면)
  database.run(`
    CREATE TABLE IF NOT EXISTS prescription_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      alias TEXT,
      category TEXT,
      source TEXT,
      composition TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 기존 테이블에 새 컬럼 추가 (category, source)
  try {
    database.run('ALTER TABLE prescription_definitions ADD COLUMN category TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescription_definitions ADD COLUMN source TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }

  // prescriptions 테이블 생성 (없으면)
  database.run(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      formula TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      issued_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // prescriptions 테이블에 새 컬럼 추가
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN prescription_name TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN formula TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN patient_name TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN chart_number TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN notes TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run("ALTER TABLE prescriptions ADD COLUMN status TEXT DEFAULT 'draft'");
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN issued_at TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN created_by TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN patient_age INTEGER');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN patient_gender TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN source_type TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN source_id TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN merged_herbs TEXT DEFAULT \'[]\'');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN final_herbs TEXT DEFAULT \'[]\'');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN total_doses REAL DEFAULT 15');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN days INTEGER DEFAULT 15');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN doses_per_day INTEGER DEFAULT 2');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN total_packs INTEGER DEFAULT 30');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN pack_volume INTEGER DEFAULT 100');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN water_amount INTEGER');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN herb_adjustment TEXT');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN total_dosage REAL DEFAULT 0');
  } catch (e) { /* 이미 존재하면 무시 */ }
  try {
    database.run('ALTER TABLE prescriptions ADD COLUMN final_total_amount REAL DEFAULT 0');
  } catch (e) { /* 이미 존재하면 무시 */ }

  // initial_charts 테이블 생성 (없으면)
  database.run(`
    CREATE TABLE IF NOT EXISTS initial_charts (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      doctor_name TEXT,
      chart_date TEXT NOT NULL,
      chief_complaint TEXT,
      present_illness TEXT,
      past_medical_history TEXT,
      notes TEXT,
      prescription_issued INTEGER DEFAULT 0,
      prescription_issued_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // progress_notes 테이블 생성 (없으면)
  database.run(`
    CREATE TABLE IF NOT EXISTS progress_notes (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      doctor_name TEXT,
      note_date TEXT NOT NULL,
      subjective TEXT,
      objective TEXT,
      assessment TEXT,
      plan TEXT,
      follow_up_plan TEXT,
      notes TEXT,
      prescription_issued INTEGER DEFAULT 0,
      prescription_issued_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // survey_templates 테이블 생성 (설문 프리셋)
  database.run(`
    CREATE TABLE IF NOT EXISTS survey_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      questions TEXT NOT NULL,
      display_mode TEXT DEFAULT 'one_by_one',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // survey_templates에 display_mode 컬럼 추가 (기존 DB 마이그레이션)
  try {
    database.run("ALTER TABLE survey_templates ADD COLUMN display_mode TEXT DEFAULT 'one_by_one'");
  } catch (e) { /* 이미 존재하면 무시 */ }

  // survey_sessions 테이블 생성 (설문 링크/세션)
  database.run(`
    CREATE TABLE IF NOT EXISTS survey_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // survey_responses 테이블 생성 (설문 응답)
  database.run(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES survey_sessions(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
      answers TEXT NOT NULL,
      respondent_name TEXT,
      submitted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 기존 테이블에 respondent_name 컬럼 추가 (마이그레이션)
  try {
    database.run(`ALTER TABLE survey_responses ADD COLUMN respondent_name TEXT`);
  } catch {
    // 이미 컬럼이 존재하면 무시
  }

  // medication_management 테이블 생성 (복약관리)
  database.run(`
    CREATE TABLE IF NOT EXISTS medication_management (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      patient_name TEXT,
      prescription_name TEXT,
      prescription_date TEXT NOT NULL,
      days INTEGER NOT NULL DEFAULT 15,
      delivery_days INTEGER NOT NULL DEFAULT 3,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      happy_call_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      postponed_to TEXT,
      postpone_count INTEGER DEFAULT 0,
      notes TEXT,
      contacted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // prescription_notes 테이블 생성 (처방정의 노트)
  database.run(`
    CREATE TABLE IF NOT EXISTS prescription_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_definition_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (prescription_definition_id) REFERENCES prescription_definitions(id) ON DELETE CASCADE
    )
  `);

  saveDb();
}

// 테이블 생성
function createTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS prescription_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3b82f6',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chart_number TEXT,
      birth_date TEXT,
      gender TEXT CHECK (gender IN ('M', 'F')),
      phone TEXT,
      address TEXT,
      notes TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS herbs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_dosage REAL,
      unit TEXT DEFAULT 'g',
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescription_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      alias TEXT,
      category TEXT,
      source TEXT,
      composition TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      patient_name TEXT,
      prescription_name TEXT,
      chart_number TEXT,
      patient_age INTEGER,
      patient_gender TEXT,
      source_type TEXT,
      source_id TEXT,
      formula TEXT NOT NULL,
      merged_herbs TEXT DEFAULT '[]',
      final_herbs TEXT DEFAULT '[]',
      total_doses REAL DEFAULT 15,
      days INTEGER DEFAULT 15,
      doses_per_day INTEGER DEFAULT 2,
      total_packs INTEGER DEFAULT 30,
      pack_volume INTEGER DEFAULT 100,
      water_amount INTEGER,
      herb_adjustment TEXT,
      total_dosage REAL DEFAULT 0,
      final_total_amount REAL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      issued_at TEXT,
      created_by TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS initial_charts (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      doctor_name TEXT,
      chart_date TEXT NOT NULL,
      chief_complaint TEXT,
      present_illness TEXT,
      past_medical_history TEXT,
      notes TEXT,
      prescription_issued INTEGER DEFAULT 0,
      prescription_issued_at TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_notes (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      doctor_name TEXT,
      note_date TEXT NOT NULL,
      subjective TEXT,
      objective TEXT,
      assessment TEXT,
      plan TEXT,
      follow_up_plan TEXT,
      notes TEXT,
      prescription_issued INTEGER DEFAULT 0,
      prescription_issued_at TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chart_records (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      visit_date TEXT NOT NULL,
      chief_complaint TEXT,
      symptoms TEXT,
      diagnosis TEXT,
      treatment TEXT,
      prescription_id TEXT REFERENCES prescriptions(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clinic_settings (
      id TEXT PRIMARY KEY,
      clinic_name TEXT NOT NULL,
      clinic_address TEXT,
      clinic_phone TEXT,
      doctor_name TEXT,
      license_number TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS survey_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      questions TEXT NOT NULL,
      display_mode TEXT DEFAULT 'one_by_one',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS survey_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES survey_sessions(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
      answers TEXT NOT NULL,
      respondent_name TEXT,
      submitted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medication_management (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      patient_name TEXT,
      prescription_name TEXT,
      prescription_date TEXT NOT NULL,
      days INTEGER NOT NULL DEFAULT 15,
      delivery_days INTEGER NOT NULL DEFAULT 3,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      happy_call_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      postponed_to TEXT,
      postpone_count INTEGER DEFAULT 0,
      notes TEXT,
      contacted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescription_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_definition_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (prescription_definition_id) REFERENCES prescription_definitions(id) ON DELETE CASCADE
    );
  `);

  // 기본 약재 데이터 삽입
  insertSampleData(database);
  saveDb();
}

// 기본 약재 및 처방 템플릿 데이터
function insertSampleData(database: Database) {
  // 약재 목록 (기본)
  const herbs = [
    '감초', '건강', '계지', '길경', '당귀', '대추', '대황', '마황', '목향', '반하',
    '백복령', '백작약', '백출', '복령', '사인', '생강', '시호', '용안육', '원지', '인삼',
    '작약', '진피', '창출', '천궁', '치자', '택사', '황금', '황기', '황련', '황백',
    '산약', '산조인', '숙지황', '목단피', '산수유', '지모', '맥문동', '오미자', '아교',
    '행인', '석고', '지실', '후박', '소엽', '향부자', '목통', '저령', '차전자', '청피'
  ];

  herbs.forEach((name, idx) => {
    try {
      database.run(
        'INSERT OR IGNORE INTO herbs (id, name, default_dosage, unit) VALUES (?, ?, ?, ?)',
        [idx + 1, name, 4, 'g']
      );
    } catch (e) { /* ignore */ }
  });

  // 처방 템플릿 (prescriptionData.ts에서 로드)
  // insertPrescriptionDefinitions 함수 사용
  insertPrescriptionDefinitions(database);

  // 설문지 템플릿 삽입
  insertSurveyTemplates(database);

  // 처방 카테고리 삽입
  insertPrescriptionCategories(database);
}

// 처방 정의 삽입 (별도 함수)
function insertPrescriptionDefinitions(database: Database) {
  PRESCRIPTION_DEFINITIONS.forEach(p => {
    try {
      database.run(
        'INSERT OR IGNORE INTO prescription_definitions (name, alias, category, source, composition) VALUES (?, ?, ?, ?, ?)',
        [p.name, p.alias || null, p.category || null, p.source || null, p.composition]
      );
    } catch (e) { /* ignore */ }
  });
}

// 처방 정의 초기화 (삭제 후 기본 265개 재삽입)
export function resetPrescriptionDefinitions(): number {
  if (!db) return 0;

  // 기존 처방 정의 모두 삭제
  db.run('DELETE FROM prescription_definitions');

  // 기본 처방 정의 삽입
  insertPrescriptionDefinitions(db);

  saveDb();
  return PRESCRIPTION_DEFINITIONS.length;
}

// 설문지 템플릿 삽입 (별도 함수) - 기본 템플릿은 고정 ID 사용
function insertSurveyTemplates(database: Database) {
  const now = new Date().toISOString();
  SURVEY_TEMPLATES.forEach((template, idx) => {
    try {
      // 기본 템플릿은 고정 ID 사용 (백엔드와 동기화)
      const id = idx === 0 ? 'default_female_health' : `template_${idx + 1}_${Date.now()}`;
      database.run(
        'INSERT OR IGNORE INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, template.name, template.description || null, JSON.stringify(template.questions), template.display_mode || 'one_by_one', template.is_active ? 1 : 0, now, now]
      );
    } catch (e) { /* ignore */ }
  });
}

// 처방 카테고리 삽입 (기본 카테고리)
function insertPrescriptionCategories(database: Database) {
  const defaultCategories = [
    { name: "계지제", color: "#ef4444" },
    { name: "마황제", color: "#f97316" },
    { name: "시호제", color: "#eab308" },
    { name: "금련제", color: "#22c55e" },
    { name: "대황제", color: "#14b8a6" },
    { name: "복령제", color: "#3b82f6" },
    { name: "부자제", color: "#8b5cf6" },
    { name: "감초제", color: "#ec4899" },
    { name: "건강제", color: "#f43f5e" },
    { name: "반하제", color: "#06b6d4" },
    { name: "석고제", color: "#64748b" },
    { name: "치자제", color: "#a855f7" },
    { name: "함흉제", color: "#10b981" },
    { name: "귤피제", color: "#f59e0b" },
    { name: "방기제", color: "#6366f1" },
    { name: "해백제", color: "#84cc16" },
    { name: "도인제", color: "#d946ef" },
    { name: "당귀제", color: "#0ea5e9" },
    { name: "다이어트", color: "#f472b6" },
  ];

  defaultCategories.forEach((cat, idx) => {
    try {
      database.run(
        'INSERT OR IGNORE INTO prescription_categories (name, color, sort_order) VALUES (?, ?, ?)',
        [cat.name, cat.color, idx]
      );
    } catch (e) { /* ignore */ }
  });
}

// DB를 localStorage에 저장
export function saveDb() {
  if (!db) return;
  const data = db.export();
  // 대용량 데이터 처리를 위해 청크 단위로 변환
  const CHUNK_SIZE = 0x8000; // 32KB
  let binary = '';
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64 = btoa(binary);
  localStorage.setItem(currentDbKey, base64);
}

// DB 인스턴스 가져오기
export function getDb(): Database | null {
  return db;
}

// UUID 생성
export function generateUUID(): string {
  return crypto.randomUUID();
}

// 쿼리 결과를 객체 배열로 변환
export function queryToObjects<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row as T);
  }
  stmt.free();
  return results;
}

// 단일 객체 쿼리
export function queryOne<T>(db: Database, sql: string, params: unknown[] = []): T | null {
  const results = queryToObjects<T>(db, sql, params);
  return results.length > 0 ? results[0] : null;
}

// DB 리셋 (새 스키마와 샘플 데이터로)
export async function resetDb(userId?: string): Promise<Database> {
  localStorage.removeItem(currentDbKey);
  db = null;
  return initLocalDb(userId);
}

// DB에 처방 템플릿이 있는지 확인하고 없으면 추가
export function ensureSampleData(): void {
  if (!db) return;

  const prescriptionCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescription_definitions');
  if (!prescriptionCount || prescriptionCount.cnt === 0) {
    insertPrescriptionDefinitions(db);
  }

  // 설문지 템플릿도 확인 (기본 템플릿이 없으면 추가, 있으면 업데이트)
  const surveyCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM survey_templates');
  if (!surveyCount || surveyCount.cnt === 0) {
    insertSurveyTemplates(db);
  } else {
    // 기본 템플릿(default_female_health)은 항상 최신 내용으로 유지
    const defaultTemplate = SURVEY_TEMPLATES[0];
    if (defaultTemplate) {
      const now = new Date().toISOString();
      const exists = queryOne<{ cnt: number }>(db!, `SELECT COUNT(*) as cnt FROM survey_templates WHERE id = ?`, ['default_female_health']);

      if (exists && exists.cnt > 0) {
        // 기존 템플릿 업데이트 (내용 고정)
        try {
          db!.run(
            'UPDATE survey_templates SET name = ?, description = ?, questions = ?, display_mode = ?, is_active = ?, updated_at = ? WHERE id = ?',
            [defaultTemplate.name, defaultTemplate.description || null, JSON.stringify(defaultTemplate.questions), defaultTemplate.display_mode || 'single_page', defaultTemplate.is_active ? 1 : 0, now, 'default_female_health']
          );
          console.log('[ensureSampleData] 기본 설문 템플릿 업데이트됨:', defaultTemplate.name);
        } catch (e) {
          console.error('[ensureSampleData] 설문 템플릿 업데이트 실패:', e);
        }
      } else {
        // 새로 삽입
        try {
          db!.run(
            'INSERT INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['default_female_health', defaultTemplate.name, defaultTemplate.description || null, JSON.stringify(defaultTemplate.questions), defaultTemplate.display_mode || 'single_page', defaultTemplate.is_active ? 1 : 0, now, now]
          );
          console.log('[ensureSampleData] 기본 설문 템플릿 추가됨:', defaultTemplate.name);
        } catch (e) {
          console.error('[ensureSampleData] 설문 템플릿 추가 실패:', defaultTemplate.name, e);
        }
      }
    }
  }

  // 처방 카테고리도 확인
  const categoryCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescription_categories');
  if (!categoryCount || categoryCount.cnt === 0) {
    insertPrescriptionCategories(db);
  }

  saveDb();
}

// ===== 휴지통 기능 =====

// 소프트 삭제 (deleted_at 설정)
export function softDelete(table: 'patients' | 'prescriptions' | 'initial_charts' | 'progress_notes', id: string): boolean {
  if (!db) return false;

  const now = new Date().toISOString();

  try {
    db.run(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`, [now, id]);

    // 환자 삭제 시 관련 데이터도 함께 삭제
    if (table === 'patients') {
      db.run(`UPDATE prescriptions SET deleted_at = ? WHERE patient_id = ? AND deleted_at IS NULL`, [now, id]);
      db.run(`UPDATE initial_charts SET deleted_at = ? WHERE patient_id = ? AND deleted_at IS NULL`, [now, id]);
      db.run(`UPDATE progress_notes SET deleted_at = ? WHERE patient_id = ? AND deleted_at IS NULL`, [now, id]);
    }

    saveDb();
    return true;
  } catch (e) {
    console.error(`[softDelete] ${table} 삭제 실패:`, e);
    return false;
  }
}

// 복원 (deleted_at 해제)
export function restoreFromTrash(table: 'patients' | 'prescriptions' | 'initial_charts' | 'progress_notes', id: string): boolean {
  if (!db) return false;

  try {
    db.run(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`, [id]);

    // 환자 복원 시 관련 데이터도 함께 복원
    if (table === 'patients') {
      db.run(`UPDATE prescriptions SET deleted_at = NULL WHERE patient_id = ?`, [id]);
      db.run(`UPDATE initial_charts SET deleted_at = NULL WHERE patient_id = ?`, [id]);
      db.run(`UPDATE progress_notes SET deleted_at = NULL WHERE patient_id = ?`, [id]);
    }

    saveDb();
    return true;
  } catch (e) {
    console.error(`[restoreFromTrash] ${table} 복원 실패:`, e);
    return false;
  }
}

// 영구 삭제
export function permanentDelete(table: 'patients' | 'prescriptions' | 'initial_charts' | 'progress_notes', id: string): boolean {
  if (!db) return false;

  try {
    db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    saveDb();
    return true;
  } catch (e) {
    console.error(`[permanentDelete] ${table} 영구 삭제 실패:`, e);
    return false;
  }
}

// 휴지통 비우기 (모든 삭제된 항목 영구 삭제)
export function emptyTrash(): { patients: number; prescriptions: number; charts: number } {
  if (!db) return { patients: 0, prescriptions: 0, charts: 0 };

  try {
    // 삭제된 항목 수 조회
    const patientsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM patients WHERE deleted_at IS NOT NULL');
    const prescriptionsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescriptions WHERE deleted_at IS NOT NULL');
    const initialChartsCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM initial_charts WHERE deleted_at IS NOT NULL');
    const progressNotesCount = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM progress_notes WHERE deleted_at IS NOT NULL');

    // 영구 삭제
    db.run('DELETE FROM progress_notes WHERE deleted_at IS NOT NULL');
    db.run('DELETE FROM initial_charts WHERE deleted_at IS NOT NULL');
    db.run('DELETE FROM prescriptions WHERE deleted_at IS NOT NULL');
    db.run('DELETE FROM patients WHERE deleted_at IS NOT NULL');

    saveDb();

    return {
      patients: patientsCount?.cnt || 0,
      prescriptions: prescriptionsCount?.cnt || 0,
      charts: (initialChartsCount?.cnt || 0) + (progressNotesCount?.cnt || 0),
    };
  } catch (e) {
    console.error('[emptyTrash] 휴지통 비우기 실패:', e);
    return { patients: 0, prescriptions: 0, charts: 0 };
  }
}

// 휴지통 목록 조회
export function getTrashItems(): TrashItem[] {
  if (!db) return [];

  const items: TrashItem[] = [];

  try {
    // 삭제된 환자
    const patients = queryToObjects<{ id: string; name: string; deleted_at: string; chart_number?: string }>(
      db,
      'SELECT id, name, deleted_at, chart_number FROM patients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    patients.forEach(p => {
      items.push({
        id: p.id,
        type: 'patient',
        name: p.name,
        deleted_at: p.deleted_at,
        extra_info: p.chart_number || undefined,
      });
    });

    // 삭제된 처방전
    const prescriptions = queryToObjects<{ id: string; prescription_name: string; patient_name: string; deleted_at: string }>(
      db,
      'SELECT id, prescription_name, patient_name, deleted_at FROM prescriptions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    prescriptions.forEach(p => {
      items.push({
        id: p.id,
        type: 'prescription',
        name: p.prescription_name || '처방전',
        deleted_at: p.deleted_at,
        extra_info: p.patient_name || undefined,
      });
    });

    // 삭제된 초진차트
    const initialCharts = queryToObjects<{ id: string; chart_date: string; deleted_at: string; patient_id: string }>(
      db,
      'SELECT ic.id, ic.chart_date, ic.deleted_at, ic.patient_id FROM initial_charts ic WHERE ic.deleted_at IS NOT NULL ORDER BY ic.deleted_at DESC'
    );
    for (const c of initialCharts) {
      const patient = queryOne<{ name: string }>(db, 'SELECT name FROM patients WHERE id = ?', [c.patient_id]);
      items.push({
        id: c.id,
        type: 'initial_chart',
        name: `초진차트 (${c.chart_date})`,
        deleted_at: c.deleted_at,
        extra_info: patient?.name || undefined,
      });
    }

    // 삭제된 경과기록
    const progressNotes = queryToObjects<{ id: string; note_date: string; deleted_at: string; patient_id: string }>(
      db,
      'SELECT pn.id, pn.note_date, pn.deleted_at, pn.patient_id FROM progress_notes pn WHERE pn.deleted_at IS NOT NULL ORDER BY pn.deleted_at DESC'
    );
    for (const n of progressNotes) {
      const patient = queryOne<{ name: string }>(db, 'SELECT name FROM patients WHERE id = ?', [n.patient_id]);
      items.push({
        id: n.id,
        type: 'progress_note',
        name: `경과기록 (${n.note_date})`,
        deleted_at: n.deleted_at,
        extra_info: patient?.name || undefined,
      });
    }

    // 삭제 시간 기준 정렬
    items.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    return items;
  } catch (e) {
    console.error('[getTrashItems] 휴지통 조회 실패:', e);
    return [];
  }
}

// 휴지통 항목 수 조회
export function getTrashCount(): { total: number; patients: number; prescriptions: number; charts: number } {
  if (!db) return { total: 0, patients: 0, prescriptions: 0, charts: 0 };

  try {
    const patients = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM patients WHERE deleted_at IS NOT NULL');
    const prescriptions = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescriptions WHERE deleted_at IS NOT NULL');
    const initialCharts = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM initial_charts WHERE deleted_at IS NOT NULL');
    const progressNotes = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM progress_notes WHERE deleted_at IS NOT NULL');

    const patientsCount = patients?.cnt || 0;
    const prescriptionsCount = prescriptions?.cnt || 0;
    const chartsCount = (initialCharts?.cnt || 0) + (progressNotes?.cnt || 0);

    return {
      total: patientsCount + prescriptionsCount + chartsCount,
      patients: patientsCount,
      prescriptions: prescriptionsCount,
      charts: chartsCount,
    };
  } catch (e) {
    console.error('[getTrashCount] 휴지통 개수 조회 실패:', e);
    return { total: 0, patients: 0, prescriptions: 0, charts: 0 };
  }
}
