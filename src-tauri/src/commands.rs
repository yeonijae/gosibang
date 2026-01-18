use crate::auth;
use crate::db;
use crate::encryption;
use crate::models::*;
use crate::models::SurveyQuestion;
use crate::server;
use once_cell::sync::OnceCell;
use std::sync::atomic::{AtomicBool, Ordering};

// HTTP 서버 상태 관리
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static SERVER_PORT: OnceCell<u16> = OnceCell::new();

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

/// 프론트엔드에서 받는 설정 입력 (날짜가 문자열)
#[derive(serde::Deserialize)]
pub struct ClinicSettingsInput {
    pub id: String,
    pub clinic_name: String,
    pub clinic_address: Option<String>,
    pub clinic_phone: Option<String>,
    pub doctor_name: Option<String>,
    pub license_number: Option<String>,
    pub created_at: Option<String>,
    #[allow(dead_code)]
    pub updated_at: Option<String>,
}

#[tauri::command]
pub fn save_clinic_settings(settings: ClinicSettingsInput) -> Result<(), String> {
    use chrono::{DateTime, Utc};

    let now = Utc::now();
    let created_at = settings.created_at
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or(now);

    let clinic_settings = ClinicSettings {
        id: settings.id,
        clinic_name: settings.clinic_name,
        clinic_address: settings.clinic_address,
        clinic_phone: settings.clinic_phone,
        doctor_name: settings.doctor_name,
        license_number: settings.license_number,
        created_at,
        updated_at: now,
    };

    log::info!("Saving clinic settings: {}", clinic_settings.clinic_name);
    db::save_clinic_settings(&clinic_settings).map_err(|e| e.to_string())
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

// ============ 암호화 데이터베이스 초기화 명령어 ============

/// 로그인 후 암호화 데이터베이스 초기화
/// - Supabase에서 암호화 키 조회 또는 생성
/// - 암호화된 사용자별 DB 초기화
#[tauri::command]
pub async fn initialize_with_encryption() -> Result<(), String> {
    // Access token과 user_id 가져오기
    let access_token = auth::get_access_token()
        .ok_or_else(|| "로그인이 필요합니다".to_string())?;
    let user_id = auth::get_user_id()
        .ok_or_else(|| "사용자 ID를 찾을 수 없습니다".to_string())?;

    // Supabase에서 암호화 키 조회 또는 생성
    let (encryption_key, is_new) = encryption::fetch_or_create_key(&access_token, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    // 로컬에 키 캐시 (오프라인 사용 대비)
    encryption::cache_key_locally(&user_id, &encryption_key)
        .map_err(|e| e.to_string())?;

    // 암호화된 DB 초기화
    db::init_database_encrypted(&user_id, &encryption_key)
        .map_err(|e| e.to_string())?;

    if is_new {
        log::info!("새 암호화 키 생성 및 데이터베이스 초기화 완료");
    } else {
        log::info!("기존 암호화 키로 데이터베이스 초기화 완료");
    }

    Ok(())
}

/// 프론트엔드에서 직접 호출: access token과 user_id를 전달받아 암호화 DB 초기화
#[tauri::command]
pub async fn initialize_encrypted_db(access_token: String, user_id: String) -> Result<(), String> {
    // Supabase 초기화 확인
    auth::ensure_supabase_initialized();

    log::info!("Initializing encrypted DB for user: {}", &user_id[..8.min(user_id.len())]);

    // Supabase에서 암호화 키 조회 또는 생성
    let (encryption_key, is_new) = encryption::fetch_or_create_key(&access_token, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    // 로컬에 키 캐시 (오프라인 사용 대비)
    encryption::cache_key_locally(&user_id, &encryption_key)
        .map_err(|e| e.to_string())?;

    // 암호화된 DB 초기화
    db::init_database_encrypted(&user_id, &encryption_key)
        .map_err(|e| e.to_string())?;

    if is_new {
        log::info!("새 암호화 키 생성 및 데이터베이스 초기화 완료 (user: {})", &user_id[..8.min(user_id.len())]);
    } else {
        log::info!("기존 암호화 키로 데이터베이스 초기화 완료 (user: {})", &user_id[..8.min(user_id.len())]);
    }

    Ok(())
}

/// 오프라인 모드로 데이터베이스 초기화 (캐시된 키 사용)
#[tauri::command]
pub fn initialize_offline(user_id: String) -> Result<(), String> {
    // 캐시된 키 조회
    let encryption_key = encryption::get_cached_key(&user_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "캐시된 암호화 키가 없습니다. 온라인 로그인이 필요합니다.".to_string())?;

    // 암호화된 DB 초기화
    db::init_database_encrypted(&user_id, &encryption_key)
        .map_err(|e| e.to_string())?;

    log::info!("오프라인 모드로 데이터베이스 초기화 완료");
    Ok(())
}

// ============ 직원 비밀번호 관리 명령어 ============

#[tauri::command]
pub fn set_staff_password(password: String) -> Result<(), String> {
    db::set_staff_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_staff_password() -> Result<bool, String> {
    db::has_staff_password().map_err(|e| e.to_string())
}

// ============ HTTP 서버 관리 명령어 ============

#[tauri::command]
pub async fn start_http_server(
    port: Option<u16>,
    plan_type: Option<String>,
    survey_external: Option<bool>,
) -> Result<String, String> {
    if SERVER_RUNNING.load(Ordering::SeqCst) {
        return Err("서버가 이미 실행 중입니다".to_string());
    }

    // Supabase 초기화 확인 (동기화를 위해 필요)
    auth::ensure_supabase_initialized();

    let port = port.unwrap_or_else(|| db::get_http_server_port().unwrap_or(3030));
    let _ = SERVER_PORT.set(port);

    // 플랜 정보
    let plan = plan_type.unwrap_or_else(|| "free".to_string());
    let external_enabled = survey_external.unwrap_or(false);
    log::info!("HTTP 서버 플랜: {}, 온라인 설문: {}", plan, external_enabled);

    // 로컬 IP 주소 가져오기
    let local_ip = get_local_ip().unwrap_or_else(|| "localhost".to_string());
    let url = format!("http://{}:{}", local_ip, port);

    // 먼저 바인딩 테스트
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await
        .map_err(|e| format!("포트 {} 바인딩 실패: {}", port, e))?;

    log::info!("HTTP 서버 시작: {}", url);

    // 서버를 별도 태스크로 실행
    tokio::spawn(async move {
        SERVER_RUNNING.store(true, Ordering::SeqCst);
        log::info!("HTTP 서버 태스크 시작됨");

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let state = server::AppState::with_plan(plan.clone(), external_enabled);
            log::info!("AppState 생성 완료 (plan: {}, survey_external: {})", plan, external_enabled);

            let cors = tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any);
            log::info!("CORS 설정 완료");

            let app = server::create_router(state).layer(cors);
            log::info!("Router 생성 완료");
            app
        }));

        match result {
            Ok(app) => {
                log::info!("서버 시작 중... axum::serve 호출");
                if let Err(e) = axum::serve(listener, app).await {
                    log::error!("HTTP 서버 오류: {}", e);
                }
            }
            Err(e) => {
                log::error!("HTTP 서버 초기화 중 패닉 발생: {:?}", e);
            }
        }

        SERVER_RUNNING.store(false, Ordering::SeqCst);
        log::info!("HTTP 서버 태스크 종료됨");
    });

    // 서버가 시작될 때까지 잠시 대기
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    Ok(url)
}

#[tauri::command]
pub fn stop_http_server() -> Result<(), String> {
    // 현재는 서버 중지 기능 미구현 (앱 종료 시 함께 종료됨)
    Ok(())
}

#[tauri::command]
pub fn get_server_status() -> Result<ServerStatus, String> {
    let running = SERVER_RUNNING.load(Ordering::SeqCst);
    let port = SERVER_PORT.get().copied();
    let local_ip = get_local_ip();

    let url = if running {
        port.map(|p| format!("http://{}:{}", local_ip.as_deref().unwrap_or("localhost"), p))
    } else {
        None
    };

    Ok(ServerStatus {
        running,
        port,
        local_ip,
        url,
    })
}

#[derive(serde::Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub local_ip: Option<String>,
    pub url: Option<String>,
}

/// 로컬 IP 주소 가져오기
fn get_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

/// HTTP 서버 자동 시작 설정 조회
#[tauri::command]
pub fn get_server_autostart() -> Result<bool, String> {
    db::get_server_autostart().map_err(|e| e.to_string())
}

/// HTTP 서버 자동 시작 설정 저장
#[tauri::command]
pub fn set_server_autostart(enabled: bool) -> Result<(), String> {
    db::set_server_autostart(enabled).map_err(|e| e.to_string())
}

// ============ 설문 템플릿 관리 명령어 ============

/// 설문 템플릿 입력 구조체
#[derive(serde::Deserialize)]
pub struct SurveyTemplateInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub questions: Vec<SurveyQuestion>,
    pub display_mode: Option<String>,
    pub is_active: Option<bool>,
}

/// 설문 템플릿 목록 조회
#[tauri::command]
pub fn list_survey_templates() -> Result<Vec<db::SurveyTemplateDb>, String> {
    db::list_survey_templates().map_err(|e| e.to_string())
}

/// 설문 템플릿 단일 조회
#[tauri::command]
pub fn get_survey_template(id: String) -> Result<Option<db::SurveyTemplateDb>, String> {
    db::get_survey_template(&id).map_err(|e| e.to_string())
}

/// 설문 템플릿 저장 (생성 또는 수정)
#[tauri::command]
pub fn save_survey_template(template: SurveyTemplateInput) -> Result<String, String> {
    let id = template.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let template_db = db::SurveyTemplateDb {
        id: id.clone(),
        name: template.name,
        description: template.description,
        questions: template.questions,
        display_mode: template.display_mode,
        is_active: template.is_active.unwrap_or(true),
    };

    db::save_survey_template(&template_db).map_err(|e| e.to_string())?;
    log::info!("설문 템플릿 저장됨: {}", id);
    Ok(id)
}

/// 설문 템플릿 삭제
#[tauri::command]
pub fn delete_survey_template(id: String) -> Result<(), String> {
    db::delete_survey_template(&id).map_err(|e| e.to_string())
}

/// 기본 설문 템플릿 복원
#[tauri::command]
pub fn restore_default_survey_templates() -> Result<(), String> {
    db::restore_default_templates().map_err(|e| e.to_string())
}

// ============ QR 코드 생성 명령어 ============

#[tauri::command]
pub fn generate_survey_qr(url: String) -> Result<String, String> {
    use qrcode::QrCode;
    use image::Luma;
    use image::ImageEncoder;
    use base64::Engine;

    let code = QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let qr_image = code.render::<Luma<u8>>().build();

    // PNG로 인코딩
    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    encoder
        .write_image(
            qr_image.as_raw(),
            qr_image.width(),
            qr_image.height(),
            image::ExtendedColorType::L8,
        )
        .map_err(|e| e.to_string())?;

    // Base64 인코딩
    let base64_str = base64::engine::general_purpose::STANDARD.encode(&png_data);

    Ok(format!("data:image/png;base64,{}", base64_str))
}

// ============ 내부 직원 계정 관리 명령어 ============

/// 직원 계정 생성 요청
#[derive(serde::Deserialize)]
pub struct CreateStaffAccountInput {
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub role: String,
}

/// 직원 계정 생성
#[tauri::command]
pub fn create_staff_account(input: CreateStaffAccountInput) -> Result<String, String> {
    use crate::models::{StaffAccount, StaffRole};

    // 비밀번호 해시
    let password_hash = db::hash_staff_password(&input.password)
        .map_err(|e| e.to_string())?;

    // 역할 파싱
    let role = StaffRole::from_str(&input.role);

    // 계정 생성
    let account = StaffAccount::new(
        input.username,
        input.display_name,
        password_hash,
        role,
    );

    let id = account.id.clone();
    db::create_staff_account(&account).map_err(|e| e.to_string())?;

    Ok(id)
}

/// 직원 계정 목록 조회
#[tauri::command]
pub fn list_staff_accounts() -> Result<Vec<crate::models::StaffAccountInfo>, String> {
    db::list_staff_accounts().map_err(|e| e.to_string())
}

/// 직원 계정 조회
#[tauri::command]
pub fn get_staff_account(id: String) -> Result<Option<crate::models::StaffAccountInfo>, String> {
    db::get_staff_account(&id)
        .map(|opt| opt.map(|a| a.into()))
        .map_err(|e| e.to_string())
}

/// 직원 계정 수정 요청
#[derive(serde::Deserialize)]
pub struct UpdateStaffAccountInput {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub password: Option<String>,  // 비어있으면 변경 안함
    pub role: String,
    pub permissions: crate::models::StaffPermissions,
    pub is_active: bool,
}

/// 직원 계정 수정
#[tauri::command]
pub fn update_staff_account(input: UpdateStaffAccountInput) -> Result<(), String> {
    use crate::models::StaffRole;

    // 기존 계정 조회
    let existing = db::get_staff_account(&input.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "계정을 찾을 수 없습니다".to_string())?;

    // 비밀번호 해시 (변경된 경우에만)
    let password_hash = match &input.password {
        Some(pw) if !pw.is_empty() => {
            db::hash_staff_password(pw).map_err(|e| e.to_string())?
        }
        _ => existing.password_hash.clone(),
    };

    let account = crate::models::StaffAccount {
        id: input.id,
        username: input.username,
        display_name: input.display_name,
        password_hash,
        role: StaffRole::from_str(&input.role),
        permissions: input.permissions,
        is_active: input.is_active,
        last_login_at: existing.last_login_at,
        created_at: existing.created_at,
        updated_at: chrono::Utc::now(),
    };

    db::update_staff_account(&account).map_err(|e| e.to_string())
}

/// 직원 계정 삭제
#[tauri::command]
pub fn delete_staff_account(id: String) -> Result<(), String> {
    db::delete_staff_account(&id).map_err(|e| e.to_string())
}

