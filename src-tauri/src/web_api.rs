//! 웹 클라이언트용 REST API
//!
//! Tauri 커맨드들을 HTTP API로 노출하여 웹 브라우저에서도 접근 가능하게 합니다.

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::db;
use crate::models::*;

/// 웹 API 상태 (세션 관리)
#[derive(Clone)]
pub struct WebApiState {
    /// 활성 세션들 (token -> WebSession)
    pub sessions: Arc<Mutex<HashMap<String, WebSession>>>,
}

#[derive(Clone, Debug)]
pub struct WebSession {
    pub token: String,
    pub account_id: String,
    pub username: String,
    pub display_name: String,
    pub role: StaffRole,
    pub permissions: StaffPermissions,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl WebApiState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 세션 검증
    pub fn verify_session(&self, token: &str) -> Option<WebSession> {
        let sessions = self.sessions.lock().ok()?;
        let session = sessions.get(token)?;

        // 24시간 유효
        if chrono::Utc::now().signed_duration_since(session.created_at).num_hours() > 24 {
            return None;
        }

        Some(session.clone())
    }

    /// 세션 생성 (내부 계정 기반)
    pub fn create_session(&self, account: &StaffAccount) -> String {
        let token = generate_token();
        let session = WebSession {
            token: token.clone(),
            account_id: account.id.clone(),
            username: account.username.clone(),
            display_name: account.display_name.clone(),
            role: account.role.clone(),
            permissions: account.permissions.clone(),
            created_at: chrono::Utc::now(),
        };

        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(token.clone(), session);
        }

        token
    }

    /// 세션 삭제
    pub fn remove_session(&self, token: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.remove(token);
        }
    }
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..64)
        .map(|_| {
            let idx = rng.gen_range(0..36);
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect()
}

/// API 응답 래퍼
#[derive(Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn err(error: impl ToString) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error.to_string()),
        }
    }
}

/// 쿼리 파라미터에서 토큰 추출
#[derive(Deserialize, Default)]
pub struct AuthQuery {
    pub token: Option<String>,
}

/// Authorization 헤더에서 Bearer 토큰 추출
fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            if value.starts_with("Bearer ") {
                Some(value[7..].to_string())
            } else {
                None
            }
        })
}

/// 세션 검증 헬퍼 매크로 (헤더 또는 쿼리에서 토큰 추출)
macro_rules! require_auth {
    ($state:expr, $headers:expr, $query:expr) => {{
        // 헤더에서 먼저 토큰 추출 시도, 없으면 쿼리 파라미터에서 추출
        let token = extract_bearer_token(&$headers).or_else(|| $query.token.clone());
        match token.as_ref().and_then(|t| $state.verify_session(t)) {
            Some(session) => session,
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(ApiResponse::<()>::err("인증이 필요합니다")),
                )
                    .into_response()
            }
        }
    }};
}

/// 웹 API 라우터 생성
pub fn create_web_api_router(state: WebApiState) -> Router {
    Router::new()
        // 인증
        .route("/auth/login", post(web_login))
        .route("/auth/logout", post(web_logout))
        .route("/auth/verify", get(web_verify))
        // 환자 관리
        .route("/patients", get(list_patients_api).post(create_patient_api))
        .route(
            "/patients/{id}",
            get(get_patient_api)
                .put(update_patient_api)
                .delete(delete_patient_api),
        )
        // 처방 관리
        .route("/prescriptions", post(create_prescription_api))
        .route("/prescriptions/patient/{patient_id}", get(get_prescriptions_api))
        // 차트 관리
        .route("/charts", post(create_chart_api))
        .route("/charts/patient/{patient_id}", get(get_charts_api))
        // 초진차트 관리
        .route("/initial-charts", get(list_initial_charts_api).post(create_initial_chart_api))
        .route("/initial-charts/{id}", get(get_initial_chart_api).put(update_initial_chart_api).delete(delete_initial_chart_api))
        .route("/initial-charts/patient/{patient_id}", get(get_initial_charts_by_patient_api))
        // 경과기록 관리
        .route("/progress-notes", post(create_progress_note_api))
        .route("/progress-notes/{id}", get(get_progress_note_api).put(update_progress_note_api).delete(delete_progress_note_api))
        .route("/progress-notes/patient/{patient_id}", get(get_progress_notes_by_patient_api))
        // 설정
        .route("/settings", get(get_settings_api).post(save_settings_api))
        // 설문 템플릿
        .route(
            "/survey-templates",
            get(list_survey_templates_api).post(save_survey_template_api),
        )
        .route(
            "/survey-templates/{id}",
            get(get_survey_template_api).delete(delete_survey_template_api),
        )
        // 설문 응답
        .route("/survey-responses", get(list_survey_responses_api))
        .route("/survey-responses/{id}", delete(delete_survey_response_api))
        .route("/survey-responses/{id}/link", post(link_survey_response_api))
        // 내보내기
        .route("/export/patient/{id}", get(export_patient_api))
        .route("/export/all", get(export_all_api))
        // 복약 관리
        .route("/medications/schedules", get(list_medication_schedules_api).post(create_medication_schedule_api))
        .route("/medications/schedules/{id}", get(get_medication_schedule_api).put(update_medication_schedule_api).delete(delete_medication_schedule_api))
        .route("/medications/schedules/patient/{patient_id}", get(get_medication_schedules_by_patient_api))
        .route("/medications/logs", get(list_medication_logs_api).post(create_medication_log_api))
        .route("/medications/logs/{id}", get(get_medication_log_api).put(update_medication_log_api))
        .route("/medications/logs/schedule/{schedule_id}", get(get_medication_logs_by_schedule_api))
        .route("/medications/stats/patient/{patient_id}", get(get_medication_stats_by_patient_api))
        // 알림 관리
        .route("/notifications", get(list_notifications_api))
        .route("/notifications/unread", get(list_unread_notifications_api))
        .route("/notifications/unread/count", get(get_unread_notification_count_api))
        .route("/notifications/{id}/read", post(mark_notification_read_api))
        .route("/notifications/{id}/dismiss", post(dismiss_notification_api))
        .route("/notifications/read-all", post(mark_all_notifications_read_api))
        .route("/notifications/settings", get(get_notification_settings_api).put(update_notification_settings_api))
        .with_state(state)
}

// ============ 인증 API ============

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
    user: LoginUser,
}

#[derive(Serialize)]
struct LoginUser {
    id: String,
    username: String,
    display_name: String,
    role: String,
    permissions: StaffPermissions,
}

async fn web_login(
    State(state): State<WebApiState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    // 내부 계정 인증
    let account = match db::verify_staff_account_password(&payload.username, &payload.password) {
        Ok(Some(acc)) => acc,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<LoginResponse>::err("아이디 또는 비밀번호가 일치하지 않습니다")),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<LoginResponse>::err(e.to_string())),
            )
                .into_response()
        }
    };

    // 비활성 계정 체크
    if !account.is_active {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::<LoginResponse>::err("비활성화된 계정입니다")),
        )
            .into_response();
    }

    // 세션 생성
    let token = state.create_session(&account);
    log::info!("웹 클라이언트 로그인: {} ({})", account.username, account.role.as_str());

    (
        StatusCode::OK,
        Json(ApiResponse::ok(LoginResponse {
            token,
            user: LoginUser {
                id: account.id,
                username: account.username,
                display_name: account.display_name,
                role: account.role.as_str().to_string(),
                permissions: account.permissions,
            },
        })),
    )
        .into_response()
}

async fn web_logout(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let token = extract_bearer_token(&headers).or(query.token);
    if let Some(token) = token {
        state.remove_session(&token);
    }
    Json(ApiResponse::ok(()))
}

async fn web_verify(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let token = extract_bearer_token(&headers).or(query.token);
    match token.as_ref().and_then(|t| state.verify_session(t)) {
        Some(session) => Json(ApiResponse::ok(serde_json::json!({
            "valid": true,
            "user": {
                "id": session.account_id,
                "username": session.username,
                "display_name": session.display_name,
                "role": session.role.as_str(),
                "permissions": session.permissions
            }
        }))),
        None => Json(ApiResponse::ok(serde_json::json!({ "valid": false }))),
    }
}

// ============ 환자 관리 API ============

#[derive(Deserialize, Default)]
struct ListPatientsQuery {
    token: Option<String>,
    search: Option<String>,
}

async fn list_patients_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<ListPatientsQuery>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: query.token };
    require_auth!(state, headers, auth_query);

    log::info!("[웹 API] list_patients 호출, search: {:?}", query.search);

    match db::list_patients(query.search.as_deref()) {
        Ok(patients) => {
            log::info!("[웹 API] list_patients 결과: {}명", patients.len());
            Json(ApiResponse::ok(patients)).into_response()
        }
        Err(e) => {
            log::error!("[웹 API] list_patients 에러: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Vec<Patient>>::err(e.to_string())),
            )
                .into_response()
        }
    }
}

async fn get_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_patient(&id) {
        Ok(patient) => Json(ApiResponse::ok(patient)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<Patient>>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct CreatePatientRequest {
    #[serde(flatten)]
    patient: Patient,
    token: Option<String>,
}

async fn create_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreatePatientRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::create_patient(&payload.patient) {
        Ok(()) => Json(ApiResponse::ok(payload.patient.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct UpdatePatientRequest {
    #[serde(flatten)]
    patient: Patient,
    token: Option<String>,
}

async fn update_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
    Json(payload): Json<UpdatePatientRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::update_patient(&payload.patient) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn delete_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::delete_patient(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 처방 관리 API ============

#[derive(Deserialize)]
struct CreatePrescriptionRequest {
    #[serde(flatten)]
    prescription: Prescription,
    token: Option<String>,
}

async fn create_prescription_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreatePrescriptionRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::create_prescription(&payload.prescription) {
        Ok(()) => Json(ApiResponse::ok(payload.prescription.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_prescriptions_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_prescriptions_by_patient(&patient_id) {
        Ok(prescriptions) => Json(ApiResponse::ok(prescriptions)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<Prescription>>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 차트 관리 API ============

#[derive(Deserialize)]
struct CreateChartRequest {
    #[serde(flatten)]
    record: ChartRecord,
    token: Option<String>,
}

async fn create_chart_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreateChartRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::create_chart_record(&payload.record) {
        Ok(()) => Json(ApiResponse::ok(payload.record.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_charts_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_chart_records_by_patient(&patient_id) {
        Ok(charts) => Json(ApiResponse::ok(charts)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<ChartRecord>>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 초진차트 API ============

use crate::models::{InitialChart, ProgressNote, MedicationSchedule, MedicationLog, MedicationStats, Notification, NotificationSettings};

async fn list_initial_charts_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::list_initial_charts() {
        Ok(charts) => Json(ApiResponse::ok(charts)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<db::InitialChartWithPatient>>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_initial_chart_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_initial_chart(&id) {
        Ok(chart) => Json(ApiResponse::ok(chart)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<InitialChart>>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_initial_charts_by_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_initial_charts_by_patient(&patient_id) {
        Ok(charts) => Json(ApiResponse::ok(charts)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<InitialChart>>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct CreateInitialChartRequest {
    #[serde(flatten)]
    chart: InitialChart,
    token: Option<String>,
}

async fn create_initial_chart_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreateInitialChartRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::create_initial_chart(&payload.chart) {
        Ok(()) => Json(ApiResponse::ok(payload.chart.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateInitialChartRequest {
    #[serde(flatten)]
    chart: InitialChart,
    token: Option<String>,
}

async fn update_initial_chart_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
    Json(payload): Json<UpdateInitialChartRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::update_initial_chart(&payload.chart) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn delete_initial_chart_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::delete_initial_chart(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 경과기록 API ============

async fn get_progress_note_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_progress_note(&id) {
        Ok(note) => Json(ApiResponse::ok(note)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<ProgressNote>>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_progress_notes_by_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_progress_notes_by_patient(&patient_id) {
        Ok(notes) => Json(ApiResponse::ok(notes)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<ProgressNote>>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct CreateProgressNoteRequest {
    #[serde(flatten)]
    note: ProgressNote,
    token: Option<String>,
}

async fn create_progress_note_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreateProgressNoteRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::create_progress_note(&payload.note) {
        Ok(()) => Json(ApiResponse::ok(payload.note.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateProgressNoteRequest {
    #[serde(flatten)]
    note: ProgressNote,
    token: Option<String>,
}

async fn update_progress_note_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
    Json(payload): Json<UpdateProgressNoteRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::update_progress_note(&payload.note) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn delete_progress_note_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::delete_progress_note(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 설정 API ============

async fn get_settings_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_clinic_settings() {
        Ok(settings) => Json(ApiResponse::ok(settings)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<ClinicSettings>>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SaveSettingsRequest {
    #[serde(flatten)]
    settings: ClinicSettingsInput,
    token: Option<String>,
}

#[derive(Deserialize)]
struct ClinicSettingsInput {
    id: String,
    clinic_name: String,
    clinic_address: Option<String>,
    clinic_phone: Option<String>,
    doctor_name: Option<String>,
    license_number: Option<String>,
    created_at: Option<String>,
}

async fn save_settings_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<SaveSettingsRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    use chrono::{DateTime, Utc};

    let now = Utc::now();
    let created_at = payload
        .settings
        .created_at
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or(now);

    let clinic_settings = ClinicSettings {
        id: payload.settings.id,
        clinic_name: payload.settings.clinic_name,
        clinic_address: payload.settings.clinic_address,
        clinic_phone: payload.settings.clinic_phone,
        doctor_name: payload.settings.doctor_name,
        license_number: payload.settings.license_number,
        created_at,
        updated_at: now,
    };

    match db::save_clinic_settings(&clinic_settings) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 설문 템플릿 API ============

async fn list_survey_templates_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::list_survey_templates() {
        Ok(templates) => Json(ApiResponse::ok(templates)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<db::SurveyTemplateDb>>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_survey_template_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_survey_template(&id) {
        Ok(template) => Json(ApiResponse::ok(template)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<db::SurveyTemplateDb>>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SaveSurveyTemplateRequest {
    id: Option<String>,
    name: String,
    description: Option<String>,
    questions: Vec<SurveyQuestion>,
    display_mode: Option<String>,
    is_active: Option<bool>,
    token: Option<String>,
}

async fn save_survey_template_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<SaveSurveyTemplateRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let template = db::SurveyTemplateDb {
        id: id.clone(),
        name: payload.name,
        description: payload.description,
        questions: payload.questions,
        display_mode: payload.display_mode,
        is_active: payload.is_active.unwrap_or(true),
    };

    match db::save_survey_template(&template) {
        Ok(()) => Json(ApiResponse::ok(id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn delete_survey_template_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::delete_survey_template(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 설문 응답 API ============

#[derive(Deserialize, Default)]
struct ListResponsesQuery {
    token: Option<String>,
    limit: Option<i32>,
}

async fn list_survey_responses_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<ListResponsesQuery>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: query.token };
    require_auth!(state, headers, auth_query);

    match db::list_survey_responses(query.limit) {
        Ok(responses) => Json(ApiResponse::ok(responses)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<db::SurveyResponseWithTemplate>>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn delete_survey_response_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::delete_survey_response(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct LinkSurveyResponseRequest {
    patient_id: String,
    token: Option<String>,
}

async fn link_survey_response_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<LinkSurveyResponseRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::link_survey_response_to_patient(&id, &payload.patient_id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 내보내기 API ============

async fn export_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::export_patient_data(&id) {
        Ok(data) => Json(ApiResponse::ok(data)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn export_all_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::export_all_data() {
        Ok(data) => Json(ApiResponse::ok(data)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 복약 일정 API ============

async fn list_medication_schedules_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::list_medication_schedules() {
        Ok(schedules) => Json(ApiResponse::ok(schedules)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<MedicationSchedule>>::err(e.to_string())),
        ).into_response(),
    }
}

async fn get_medication_schedule_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::get_medication_schedule(&id) {
        Ok(schedule) => Json(ApiResponse::ok(schedule)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<MedicationSchedule>>::err(e.to_string())),
        ).into_response(),
    }
}

async fn get_medication_schedules_by_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::get_medication_schedules_by_patient(&patient_id) {
        Ok(schedules) => Json(ApiResponse::ok(schedules)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<MedicationSchedule>>::err(e.to_string())),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct CreateMedicationScheduleRequest {
    #[serde(flatten)]
    schedule: MedicationSchedule,
    token: Option<String>,
}

async fn create_medication_schedule_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreateMedicationScheduleRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    let session = require_auth!(state, headers, auth_query);

    if !session.permissions.medications_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 쓰기 권한이 없습니다")),
        ).into_response();
    }

    match db::create_medication_schedule(&payload.schedule) {
        Ok(()) => Json(ApiResponse::ok(payload.schedule.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateMedicationScheduleRequest {
    #[serde(flatten)]
    schedule: MedicationSchedule,
    token: Option<String>,
}

async fn update_medication_schedule_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateMedicationScheduleRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    let session = require_auth!(state, headers, auth_query);

    if !session.permissions.medications_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 쓰기 권한이 없습니다")),
        ).into_response();
    }

    match db::update_medication_schedule(&id, &payload.schedule) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}

async fn delete_medication_schedule_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 쓰기 권한이 없습니다")),
        ).into_response();
    }

    match db::delete_medication_schedule(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}

// ============ 복약 기록 API ============

async fn list_medication_logs_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::list_medication_logs() {
        Ok(logs) => Json(ApiResponse::ok(logs)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<MedicationLog>>::err(e.to_string())),
        ).into_response(),
    }
}

async fn get_medication_log_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::get_medication_log(&id) {
        Ok(log) => Json(ApiResponse::ok(log)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<MedicationLog>>::err(e.to_string())),
        ).into_response(),
    }
}

async fn get_medication_logs_by_schedule_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(schedule_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::get_medication_logs_by_schedule(&schedule_id) {
        Ok(logs) => Json(ApiResponse::ok(logs)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<MedicationLog>>::err(e.to_string())),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct CreateMedicationLogRequest {
    #[serde(flatten)]
    log: MedicationLog,
    token: Option<String>,
}

async fn create_medication_log_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreateMedicationLogRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    let session = require_auth!(state, headers, auth_query);

    if !session.permissions.medications_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 쓰기 권한이 없습니다")),
        ).into_response();
    }

    match db::create_medication_log(&payload.log) {
        Ok(()) => Json(ApiResponse::ok(payload.log.id)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateMedicationLogRequest {
    #[serde(flatten)]
    log: MedicationLog,
    token: Option<String>,
}

async fn update_medication_log_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateMedicationLogRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    let session = require_auth!(state, headers, auth_query);

    if !session.permissions.medications_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 쓰기 권한이 없습니다")),
        ).into_response();
    }

    match db::update_medication_log(&id, &payload.log) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}

// ============ 복약 통계 API ============

async fn get_medication_stats_by_patient_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);

    if !session.permissions.medications_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
        ).into_response();
    }

    match db::get_medication_stats_by_patient(&patient_id) {
        Ok(stats) => Json(ApiResponse::ok(stats)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<MedicationStats>::err(e.to_string())),
        ).into_response(),
    }
}

// ============ 알림 API ============

#[derive(Deserialize, Default)]
struct ListNotificationsQuery {
    token: Option<String>,
    limit: Option<i32>,
}

async fn list_notifications_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<ListNotificationsQuery>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: query.token };
    require_auth!(state, headers, auth_query);

    match db::list_notifications(query.limit) {
        Ok(notifications) => Json(ApiResponse::ok(notifications)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<Notification>>::err(e.to_string())),
        ).into_response(),
    }
}

async fn list_unread_notifications_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::list_unread_notifications() {
        Ok(notifications) => Json(ApiResponse::ok(notifications)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<Notification>>::err(e.to_string())),
        ).into_response(),
    }
}

async fn get_unread_notification_count_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_unread_notification_count() {
        Ok(count) => Json(ApiResponse::ok(count)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<i32>::err(e.to_string())),
        ).into_response(),
    }
}

async fn mark_notification_read_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::mark_notification_read(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}

async fn dismiss_notification_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::dismiss_notification(&id) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}

async fn mark_all_notifications_read_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::mark_all_notifications_read() {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}

async fn get_notification_settings_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, headers, query);

    match db::get_notification_settings() {
        Ok(settings) => Json(ApiResponse::ok(settings)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Option<NotificationSettings>>::err(e.to_string())),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateNotificationSettingsRequest {
    #[serde(flatten)]
    settings: NotificationSettings,
    token: Option<String>,
}

async fn update_notification_settings_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateNotificationSettingsRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, headers, auth_query);

    match db::update_notification_settings(&payload.settings) {
        Ok(()) => Json(ApiResponse::ok(())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::err(e.to_string())),
        ).into_response(),
    }
}
