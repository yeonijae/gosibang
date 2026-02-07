use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 한의원 설정 정보
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClinicSettings {
    pub id: String,
    pub clinic_name: String,           // 한의원 이름
    pub clinic_address: Option<String>, // 주소
    pub clinic_phone: Option<String>,   // 전화번호
    pub doctor_name: Option<String>,    // 원장님 성함
    pub license_number: Option<String>, // 면허번호
    pub created_at: DateTime<Utc>,
    #[allow(dead_code)]
    pub updated_at: DateTime<Utc>,
}

impl Default for ClinicSettings {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            clinic_name: String::new(),
            clinic_address: None,
            clinic_phone: None,
            doctor_name: None,
            license_number: None,
            created_at: now,
            updated_at: now,
        }
    }
}

/// 환자 정보
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Patient {
    pub id: String,
    pub name: String,
    pub chart_number: Option<String>,    // 차트번호
    pub birth_date: Option<String>,      // YYYY-MM-DD
    pub gender: Option<String>,          // M/F
    pub phone: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,           // 특이사항
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Patient {
    #[allow(dead_code)]
    pub fn new(name: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            chart_number: None,
            birth_date: None,
            gender: None,
            phone: None,
            address: None,
            notes: None,
            created_at: now,
            updated_at: now,
        }
    }
}

/// 한약 처방
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prescription {
    pub id: String,
    pub patient_id: String,
    pub prescription_name: String,       // 처방명 (예: 보중익기탕)
    pub herbs: Vec<HerbItem>,            // 약재 구성
    pub dosage_instructions: Option<String>, // 복용 방법
    pub total_days: i32,                 // 총 복용 일수
    pub notes: Option<String>,           // 처방 메모
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 약재 항목
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HerbItem {
    pub herb_name: String,   // 약재명
    pub amount: f64,         // 용량 (g)
    pub unit: String,        // 단위 (g, 돈 등)
}

/// 차팅 기록
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartRecord {
    pub id: String,
    pub patient_id: String,
    pub visit_date: DateTime<Utc>,
    pub chief_complaint: Option<String>,  // 주소증
    pub symptoms: Option<String>,         // 증상
    pub diagnosis: Option<String>,        // 진단
    pub treatment: Option<String>,        // 치료 내용
    pub prescription_id: Option<String>,  // 연결된 처방 ID
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 초진차트
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitialChart {
    pub id: String,
    pub patient_id: String,
    pub doctor_name: Option<String>,
    pub chart_date: String,               // 차트 날짜 (YYYY-MM-DD)
    pub chief_complaint: Option<String>,  // 주소증
    pub present_illness: Option<String>,  // 현병력
    pub past_medical_history: Option<String>, // 과거력
    pub notes: Option<String>,            // 차트 전체 내용 ([주소증], [복진], [설진], etc.)
    pub prescription_issued: bool,        // 처방 발급 여부
    pub prescription_issued_at: Option<String>,
    pub deleted_at: Option<String>,       // 소프트 삭제
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl InitialChart {
    pub fn new(patient_id: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            patient_id,
            doctor_name: None,
            chart_date: now.format("%Y-%m-%d").to_string(),
            chief_complaint: None,
            present_illness: None,
            past_medical_history: None,
            notes: None,
            prescription_issued: false,
            prescription_issued_at: None,
            deleted_at: None,
            created_at: now,
            updated_at: now,
        }
    }
}

/// 경과기록 (Progress Note / SOAP)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressNote {
    pub id: String,
    pub patient_id: String,
    pub doctor_name: Option<String>,
    pub note_date: String,                // 경과 날짜 (YYYY-MM-DD)
    pub subjective: Option<String>,       // S: 주관적 증상
    pub objective: Option<String>,        // O: 객관적 소견 (경과/진료)
    pub assessment: Option<String>,       // A: 진단 (복진/설진/맥진/혈색)
    pub plan: Option<String>,             // P: 치료 계획 (처방)
    pub follow_up_plan: Option<String>,   // 추후 계획
    pub notes: Option<String>,            // 기타 메모
    pub prescription_issued: bool,        // 처방 발급 여부
    pub prescription_issued_at: Option<String>,
    pub deleted_at: Option<String>,       // 소프트 삭제
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ProgressNote {
    pub fn new(patient_id: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            patient_id,
            doctor_name: None,
            note_date: now.format("%Y-%m-%d").to_string(),
            subjective: None,
            objective: None,
            assessment: None,
            plan: None,
            follow_up_plan: None,
            notes: None,
            prescription_issued: false,
            prescription_issued_at: None,
            deleted_at: None,
            created_at: now,
            updated_at: now,
        }
    }
}

/// 설문지 템플릿
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyTemplate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub questions: Vec<SurveyQuestion>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 설문 질문
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyQuestion {
    pub id: String,
    pub question_text: String,
    pub question_type: QuestionType,
    pub options: Option<Vec<String>>,  // 선택형 질문의 옵션들
    pub scale_config: Option<ScaleConfig>,  // 척도형 질문 설정
    pub required: bool,
}

/// 척도형 질문 설정
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScaleConfig {
    pub min: i32,
    pub max: i32,
    #[serde(rename = "minLabel")]
    pub min_label: Option<String>,
    #[serde(rename = "maxLabel")]
    pub max_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    Text,           // 텍스트 입력
    SingleChoice,   // 단일 선택
    MultipleChoice, // 복수 선택
    Scale,          // 척도 (1-10 등)
    YesNo,          // 예/아니오
}

/// 설문 세션 (온라인 설문용)
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveySession {
    pub id: String,
    pub token: String,              // 접속용 토큰
    pub template_id: String,
    pub patient_id: Option<String>, // 환자 연결 (선택)
    pub respondent_name: Option<String>, // 응답자 이름 (환자 미등록시)
    pub status: SessionStatus,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Pending,    // 대기 중
    Completed,  // 완료
    Expired,    // 만료
}

impl SurveySession {
    #[allow(dead_code)]
    pub fn new(template_id: String, patient_id: Option<String>, respondent_name: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            token: generate_token(),
            template_id,
            patient_id,
            respondent_name,
            status: SessionStatus::Pending,
            expires_at: now + chrono::Duration::hours(24),
            created_at: now,
        }
    }
}

#[allow(dead_code)]
fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..8)
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

/// 환자 설문 응답
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyResponse {
    pub id: String,
    pub session_id: Option<String>,
    pub patient_id: Option<String>,
    pub template_id: String,
    pub respondent_name: Option<String>,
    pub answers: Vec<SurveyAnswer>,
    pub submitted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyAnswer {
    pub question_id: String,
    pub answer: serde_json::Value, // 다양한 타입 지원
}

/// 복약 관리
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedicationSchedule {
    pub id: String,
    pub patient_id: String,
    pub prescription_id: String,
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
    pub times_per_day: i32,             // 하루 복용 횟수
    pub medication_times: Vec<String>,   // 복용 시간 (예: ["08:00", "12:00", "18:00"])
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// 복약 기록
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedicationLog {
    pub id: String,
    pub schedule_id: String,
    pub taken_at: DateTime<Utc>,
    pub status: MedicationStatus,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MedicationStatus {
    Taken,      // 복용함
    Missed,     // 미복용
    Skipped,    // 건너뜀
}

/// 복약 통계
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedicationStats {
    pub patient_id: String,
    pub total_schedules: i32,
    pub active_schedules: i32,
    pub total_logs: i32,
    pub taken_count: i32,
    pub missed_count: i32,
    pub skipped_count: i32,
    pub compliance_rate: f64,  // 복약 순응률 (%)
}

/// 구독 정보 (Supabase에서 가져옴)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub user_id: String,
    pub plan: String,
    pub status: SubscriptionStatus,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Active,
    Expired,
    Cancelled,
    Trial,
}

/// 로컬 인증 상태
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub is_authenticated: bool,
    pub user_email: Option<String>,
    pub subscription: Option<Subscription>,
    pub last_verified: Option<DateTime<Utc>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            is_authenticated: false,
            user_email: None,
            subscription: None,
            last_verified: None,
        }
    }
}

// ============ 내부계정 (웹 클라이언트용) ============

/// 직원 권한
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StaffPermissions {
    pub patients_read: bool,
    pub patients_write: bool,
    pub prescriptions_read: bool,
    pub prescriptions_write: bool,
    pub charts_read: bool,
    pub charts_write: bool,
    pub survey_read: bool,
    pub survey_write: bool,
    pub settings_read: bool,
    #[serde(default)]
    pub medications_read: bool,
    #[serde(default)]
    pub medications_write: bool,
}

impl StaffPermissions {
    /// 관리자 권한 (모든 권한)
    pub fn admin() -> Self {
        Self {
            patients_read: true,
            patients_write: true,
            prescriptions_read: true,
            prescriptions_write: true,
            charts_read: true,
            charts_write: true,
            survey_read: true,
            survey_write: true,
            settings_read: true,
            medications_read: true,
            medications_write: true,
        }
    }

    /// 직원 권한 (읽기/쓰기, 설정 제외)
    pub fn staff() -> Self {
        Self {
            patients_read: true,
            patients_write: true,
            prescriptions_read: true,
            prescriptions_write: true,
            charts_read: true,
            charts_write: true,
            survey_read: true,
            survey_write: true,
            settings_read: false,
            medications_read: true,
            medications_write: true,
        }
    }

    /// 열람자 권한 (읽기만)
    pub fn viewer() -> Self {
        Self {
            patients_read: true,
            patients_write: false,
            prescriptions_read: true,
            prescriptions_write: false,
            charts_read: true,
            charts_write: false,
            survey_read: true,
            survey_write: false,
            settings_read: false,
            medications_read: true,
            medications_write: false,
        }
    }
}

/// 직원 역할
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StaffRole {
    Admin,   // 관리자 (모든 권한)
    Staff,   // 직원 (읽기/쓰기)
    Viewer,  // 열람자 (읽기만)
}

impl Default for StaffRole {
    fn default() -> Self {
        StaffRole::Viewer
    }
}

impl StaffRole {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "admin" => StaffRole::Admin,
            "staff" => StaffRole::Staff,
            _ => StaffRole::Viewer,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            StaffRole::Admin => "admin",
            StaffRole::Staff => "staff",
            StaffRole::Viewer => "viewer",
        }
    }
}

/// 내부 직원 계정
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaffAccount {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub password_hash: String,
    pub role: StaffRole,
    pub permissions: StaffPermissions,
    pub is_active: bool,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl StaffAccount {
    pub fn new(username: String, display_name: String, password_hash: String, role: StaffRole) -> Self {
        let permissions = match role {
            StaffRole::Admin => StaffPermissions::admin(),
            StaffRole::Staff => StaffPermissions::staff(),
            StaffRole::Viewer => StaffPermissions::viewer(),
        };

        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            username,
            display_name,
            password_hash,
            role,
            permissions,
            is_active: true,
            last_login_at: None,
            created_at: now,
            updated_at: now,
        }
    }
}

/// 프론트엔드에 전달할 계정 정보 (비밀번호 해시 제외)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaffAccountInfo {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub role: StaffRole,
    pub permissions: StaffPermissions,
    pub is_active: bool,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<StaffAccount> for StaffAccountInfo {
    fn from(account: StaffAccount) -> Self {
        Self {
            id: account.id,
            username: account.username,
            display_name: account.display_name,
            role: account.role,
            permissions: account.permissions,
            is_active: account.is_active,
            last_login_at: account.last_login_at,
            created_at: account.created_at,
            updated_at: account.updated_at,
        }
    }
}

// ============ 알림 시스템 ============

/// 알림 설정 (전역 또는 복약 일정별)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettings {
    pub id: String,
    pub schedule_id: Option<String>,              // None = 전역 설정
    pub enabled: bool,
    pub pre_reminder_minutes: i32,                // 복약 시간 전 알림 (분)
    pub missed_reminder_enabled: bool,            // 복약 누락 알림 활성화
    pub missed_reminder_delay_minutes: i32,       // 복약 누락 판정 시간 (분)
    pub daily_summary_enabled: bool,              // 일일 요약 알림 활성화
    pub daily_summary_time: String,               // HH:mm 형식
    pub sound_enabled: bool,                      // 소리 알림 활성화
    pub sound_preset: String,                     // default, gentle, urgent
    pub do_not_disturb_start: Option<String>,     // 방해금지 시작 (HH:mm)
    pub do_not_disturb_end: Option<String>,       // 방해금지 종료 (HH:mm)
    pub created_at: String,
    pub updated_at: String,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            schedule_id: None,
            enabled: true,
            pre_reminder_minutes: 5,
            missed_reminder_enabled: true,
            missed_reminder_delay_minutes: 30,
            daily_summary_enabled: false,
            daily_summary_time: "09:00".to_string(),
            sound_enabled: true,
            sound_preset: "default".to_string(),
            do_not_disturb_start: None,
            do_not_disturb_end: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// 알림 유형
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationType {
    MedicationReminder,   // 복약 알림
    MissedMedication,     // 복약 누락 알림
    DailySummary,         // 일일 요약
}

impl NotificationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            NotificationType::MedicationReminder => "medication_reminder",
            NotificationType::MissedMedication => "missed_medication",
            NotificationType::DailySummary => "daily_summary",
        }
    }

    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "medication_reminder" => NotificationType::MedicationReminder,
            "missed_medication" => NotificationType::MissedMedication,
            "daily_summary" => NotificationType::DailySummary,
            _ => NotificationType::MedicationReminder,
        }
    }
}

/// 알림 우선순위
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationPriority {
    Low,
    Normal,
    High,
    Critical,
}

impl NotificationPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            NotificationPriority::Low => "low",
            NotificationPriority::Normal => "normal",
            NotificationPriority::High => "high",
            NotificationPriority::Critical => "critical",
        }
    }

    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "low" => NotificationPriority::Low,
            "normal" => NotificationPriority::Normal,
            "high" => NotificationPriority::High,
            "critical" => NotificationPriority::Critical,
            _ => NotificationPriority::Normal,
        }
    }
}

/// 알림 기록
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub notification_type: String,  // medication_reminder, missed_medication, daily_summary
    pub title: String,
    pub body: String,
    pub priority: String,           // low, normal, high, critical
    pub schedule_id: Option<String>,
    pub patient_id: Option<String>,
    pub is_read: bool,
    pub is_dismissed: bool,
    pub action_url: Option<String>,
    pub created_at: String,
    pub read_at: Option<String>,
}

impl Notification {
    pub fn new(
        notification_type: NotificationType,
        title: String,
        body: String,
        priority: NotificationPriority,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            notification_type: notification_type.as_str().to_string(),
            title,
            body,
            priority: priority.as_str().to_string(),
            schedule_id: None,
            patient_id: None,
            is_read: false,
            is_dismissed: false,
            action_url: None,
            created_at: Utc::now().to_rfc3339(),
            read_at: None,
        }
    }
}
