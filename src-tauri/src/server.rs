//! HTTP 서버 모듈 (axum 기반)
//!
//! 환자 설문 페이지와 직원 대시보드를 인트라넷에서 제공합니다.

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use rust_embed::Embed;
use serde::Deserialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

use crate::auth;
use crate::db;
use crate::error::AppResult;

/// 내장 정적 파일 (기존 설문 시스템용)
#[derive(Embed)]
#[folder = "static/"]
struct StaticAssets;

/// 서버 상태
#[derive(Clone)]
pub struct AppState {
    /// 직원 세션 (간단한 토큰 기반)
    pub staff_sessions: Arc<Mutex<HashMap<String, StaffSession>>>,
    /// 현재 사용자의 플랜 타입 (free, basic, premium)
    pub plan_type: Arc<Mutex<String>>,
    /// 온라인 설문 기능 활성화 여부
    pub survey_external_enabled: Arc<Mutex<bool>>,
}

#[derive(Clone, Debug)]
pub struct StaffSession {
    pub token: String,
    pub clinic_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            staff_sessions: Arc::new(Mutex::new(HashMap::new())),
            plan_type: Arc::new(Mutex::new("free".to_string())),
            survey_external_enabled: Arc::new(Mutex::new(false)),
        }
    }

    pub fn with_plan(plan_type: String, survey_external: bool) -> Self {
        Self {
            staff_sessions: Arc::new(Mutex::new(HashMap::new())),
            plan_type: Arc::new(Mutex::new(plan_type)),
            survey_external_enabled: Arc::new(Mutex::new(survey_external)),
        }
    }
}

/// 라우터 생성
pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        // 환자 설문 페이지 (기존 기능)
        .route("/s/{token}", get(survey_page_handler))
        // 환자 전용 키오스크 페이지
        .route("/patient", get(patient_kiosk_page))
        .route("/api/patient/create-session", post(patient_create_session_api))
        // 설문 API
        .route("/api/survey/{token}", get(get_survey_data).post(submit_survey))
        // 직원 페이지 (간단한 설문 관리용)
        .route("/staff", get(staff_login_page))
        .route("/staff/login", post(staff_login))
        .route("/staff/dashboard", get(staff_dashboard))
        .route("/api/staff/create-session", post(create_session_api))
        .route("/api/staff/create-online-session", post(create_online_session_api))
        .route("/api/responses", get(get_responses_api))
        .route("/api/templates", get(get_templates_api))
        // 디버그 (개발용)
        .route("/debug/db", get(debug_db_handler))
        .route("/debug/create-test-session", post(create_test_session_handler))
        // 정적 파일 (기존 설문 시스템용)
        .route("/static/{*path}", get(static_handler))
        .with_state(state)
        // 메인 인덱스 (안내 페이지)
        .route("/", get(index_handler))
}

/// HTTP 서버 시작
pub async fn start_server(port: u16) -> AppResult<()> {
    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = create_router(state).layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    log::info!("HTTP 서버 시작: http://0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await
        .map_err(|e| crate::error::AppError::Custom(format!("Server bind error: {}", e)))?;

    axum::serve(listener, app).await
        .map_err(|e| crate::error::AppError::Custom(format!("Server error: {}", e)))?;

    Ok(())
}

// ============ 핸들러 ============

/// 헬스 체크 (DB 호출 없음 - 서버 동작 확인용)
async fn health_handler() -> &'static str {
    "OK"
}

/// 메인 페이지
async fn index_handler() -> Html<String> {
    let clinic_name = db::get_clinic_settings()
        .ok()
        .flatten()
        .map(|s| s.clinic_name)
        .unwrap_or_else(|| "한의원".to_string());

    Html(format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{} - 설문 시스템</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
        .container {{ background: white; padding: 3rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }}
        h1 {{ color: #333; margin-bottom: 1rem; }}
        p {{ color: #666; margin-bottom: 2rem; }}
        a {{ display: inline-block; padding: 0.75rem 1.5rem; background: #4f46e5; color: white; text-decoration: none; border-radius: 0.5rem; }}
        a:hover {{ background: #4338ca; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🏥 {}</h1>
        <p>설문 시스템에 오신 것을 환영합니다.</p>
        <a href="/staff">직원 로그인</a>
    </div>
</body>
</html>"#, clinic_name, clinic_name))
}

/// 환자 설문 페이지
async fn survey_page_handler(Path(token): Path<String>) -> impl IntoResponse {
    // 세션 확인
    let session = match db::get_survey_session_by_token(&token) {
        Ok(Some(s)) => s,
        Ok(None) => return Html(error_page("설문을 찾을 수 없습니다", "잘못된 링크이거나 만료된 설문입니다.")),
        Err(_) => return Html(error_page("오류가 발생했습니다", "잠시 후 다시 시도해주세요.")),
    };

    // 상태 확인
    if session.status == crate::models::SessionStatus::Completed {
        return Html(error_page("이미 완료된 설문입니다", "감사합니다."));
    }
    if session.status == crate::models::SessionStatus::Expired {
        return Html(error_page("만료된 설문입니다", "새로운 설문 링크를 요청해주세요."));
    }

    // 템플릿 조회
    let template = match db::get_survey_template(&session.template_id) {
        Ok(Some(t)) => t,
        _ => return Html(error_page("설문 템플릿을 찾을 수 없습니다", "")),
    };

    // 설문 페이지 렌더링
    Html(render_survey_page(&token, &template, session.respondent_name.as_deref()))
}

/// 설문 데이터 API
async fn get_survey_data(Path(token): Path<String>) -> impl IntoResponse {
    let session = match db::get_survey_session_by_token(&token) {
        Ok(Some(s)) => s,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "설문을 찾을 수 없습니다"}))).into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "서버 오류"}))).into_response(),
    };

    if session.status != crate::models::SessionStatus::Pending {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "유효하지 않은 설문입니다"}))).into_response();
    }

    let template = match db::get_survey_template(&session.template_id) {
        Ok(Some(t)) => t,
        _ => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "템플릿을 찾을 수 없습니다"}))).into_response(),
    };

    Json(serde_json::json!({
        "session": session,
        "template": template,
    })).into_response()
}

/// 설문 제출
#[derive(Deserialize)]
struct SubmitSurveyRequest {
    answers: Vec<crate::models::SurveyAnswer>,
}

async fn submit_survey(
    Path(token): Path<String>,
    Json(payload): Json<SubmitSurveyRequest>,
) -> impl IntoResponse {
    // 세션 확인
    let session = match db::get_survey_session_by_token(&token) {
        Ok(Some(s)) => s,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "설문을 찾을 수 없습니다"}))),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "서버 오류"}))),
    };

    if session.status != crate::models::SessionStatus::Pending {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "이미 완료되었거나 만료된 설문입니다"})));
    }

    // 응답 저장
    let response = match db::save_survey_response(
        &session.id,
        &session.template_id,
        session.patient_id.as_deref(),
        session.respondent_name.as_deref(),
        &payload.answers,
    ) {
        Ok(r) => r,
        Err(e) => {
            log::error!("설문 응답 저장 실패: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "저장 실패"})));
        }
    };

    // Supabase 동기화 (비동기, 실패해도 로컬 저장은 완료됨)
    tokio::spawn(async move {
        if let Err(e) = crate::sync::sync_survey_response(&response).await {
            log::warn!("Supabase 동기화 실패 (나중에 재시도됨): {}", e);
        }
    });

    // 세션 완료 처리
    if let Err(e) = db::complete_survey_session(&session.id) {
        log::error!("세션 완료 처리 실패: {}", e);
    }

    (StatusCode::OK, Json(serde_json::json!({"success": true, "message": "설문이 제출되었습니다"})))
}

/// 직원 로그인 페이지
async fn staff_login_page() -> Html<String> {
    let clinic_name = db::get_clinic_settings()
        .ok()
        .flatten()
        .map(|s| s.clinic_name)
        .unwrap_or_else(|| "한의원".to_string());

    Html(render_staff_login_page(&clinic_name))
}

/// 직원 로그인 처리
#[derive(Deserialize)]
struct StaffLoginRequest {
    clinic_name: String,
    password: String,
}

async fn staff_login(
    State(state): State<AppState>,
    Json(payload): Json<StaffLoginRequest>,
) -> impl IntoResponse {
    // 한의원 이름 확인
    let settings = match db::get_clinic_settings() {
        Ok(Some(s)) => s,
        _ => return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "설정을 찾을 수 없습니다"}))).into_response(),
    };

    if settings.clinic_name != payload.clinic_name {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "한의원 이름이 일치하지 않습니다"}))).into_response();
    }

    // 비밀번호 확인
    match db::verify_staff_password(&payload.password) {
        Ok(true) => {}
        Ok(false) => return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "비밀번호가 일치하지 않습니다"}))).into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "서버 오류"}))).into_response(),
    }

    // 세션 생성
    let token = generate_session_token();
    let session = StaffSession {
        token: token.clone(),
        clinic_name: settings.clinic_name,
        created_at: chrono::Utc::now(),
    };

    if let Ok(mut sessions) = state.staff_sessions.lock() {
        sessions.insert(token.clone(), session);
    }

    Json(serde_json::json!({
        "success": true,
        "token": token,
    })).into_response()
}

/// 직원 대시보드
async fn staff_dashboard(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let token = params.get("token").cloned().unwrap_or_default();

    // 세션 확인
    let session = {
        let sessions = state.staff_sessions.lock().ok();
        sessions.and_then(|s| s.get(&token).cloned())
    };

    // 온라인 설문 기능 활성화 여부
    let survey_external = {
        state.survey_external_enabled.lock().ok()
            .map(|v| *v)
            .unwrap_or(false)
    };

    match session {
        Some(s) => {
            // 24시간 유효
            if chrono::Utc::now().signed_duration_since(s.created_at).num_hours() > 24 {
                return Html(render_staff_login_page_with_error("세션이 만료되었습니다. 다시 로그인해주세요."));
            }
            Html(render_staff_dashboard(&s.clinic_name, &token, survey_external))
        }
        None => Html(render_staff_login_page_with_error("로그인이 필요합니다.")),
    }
}

/// 응답 목록 API
async fn get_responses_api(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let token = params.get("token").cloned().unwrap_or_default();

    // 세션 확인
    let valid = {
        let sessions = state.staff_sessions.lock().ok();
        sessions.map(|s| s.contains_key(&token)).unwrap_or(false)
    };

    if !valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "인증 필요"}))).into_response();
    }

    match db::list_survey_responses(Some(100)) {
        Ok(responses) => Json(serde_json::json!({"responses": responses})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

/// 정적 파일 핸들러
async fn static_handler(Path(path): Path<String>) -> impl IntoResponse {
    match StaticAssets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref())],
                content.data.into_owned(),
            ).into_response()
        }
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

// ============ 헬퍼 함수 ============

fn generate_session_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..32)
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

fn error_page(title: &str, message: &str) -> String {
    format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>오류</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
        .container {{ background: white; padding: 3rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }}
        .icon {{ font-size: 4rem; margin-bottom: 1rem; }}
        h1 {{ color: #333; margin-bottom: 0.5rem; font-size: 1.5rem; }}
        p {{ color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">❌</div>
        <h1>{}</h1>
        <p>{}</p>
    </div>
</body>
</html>"#, title, message)
}

fn render_survey_page(token: &str, template: &db::SurveyTemplateDb, respondent_name: Option<&str>) -> String {
    let questions_json = serde_json::to_string(&template.questions).unwrap_or_default();
    let display_mode = template.display_mode.as_deref().unwrap_or("one_by_one");
    let _name = respondent_name.unwrap_or("");

    format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{} - 설문</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; padding: 1rem; }}
        .container {{ max-width: 600px; margin: 0 auto; }}
        .card {{ background: white; border-radius: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 1.5rem; margin-bottom: 1rem; }}
        h1 {{ color: #333; font-size: 1.5rem; margin-bottom: 0.5rem; }}
        .description {{ color: #666; margin-bottom: 1rem; }}
        .question {{ margin-bottom: 1.5rem; }}
        .question-text {{ font-weight: 600; margin-bottom: 0.75rem; color: #333; }}
        .required {{ color: #ef4444; }}
        .options {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }}
        .option {{ padding: 0.75rem 1rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; text-align: center; font-size: 0.9rem; }}
        .option:hover {{ border-color: #4f46e5; background: #f5f3ff; }}
        .option.selected {{ border-color: #4f46e5; background: #4f46e5; color: white; }}
        .option-multi.selected {{ border-color: #4f46e5; background: #eef2ff; color: #4f46e5; }}
        input[type="text"], textarea {{ width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 1rem; }}
        input[type="text"]:focus, textarea:focus {{ outline: none; border-color: #4f46e5; }}
        .scale-container {{ display: flex; gap: 0.5rem; flex-wrap: wrap; }}
        .scale-btn {{ flex: 1; min-width: 40px; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; cursor: pointer; text-align: center; font-weight: 600; }}
        .scale-btn:hover {{ border-color: #4f46e5; }}
        .scale-btn.selected {{ border-color: #4f46e5; background: #4f46e5; color: white; }}
        .scale-labels {{ display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.875rem; color: #666; }}
        .nav-buttons {{ display: flex; gap: 1rem; margin-top: 1.5rem; }}
        .btn {{ flex: 1; padding: 1rem; border: none; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; }}
        .btn-primary {{ background: #4f46e5; color: white; }}
        .btn-primary:hover {{ background: #4338ca; }}
        .btn-secondary {{ background: #e5e7eb; color: #374151; }}
        .btn-secondary:hover {{ background: #d1d5db; }}
        .btn:disabled {{ opacity: 0.5; cursor: not-allowed; }}
        .progress {{ height: 4px; background: #e5e7eb; border-radius: 2px; margin-bottom: 1rem; }}
        .progress-bar {{ height: 100%; background: #4f46e5; border-radius: 2px; transition: width 0.3s; }}
        .success {{ text-align: center; padding: 3rem; }}
        .success-icon {{ font-size: 4rem; margin-bottom: 1rem; }}
        .hidden {{ display: none; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="card" id="survey-form">
            <h1>{}</h1>
            <p class="description">{}</p>
            <div class="progress"><div class="progress-bar" id="progress-bar"></div></div>
            <div id="questions-container"></div>
            <div class="nav-buttons">
                <button class="btn btn-secondary" id="prev-btn" onclick="prevQuestion()">이전</button>
                <button class="btn btn-primary" id="next-btn" onclick="nextQuestion()">다음</button>
            </div>
        </div>
        <div class="card success hidden" id="success-card">
            <div class="success-icon">✅</div>
            <h1>설문이 제출되었습니다</h1>
            <p>감사합니다.</p>
        </div>
    </div>
    <script>
        const token = '{}';
        const questions = {};
        const displayMode = '{}';
        const answers = {{}};
        let currentIndex = 0;

        function init() {{
            renderQuestions();
            updateNavigation();
        }}

        function renderQuestions() {{
            const container = document.getElementById('questions-container');
            container.innerHTML = '';

            if (displayMode === 'one_by_one') {{
                const q = questions[currentIndex];
                container.appendChild(createQuestionElement(q, currentIndex));
            }} else {{
                questions.forEach((q, i) => {{
                    container.appendChild(createQuestionElement(q, i));
                }});
            }}
        }}

        function createQuestionElement(q, index) {{
            const div = document.createElement('div');
            div.className = 'question';
            div.innerHTML = `<div class="question-text">Q${{index + 1}}. ${{q.question_text}} ${{q.required ? '<span class="required">*</span>' : ''}}</div>`;

            if (q.question_type === 'single_choice' && q.options) {{
                const optionsDiv = document.createElement('div');
                optionsDiv.className = 'options';
                q.options.forEach(opt => {{
                    const optDiv = document.createElement('div');
                    optDiv.className = 'option' + (answers[q.id] === opt ? ' selected' : '');
                    optDiv.textContent = opt;
                    optDiv.onclick = () => selectOption(q.id, opt, optDiv);
                    optionsDiv.appendChild(optDiv);
                }});
                div.appendChild(optionsDiv);
            }} else if (q.question_type === 'multiple_choice' && q.options) {{
                const optionsDiv = document.createElement('div');
                optionsDiv.className = 'options';
                q.options.forEach(opt => {{
                    const optDiv = document.createElement('div');
                    const selected = (answers[q.id] || []).includes(opt);
                    optDiv.className = 'option option-multi' + (selected ? ' selected' : '');
                    optDiv.textContent = opt;
                    optDiv.onclick = () => selectMultiOption(q.id, opt, optDiv);
                    optionsDiv.appendChild(optDiv);
                }});
                div.appendChild(optionsDiv);
            }} else if (q.question_type === 'text') {{
                const input = document.createElement('textarea');
                input.rows = 3;
                input.placeholder = '답변을 입력하세요';
                input.value = answers[q.id] || '';
                input.oninput = (e) => {{ answers[q.id] = e.target.value; }};
                div.appendChild(input);
            }} else if (q.question_type === 'scale' && q.scale_config) {{
                const scaleDiv = document.createElement('div');
                scaleDiv.className = 'scale-container';
                for (let i = q.scale_config.min; i <= q.scale_config.max; i++) {{
                    const btn = document.createElement('div');
                    btn.className = 'scale-btn' + (answers[q.id] === i ? ' selected' : '');
                    btn.textContent = i;
                    btn.onclick = () => selectScale(q.id, i, scaleDiv);
                    scaleDiv.appendChild(btn);
                }}
                div.appendChild(scaleDiv);
                if (q.scale_config.minLabel || q.scale_config.maxLabel) {{
                    const labels = document.createElement('div');
                    labels.className = 'scale-labels';
                    labels.innerHTML = `<span>${{q.scale_config.minLabel || ''}}</span><span>${{q.scale_config.maxLabel || ''}}</span>`;
                    div.appendChild(labels);
                }}
            }}

            return div;
        }}

        function selectOption(qId, value, element) {{
            answers[qId] = value;
            element.parentElement.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
        }}

        function selectMultiOption(qId, value, element) {{
            if (!answers[qId]) answers[qId] = [];
            const idx = answers[qId].indexOf(value);
            if (idx >= 0) {{
                answers[qId].splice(idx, 1);
                element.classList.remove('selected');
            }} else {{
                answers[qId].push(value);
                element.classList.add('selected');
            }}
        }}

        function selectScale(qId, value, container) {{
            answers[qId] = value;
            container.querySelectorAll('.scale-btn').forEach(el => el.classList.remove('selected'));
            event.target.classList.add('selected');
        }}

        function updateNavigation() {{
            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');
            const progressBar = document.getElementById('progress-bar');

            if (displayMode === 'one_by_one') {{
                prevBtn.classList.toggle('hidden', currentIndex === 0);
                nextBtn.textContent = currentIndex === questions.length - 1 ? '제출하기' : '다음';
                progressBar.style.width = ((currentIndex + 1) / questions.length * 100) + '%';
            }} else {{
                prevBtn.classList.add('hidden');
                nextBtn.textContent = '제출하기';
                progressBar.style.width = '100%';
            }}
        }}

        function prevQuestion() {{
            if (currentIndex > 0) {{
                currentIndex--;
                renderQuestions();
                updateNavigation();
            }}
        }}

        function nextQuestion() {{
            if (displayMode === 'one_by_one' && currentIndex < questions.length - 1) {{
                currentIndex++;
                renderQuestions();
                updateNavigation();
            }} else {{
                submitSurvey();
            }}
        }}

        async function submitSurvey() {{
            // 필수 질문 확인
            for (const q of questions) {{
                if (q.required) {{
                    const ans = answers[q.id];
                    if (ans === undefined || ans === '' || (Array.isArray(ans) && ans.length === 0)) {{
                        alert(`"${{q.question_text}}" 질문에 답변해주세요.`);
                        return;
                    }}
                }}
            }}

            const answerArray = Object.entries(answers).map(([question_id, answer]) => ({{ question_id, answer }}));

            try {{
                const res = await fetch('/api/survey/' + token, {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ answers: answerArray }})
                }});

                if (res.ok) {{
                    document.getElementById('survey-form').classList.add('hidden');
                    document.getElementById('success-card').classList.remove('hidden');
                }} else {{
                    const data = await res.json();
                    alert(data.error || '제출에 실패했습니다.');
                }}
            }} catch (e) {{
                alert('네트워크 오류가 발생했습니다.');
            }}
        }}

        init();
    </script>
</body>
</html>"#,
        template.name,
        template.name,
        template.description.as_deref().unwrap_or(""),
        token,
        questions_json,
        display_mode
    )
}

fn render_staff_login_page(clinic_name: &str) -> String {
    render_staff_login_page_inner(clinic_name, None)
}

fn render_staff_login_page_with_error(error: &str) -> String {
    render_staff_login_page_inner("", Some(error))
}

fn render_staff_login_page_inner(clinic_name: &str, error: Option<&str>) -> String {
    let error_html = error.map(|e| format!(r#"<div class="error">{}</div>"#, e)).unwrap_or_default();

    format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>직원 로그인</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
        .container {{ background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }}
        h1 {{ color: #333; margin-bottom: 1.5rem; text-align: center; }}
        .form-group {{ margin-bottom: 1rem; }}
        label {{ display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; }}
        input {{ width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 1rem; }}
        input:focus {{ outline: none; border-color: #4f46e5; }}
        button {{ width: 100%; padding: 1rem; background: #4f46e5; color: white; border: none; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 1rem; }}
        button:hover {{ background: #4338ca; }}
        .error {{ background: #fef2f2; color: #dc2626; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem; text-align: center; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 직원 로그인</h1>
        {}
        <form onsubmit="login(event)">
            <div class="form-group">
                <label for="clinic_name">한의원 이름</label>
                <input type="text" id="clinic_name" name="clinic_name" required placeholder="한의원 이름을 입력하세요" value="{}">
            </div>
            <div class="form-group">
                <label for="password">직원 비밀번호</label>
                <input type="password" id="password" name="password" required placeholder="비밀번호를 입력하세요">
            </div>
            <button type="submit">로그인</button>
        </form>
    </div>
    <script>
        async function login(e) {{
            e.preventDefault();
            const clinic_name = document.getElementById('clinic_name').value;
            const password = document.getElementById('password').value;

            try {{
                const res = await fetch('/staff/login', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ clinic_name, password }})
                }});

                const data = await res.json();
                if (data.success) {{
                    window.location.href = '/staff/dashboard?token=' + data.token;
                }} else {{
                    alert(data.error || '로그인에 실패했습니다.');
                }}
            }} catch (e) {{
                alert('네트워크 오류가 발생했습니다.');
            }}
        }}
    </script>
</body>
</html>"#, error_html, clinic_name)
}

fn render_staff_dashboard(clinic_name: &str, token: &str, survey_external: bool) -> String {
    // 온라인 링크 버튼 (프리미엄 플랜만)
    let online_link_btn = if survey_external {
        r#"<button onclick="showOnlineLinkModal()" class="btn-online">🌐 온라인 링크</button>"#
    } else {
        ""
    };

    format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{} - 설문 결과</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; }}
        .header {{ background: white; padding: 1rem 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; }}
        .header h1 {{ font-size: 1.25rem; color: #333; }}
        .header-actions {{ display: flex; gap: 1rem; align-items: center; }}
        .btn-online {{ padding: 0.5rem 1rem; background: #7c3aed; color: white; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; }}
        .btn-online:hover {{ background: #6d28d9; }}
        .logout {{ color: #666; text-decoration: none; }}
        .logout:hover {{ color: #333; }}
        .container {{ max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }}
        .card {{ background: white; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }}
        .card-header {{ padding: 1rem 1.5rem; border-bottom: 1px solid #e5e7eb; font-weight: 600; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ padding: 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; }}
        th {{ background: #f9fafb; font-weight: 600; color: #374151; }}
        tr:hover {{ background: #f9fafb; }}
        .badge {{ display: inline-block; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.875rem; }}
        .badge-blue {{ background: #dbeafe; color: #1d4ed8; }}
        .empty {{ text-align: center; padding: 3rem; color: #666; }}
        .loading {{ text-align: center; padding: 2rem; }}
        .modal {{ display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 1000; }}
        .modal.show {{ display: flex; }}
        .modal-content {{ background: white; padding: 2rem; border-radius: 1rem; max-width: 500px; width: 90%; }}
        .modal-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }}
        .modal-close {{ background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666; }}
        .modal-close:hover {{ color: #333; }}
        .form-group {{ margin-bottom: 1rem; }}
        .form-group label {{ display: block; margin-bottom: 0.5rem; font-weight: 600; color: #374151; }}
        .form-group select, .form-group input {{ width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 1rem; }}
        .btn-submit {{ width: 100%; padding: 1rem; background: #7c3aed; color: white; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; margin-top: 1rem; }}
        .btn-submit:hover {{ background: #6d28d9; }}
        .result-box {{ margin-top: 1rem; padding: 1rem; background: #f0fdf4; border: 1px solid #22c55e; border-radius: 0.5rem; }}
        .result-url {{ word-break: break-all; font-family: monospace; padding: 0.5rem; background: white; border-radius: 0.25rem; margin-top: 0.5rem; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 {} - 설문 결과</h1>
        <div class="header-actions">
            {}
            <a href="/staff" class="logout">로그아웃</a>
        </div>
    </div>
    <div class="container">
        <div class="card">
            <div class="card-header">최근 설문 응답</div>
            <div id="responses-container">
                <div class="loading">로딩 중...</div>
            </div>
        </div>
    </div>
    <script>
        const token = '{}';

        async function loadResponses() {{
            try {{
                const res = await fetch('/api/responses?token=' + token);
                const data = await res.json();

                const container = document.getElementById('responses-container');
                if (!data.responses || data.responses.length === 0) {{
                    container.innerHTML = '<div class="empty">설문 응답이 없습니다.</div>';
                    return;
                }}

                let html = `<table>
                    <thead>
                        <tr>
                            <th>응답자</th>
                            <th>설문</th>
                            <th>제출일시</th>
                            <th>답변 수</th>
                        </tr>
                    </thead>
                    <tbody>`;

                data.responses.forEach(r => {{
                    const name = r.patient_name || r.respondent_name || '익명';
                    const template = r.template_name || '알 수 없음';
                    const date = new Date(r.submitted_at).toLocaleString('ko-KR');
                    const count = r.answers ? r.answers.length : 0;

                    html += `<tr>
                        <td>${{name}}</td>
                        <td><span class="badge badge-blue">${{template}}</span></td>
                        <td>${{date}}</td>
                        <td>${{count}}개</td>
                    </tr>`;
                }});

                html += '</tbody></table>';
                container.innerHTML = html;
            }} catch (e) {{
                document.getElementById('responses-container').innerHTML = '<div class="empty">데이터를 불러올 수 없습니다.</div>';
            }}
        }}

        loadResponses();

        // 온라인 링크 모달 관련 함수들
        function showOnlineLinkModal() {{
            loadTemplatesForModal();
            document.getElementById('online-link-modal').classList.add('show');
        }}

        function closeOnlineLinkModal() {{
            document.getElementById('online-link-modal').classList.remove('show');
            document.getElementById('online-result').style.display = 'none';
        }}

        async function loadTemplatesForModal() {{
            try {{
                const res = await fetch('/api/templates?token=' + token);
                const data = await res.json();
                const select = document.getElementById('modal-template');
                select.innerHTML = '<option value="">템플릿을 선택하세요</option>';

                if (data.templates && data.templates.length > 0) {{
                    data.templates.forEach(t => {{
                        const option = document.createElement('option');
                        option.value = t.id;
                        option.textContent = t.name;
                        select.appendChild(option);
                    }});
                }}
            }} catch (e) {{
                console.error('템플릿 로드 실패:', e);
            }}
        }}

        async function createOnlineLink() {{
            const templateId = document.getElementById('modal-template').value;
            const name = document.getElementById('modal-name').value;

            if (!templateId) {{
                alert('템플릿을 선택하세요');
                return;
            }}

            try {{
                const res = await fetch('/api/staff/create-online-session?token=' + token, {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{
                        template_id: templateId,
                        respondent_name: name || null
                    }})
                }});

                const data = await res.json();
                if (data.success) {{
                    document.getElementById('online-url-text').textContent = data.url;
                    document.getElementById('online-result').style.display = 'block';
                }} else {{
                    alert(data.error || '생성 실패');
                }}
            }} catch (e) {{
                alert('네트워크 오류');
            }}
        }}

        function copyOnlineUrl() {{
            const url = document.getElementById('online-url-text').textContent;
            navigator.clipboard.writeText(url).then(() => {{
                alert('복사되었습니다');
            }}).catch(() => {{
                prompt('URL을 복사하세요:', url);
            }});
        }}
    </script>

    <!-- 온라인 링크 생성 모달 -->
    <div class="modal" id="online-link-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>🌐 온라인 설문 링크 생성</h2>
                <button class="modal-close" onclick="closeOnlineLinkModal()">&times;</button>
            </div>
            <div class="form-group">
                <label for="modal-template">설문 템플릿</label>
                <select id="modal-template">
                    <option value="">템플릿을 선택하세요</option>
                </select>
            </div>
            <div class="form-group">
                <label for="modal-name">응답자 이름 (선택)</label>
                <input type="text" id="modal-name" placeholder="환자 또는 응답자 이름">
            </div>
            <button class="btn-submit" onclick="createOnlineLink()">링크 생성</button>
            <div class="result-box" id="online-result" style="display:none;">
                <strong>✅ 온라인 링크가 생성되었습니다</strong>
                <div class="result-url" id="online-url-text"></div>
                <button class="btn-submit" style="background:#22c55e;margin-top:0.5rem;" onclick="copyOnlineUrl()">URL 복사</button>
            </div>
        </div>
    </div>
</body>
</html>"#, clinic_name, clinic_name, online_link_btn, token)
}

/// 디버그: 테스트 세션 생성
async fn create_test_session_handler() -> impl IntoResponse {
    // 테스트용 템플릿 생성 (없으면)
    let template_id = "test_template_local";
    let template = db::SurveyTemplateDb {
        id: template_id.to_string(),
        name: "테스트 설문".to_string(),
        description: Some("동기화 테스트용".to_string()),
        questions: vec![
            crate::models::SurveyQuestion {
                id: "q1".to_string(),
                question_type: crate::models::QuestionType::SingleChoice,
                question_text: "테스트 질문입니다".to_string(),
                required: true,
                options: Some(vec!["옵션1".to_string(), "옵션2".to_string()]),
                scale_config: None,
            }
        ],
        display_mode: Some("all_at_once".to_string()),
        is_active: true,
    };
    let _ = db::save_survey_template(&template);

    // 테스트 세션 생성
    match db::create_survey_session(None, template_id, Some("테스트 응답자"), None) {
        Ok(session) => {
            Json(serde_json::json!({
                "success": true,
                "token": session.token,
                "url": format!("/s/{}", session.token)
            }))
        }
        Err(e) => {
            Json(serde_json::json!({
                "error": e.to_string()
            }))
        }
    }
}

/// 디버그: DB 상태 확인 (개발용)
async fn debug_db_handler() -> impl IntoResponse {
    let settings = db::get_clinic_settings();
    let has_password = db::has_staff_password();
    let all_rows = db::debug_get_all_clinic_rows();

    let settings_info = match &settings {
        Ok(Some(s)) => format!("clinic_name: '{}', doctor_name: {:?}", s.clinic_name, s.doctor_name),
        Ok(None) => "No settings found".to_string(),
        Err(e) => format!("Error: {}", e),
    };

    let password_info = match has_password {
        Ok(true) => "Password is set",
        Ok(false) => "Password is NOT set",
        Err(e) => &format!("Error: {}", e),
    };

    Json(serde_json::json!({
        "settings": settings_info,
        "password": password_info,
        "all_rows": all_rows.unwrap_or_default(),
    }))
}

/// 템플릿 목록 API
async fn get_templates_api(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let token = params.get("token").cloned().unwrap_or_default();

    // 키오스크 토큰 또는 직원 세션 확인
    let is_kiosk = token == "kiosk";
    let valid = if is_kiosk {
        true // 키오스크 모드는 인증 불필요
    } else {
        let sessions = state.staff_sessions.lock().ok();
        sessions.map(|s| s.contains_key(&token)).unwrap_or(false)
    };

    if !valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "인증 필요"}))).into_response();
    }

    match db::list_survey_templates() {
        Ok(templates) => {
            let active: Vec<_> = templates.into_iter().filter(|t| t.is_active).collect();
            Json(serde_json::json!({"templates": active})).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

/// 설문 세션 생성 API
#[derive(Deserialize)]
struct CreateSessionRequest {
    template_id: String,
    respondent_name: Option<String>,
    patient_id: Option<String>,
}

async fn create_session_api(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
    Json(payload): Json<CreateSessionRequest>,
) -> impl IntoResponse {
    let token = params.get("token").cloned().unwrap_or_default();

    // 세션 확인
    let valid = {
        let sessions = state.staff_sessions.lock().ok();
        sessions.map(|s| s.contains_key(&token)).unwrap_or(false)
    };

    if !valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "인증 필요"}))).into_response();
    }

    // 템플릿 존재 확인
    match db::get_survey_template(&payload.template_id) {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "템플릿을 찾을 수 없습니다"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }

    // 세션 생성
    match db::create_survey_session(
        payload.patient_id.as_deref(),
        &payload.template_id,
        payload.respondent_name.as_deref(),
        None,
    ) {
        Ok(session) => {
            Json(serde_json::json!({
                "success": true,
                "token": session.token,
                "url": format!("/s/{}", session.token),
                "session_id": session.id
            })).into_response()
        }
        Err(e) => {
            log::error!("설문 세션 생성 실패: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "세션 생성 실패"}))).into_response()
        }
    }
}

/// 온라인 설문 세션 생성 (Supabase 연동)
async fn create_online_session_api(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
    Json(payload): Json<CreateSessionRequest>,
) -> impl IntoResponse {
    let token = params.get("token").cloned().unwrap_or_default();

    // Staff 세션 확인
    let valid = {
        let sessions = state.staff_sessions.lock().ok();
        sessions.map(|s| s.contains_key(&token)).unwrap_or(false)
    };

    if !valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "인증 필요"}))).into_response();
    }

    // 템플릿 조회
    let template = match db::get_survey_template(&payload.template_id) {
        Ok(Some(t)) => t,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "템플릿을 찾을 수 없습니다"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    };

    // Supabase 설정 가져오기
    auth::ensure_supabase_initialized();
    let config = match auth::get_supabase_config() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("Supabase 미초기화: {}", e)}))).into_response(),
    };
    let client = match auth::get_http_client() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("HTTP 클라이언트 오류: {}", e)}))).into_response(),
    };

    let user_id = auth::get_user_id().unwrap_or_default();
    let access_token = auth::get_access_token().unwrap_or_default();

    if user_id.is_empty() || access_token.is_empty() {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "로그인이 필요합니다 (Supabase 인증)"}))).into_response();
    }

    // 1. Supabase에 템플릿 upsert
    let questions_json = serde_json::to_value(&template.questions).unwrap_or_default();
    let template_body = serde_json::json!({
        "id": template.id,
        "user_id": user_id,
        "name": template.name,
        "description": template.description,
        "questions": questions_json,
        "display_mode": template.display_mode.unwrap_or_else(|| "single_page".to_string()),
    });

    let upsert_res = client
        .post(format!("{}/rest/v1/survey_templates", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates")
        .json(&template_body)
        .send()
        .await;

    if let Err(e) = upsert_res {
        log::error!("Supabase 템플릿 upsert 실패: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("템플릿 동기화 실패: {}", e)}))).into_response();
    }

    // 2. 16자 랜덤 토큰 생성
    let survey_token = generate_online_token(16);
    let session_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let expires_at = (now + chrono::Duration::hours(24)).to_rfc3339();

    // 3. Supabase에 세션 INSERT
    let session_body = serde_json::json!({
        "id": session_id,
        "user_id": user_id,
        "template_id": template.id,
        "token": survey_token,
        "respondent_name": payload.respondent_name,
        "expires_at": expires_at,
    });

    let session_res = client
        .post(format!("{}/rest/v1/survey_sessions", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&session_body)
        .send()
        .await;

    match session_res {
        Ok(resp) if !resp.status().is_success() => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            log::error!("Supabase 세션 생성 실패: {} - {}", status, body);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("세션 생성 실패: {}", body)}))).into_response();
        }
        Err(e) => {
            log::error!("Supabase 세션 생성 요청 실패: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("세션 생성 실패: {}", e)}))).into_response();
        }
        _ => {}
    }

    // 4. 로컬 DB에도 세션 저장 (동기화용)
    if let Err(e) = db::create_survey_session(
        payload.patient_id.as_deref(),
        &payload.template_id,
        payload.respondent_name.as_deref(),
        Some(&user_id),
    ) {
        log::warn!("로컬 DB 세션 저장 실패 (무시): {}", e);
    }

    // 5. Vercel URL 반환
    let survey_url = format!("https://gosibang-survey.vercel.app/s/{}", survey_token);
    log::info!("온라인 설문 링크 생성: {}", survey_url);

    Json(serde_json::json!({
        "success": true,
        "url": survey_url,
        "token": survey_token,
        "session_id": session_id
    })).into_response()
}

/// 온라인 설문용 토큰 생성 (지정 길이)
fn generate_online_token(len: usize) -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..len)
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

// ============ 환자 전용 키오스크 페이지 ============

/// 환자 전용 설문 키오스크 페이지
async fn patient_kiosk_page() -> Html<String> {
    let clinic_name = db::get_clinic_settings()
        .ok()
        .flatten()
        .map(|s| s.clinic_name)
        .unwrap_or_else(|| "한의원".to_string());

    Html(render_patient_kiosk_page(&clinic_name))
}

/// 환자용 세션 생성 API (인증 불필요)
async fn patient_create_session_api(
    Json(payload): Json<CreateSessionRequest>,
) -> impl IntoResponse {
    // 템플릿 존재 확인
    match db::get_survey_template(&payload.template_id) {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "템플릿을 찾을 수 없습니다"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }

    // 세션 생성
    match db::create_survey_session(
        payload.patient_id.as_deref(),
        &payload.template_id,
        payload.respondent_name.as_deref(),
        None,
    ) {
        Ok(session) => {
            Json(serde_json::json!({
                "success": true,
                "token": session.token,
                "session_id": session.id
            })).into_response()
        }
        Err(e) => {
            log::error!("설문 세션 생성 실패: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "세션 생성 실패"}))).into_response()
        }
    }
}

/// 환자 키오스크 페이지 렌더링
fn render_patient_kiosk_page(clinic_name: &str) -> String {
    format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>{} - 설문</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; padding: 1rem; }}
        .container {{ max-width: 600px; margin: 0 auto; }}

        /* 대기 화면 */
        .waiting-screen {{ display: none; }}
        .waiting-screen .card {{ background: white; border-radius: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 1.5rem; }}
        .waiting-screen h1 {{ color: #333; font-size: 1.5rem; margin-bottom: 0.5rem; text-align: center; }}
        .waiting-screen .subtitle {{ color: #666; font-size: 1rem; margin-bottom: 1.5rem; text-align: center; }}

        .form-group {{ margin-bottom: 1.25rem; }}
        .form-group label {{ display: block; font-weight: 600; color: #333; margin-bottom: 0.5rem; }}
        .form-group select, .form-group input {{ width: 100%; padding: 0.75rem 1rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 1rem; }}
        .form-group select:focus, .form-group input:focus {{ outline: none; border-color: #4f46e5; }}

        .btn-start {{ width: 100%; padding: 1rem; background: #4f46e5; color: white; border: none; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; }}
        .btn-start:hover {{ background: #4338ca; }}
        .btn-start:disabled {{ opacity: 0.5; cursor: not-allowed; }}

        .staff-hint {{ margin-top: 1.25rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem; }}
        .staff-hint p {{ color: #92400e; font-size: 0.875rem; }}

        /* 설문 화면 */
        .survey-screen {{ display: none; }}
        .survey-screen .card {{ background: white; border-radius: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 1.5rem; }}
        .survey-header {{ margin-bottom: 1rem; }}
        .survey-header h2 {{ color: #333; font-size: 1.5rem; margin-bottom: 0.25rem; }}
        .survey-header .patient-name {{ color: #666; font-size: 0.9rem; }}
        .progress {{ height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 0.75rem; }}
        .progress-bar {{ height: 100%; background: #4f46e5; border-radius: 2px; transition: width 0.3s; }}

        .questions-container {{ max-height: 60vh; overflow-y: auto; }}
        .question {{ margin-bottom: 1.5rem; }}
        .question-text {{ font-weight: 600; margin-bottom: 0.75rem; color: #333; }}
        .required {{ color: #ef4444; }}

        .options {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }}
        .option {{ padding: 0.75rem 1rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; text-align: center; font-size: 0.9rem; }}
        .option:hover {{ border-color: #4f46e5; background: #f5f3ff; }}
        .option.selected {{ border-color: #4f46e5; background: #4f46e5; color: white; }}
        .option-multi.selected {{ border-color: #4f46e5; background: #eef2ff; color: #4f46e5; }}

        input[type="text"], textarea {{ width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 1rem; }}
        input[type="text"]:focus, textarea:focus {{ outline: none; border-color: #4f46e5; }}
        textarea {{ min-height: 80px; resize: vertical; }}

        .scale-container {{ display: flex; gap: 0.5rem; flex-wrap: wrap; }}
        .scale-btn {{ flex: 1; min-width: 40px; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; cursor: pointer; text-align: center; font-weight: 600; }}
        .scale-btn:hover {{ border-color: #4f46e5; }}
        .scale-btn.selected {{ border-color: #4f46e5; background: #4f46e5; color: white; }}
        .scale-labels {{ display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.875rem; color: #666; }}

        .nav-buttons {{ display: flex; gap: 1rem; margin-top: 1.5rem; }}
        .btn {{ flex: 1; padding: 1rem; border: none; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; }}
        .btn-primary {{ background: #4f46e5; color: white; }}
        .btn-primary:hover {{ background: #4338ca; }}
        .btn-secondary {{ background: #e5e7eb; color: #374151; }}
        .btn-secondary:hover {{ background: #d1d5db; }}
        .btn:disabled {{ opacity: 0.5; cursor: not-allowed; }}
        .hidden {{ display: none !important; }}

        /* 완료 화면 */
        .complete-screen {{ display: none; }}
        .complete-screen .card {{ background: white; border-radius: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 3rem; text-align: center; }}
        .success-icon {{ font-size: 4rem; margin-bottom: 1rem; }}
        .complete-screen h2 {{ color: #059669; font-size: 1.5rem; margin-bottom: 0.5rem; }}
        .complete-screen p {{ color: #666; margin-bottom: 1rem; }}
        .countdown {{ background: #f3f4f6; padding: 0.5rem 1rem; border-radius: 1rem; display: inline-block; color: #374151; font-size: 0.9rem; }}

        /* 활성 상태 */
        .screen.active {{ display: block; }}
    </style>
</head>
<body>
    <div class="container">
    <!-- 대기 화면 -->
    <div class="waiting-screen screen active" id="waiting-screen">
        <div class="card">
            <h1>{}</h1>
            <p class="subtitle">설문 시스템</p>

            <div class="form-group">
                <label for="template">설문 종류</label>
                <select id="template">
                    <option value="">설문을 선택하세요</option>
                </select>
            </div>
            <div class="form-group">
                <label for="patient-name">환자 이름</label>
                <input type="text" id="patient-name" placeholder="이름을 입력하세요">
            </div>
            <button class="btn-start" id="start-btn" onclick="startSurvey()">
                설문 시작하기
            </button>
            <div class="staff-hint">
                <p><strong>💡 안내:</strong> 직원이 위 정보를 입력한 후 환자에게 태블릿을 건네주세요.</p>
            </div>
        </div>
    </div>

    <!-- 설문 화면 -->
    <div class="survey-screen screen" id="survey-screen">
        <div class="card">
            <div class="survey-header">
                <h2 id="survey-title">설문</h2>
                <p class="patient-name" id="display-patient-name"></p>
                <div class="progress"><div class="progress-bar" id="progress-bar"></div></div>
            </div>
            <div id="questions-container" class="questions-container"></div>
            <div class="nav-buttons">
                <button class="btn btn-secondary" id="prev-btn" onclick="prevQuestion()">이전</button>
                <button class="btn btn-primary" id="next-btn" onclick="nextQuestion()">다음</button>
            </div>
        </div>
    </div>

    <!-- 완료 화면 -->
    <div class="complete-screen screen" id="complete-screen">
        <div class="card">
            <div class="success-icon">✅</div>
            <h2>설문이 완료되었습니다</h2>
            <p>감사합니다.<br>태블릿을 직원에게 돌려주세요.</p>
            <div class="countdown" id="countdown">5초 후 처음으로 돌아갑니다</div>
        </div>
    </div>
    </div>

    <script>
        let currentToken = '';
        let questions = [];
        let answers = {{}};
        let currentIndex = 0;
        let patientName = '';
        let templateName = '';
        let displayMode = 'one_by_one';

        // 템플릿 로드
        async function loadTemplates() {{
            try {{
                const res = await fetch('/api/templates?token=kiosk');
                const data = await res.json();
                const select = document.getElementById('template');

                if (data.templates && data.templates.length > 0) {{
                    data.templates.forEach(t => {{
                        const option = document.createElement('option');
                        option.value = t.id;
                        option.textContent = t.name;
                        option.dataset.questions = JSON.stringify(t.questions);
                        option.dataset.name = t.name;
                        option.dataset.displayMode = t.display_mode || 'one_by_one';
                        select.appendChild(option);
                    }});
                }}
            }} catch (e) {{
                console.error('템플릿 로드 실패:', e);
            }}
        }}

        // 설문 시작
        async function startSurvey() {{
            const templateSelect = document.getElementById('template');
            const templateId = templateSelect.value;
            const nameInput = document.getElementById('patient-name');
            patientName = nameInput.value.trim();

            if (!templateId) {{
                alert('설문을 선택하세요');
                return;
            }}
            if (!patientName) {{
                alert('환자 이름을 입력하세요');
                return;
            }}

            const selectedOption = templateSelect.options[templateSelect.selectedIndex];
            questions = JSON.parse(selectedOption.dataset.questions || '[]');
            templateName = selectedOption.dataset.name;
            displayMode = selectedOption.dataset.displayMode || 'one_by_one';

            if (questions.length === 0) {{
                alert('설문 질문이 없습니다');
                return;
            }}

            // 세션 생성
            try {{
                const res = await fetch('/api/patient/create-session', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{
                        template_id: templateId,
                        respondent_name: patientName
                    }})
                }});

                const data = await res.json();
                if (data.success) {{
                    currentToken = data.token;
                    showScreen('survey');
                    document.getElementById('survey-title').textContent = templateName;
                    document.getElementById('display-patient-name').textContent = patientName + '님';
                    currentIndex = 0;
                    answers = {{}};

                    if (displayMode === 'single_page' || displayMode === 'all_at_once') {{
                        renderAllQuestions();
                        document.getElementById('prev-btn').classList.add('hidden');
                        document.getElementById('next-btn').textContent = '제출하기';
                        document.getElementById('progress-bar').style.width = '100%';
                    }} else {{
                        renderQuestion();
                        updateNavigation();
                    }}
                }} else {{
                    alert(data.error || '세션 생성 실패');
                }}
            }} catch (e) {{
                alert('네트워크 오류가 발생했습니다');
            }}
        }}

        // 화면 전환
        function showScreen(screenName) {{
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(screenName + '-screen').classList.add('active');
        }}

        // 질문 렌더링
        function renderQuestion() {{
            const container = document.getElementById('questions-container');
            const q = questions[currentIndex];
            container.innerHTML = '';

            const div = document.createElement('div');
            div.className = 'question';
            div.innerHTML = `<div class="question-text">Q${{currentIndex + 1}}. ${{q.question_text}} ${{q.required ? '<span class="required">*</span>' : ''}}</div>`;

            if (q.question_type === 'single_choice' && q.options) {{
                const optionsDiv = document.createElement('div');
                optionsDiv.className = 'options';
                q.options.forEach(opt => {{
                    const optDiv = document.createElement('div');
                    optDiv.className = 'option' + (answers[q.id] === opt ? ' selected' : '');
                    optDiv.textContent = opt;
                    optDiv.onclick = () => selectOption(q.id, opt, optDiv);
                    optionsDiv.appendChild(optDiv);
                }});
                div.appendChild(optionsDiv);
            }} else if (q.question_type === 'multiple_choice' && q.options) {{
                const optionsDiv = document.createElement('div');
                optionsDiv.className = 'options';
                q.options.forEach(opt => {{
                    const optDiv = document.createElement('div');
                    const selected = (answers[q.id] || []).includes(opt);
                    optDiv.className = 'option option-multi' + (selected ? ' selected' : '');
                    optDiv.textContent = opt;
                    optDiv.onclick = () => selectMultiOption(q.id, opt, optDiv);
                    optionsDiv.appendChild(optDiv);
                }});
                div.appendChild(optionsDiv);
            }} else if (q.question_type === 'text') {{
                const textarea = document.createElement('textarea');
                textarea.placeholder = '답변을 입력하세요';
                textarea.value = answers[q.id] || '';
                textarea.oninput = (e) => {{ answers[q.id] = e.target.value; }};
                div.appendChild(textarea);
            }} else if (q.question_type === 'scale' && q.scale_config) {{
                const scaleDiv = document.createElement('div');
                scaleDiv.className = 'scale-container';
                for (let i = q.scale_config.min; i <= q.scale_config.max; i++) {{
                    const btn = document.createElement('div');
                    btn.className = 'scale-btn' + (answers[q.id] === i ? ' selected' : '');
                    btn.textContent = i;
                    btn.onclick = () => selectScale(q.id, i, scaleDiv);
                    scaleDiv.appendChild(btn);
                }}
                div.appendChild(scaleDiv);
                if (q.scale_config.minLabel || q.scale_config.maxLabel) {{
                    const labels = document.createElement('div');
                    labels.className = 'scale-labels';
                    labels.innerHTML = `<span>${{q.scale_config.minLabel || ''}}</span><span>${{q.scale_config.maxLabel || ''}}</span>`;
                    div.appendChild(labels);
                }}
            }}

            container.appendChild(div);
        }}

        // 모든 질문을 한 화면에 렌더링 (single_page / all_at_once 모드)
        function renderAllQuestions() {{
            const container = document.getElementById('questions-container');
            container.innerHTML = '';

            questions.forEach((q, idx) => {{
                const div = document.createElement('div');
                div.className = 'question';
                div.innerHTML = `<div class="question-text">Q${{idx + 1}}. ${{q.question_text}} ${{q.required ? '<span class="required">*</span>' : ''}}</div>`;

                if (q.question_type === 'single_choice' && q.options) {{
                    const optionsDiv = document.createElement('div');
                    optionsDiv.className = 'options';
                    q.options.forEach(opt => {{
                        const optDiv = document.createElement('div');
                        optDiv.className = 'option' + (answers[q.id] === opt ? ' selected' : '');
                        optDiv.textContent = opt;
                        optDiv.onclick = () => {{
                            answers[q.id] = opt;
                            optDiv.parentElement.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
                            optDiv.classList.add('selected');
                        }};
                        optionsDiv.appendChild(optDiv);
                    }});
                    div.appendChild(optionsDiv);
                }} else if (q.question_type === 'multiple_choice' && q.options) {{
                    const optionsDiv = document.createElement('div');
                    optionsDiv.className = 'options';
                    q.options.forEach(opt => {{
                        const optDiv = document.createElement('div');
                        const selected = (answers[q.id] || []).includes(opt);
                        optDiv.className = 'option option-multi' + (selected ? ' selected' : '');
                        optDiv.textContent = opt;
                        optDiv.onclick = () => {{
                            if (!answers[q.id]) answers[q.id] = [];
                            const i = answers[q.id].indexOf(opt);
                            if (i >= 0) {{
                                answers[q.id].splice(i, 1);
                                optDiv.classList.remove('selected');
                            }} else {{
                                answers[q.id].push(opt);
                                optDiv.classList.add('selected');
                            }}
                        }};
                        optionsDiv.appendChild(optDiv);
                    }});
                    div.appendChild(optionsDiv);
                }} else if (q.question_type === 'text') {{
                    const textarea = document.createElement('textarea');
                    textarea.placeholder = '답변을 입력하세요';
                    textarea.value = answers[q.id] || '';
                    textarea.oninput = (e) => {{ answers[q.id] = e.target.value; }};
                    div.appendChild(textarea);
                }} else if (q.question_type === 'scale' && q.scale_config) {{
                    const scaleDiv = document.createElement('div');
                    scaleDiv.className = 'scale-container';
                    for (let i = q.scale_config.min; i <= q.scale_config.max; i++) {{
                        const btn = document.createElement('div');
                        btn.className = 'scale-btn' + (answers[q.id] === i ? ' selected' : '');
                        btn.textContent = i;
                        btn.onclick = () => {{
                            answers[q.id] = i;
                            scaleDiv.querySelectorAll('.scale-btn').forEach(el => el.classList.remove('selected'));
                            btn.classList.add('selected');
                        }};
                        scaleDiv.appendChild(btn);
                    }}
                    div.appendChild(scaleDiv);
                    if (q.scale_config.minLabel || q.scale_config.maxLabel) {{
                        const labels = document.createElement('div');
                        labels.className = 'scale-labels';
                        labels.innerHTML = `<span>${{q.scale_config.minLabel || ''}}</span><span>${{q.scale_config.maxLabel || ''}}</span>`;
                        div.appendChild(labels);
                    }}
                }}

                container.appendChild(div);
            }});
        }}

        function selectOption(qId, value, element) {{
            answers[qId] = value;
            element.parentElement.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
        }}

        function selectMultiOption(qId, value, element) {{
            if (!answers[qId]) answers[qId] = [];
            const idx = answers[qId].indexOf(value);
            if (idx >= 0) {{
                answers[qId].splice(idx, 1);
                element.classList.remove('selected');
            }} else {{
                answers[qId].push(value);
                element.classList.add('selected');
            }}
        }}

        function selectScale(qId, value, container) {{
            answers[qId] = value;
            container.querySelectorAll('.scale-btn').forEach(el => el.classList.remove('selected'));
            event.target.classList.add('selected');
        }}

        function updateNavigation() {{
            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');
            const progressBar = document.getElementById('progress-bar');

            prevBtn.classList.toggle('hidden', currentIndex === 0);
            nextBtn.textContent = currentIndex === questions.length - 1 ? '제출하기' : '다음';
            progressBar.style.width = ((currentIndex + 1) / questions.length * 100) + '%';
        }}

        function prevQuestion() {{
            if (currentIndex > 0) {{
                currentIndex--;
                renderQuestion();
                updateNavigation();
            }}
        }}

        function nextQuestion() {{
            // single_page/all_at_once 모드에서는 바로 제출
            if (displayMode === 'single_page' || displayMode === 'all_at_once') {{
                submitSurvey();
                return;
            }}

            if (currentIndex < questions.length - 1) {{
                currentIndex++;
                renderQuestion();
                updateNavigation();
            }} else {{
                submitSurvey();
            }}
        }}

        async function submitSurvey() {{
            // 필수 질문 확인
            for (const q of questions) {{
                if (q.required) {{
                    const ans = answers[q.id];
                    if (ans === undefined || ans === '' || (Array.isArray(ans) && ans.length === 0)) {{
                        alert(`"${{q.question_text}}" 질문에 답변해주세요.`);
                        return;
                    }}
                }}
            }}

            const answerArray = Object.entries(answers).map(([question_id, answer]) => ({{ question_id, answer }}));

            try {{
                const res = await fetch('/api/survey/' + currentToken, {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ answers: answerArray }})
                }});

                if (res.ok) {{
                    showComplete();
                }} else {{
                    const data = await res.json();
                    alert(data.error || '제출에 실패했습니다.');
                }}
            }} catch (e) {{
                alert('네트워크 오류가 발생했습니다.');
            }}
        }}

        function showComplete() {{
            showScreen('complete');

            let count = 5;
            const countdownEl = document.getElementById('countdown');

            const timer = setInterval(() => {{
                count--;
                countdownEl.textContent = count + '초 후 처음으로 돌아갑니다';

                if (count <= 0) {{
                    clearInterval(timer);
                    resetToWaiting();
                }}
            }}, 1000);
        }}

        function resetToWaiting() {{
            // 초기화
            document.getElementById('patient-name').value = '';
            document.getElementById('template').selectedIndex = 0;
            currentToken = '';
            questions = [];
            answers = {{}};
            currentIndex = 0;
            patientName = '';
            displayMode = 'one_by_one';

            showScreen('waiting');
        }}

        // 초기화
        loadTemplates();
    </script>
</body>
</html>"#, clinic_name, clinic_name)
}

