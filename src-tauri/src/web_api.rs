//! 웹 클라이언트용 REST API
//!
//! Tauri 커맨드들을 HTTP API로 노출하여 웹 브라우저에서도 접근 가능하게 합니다.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
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
#[derive(Deserialize)]
pub struct AuthQuery {
    pub token: Option<String>,
}

/// 세션 검증 헬퍼 매크로
macro_rules! require_auth {
    ($state:expr, $query:expr) => {
        match $query.token.as_ref().and_then(|t| $state.verify_session(t)) {
            Some(session) => session,
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(ApiResponse::<()>::err("인증이 필요합니다")),
                )
                    .into_response()
            }
        }
    };
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
        // 내보내기
        .route("/export/patient/{id}", get(export_patient_api))
        .route("/export/all", get(export_all_api))
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
            username: account.username,
            display_name: account.display_name,
            role: account.role.as_str().to_string(),
            permissions: account.permissions,
        })),
    )
        .into_response()
}

async fn web_logout(
    State(state): State<WebApiState>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    if let Some(token) = query.token {
        state.remove_session(&token);
    }
    Json(ApiResponse::ok(()))
}

async fn web_verify(
    State(state): State<WebApiState>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    match query.token.as_ref().and_then(|t| state.verify_session(t)) {
        Some(_) => Json(ApiResponse::ok(true)),
        None => Json(ApiResponse::ok(false)),
    }
}

// ============ 환자 관리 API ============

#[derive(Deserialize)]
struct ListPatientsQuery {
    token: Option<String>,
    search: Option<String>,
}

async fn list_patients_api(
    State(state): State<WebApiState>,
    Query(query): Query<ListPatientsQuery>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: query.token };
    require_auth!(state, auth_query);

    match db::list_patients(query.search.as_deref()) {
        Ok(patients) => Json(ApiResponse::ok(patients)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<Patient>>::err(e.to_string())),
        )
            .into_response(),
    }
}

async fn get_patient_api(
    State(state): State<WebApiState>,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Json(payload): Json<CreatePatientRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, auth_query);

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
    Path(_id): Path<String>,
    Json(payload): Json<UpdatePatientRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, auth_query);

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
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Json(payload): Json<CreatePrescriptionRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, auth_query);

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
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Json(payload): Json<CreateChartRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, auth_query);

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
    Path(patient_id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

    match db::get_chart_records_by_patient(&patient_id) {
        Ok(charts) => Json(ApiResponse::ok(charts)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<ChartRecord>>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 설정 API ============

async fn get_settings_api(
    State(state): State<WebApiState>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Json(payload): Json<SaveSettingsRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, auth_query);

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
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Json(payload): Json<SaveSurveyTemplateRequest>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: payload.token };
    require_auth!(state, auth_query);

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
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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

#[derive(Deserialize)]
struct ListResponsesQuery {
    token: Option<String>,
    limit: Option<i32>,
}

async fn list_survey_responses_api(
    State(state): State<WebApiState>,
    Query(query): Query<ListResponsesQuery>,
) -> impl IntoResponse {
    let auth_query = AuthQuery { token: query.token };
    require_auth!(state, auth_query);

    match db::list_survey_responses(query.limit) {
        Ok(responses) => Json(ApiResponse::ok(responses)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<db::SurveyResponseDb>>::err(e.to_string())),
        )
            .into_response(),
    }
}

// ============ 내보내기 API ============

async fn export_patient_api(
    State(state): State<WebApiState>,
    Path(id): Path<String>,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

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
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    require_auth!(state, query);

    match db::export_all_data() {
        Ok(data) => Json(ApiResponse::ok(data)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::err(e.to_string())),
        )
            .into_response(),
    }
}
