# SPEC-MED-002: 복약관리 웹 클라이언트 API

---
id: SPEC-MED-002
version: 1.0.0
status: planned
created: 2026-02-07
updated: 2026-02-07
author: yeonijae
priority: high
complexity: medium
lifecycle_level: spec-anchored
tags: medication, web-api, rest, axum, permissions
---

## 개요

### 목적

SPEC-MED-001에서 정의된 복약 기록 시스템을 웹 클라이언트에서 접근할 수 있도록 REST API를 구현한다. Axum HTTP 서버(포트 8787)를 통해 복약 일정(MedicationSchedule)과 복약 기록(MedicationLog) CRUD 기능 및 통계 조회 API를 제공한다.

### 범위

- StaffPermissions 모델 확장 (medications_read, medications_write 필드 추가)
- Rust db.rs에 복약 CRUD 함수 구현
- Rust web_api.rs에 REST 엔드포인트 구현
- TypeScript webApiClient.ts에 API 클라이언트 함수 구현
- WebMedications.tsx 페이지 컴포넌트 구현

### 현재 상태 분석

| 구성요소 | 상태 | 비고 |
|---------|------|------|
| Rust 모델 (MedicationSchedule, MedicationLog) | 구현됨 | src-tauri/src/models.rs (SPEC-MED-001) |
| DB 테이블 (medication_schedules, medication_logs) | 구현됨 | src-tauri/src/db.rs (SPEC-MED-001) |
| TypeScript 타입 (MedicationLog, MedicationSlot, MedicationStats) | 구현됨 | src/types/index.ts (SPEC-MED-001) |
| 프론트엔드 컴포넌트 (10개) | 구현됨 | src/components/medication/* (SPEC-MED-001) |
| StaffPermissions.medications_read | 미구현 | 추가 필요 |
| StaffPermissions.medications_write | 미구현 | 추가 필요 |
| Rust db.rs 복약 CRUD (Axum용) | 미구현 | 추가 필요 |
| Rust web_api.rs 복약 엔드포인트 | 미구현 | 추가 필요 |
| TypeScript webApiClient.ts 복약 API | 미구현 | 추가 필요 |
| WebMedications.tsx 페이지 | 미구현 | 추가 필요 |

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                    웹 클라이언트 (브라우저)                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  WebMedications.tsx                                         │ │
│  │  - 복약 일정 목록/상세                                        │ │
│  │  - 복약 기록 입력/조회                                        │ │
│  │  - 환자별 복약 통계                                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │ HTTP (REST API)                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  webApiClient.ts                                            │ │
│  │  - listMedicationSchedules()                                │ │
│  │  - createMedicationLog()                                    │ │
│  │  - getMedicationStats()                                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Axum HTTP Server (Port 8787)                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  web_api.rs                                                 │ │
│  │  - GET/POST/PUT/DELETE /api/web/medications/schedules       │ │
│  │  - GET/POST/PUT /api/web/medications/logs                   │ │
│  │  - GET /api/web/medications/stats/patient/{id}              │ │
│  │                                                             │ │
│  │  require_auth! + permissions check                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  db.rs (복약 CRUD 함수)                                      │ │
│  │  - list_medication_schedules()                              │ │
│  │  - create_medication_schedule()                             │ │
│  │  - get_medication_logs_by_schedule()                        │ │
│  │  - create_medication_log()                                  │ │
│  │  - get_medication_stats()                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  SQLite + SQLCipher (암호화 DB)                              │ │
│  │  - medication_schedules 테이블                               │ │
│  │  - medication_logs 테이블                                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 요구사항 (EARS Format)

### Ubiquitous (필수 요구사항)

> 시스템이 항상 준수해야 하는 요구사항

**REQ-U-001**: 시스템은 항상 복약 API 접근 시 Bearer 토큰 인증을 요구해야 한다.
- Authorization 헤더에서 Bearer 토큰 추출
- WebApiState.verify_session()으로 세션 검증
- 미인증 시 401 Unauthorized 반환

**REQ-U-002**: 시스템은 항상 복약 API에서 권한 검증을 수행해야 한다.
- GET 요청: medications_read 권한 필요
- POST/PUT/DELETE 요청: medications_write 권한 필요
- 권한 없음 시 403 Forbidden 반환

**REQ-U-003**: 시스템은 항상 API 응답을 표준 ApiResponse 형식으로 반환해야 한다.
- success: boolean
- data: T | null
- error: string | null

**REQ-U-004**: 시스템은 항상 복약 데이터를 SQLCipher로 암호화된 DB에 저장해야 한다.
- 기존 db.rs의 DB_CONNECTION 활용
- 의료 데이터 보안 요구사항 준수

### Event-Driven (이벤트 기반 요구사항)

> 특정 이벤트 발생 시 시스템이 수행해야 하는 동작

**REQ-E-001**: WHEN GET /api/web/medications/schedules 호출 THEN 모든 복약 일정을 반환해야 한다.
- 전체 복약 일정 목록 조회
- 환자명, 처방명 포함하여 반환

**REQ-E-002**: WHEN GET /api/web/medications/schedules/{id} 호출 THEN 해당 복약 일정 상세를 반환해야 한다.
- 단일 복약 일정 조회
- 연결된 복약 기록 포함 (선택)

**REQ-E-003**: WHEN GET /api/web/medications/schedules/patient/{patient_id} 호출 THEN 해당 환자의 복약 일정을 반환해야 한다.
- 환자 ID 기준 필터링
- 최신순 정렬

**REQ-E-004**: WHEN POST /api/web/medications/schedules 호출 THEN 새 복약 일정을 생성해야 한다.
- MedicationSchedule 데이터 저장
- 생성된 ID 반환

**REQ-E-005**: WHEN PUT /api/web/medications/schedules/{id} 호출 THEN 복약 일정을 수정해야 한다.
- 기존 일정 업데이트
- 미래 날짜의 슬롯만 영향

**REQ-E-006**: WHEN DELETE /api/web/medications/schedules/{id} 호출 THEN 복약 일정을 삭제해야 한다.
- 소프트 삭제 또는 완전 삭제
- 연결된 로그 처리 정책 결정

**REQ-E-007**: WHEN GET /api/web/medications/logs 호출 THEN 복약 기록 목록을 반환해야 한다.
- 전체 복약 기록 조회
- 페이지네이션 지원 (선택)

**REQ-E-008**: WHEN GET /api/web/medications/logs/schedule/{schedule_id} 호출 THEN 해당 일정의 복약 기록을 반환해야 한다.
- schedule_id 기준 필터링
- 시간순 정렬

**REQ-E-009**: WHEN POST /api/web/medications/logs 호출 THEN 새 복약 기록을 생성해야 한다.
- MedicationLog 데이터 저장
- 중복 검사 (schedule_id + taken_at)
- 생성된 ID 반환

**REQ-E-010**: WHEN PUT /api/web/medications/logs/{id} 호출 THEN 복약 기록을 수정해야 한다.
- 상태(status) 또는 메모(notes) 수정
- 수정 이력 보존 (선택)

**REQ-E-011**: WHEN GET /api/web/medications/stats/patient/{patient_id} 호출 THEN 환자별 복약 통계를 반환해야 한다.
- 이행률(adherence_rate) 계산
- taken, missed, skipped 카운트
- 기간별 필터링 지원 (선택)

### State-Driven (조건 기반 요구사항)

> 특정 조건/상태에서 시스템이 수행해야 하는 동작

**REQ-S-001**: IF StaffPermissions.medications_read == false THEN GET 요청은 403 Forbidden을 반환해야 한다.
- 읽기 권한 미보유 시 접근 거부
- 명확한 에러 메시지 제공

**REQ-S-002**: IF StaffPermissions.medications_write == false THEN POST/PUT/DELETE 요청은 403 Forbidden을 반환해야 한다.
- 쓰기 권한 미보유 시 변경 거부
- 명확한 에러 메시지 제공

**REQ-S-003**: IF 세션이 만료됨 THEN 401 Unauthorized를 반환해야 한다.
- 24시간 세션 만료 정책 적용
- 재로그인 유도 메시지 제공

**REQ-S-004**: IF 동일 schedule_id + taken_at 조합이 존재 THEN 중복 생성을 거부해야 한다.
- 409 Conflict 반환
- 기존 레코드 ID 반환 (선택)

### Unwanted (금지 요구사항)

> 시스템이 수행해서는 안 되는 동작

**REQ-N-001**: 시스템은 인증 없이 복약 엔드포인트 접근을 허용하지 않아야 한다.
- 모든 /api/web/medications/* 엔드포인트에 인증 필수
- 토큰 없이 접근 시 401 반환

**REQ-N-002**: 시스템은 복약 기록(MedicationLog) 삭제를 허용하지 않아야 한다.
- 의료 기록 보존 원칙 준수
- DELETE /api/web/medications/logs/{id} 엔드포인트 미구현
- 상태 변경으로 대체

**REQ-N-003**: 시스템은 API 키나 비밀번호를 응답에 포함하지 않아야 한다.
- 민감한 정보 필터링
- StaffAccount.password_hash 등 제외

**REQ-N-004**: 시스템은 권한 없는 사용자에게 다른 사용자의 권한 정보를 노출하지 않아야 한다.
- 자신의 권한 정보만 조회 가능
- 타인 정보 접근 시 404 또는 403 반환

### Optional (선택 요구사항)

> 가능하면 제공하면 좋은 기능

**REQ-O-001**: 가능하면 복약 기록 조회 시 날짜 범위 필터링을 지원해야 한다.
- 쿼리 파라미터: start_date, end_date
- ISO 8601 형식

**REQ-O-002**: 가능하면 복약 통계 조회 시 기간별 집계를 지원해야 한다.
- 일간, 주간, 월간 집계 옵션
- 쿼리 파라미터: period=daily|weekly|monthly

**REQ-O-003**: 가능하면 복약 일정 목록에서 환자명/처방명 검색을 지원해야 한다.
- 쿼리 파라미터: search
- 부분 일치 검색

**REQ-O-004**: 가능하면 WebMedications.tsx에서 복약 캘린더 뷰를 제공해야 한다.
- 월간 캘린더 형태
- 날짜별 복약 상태 시각화

---

## API 엔드포인트 명세

### 복약 일정 (Schedules)

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|------------|------|------|
| GET | /api/web/medications/schedules | 전체 복약 일정 목록 | medications_read |
| POST | /api/web/medications/schedules | 복약 일정 생성 | medications_write |
| GET | /api/web/medications/schedules/{id} | 복약 일정 상세 조회 | medications_read |
| PUT | /api/web/medications/schedules/{id} | 복약 일정 수정 | medications_write |
| DELETE | /api/web/medications/schedules/{id} | 복약 일정 삭제 | medications_write |
| GET | /api/web/medications/schedules/patient/{patient_id} | 환자별 복약 일정 | medications_read |

### 복약 기록 (Logs)

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|------------|------|------|
| GET | /api/web/medications/logs | 전체 복약 기록 목록 | medications_read |
| POST | /api/web/medications/logs | 복약 기록 생성 | medications_write |
| GET | /api/web/medications/logs/{id} | 복약 기록 상세 조회 | medications_read |
| PUT | /api/web/medications/logs/{id} | 복약 기록 수정 | medications_write |
| GET | /api/web/medications/logs/schedule/{schedule_id} | 일정별 복약 기록 | medications_read |

### 복약 통계 (Stats)

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|------------|------|------|
| GET | /api/web/medications/stats/patient/{patient_id} | 환자별 복약 통계 | medications_read |

---

## 데이터 모델

### StaffPermissions (확장)

```rust
pub struct StaffPermissions {
    // 기존 필드
    pub patients_read: bool,
    pub patients_write: bool,
    pub prescriptions_read: bool,
    pub prescriptions_write: bool,
    pub charts_read: bool,
    pub charts_write: bool,
    pub survey_read: bool,
    pub survey_write: bool,
    pub settings_read: bool,
    // 신규 필드
    pub medications_read: bool,   // 복약 정보 읽기 권한
    pub medications_write: bool,  // 복약 정보 쓰기 권한
}
```

### API 요청/응답 타입 (TypeScript)

```typescript
// 복약 일정 생성 요청
interface CreateMedicationScheduleRequest {
  patient_id: string;
  prescription_id: string;
  start_date: string;
  end_date: string;
  times_per_day: number;
  medication_times: string[];
  notes?: string;
}

// 복약 기록 생성 요청
interface CreateMedicationLogRequest {
  schedule_id: string;
  taken_at: string;
  status: MedicationStatus;
  notes?: string;
}

// 복약 통계 응답
interface MedicationStatsResponse {
  patient_id: string;
  total_slots: number;
  taken_count: number;
  missed_count: number;
  skipped_count: number;
  adherence_rate: number;
  period_start?: string;
  period_end?: string;
}
```

---

## 제약사항

### 기술적 제약

- 기존 web_api.rs 패턴 준수 (require_auth! 매크로 사용)
- 기존 ApiResponse<T> 래퍼 사용
- SQLCipher 암호화 체계 유지
- Axum 0.8 프레임워크 호환

### 비즈니스 제약

- 복약 기록 삭제 불가 (의료 기록 보존)
- 권한 기반 접근 제어 필수
- 개인정보보호법 준수

### 성능 제약

- API 응답 시간 < 500ms
- 동시 접속 100명 이상 지원
- 세션 만료 24시간

---

## 트레이서빌리티

### 관련 문서

- .moai/specs/SPEC-MED-002/plan.md - 구현 계획
- .moai/specs/SPEC-MED-002/acceptance.md - 인수 조건

### 관련 코드 (수정 대상)

- src-tauri/src/models.rs - StaffPermissions 확장
- src-tauri/src/db.rs - 복약 CRUD 함수 추가
- src-tauri/src/web_api.rs - REST 엔드포인트 추가
- src/lib/webApiClient.ts - API 클라이언트 함수 추가
- src/pages/WebMedications.tsx - 웹 UI 페이지 (신규)

### 의존 SPEC

- SPEC-MED-001: 복약 기록 시스템 (Rust 모델, DB 테이블, TypeScript 타입, UI 컴포넌트)

### 연관 기능

- 내부계정 인증 (StaffAccount, WebSession)
- 환자 관리 (patients)
- 처방전 관리 (prescriptions)

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
