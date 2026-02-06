# SPEC-MED-001: 복약 기록 시스템 - 구현 계획

---
spec_id: SPEC-MED-001
version: 1.0.0
status: planned
created: 2026-02-07
updated: 2026-02-07
author: yeonijae
---

## 구현 개요

복약 기록 시스템의 구현을 4개 단계로 나누어 진행한다. 기존 Rust 백엔드 모델과 DB 테이블이 이미 구현되어 있으므로, TypeScript 타입 정의, localDb 쿼리, Zustand 스토어, UI 컴포넌트 순으로 구현한다.

---

## 마일스톤

### Primary Goal: 기본 복약 기록 기능

**범위:**
- TypeScript 타입 정의 완성
- localDb 쿼리 함수 구현
- Zustand 스토어 생성
- 기본 복약 기록 입력 UI

**산출물:**
- src/types/index.ts 타입 추가
- src/lib/localDb.ts 쿼리 함수 추가
- src/store/medicationStore.ts 신규 생성
- src/components/MedicationLog.tsx 신규 생성

### Secondary Goal: 복약 일정 관리 기능

**범위:**
- 복약 일정 생성/수정/조회 UI
- 처방전 연동 (일정 생성 진입점)
- 슬롯 자동 생성 로직

**산출물:**
- src/components/MedicationScheduleForm.tsx 신규 생성
- src/components/MedicationScheduleList.tsx 신규 생성
- 기존 처방전 컴포넌트에 연동 버튼 추가

### Tertiary Goal: 복약 이행률 대시보드

**범위:**
- 환자별 복약 이행률 계산
- 대시보드 위젯
- 경고 알림 표시

**산출물:**
- src/components/MedicationStats.tsx 신규 생성
- src/components/MedicationDashboard.tsx 신규 생성
- 환자 상세 화면에 통계 위젯 추가

### Optional Goal: 고급 기능

**범위:**
- 캘린더 뷰 시각화
- 이행률 추이 그래프
- 커스텀 알림 시간 프리셋

**산출물:**
- src/components/MedicationCalendar.tsx 신규 생성
- src/components/MedicationChart.tsx 신규 생성

---

## 작업 분해

### Phase 1: 타입 및 데이터 계층

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-001 | MedicationLog 타입 추가 | src/types/index.ts | High |
| T-002 | MedicationSlot 타입 추가 | src/types/index.ts | High |
| T-003 | medication_schedules 쿼리 구현 | src/lib/localDb.ts | High |
| T-004 | medication_logs 쿼리 구현 | src/lib/localDb.ts | High |
| T-005 | medicationStore 생성 | src/store/medicationStore.ts | High |

### Phase 2: 기본 UI 컴포넌트

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-006 | MedicationLogItem 컴포넌트 | src/components/medication/MedicationLogItem.tsx | High |
| T-007 | MedicationLogList 컴포넌트 | src/components/medication/MedicationLogList.tsx | High |
| T-008 | MedicationStatusBadge 컴포넌트 | src/components/medication/MedicationStatusBadge.tsx | Medium |
| T-009 | MedicationTimeSlot 컴포넌트 | src/components/medication/MedicationTimeSlot.tsx | Medium |

### Phase 3: 일정 관리 UI

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-010 | MedicationScheduleForm 컴포넌트 | src/components/medication/MedicationScheduleForm.tsx | High |
| T-011 | MedicationScheduleList 컴포넌트 | src/components/medication/MedicationScheduleList.tsx | High |
| T-012 | TimePickerGrid 컴포넌트 | src/components/medication/TimePickerGrid.tsx | Medium |
| T-013 | 처방전 상세에 일정 생성 버튼 추가 | src/components/PrescriptionInput.tsx | Medium |

### Phase 4: 대시보드 및 통계

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-014 | MedicationStats 컴포넌트 | src/components/medication/MedicationStats.tsx | Medium |
| T-015 | MedicationDashboard 컴포넌트 | src/components/medication/MedicationDashboard.tsx | Medium |
| T-016 | 경고 배지 컴포넌트 | src/components/medication/MedicationAlertBadge.tsx | Low |
| T-017 | 환자 상세에 통계 위젯 추가 | 기존 환자 상세 컴포넌트 | Low |

### Phase 5: 선택 기능 (Optional)

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-018 | MedicationCalendar 컴포넌트 | src/components/medication/MedicationCalendar.tsx | Low |
| T-019 | MedicationChart 컴포넌트 | src/components/medication/MedicationChart.tsx | Low |
| T-020 | 알림 시간 프리셋 관리 | src/components/medication/TimePresetManager.tsx | Low |

---

## 기술 접근 방식

### TypeScript 타입 정의

```typescript
// src/types/index.ts에 추가

// 복약 기록 (MedicationLog)
export interface MedicationLog {
  id: string;
  schedule_id: string;
  taken_at: string;
  status: MedicationStatus;
  notes?: string;
}

// 복약 슬롯 (UI 표시용)
export interface MedicationSlot {
  date: string;
  time: string;
  schedule_id: string;
  log_id?: string;
  status: MedicationStatus | 'pending';
  is_past: boolean;
  is_active: boolean;
}
```

### localDb 쿼리 패턴

```typescript
// src/lib/localDb.ts에 추가

// 복약 일정 조회
export async function getMedicationSchedules(patientId: string): Promise<MedicationSchedule[]>

// 복약 일정 생성
export async function createMedicationSchedule(schedule: Omit<MedicationSchedule, 'id' | 'created_at'>): Promise<MedicationSchedule>

// 복약 기록 조회
export async function getMedicationLogs(scheduleId: string): Promise<MedicationLog[]>

// 복약 기록 생성/수정 (upsert)
export async function upsertMedicationLog(log: Omit<MedicationLog, 'id'>): Promise<MedicationLog>

// 복약 이행률 계산
export async function getMedicationStats(patientId: string): Promise<MedicationStats>
```

### Zustand 스토어 구조

```typescript
// src/store/medicationStore.ts

interface MedicationState {
  // 상태
  schedules: MedicationSchedule[];
  logs: MedicationLog[];
  slots: MedicationSlot[];
  isLoading: boolean;
  error: string | null;

  // 액션
  loadSchedules: (patientId: string) => Promise<void>;
  createSchedule: (schedule: CreateScheduleInput) => Promise<void>;
  loadLogs: (scheduleId: string) => Promise<void>;
  updateLogStatus: (slot: MedicationSlot, status: MedicationStatus) => Promise<void>;
  calculateStats: (patientId: string) => Promise<MedicationStats>;
}
```

### UI 컴포넌트 계층 구조

```
src/components/medication/
├── MedicationLogItem.tsx       # 개별 복약 기록 아이템
├── MedicationLogList.tsx       # 복약 기록 목록
├── MedicationStatusBadge.tsx   # 상태 배지 (taken/missed/skipped)
├── MedicationTimeSlot.tsx      # 시간대별 슬롯
├── MedicationScheduleForm.tsx  # 일정 생성/수정 폼
├── MedicationScheduleList.tsx  # 일정 목록
├── TimePickerGrid.tsx          # 복용 시간 선택 그리드
├── MedicationStats.tsx         # 이행률 통계
├── MedicationDashboard.tsx     # 대시보드 위젯
├── MedicationAlertBadge.tsx    # 경고 배지
├── MedicationCalendar.tsx      # 캘린더 뷰 (Optional)
└── MedicationChart.tsx         # 추이 그래프 (Optional)
```

---

## 의존성 분석

### 내부 의존성

| 모듈 | 의존 대상 | 의존 유형 |
|------|-----------|-----------|
| medicationStore | localDb | 데이터 소스 |
| MedicationLogList | medicationStore | 상태 관리 |
| MedicationScheduleForm | patientStore | 환자 정보 |
| MedicationScheduleForm | prescriptionStore (if exists) | 처방 정보 |

### 외부 의존성

| 라이브러리 | 용도 | 버전 |
|------------|------|------|
| zustand | 상태 관리 | 5.0.9 (기존) |
| @tanstack/react-query | 캐싱 | 5.90.12 (기존) |
| lucide-react | 아이콘 | 0.562.0 (기존) |
| date-fns | 날짜 처리 | 신규 추가 권장 |

---

## 위험 분석

### 기술적 위험

| 위험 | 영향도 | 발생 가능성 | 대응 방안 |
|------|--------|-------------|-----------|
| sql.js 메모리 이슈 (대량 슬롯) | Medium | Low | 페이지네이션 적용, 가상화 리스트 |
| Tauri IPC 동시성 | Low | Low | 기존 패턴 준수 |
| 시간대 처리 오류 | Medium | Medium | UTC 일관 사용, 로컬 변환은 UI에서만 |

### 비즈니스 위험

| 위험 | 영향도 | 발생 가능성 | 대응 방안 |
|------|--------|-------------|-----------|
| 사용자 혼란 (기존 복약관리와 중복) | Medium | Medium | UI 네이밍 명확화, 가이드 문서 |
| 데이터 일관성 (오프라인 편집 충돌) | High | Low | 마지막 수정 우선 정책 |

---

## 품질 기준

### 코드 품질

- TypeScript strict 모드 준수
- ESLint 경고 0개
- 컴포넌트별 단위 테스트 작성
- Storybook 스토리 작성 (선택)

### 성능 기준

- 복약 기록 조회: < 500ms
- 상태 업데이트: < 100ms (낙관적 업데이트)
- 슬롯 렌더링: < 16ms (60fps)

### 접근성 기준

- 키보드 네비게이션 지원
- 스크린 리더 호환 (aria-label)
- 색상 대비 4.5:1 이상

---

## 연관 문서

- spec.md - 요구사항 정의
- acceptance.md - 인수 조건

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
