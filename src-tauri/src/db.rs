use crate::error::{AppError, AppResult};
use crate::models::*;
use chrono::Utc;
use once_cell::sync::OnceCell;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

static DB_CONNECTION: OnceCell<Mutex<Connection>> = OnceCell::new();

/// 데이터베이스 경로 가져오기
fn get_db_path() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Custom("Cannot find data directory".to_string()))?;
    let app_dir = data_dir.join("gosibang");
    std::fs::create_dir_all(&app_dir)?;
    Ok(app_dir.join("clinic.db"))
}

/// 데이터베이스 초기화 (암호화 키 설정)
pub fn init_database(_encryption_key: &str) -> AppResult<()> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path)?;

    // TODO: 배포 시 SQLCipher 활성화 후 아래 주석 해제
    // conn.execute_batch(&format!("PRAGMA key = '{}';", encryption_key))?;

    // 테이블 생성
    create_tables(&conn)?;

    DB_CONNECTION
        .set(Mutex::new(conn))
        .map_err(|_| AppError::Custom("Database already initialized".to_string()))?;

    log::info!("Database initialized at {:?}", db_path);
    Ok(())
}

/// 테이블 생성
fn create_tables(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        -- 한의원 설정
        CREATE TABLE IF NOT EXISTS clinic_settings (
            id TEXT PRIMARY KEY,
            clinic_name TEXT NOT NULL,
            clinic_address TEXT,
            clinic_phone TEXT,
            doctor_name TEXT,
            license_number TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 환자 정보
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            birth_date TEXT,
            gender TEXT,
            phone TEXT,
            address TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 처방
        CREATE TABLE IF NOT EXISTS prescriptions (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            prescription_name TEXT NOT NULL,
            herbs TEXT NOT NULL,
            dosage_instructions TEXT,
            total_days INTEGER NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );

        -- 차팅 기록
        CREATE TABLE IF NOT EXISTS chart_records (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            visit_date TEXT NOT NULL,
            chief_complaint TEXT,
            symptoms TEXT,
            diagnosis TEXT,
            treatment TEXT,
            prescription_id TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        );

        -- 설문지 템플릿
        CREATE TABLE IF NOT EXISTS survey_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            questions TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 설문 응답
        CREATE TABLE IF NOT EXISTS survey_responses (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            answers TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (template_id) REFERENCES survey_templates(id)
        );

        -- 복약 일정
        CREATE TABLE IF NOT EXISTS medication_schedules (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            prescription_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            times_per_day INTEGER NOT NULL,
            medication_times TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        );

        -- 복약 기록
        CREATE TABLE IF NOT EXISTS medication_logs (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL,
            taken_at TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY (schedule_id) REFERENCES medication_schedules(id)
        );

        -- 인덱스 생성
        CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
        CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
        CREATE INDEX IF NOT EXISTS idx_chart_records_patient ON chart_records(patient_id);
        CREATE INDEX IF NOT EXISTS idx_chart_records_date ON chart_records(visit_date);
        "#,
    )?;
    Ok(())
}

/// DB 연결 가져오기
fn get_conn() -> AppResult<std::sync::MutexGuard<'static, Connection>> {
    DB_CONNECTION
        .get()
        .ok_or_else(|| AppError::Custom("Database not initialized".to_string()))?
        .lock()
        .map_err(|_| AppError::Custom("Database lock error".to_string()))
}

// ============ 한의원 설정 ============

pub fn save_clinic_settings(settings: &ClinicSettings) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        r#"INSERT OR REPLACE INTO clinic_settings
           (id, clinic_name, clinic_address, clinic_phone, doctor_name, license_number, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
        params![
            settings.id,
            settings.clinic_name,
            settings.clinic_address,
            settings.clinic_phone,
            settings.doctor_name,
            settings.license_number,
            settings.created_at.to_rfc3339(),
            Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_clinic_settings() -> AppResult<Option<ClinicSettings>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, clinic_name, clinic_address, clinic_phone, doctor_name, license_number, created_at, updated_at
         FROM clinic_settings LIMIT 1",
    )?;

    let result = stmt.query_row([], |row| {
        Ok(ClinicSettings {
            id: row.get(0)?,
            clinic_name: row.get(1)?,
            clinic_address: row.get(2)?,
            clinic_phone: row.get(3)?,
            doctor_name: row.get(4)?,
            license_number: row.get(5)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    });

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

// ============ 환자 관리 ============

pub fn create_patient(patient: &Patient) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        r#"INSERT INTO patients (id, name, birth_date, gender, phone, address, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            patient.id,
            patient.name,
            patient.birth_date,
            patient.gender,
            patient.phone,
            patient.address,
            patient.notes,
            patient.created_at.to_rfc3339(),
            patient.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_patient(id: &str) -> AppResult<Option<Patient>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, birth_date, gender, phone, address, notes, created_at, updated_at
         FROM patients WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(Patient {
            id: row.get(0)?,
            name: row.get(1)?,
            birth_date: row.get(2)?,
            gender: row.get(3)?,
            phone: row.get(4)?,
            address: row.get(5)?,
            notes: row.get(6)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    });

    match result {
        Ok(patient) => Ok(Some(patient)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn list_patients(search: Option<&str>) -> AppResult<Vec<Patient>> {
    let conn = get_conn()?;
    let query = match search {
        Some(_) => {
            "SELECT id, name, birth_date, gender, phone, address, notes, created_at, updated_at
             FROM patients WHERE name LIKE ?1 ORDER BY name"
        }
        None => {
            "SELECT id, name, birth_date, gender, phone, address, notes, created_at, updated_at
             FROM patients ORDER BY name"
        }
    };

    let mut stmt = conn.prepare(query)?;
    let rows = if let Some(s) = search {
        stmt.query_map([format!("%{}%", s)], map_patient_row)?
    } else {
        stmt.query_map([], map_patient_row)?
    };

    let mut patients = Vec::new();
    for row in rows {
        patients.push(row?);
    }
    Ok(patients)
}

fn map_patient_row(row: &rusqlite::Row) -> rusqlite::Result<Patient> {
    Ok(Patient {
        id: row.get(0)?,
        name: row.get(1)?,
        birth_date: row.get(2)?,
        gender: row.get(3)?,
        phone: row.get(4)?,
        address: row.get(5)?,
        notes: row.get(6)?,
        created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
            .unwrap()
            .with_timezone(&Utc),
        updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
            .unwrap()
            .with_timezone(&Utc),
    })
}

pub fn update_patient(patient: &Patient) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        r#"UPDATE patients SET name = ?2, birth_date = ?3, gender = ?4, phone = ?5,
           address = ?6, notes = ?7, updated_at = ?8 WHERE id = ?1"#,
        params![
            patient.id,
            patient.name,
            patient.birth_date,
            patient.gender,
            patient.phone,
            patient.address,
            patient.notes,
            Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn delete_patient(id: &str) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM patients WHERE id = ?1", [id])?;
    Ok(())
}

// ============ 처방 관리 ============

pub fn create_prescription(prescription: &Prescription) -> AppResult<()> {
    let conn = get_conn()?;
    let herbs_json = serde_json::to_string(&prescription.herbs)?;
    conn.execute(
        r#"INSERT INTO prescriptions (id, patient_id, prescription_name, herbs, dosage_instructions, total_days, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            prescription.id,
            prescription.patient_id,
            prescription.prescription_name,
            herbs_json,
            prescription.dosage_instructions,
            prescription.total_days,
            prescription.notes,
            prescription.created_at.to_rfc3339(),
            prescription.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_prescriptions_by_patient(patient_id: &str) -> AppResult<Vec<Prescription>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, prescription_name, herbs, dosage_instructions, total_days, notes, created_at, updated_at
         FROM prescriptions WHERE patient_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        let herbs_json: String = row.get(3)?;
        let herbs: Vec<HerbItem> = serde_json::from_str(&herbs_json).unwrap_or_default();
        Ok(Prescription {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            prescription_name: row.get(2)?,
            herbs,
            dosage_instructions: row.get(4)?,
            total_days: row.get(5)?,
            notes: row.get(6)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut prescriptions = Vec::new();
    for row in rows {
        prescriptions.push(row?);
    }
    Ok(prescriptions)
}

// ============ 차팅 관리 ============

pub fn create_chart_record(record: &ChartRecord) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        r#"INSERT INTO chart_records (id, patient_id, visit_date, chief_complaint, symptoms, diagnosis, treatment, prescription_id, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#,
        params![
            record.id,
            record.patient_id,
            record.visit_date.to_rfc3339(),
            record.chief_complaint,
            record.symptoms,
            record.diagnosis,
            record.treatment,
            record.prescription_id,
            record.notes,
            record.created_at.to_rfc3339(),
            record.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_chart_records_by_patient(patient_id: &str) -> AppResult<Vec<ChartRecord>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, visit_date, chief_complaint, symptoms, diagnosis, treatment, prescription_id, notes, created_at, updated_at
         FROM chart_records WHERE patient_id = ?1 ORDER BY visit_date DESC",
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        Ok(ChartRecord {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            visit_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                .unwrap()
                .with_timezone(&Utc),
            chief_complaint: row.get(3)?,
            symptoms: row.get(4)?,
            diagnosis: row.get(5)?,
            treatment: row.get(6)?,
            prescription_id: row.get(7)?,
            notes: row.get(8)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

// ============ 데이터 내보내기 ============

pub fn export_patient_data(patient_id: &str) -> AppResult<String> {
    let patient = get_patient(patient_id)?
        .ok_or_else(|| AppError::Custom("Patient not found".to_string()))?;
    let prescriptions = get_prescriptions_by_patient(patient_id)?;
    let chart_records = get_chart_records_by_patient(patient_id)?;

    let export_data = serde_json::json!({
        "patient": patient,
        "prescriptions": prescriptions,
        "chart_records": chart_records,
        "exported_at": Utc::now().to_rfc3339(),
    });

    Ok(serde_json::to_string_pretty(&export_data)?)
}

pub fn export_all_data() -> AppResult<String> {
    let patients = list_patients(None)?;
    let settings = get_clinic_settings()?;

    let mut all_data = Vec::new();
    for patient in &patients {
        let prescriptions = get_prescriptions_by_patient(&patient.id)?;
        let chart_records = get_chart_records_by_patient(&patient.id)?;
        all_data.push(serde_json::json!({
            "patient": patient,
            "prescriptions": prescriptions,
            "chart_records": chart_records,
        }));
    }

    let export_data = serde_json::json!({
        "clinic_settings": settings,
        "patients_data": all_data,
        "exported_at": Utc::now().to_rfc3339(),
    });

    Ok(serde_json::to_string_pretty(&export_data)?)
}
