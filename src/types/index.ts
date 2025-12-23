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
  birth_date?: string;
  gender?: 'M' | 'F';
  phone?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 약재 항목
export interface HerbItem {
  herb_name: string;
  amount: number;
  unit: string;
}

// 처방
export interface Prescription {
  id: string;
  patient_id: string;
  prescription_name: string;
  herbs: HerbItem[];
  dosage_instructions?: string;
  total_days: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 차팅 기록
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

// 설문 질문 유형
export type QuestionType = 'text' | 'single_choice' | 'multiple_choice' | 'scale' | 'yes_no';

// 설문 질문
export interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  required: boolean;
}

// 설문 템플릿
export interface SurveyTemplate {
  id: string;
  name: string;
  description?: string;
  questions: SurveyQuestion[];
  created_at: string;
  updated_at: string;
}

// 설문 응답
export interface SurveyResponse {
  id: string;
  patient_id: string;
  template_id: string;
  answers: { question_id: string; answer: string }[];
  submitted_at: string;
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

// 인증 상태
export interface AuthState {
  is_authenticated: boolean;
  user_email?: string;
  subscription?: Subscription;
  last_verified?: string;
}
