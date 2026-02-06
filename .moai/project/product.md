# 고시방 (Gosibang) - 한약처방관리시스템

## 프로젝트 개요

**프로젝트명**: Gosibang (고시방)
**버전**: 0.2.3
**식별자**: com.gosibang.app
**유형**: 한의원 전자의무기록(EMR) 및 처방 관리 시스템

고시방은 한의원을 위한 종합 한약처방관리시스템입니다. 환자 관리부터 진료 차트 작성, 처방전 발급, 설문 조사, 복약 추적까지 한의원 운영에 필요한 모든 기능을 제공합니다. 데스크톱 애플리케이션과 웹 클라이언트를 모두 지원하는 하이브리드 아키텍처로, 오프라인 환경에서도 안정적으로 작동합니다.

---

## 대상 사용자

### 주요 사용자

| 사용자 유형 | 역할 | 주요 활용 기능 |
|------------|------|---------------|
| 한의사 (원장) | 진료 및 처방 | 환자 차트 작성, 한약 처방, 진료 기록, 구독 관리 |
| 한의원 직원 | 행정 업무 | 환자 등록, 설문 관리, 복약 안내, 데이터 입력 |
| 열람자 | 조회 전용 | 환자 정보 조회, 설문 응답 확인 |

### 사용 환경

- **데스크톱 앱**: Windows 환경의 한의원 진료실 (Tauri 기반)
- **웹 클라이언트**: 브라우저를 통한 직원용 대시보드 접근 (내장 HTTP 서버)
- **키오스크/태블릿**: 대기실 환자 설문 입력용

---

## 핵심 기능 (10개)

### 1. 환자 관리 (Patients)

환자 정보의 체계적인 관리를 지원합니다.

**기능 목록**:
- 환자 등록 및 기본 정보 관리 (이름, 생년월일, 성별, 연락처, 주소)
- 차트번호 자동/수동 부여
- 환자 검색 및 필터링
- 진료 이력 조회
- 환자별 메모 관리

**데이터 필드**:
- 환자 ID (UUID)
- 차트번호 (선택적)
- 기본 인적사항 (이름, 생년월일, 성별, 연락처, 주소)
- 생성/수정 타임스탬프

### 2. 한약 처방 관리 (Prescriptions)

한약 처방의 전 과정을 디지털화합니다.

**기능 목록**:
- 약재 라이브러리 관리 (약재명, 기본 용량, 단위)
- 처방 템플릿 관리 (예: 소시호탕, 반하사심탕)
- 처방 카테고리 분류
- 처방 구성 약재 조합
- 용량 조절 및 가감
- 처방전 발급 (초진/경과기록 연동)
- 처방 상태 관리 (초안, 발급됨, 완료)

**처방 정보**:
- 기본 처방 선택 (formula)
- 약재 병합 및 최종 약재 목록 (merged_herbs, final_herbs)
- 복용일수, 1일 복용횟수 (days, doses_per_day)
- 총 첩수, 팩당 용량 (total_packs, pack_volume)
- 가감 내용 기록 (herb_adjustment)

### 3. 진료 차트 관리 (Charts)

초진 및 경과 기록을 체계적으로 관리합니다.

**초진차트 (Initial Chart)**:
- 담당 한의사
- 주소 (Chief Complaint)
- 현병력 (Present Illness)
- 과거력 (Past Medical History)
- 진료 메모
- 처방 발급 연동

**경과기록 (Progress Note) - SOAP 형식**:
- Subjective: 주관적 증상
- Objective: 객관적 소견
- Assessment: 평가/진단
- Plan: 치료 계획
- 추적관찰 계획 (Follow-up Plan)

### 4. 설문 시스템 (Survey)

환자 설문 수집을 위한 다양한 방법을 제공합니다.

**설문 질문 유형**:
- 텍스트 입력 (text)
- 단일 선택 (single_choice)
- 복수 선택 (multiple_choice)
- 척도 평가 (scale) - 최소/최대값, 라벨 설정

**설문 표시 모드**:
- 한 문항씩 표시 (one_by_one)
- 단일 페이지 표시 (single_page)

**배포 방식**:
- QR 코드 생성
- 키오스크 모드 (태블릿용)
- 외부 링크 공유

**설문 세션 관리**:
- 토큰 기반 접근
- 만료 시간 설정
- 응답 상태 추적 (pending, completed, expired)

### 5. 복약 추적 (Medications)

처방 후 복약 관리를 지원합니다.

**기능 목록**:
- 복약 일정 생성
- 복약 시간 설정
- 해피콜(Happy Call) 날짜 관리
- 복약 상태 추적 (taken, missed, skipped)
- 연락 기록 관리
- 연기 처리 및 횟수 추적

**복약관리 상태**: pending, contacted, completed, postponed

### 6. 내부 계정 관리 (Staff Accounts)

웹 클라이언트 접근을 위한 직원 계정을 관리합니다.

**역할 (Role)**:
| 역할 | 설명 | 권한 수준 |
|-----|------|----------|
| Admin | 관리자 | 모든 기능 접근 |
| Staff | 일반 직원 | 지정된 기능 접근 |
| Viewer | 열람자 | 읽기 전용 |

**세부 권한 (Permissions)**:
- 환자 조회/수정 (patients_read, patients_write)
- 처방 조회/수정 (prescriptions_read, prescriptions_write)
- 차트 조회/수정 (charts_read, charts_write)
- 설문 조회/수정 (survey_read, survey_write)
- 설정 조회 (settings_read) - 읽기전용

### 7. 구독 및 플랜 관리 (Subscription)

SaaS 형태의 구독 모델을 지원합니다.

**플랜 유형**:
| 기능 | Beginner | Challenger | Master |
|------|----------|------------|--------|
| 환자 관리 | O | O | O |
| 처방 발급 | O | O | O |
| 차트 관리 | O | O | O |
| 내부 설문 | O | O | O |
| 외부 설문 | X | O | O |
| 숙제 기능 | X | O | O |
| 내부계정 | X | O | O |
| 처방정의 편집 | X | X | O |

**구독 상태**: active, expired, cancelled, trial

### 8. 데이터 관리 (Data Management)

안전한 데이터 관리를 위한 기능을 제공합니다.

**백업 기능**:
- 자동 백업 설정 (useAutoBackup 훅)
- 수동 백업 실행
- 백업 파일 관리

**내보내기**:
- 데이터 내보내기 (JSON 형식)
- 선택적 내보내기 지원

**보안**:
- SQLCipher를 통한 데이터베이스 암호화 (32자 이상 키)
- 비밀번호 해싱 (Bcrypt + Argon2)
- 토큰 기반 세션 관리

### 9. 숙제 시스템 (Homework)

환자 및 학습자를 위한 과제 관리 기능입니다.

**과제 유형**:
- 공통 과제 (common): 특정 플랜 전체 대상
- 개별 과제 (individual): 특정 사용자 지정

**기능 목록**:
- 숙제 생성 및 관리
- 첨부파일 지원 (attachment_url, attachment_name)
- 마감일 설정
- 제출 관리
- 피드백 제공 (feedback, reviewed_at)

**제출 상태**: submitted, reviewed

### 10. 내부 HTTP 서버 (Web Server)

웹 클라이언트 접근을 위한 내장 서버입니다.

**사양**:
- 기본 포트: 8787
- Axum 기반 HTTP 서버
- CORS 설정 지원
- 정적 파일 서빙 (rust-embed)

**제공 기능**:
- 인증 API (내부계정 로그인)
- 환자 데이터 API
- 대시보드 API

---

## 주요 사용 사례 (Use Cases)

### UC-001: 환자 초진 접수

1. 접수 직원이 새 환자 정보를 등록
2. 환자가 키오스크에서 초진 설문 작성 (QR 코드 또는 직접 접속)
3. 원장이 설문 응답 확인 후 초진 차트 작성
4. 진단 후 처방 템플릿 선택 및 가감
5. 처방전 발급

### UC-002: 재진 환자 진료

1. 환자 검색 및 이전 기록 조회
2. 경과 기록(Progress Note) 작성 - SOAP 형식
3. 기존 처방 수정 또는 새 처방 발급
4. 복약 일정 등록

### UC-003: 처방전 발급 흐름

1. 환자 선택 또는 차트에서 연동
2. 처방 템플릿 선택 (예: 소시호탕)
3. 약재 용량 조절 및 가감
4. 복용 일수, 1일 복용 횟수 설정
5. 처방전 발급 (상태: draft -> issued -> completed)

### UC-004: 설문 조사 관리

1. 설문 템플릿 생성 (질문 유형, 필수 여부 설정)
2. 환자에게 설문 링크 전송 또는 키오스크 모드 실행
3. QR 코드로 환자 접속
4. 응답 수집 및 분석
5. 진료 시 설문 응답 참고

### UC-005: 복약 관리 (Happy Call)

1. 처방 발급 시 복약 관리 자동 등록
2. 배송일수 고려한 복용 시작/종료일 계산
3. Happy Call 예정일 설정
4. 해피콜 실행 및 결과 기록
5. 필요시 연기 처리 (횟수 추적)

### UC-006: 웹 클라이언트 접근

1. 관리자가 직원 계정 생성 (역할 및 권한 설정)
2. 데스크톱 앱에서 HTTP 서버 시작 (포트 8787)
3. 직원이 웹 브라우저로 http://localhost:8787 접속
4. 내부계정으로 로그인
5. 권한에 따른 기능 접근 (환자 조회, 대시보드 등)

---

## 공지사항 시스템 (Announcements)

앱 내 공지사항 표시 기능을 제공합니다.

**공지 유형**:
- info: 일반 안내
- warning: 주의 사항
- update: 업데이트 안내
- maintenance: 점검 안내

**설정 옵션**:
- 고정 표시 (is_pinned)
- 활성화/비활성화 (is_active)
- 시작/종료 일시 (starts_at, ends_at)

---

## 데이터 모델 요약

### 핵심 엔티티

| 엔티티 | 설명 | 주요 필드 |
|--------|------|----------|
| Patient | 환자 정보 | id, name, chart_number, birth_date, gender |
| InitialChart | 초진 차트 | patient_id, chief_complaint, present_illness |
| ProgressNote | 경과 기록 (SOAP) | patient_id, subjective, objective, assessment, plan |
| Prescription | 처방전 | patient_id, formula, merged_herbs, final_herbs, days |
| PrescriptionTemplate | 처방 템플릿 | name, alias, herbs, description |
| Herb | 약재 | name, default_dosage, unit |
| SurveyTemplate | 설문 템플릿 | name, questions, display_mode |
| SurveyResponse | 설문 응답 | template_id, patient_id, answers |
| Homework | 숙제 | title, due_date, assignment_type |
| StaffAccount | 내부 직원 계정 | username, role, permissions |

---

*마지막 업데이트: 2026-02-06*
