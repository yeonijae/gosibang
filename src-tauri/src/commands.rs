use crate::auth;
use crate::db;
use crate::error::AppResult;
use crate::models::*;

// ============ 인증 명령어 ============

#[tauri::command]
pub async fn login(email: String, password: String) -> Result<AuthState, String> {
    auth::login(&email, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn logout() -> Result<(), String> {
    auth::logout().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_auth_state() -> Result<AuthState, String> {
    auth::get_current_auth_state().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn signup(email: String, password: String) -> Result<String, String> {
    auth::signup(&email, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_auth() -> Result<bool, String> {
    auth::verify_auth_status()
        .await
        .map_err(|e| e.to_string())
}

// ============ 한의원 설정 명령어 ============

#[tauri::command]
pub fn save_clinic_settings(settings: ClinicSettings) -> Result<(), String> {
    db::save_clinic_settings(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_clinic_settings() -> Result<Option<ClinicSettings>, String> {
    db::get_clinic_settings().map_err(|e| e.to_string())
}

// ============ 환자 관리 명령어 ============

#[tauri::command]
pub fn create_patient(patient: Patient) -> Result<(), String> {
    db::create_patient(&patient).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_patient(id: String) -> Result<Option<Patient>, String> {
    db::get_patient(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_patients(search: Option<String>) -> Result<Vec<Patient>, String> {
    db::list_patients(search.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_patient(patient: Patient) -> Result<(), String> {
    db::update_patient(&patient).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_patient(id: String) -> Result<(), String> {
    db::delete_patient(&id).map_err(|e| e.to_string())
}

// ============ 처방 관리 명령어 ============

#[tauri::command]
pub fn create_prescription(prescription: Prescription) -> Result<(), String> {
    db::create_prescription(&prescription).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_prescriptions_by_patient(patient_id: String) -> Result<Vec<Prescription>, String> {
    db::get_prescriptions_by_patient(&patient_id).map_err(|e| e.to_string())
}

// ============ 차팅 관리 명령어 ============

#[tauri::command]
pub fn create_chart_record(record: ChartRecord) -> Result<(), String> {
    db::create_chart_record(&record).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chart_records_by_patient(patient_id: String) -> Result<Vec<ChartRecord>, String> {
    db::get_chart_records_by_patient(&patient_id).map_err(|e| e.to_string())
}

// ============ 데이터 내보내기 명령어 ============

#[tauri::command]
pub fn export_patient_data(patient_id: String) -> Result<String, String> {
    db::export_patient_data(&patient_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_all_data() -> Result<String, String> {
    db::export_all_data().map_err(|e| e.to_string())
}

// ============ 초기화 명령어 ============

#[tauri::command]
pub fn initialize_app(
    supabase_url: String,
    supabase_key: String,
    db_encryption_key: String,
) -> Result<(), String> {
    // Supabase 초기화
    auth::init_supabase(&supabase_url, &supabase_key);

    // DB 초기화
    db::init_database(&db_encryption_key).map_err(|e| e.to_string())?;

    log::info!("App initialized successfully");
    Ok(())
}
