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
    pub birth_date: Option<String>,      // YYYY-MM-DD
    pub gender: Option<String>,          // M/F
    pub phone: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,           // 특이사항
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Patient {
    pub fn new(name: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
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

/// 설문지 템플릿
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
    pub required: bool,
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

/// 환자 설문 응답
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyResponse {
    pub id: String,
    pub patient_id: String,
    pub template_id: String,
    pub answers: Vec<SurveyAnswer>,
    pub submitted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyAnswer {
    pub question_id: String,
    pub answer: String,
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
