// @ts-ignore
import initSqlJs, { Database } from 'sql.js';
import { PRESCRIPTION_DEFINITIONS } from './prescriptionData';

let db: Database | null = null;
const DB_KEY = 'gosibang_db';

// SQL.js 초기화 및 DB 로드
export async function initLocalDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });

  // localStorage에서 기존 DB 로드
  const savedDb = localStorage.getItem(DB_KEY);
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

// 기존 DB 마이그레이션 (새 테이블 추가)
function migrateDatabase(database: Database) {
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

  saveDb();
}

// 테이블 생성
function createTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chart_number TEXT,
      birth_date TEXT,
      gender TEXT CHECK (gender IN ('M', 'F')),
      phone TEXT,
      address TEXT,
      notes TEXT,
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
  localStorage.setItem(DB_KEY, base64);
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
export async function resetDb(): Promise<Database> {
  localStorage.removeItem(DB_KEY);
  db = null;
  return initLocalDb();
}

// DB에 처방 템플릿이 있는지 확인하고 없으면 추가
export function ensureSampleData(): void {
  if (!db) return;

  const count = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM prescription_definitions');
  if (!count || count.cnt === 0) {
    insertSampleData(db);
    saveDb();
  }
}
