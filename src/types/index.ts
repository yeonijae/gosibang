// 한의원 설정
export interface ClinicSettings {
  id: string;
  clinic_name: string;
  clinic_address?: string;
  clinic_phone?: string;
  doctor_name?: string;
  license_number?: string;
  created_at: string;
  updated_at: string;
}

// 환자 정보
export interface Patient {
  id: string;
  name: string;
  chart_number?: string;
  birth_date?: string;
  gender?: 'M' | 'F';
  phone?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ===== 약재 관련 타입 =====

// 약재 (개별 재료)
export interface Herb {
  id: number;
  name: string;
  default_dosage?: number;
  unit?: string;
  description?: string;
  created_at?: string;
}

// 처방 템플릿의 약재 구성
export interface PrescriptionHerb {
  herb_id: number;
  herb_name: string;
  dosage: number;
  unit: string;
}

// 처방 템플릿 (기본 처방 - 예: 소시호탕, 반하사심탕)
export interface PrescriptionTemplate {
  id: number;
  name: string;
  alias?: string;
  herbs: PrescriptionHerb[];
  description?: string;
  created_at?: string;
  updated_at?: string;
}

// 처방정의 노트 (공부 메모)
export interface PrescriptionNote {
  id: number;
  prescription_definition_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

// 최종 약재 (조정 후)
export interface FinalHerb {
  herb_id: number;
  name: string;
  amount: number;
}

// ===== 처방전 타입 =====

// 처방전 (실제 환자에게 발급하는 처방)
export interface Prescription {
  id: string;
  patient_id?: string;
  patient_name?: string;
  prescription_name?: string;
  chart_number?: string;
  patient_age?: number;
  patient_gender?: string;
  source_type?: 'initial_chart' | 'progress_note';
  source_id?: string;
  formula: string;
  merged_herbs: PrescriptionHerb[];
  final_herbs: FinalHerb[];
  total_doses: number;
  days: number;
  doses_per_day: number;
  total_packs: number;
  pack_volume?: number;
  water_amount?: number;
  herb_adjustment?: string;
  total_dosage: number;
  final_total_amount: number;
  notes?: string;
  status: 'draft' | 'issued' | 'completed';
  issued_at?: string;
  chief_complaint?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ===== 차트 타입 =====

// 초진차트
export interface InitialChart {
  id: string;
  patient_id: string;
  doctor_name?: string;
  chart_date: string;
  chief_complaint?: string;
  present_illness?: string;
  past_medical_history?: string;
  notes?: string;
  prescription_issued?: boolean;
  prescription_issued_at?: string;
  created_at: string;
  updated_at: string;
}

// 경과기록 (SOAP)
export interface ProgressNote {
  id: string;
  patient_id: string;
  doctor_name?: string;
  note_date: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  follow_up_plan?: string;
  notes?: string;
  prescription_issued?: boolean;
  prescription_issued_at?: string;
  created_at: string;
  updated_at: string;
}

// 차트 기록 (레거시 호환용)
export interface ChartRecord {
  id: string;
  patient_id: string;
  visit_date: string;
  chief_complaint?: string;
  symptoms?: string;
  diagnosis?: string;
  treatment?: string;
  prescription_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 경과 엔트리 (UI용 - haniwon 스타일)
export interface ProgressEntry {
  id: string;
  entry_date: string;
  treatment: string;      // 경과/진료 (objective 컬럼)
  diagnosis: string;      // 진단 (assessment 컬럼)
  prescription: string;   // 처방 (plan 컬럼)
  prescription_issued: boolean;
  prescription_issued_at?: string;
  created_at: string;
}

// 설문 질문 유형
export type QuestionType = 'text' | 'single_choice' | 'multiple_choice' | 'scale';

// 척도 설정
export interface ScaleConfig {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

// 설문 질문
export interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  scale_config?: ScaleConfig;
  required: boolean;
  order: number;
}

// 설문 표시 모드
export type SurveyDisplayMode = 'one_by_one' | 'single_page';

// 설문 템플릿
export interface SurveyTemplate {
  id: string;
  name: string;
  description?: string;
  questions: SurveyQuestion[];
  display_mode: SurveyDisplayMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 설문 세션 (링크용)
export interface SurveySession {
  id: string;
  token: string;
  patient_id?: string;
  template_id: string;
  respondent_name?: string;
  status: 'pending' | 'completed' | 'expired';
  expires_at: string;
  completed_at?: string;
  created_by?: string;
  created_at: string;
  // 조인 데이터
  patient_name?: string;
  template_name?: string;
}

// 설문 응답 답변
export interface SurveyAnswer {
  question_id: string;
  answer: string | string[] | number;
}

// 설문 응답
export interface SurveyResponse {
  id: string;
  session_id?: string;
  patient_id?: string;
  template_id: string;
  respondent_name?: string;
  answers: SurveyAnswer[];
  submitted_at: string;
  // 조인 데이터
  patient_name?: string;
  template_name?: string;
}

// 복약 상태
export type MedicationStatus = 'taken' | 'missed' | 'skipped';

// 복약 일정
export interface MedicationSchedule {
  id: string;
  patient_id: string;
  prescription_id: string;
  start_date: string;
  end_date: string;
  times_per_day: number;
  medication_times: string[];
  notes?: string;
  created_at: string;
}

// 구독 상태
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';

// 구독 정보
export interface Subscription {
  user_id: string;
  plan: string;
  status: SubscriptionStatus;
  expires_at: string;
}

// 사용자 정보
export interface UserInfo {
  id: string;
  email?: string;
}

// 인증 상태
export interface AuthState {
  is_authenticated: boolean;
  user?: UserInfo;
  user_email?: string;
  subscription?: Subscription;
  last_verified?: string;
}

// 사용자 세션 (동시 접속 제한용)
export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  device_name: string;
  last_active_at: string;
  created_at: string;
  is_current?: boolean;
}

// ===== 기능 권한 타입 =====

// 기능 키 (메뉴와 매핑)
export type FeatureKey =
  | 'dashboard'
  | 'patients'
  | 'prescriptions'
  | 'prescription_definitions'
  | 'prescription_definitions_edit'
  | 'charts'
  | 'survey_templates'
  | 'survey_responses'
  | 'medication'
  | 'homework'
  | 'staff_accounts';

// 플랜별 기능 권한
export interface PlanFeatures {
  dashboard: boolean;
  patients: boolean;
  prescriptions: boolean;
  prescription_definitions: boolean;
  prescription_definitions_edit: boolean;  // 처방정의 추가/삭제 권한
  charts: boolean;
  survey_templates: boolean;
  survey_responses: boolean;
  medication: boolean;
  survey_internal: boolean;   // 내부 설문 (태블릿/인트라넷)
  survey_external: boolean;   // 외부 설문 (온라인 링크)
  homework: boolean;          // 숙제 기능 (챌린저 플랜)
  staff_accounts: boolean;    // 내부계정 (웹 클라이언트용 직원 계정 관리)
  backup?: boolean;
  export?: boolean;
  multiUser?: boolean;
}

// 메뉴 아이템 메타 정보
export interface MenuItemMeta {
  key: FeatureKey;
  label: string;
  icon: string;
  path: string;
}

// 플랜 표시 설정 (gosibang-admin에서 제어)
export interface DisplayConfig {
  show_price: boolean;
  show_patient_limit: boolean;
  show_prescription_limit: boolean;
  show_chart_limit: boolean;
}

// ===== 복약관리 타입 =====

// 복약관리 상태
export type MedicationManagementStatus = 'pending' | 'contacted' | 'completed' | 'postponed';

// 복약관리
export interface MedicationManagement {
  id: string;
  prescription_id: string;
  patient_id: string;
  patient_name: string;
  prescription_name: string;

  // 처방 정보
  prescription_date: string;
  days: number;

  // 복약관리 설정
  delivery_days: number;
  start_date: string;
  end_date: string;
  happy_call_date: string;

  // 상태
  status: MedicationManagementStatus;
  postponed_to?: string;
  postpone_count: number;

  // 기록
  notes?: string;
  contacted_at?: string;

  created_at: string;
  updated_at: string;
}

// ===== 공지사항 타입 =====

// 공지사항 타입
export type AnnouncementType = 'info' | 'warning' | 'update' | 'maintenance';

// 공지사항
export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  is_pinned: boolean;
  is_active: boolean;
  starts_at: string;
  ends_at?: string;
  created_at: string;
}

// ===== 숙제 타입 =====

// 플랜 타입
export type PlanType = 'beginner' | 'challenger' | 'master';

// 과제 유형
export type AssignmentType = 'common' | 'individual';

// 숙제
export interface Homework {
  id: string;
  title: string;
  description?: string;
  attachment_url?: string;
  attachment_name?: string;
  due_date: string;
  is_active: boolean;
  assignment_type?: AssignmentType;
  target_plan?: PlanType;
  target_plans?: PlanType[];
  created_by?: string;
  created_at: string;
  updated_at: string;
  // 개별과제인 경우 할당된 내용
  individual_content?: string;
}

// 개별과제 할당
export interface HomeworkAssignment {
  id: string;
  homework_id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  content: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

// 숙제 제출 상태
export type HomeworkSubmissionStatus = 'submitted' | 'reviewed';

// 숙제 제출
export interface HomeworkSubmission {
  id: string;
  homework_id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  answer: string;
  status: HomeworkSubmissionStatus;
  feedback?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  submitted_at: string;
  updated_at: string;
  // 조인 데이터
  homework_title?: string;
}

// ===== 내부계정 타입 =====

// 직원 권한 (웹 클라이언트 접근 권한)
export interface StaffPermissions {
  patients_read: boolean;     // 환자 조회
  patients_write: boolean;    // 환자 수정
  prescriptions_read: boolean;   // 처방 조회
  prescriptions_write: boolean;  // 처방 수정
  charts_read: boolean;       // 차트 조회
  charts_write: boolean;      // 차트 수정
  survey_read: boolean;       // 설문 조회
  survey_write: boolean;      // 설문 수정
  settings_read: boolean;     // 설정 조회 (읽기전용)
}

// 기본 권한 프리셋
export type StaffRole = 'admin' | 'staff' | 'viewer';

// 내부 직원 계정
export interface StaffAccount {
  id: string;
  username: string;
  display_name: string;
  role: StaffRole;
  permissions: StaffPermissions;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}
