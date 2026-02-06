# SPEC-MED-001: 복약 기록 시스템

---
id: SPEC-MED-001
version: 1.0.0
status: planned
created: 2026-02-07
updated: 2026-02-07
author: yeonijae
priority: high
complexity: medium
lifecycle_level: spec-anchored
tags: medication, logging, patient-care, healthcare
---

## 개요

### 목적

환자의 복약 일정을 관리하고 복약 이행 상태를 체계적으로 기록하는 시스템을 구현한다. 처방전 기반의 복약 일정 생성, 일별 복약 상태 입력, 복약 이행률 통계 대시보드 기능을 제공한다.

### 범위

- 복약 일정(MedicationSchedule) 생성 및 관리
- 복약 기록(MedicationLog) 입력 및 조회
- 복약 이행률 통계 및 시각화
- 기존 Rust 백엔드 모델과의 연동

### 현재 상태 분석

| 구성요소 | 상태 | 비고 |
|---------|------|------|
| Rust 모델 (MedicationSchedule) | 구현됨 | src-tauri/src/models.rs |
| Rust 모델 (MedicationLog) | 구현됨 | src-tauri/src/models.rs |
| DB 테이블 (medication_schedules) | 구현됨 | src-tauri/src/db.rs |
| DB 테이블 (medication_logs) | 구현됨 | src-tauri/src/db.rs |
| TypeScript 타입 (MedicationSchedule) | 부분 구현 | src/types/index.ts |
| TypeScript 타입 (MedicationLog) | 미구현 | 추가 필요 |
| localDb 쿼리 | 미구현 | 추가 필요 |
| UI 컴포넌트 | 미구현 | 추가 필요 |

---

## 요구사항 (EARS Format)

### Ubiquitous (필수 요구사항)

> 시스템이 항상 준수해야 하는 요구사항

**REQ-U-001**: 시스템은 항상 복약 일정 생성 시 복약 기록 슬롯을 자동 생성해야 한다.
- 복약 일정의 시작일부터 종료일까지 모든 날짜에 대해 times_per_day 개수만큼 슬롯 생성
- 슬롯 상태는 기본값 'pending'으로 설정

**REQ-U-002**: 시스템은 항상 복약 기록을 환자-처방-일정 계층 구조로 관리해야 한다.
- 복약 기록(MedicationLog)은 반드시 복약 일정(MedicationSchedule)에 연결
- 복약 일정(MedicationSchedule)은 반드시 처방전(Prescription)과 환자(Patient)에 연결

**REQ-U-003**: 시스템은 항상 복약 기록 데이터를 SQLCipher로 암호화하여 저장해야 한다.
- 의료 데이터 보안 요구사항 준수
- 기존 데이터베이스 암호화 체계 활용

### Event-Driven (이벤트 기반 요구사항)

> 특정 이벤트 발생 시 시스템이 수행해야 하는 동작

**REQ-E-001**: WHEN 처방전이 발급되면 THEN 복약 일정(MedicationSchedule)을 생성할 수 있어야 한다.
- 처방전 상세 화면에서 "복약 일정 생성" 버튼 제공
- 복용 횟수(times_per_day)와 복용 시간(medication_times) 입력 UI 제공
- 시작일/종료일 기본값은 처방전 날짜 기준 자동 계산

**REQ-E-002**: WHEN 복약 시간이 되면 THEN 해당 시간대의 복약 기록 슬롯이 활성화되어야 한다.
- 현재 시각 기준으로 해당 시간대 슬롯 하이라이트
- 과거 시간대의 미입력 슬롯은 'missed' 상태 후보로 표시

**REQ-E-003**: WHEN 사용자가 복약 상태를 선택하면 THEN MedicationLog에 기록되어야 한다.
- 상태 옵션: taken(복용완료), missed(미복용), skipped(건너뜀)
- 선택 시 즉시 저장 (낙관적 업데이트)
- 메모 추가 기능 제공 (선택사항)

**REQ-E-004**: WHEN 복약 일정이 수정되면 THEN 미래 날짜의 슬롯만 업데이트되어야 한다.
- 과거 기록은 보존
- 종료일 연장/단축 시 슬롯 자동 추가/제거

### State-Driven (조건 기반 요구사항)

> 특정 조건/상태에서 시스템이 수행해야 하는 동작

**REQ-S-001**: IF 복약 기록이 3일 연속 미복용(missed)이면 THEN 경고 알림을 표시해야 한다.
- 환자 상세 화면에 경고 배지 표시
- 복약 관리 목록에서 해당 환자 강조 표시

**REQ-S-002**: IF 복약 일정이 종료되면 THEN 복약 이행률 통계를 계산해야 한다.
- 이행률 = (taken 개수) / (전체 슬롯 개수) * 100
- 통계 데이터 저장 및 대시보드 표시

**REQ-S-003**: IF 오늘 날짜에 복약 일정이 있으면 THEN 대시보드에 오늘의 복약 현황을 표시해야 한다.
- 오늘 예정된 복약 목록
- 완료/미완료 상태 시각화

### Unwanted (금지 요구사항)

> 시스템이 수행해서는 안 되는 동작

**REQ-N-001**: 시스템은 과거 복약 기록을 임의 삭제하지 않아야 한다.
- 의료 기록 보존 원칙 준수
- 삭제 대신 상태 변경으로 처리
- 수정 이력 보존

**REQ-N-002**: 시스템은 복약 시간 이전에 '복용완료(taken)' 상태 입력을 허용하지 않아야 한다.
- 해당 시간대 도래 전에는 입력 비활성화
- 예외: 조기 복용 시 메모와 함께 입력 허용 (명시적 확인 필요)

**REQ-N-003**: 시스템은 동일 시간대에 중복 복약 기록을 생성하지 않아야 한다.
- schedule_id + taken_at 조합 유일성 보장
- 상태 변경은 업데이트로 처리

### Optional (선택 요구사항)

> 가능하면 제공하면 좋은 기능

**REQ-O-001**: 가능하면 복약 시간을 개인화(커스텀 알림 시간)할 수 있어야 한다.
- 환자별 복약 시간 프리셋 저장
- 일반적인 시간대 제안: 08:00(아침), 12:00(점심), 18:00(저녁), 22:00(취침전)

**REQ-O-002**: 가능하면 복약 일정을 캘린더 형태로 시각화할 수 있어야 한다.
- 월간 캘린더 뷰
- 날짜별 복약 현황 아이콘 표시

**REQ-O-003**: 가능하면 복약 이행률 추이를 그래프로 표시할 수 있어야 한다.
- 주간/월간 이행률 추이 차트
- 환자별 비교 기능

---

## 데이터 모델

### MedicationSchedule (복약 일정)

```typescript
interface MedicationSchedule {
  id: string;                    // UUID v4
  patient_id: string;            // 환자 ID (FK: patients.id)
  prescription_id: string;       // 처방전 ID (FK: prescriptions.id)
  start_date: string;            // 시작일 (ISO 8601)
  end_date: string;              // 종료일 (ISO 8601)
  times_per_day: number;         // 하루 복용 횟수 (1-4)
  medication_times: string[];    // 복용 시간 배열 ["08:00", "12:00", "18:00"]
  notes?: string;                // 복용 지침 메모
  created_at: string;            // 생성일시 (ISO 8601)
}
```

### MedicationLog (복약 기록)

```typescript
interface MedicationLog {
  id: string;                    // UUID v4
  schedule_id: string;           // 복약 일정 ID (FK: medication_schedules.id)
  taken_at: string;              // 복용 시각 (ISO 8601)
  status: MedicationStatus;      // 복용 상태
  notes?: string;                // 복용 관련 메모
}

type MedicationStatus = 'taken' | 'missed' | 'skipped';
```

### MedicationSlot (UI 표시용, 비영속)

```typescript
interface MedicationSlot {
  date: string;                  // 날짜 (YYYY-MM-DD)
  time: string;                  // 시간 (HH:mm)
  schedule_id: string;           // 복약 일정 ID
  log_id?: string;               // 기록된 경우 로그 ID
  status: MedicationStatus | 'pending';  // 상태 (pending: 미입력)
  is_past: boolean;              // 과거 시간대 여부
  is_active: boolean;            // 현재 입력 가능 여부
}
```

---

## 기술 명세

### 프론트엔드

| 항목 | 기술 | 비고 |
|------|------|------|
| UI 프레임워크 | React 19 | 기존 스택 |
| 상태 관리 | Zustand | medicationStore 신규 생성 |
| 데이터 조회 | TanStack Query | 캐싱 및 동기화 |
| 스타일링 | Tailwind CSS 4 | 기존 스택 |
| 아이콘 | Lucide React | 기존 스택 |
| 로컬 DB | sql.js | localDb.ts 확장 |

### 백엔드 (Rust)

| 항목 | 기술 | 비고 |
|------|------|------|
| 모델 | 기존 구현 | models.rs |
| DB | SQLite + SQLCipher | 기존 테이블 활용 |
| API | Tauri IPC / Axum HTTP | 기존 패턴 따름 |

### API 엔드포인트 (추가 필요)

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| /medication-schedules | GET | 복약 일정 목록 조회 |
| /medication-schedules | POST | 복약 일정 생성 |
| /medication-schedules/:id | GET | 복약 일정 상세 조회 |
| /medication-schedules/:id | PUT | 복약 일정 수정 |
| /medication-logs | GET | 복약 기록 목록 조회 |
| /medication-logs | POST | 복약 기록 생성/수정 |
| /medication-stats/:patient_id | GET | 환자별 복약 통계 |

---

## 제약사항

### 기술적 제약

- 기존 데이터베이스 스키마 변경 최소화
- SQLCipher 암호화 체계 준수
- Tauri IPC와 Axum HTTP API 동시 지원

### 비즈니스 제약

- 의료 기록 보존 의무 준수 (삭제 불가)
- 개인정보보호법 준수 (암호화 필수)
- 오프라인 환경 지원 (로컬 우선 저장)

### 성능 제약

- 복약 기록 조회 응답시간 < 500ms
- 일정 생성 시 슬롯 생성 최대 365일분

---

## 트레이서빌리티

### 관련 문서

- .moai/specs/SPEC-MED-001/plan.md - 구현 계획
- .moai/specs/SPEC-MED-001/acceptance.md - 인수 조건

### 관련 코드

- src-tauri/src/models.rs - Rust 모델 정의
- src-tauri/src/db.rs - 데이터베이스 테이블 정의
- src/types/index.ts - TypeScript 타입 정의

### 의존 SPEC

- 없음 (독립 기능)

### 연관 기능

- 처방전 관리 (prescriptions)
- 환자 관리 (patients)
- 복약 관리 (medication_management) - 별도 기능

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
