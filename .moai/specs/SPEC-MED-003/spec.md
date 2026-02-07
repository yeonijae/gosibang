# SPEC-MED-003: 복약 알림 시스템

---
id: SPEC-MED-003
version: 1.0.0
status: planned
created: 2026-02-07
updated: 2026-02-07
author: yeonijae
priority: high
complexity: medium
lifecycle_level: spec-anchored
tags: medication, notification, reminder, alert, desktop, web
---

## 개요

### 목적

복약 일정에 따라 직원에게 시의적절한 알림을 제공하여 환자의 복약 이행률을 향상시키는 알림 시스템을 구현한다. 데스크탑 알림, 인앱 알림, 사운드 알림 등 다양한 채널을 통해 복약 시간 도래, 미복용 경고, 일일 복약 요약 정보를 제공한다.

### 범위

- 복약 시간 알림 스케줄러 (백그라운드 태스크)
- 다중 알림 채널 지원 (데스크탑 알림, 인앱 알림, 사운드)
- 알림 설정 및 선호도 관리
- 일일 복약 요약 알림
- 미복용 경고 알림
- 웹 클라이언트 브라우저 알림 지원

### 현재 상태 분석

| 구성요소 | 상태 | 비고 |
|---------|------|------|
| Tauri Notification Plugin | 미설치 | tauri-plugin-notification 추가 필요 |
| 복약 일정 (MedicationSchedule) | 구현됨 | SPEC-MED-001 |
| 복약 기록 (MedicationLog) | 구현됨 | SPEC-MED-001 |
| 복약 통계 (MedicationStats) | 구현됨 | SPEC-MED-001 |
| 웹 API (복약 관련) | 구현됨 | SPEC-MED-002 |
| MedicationAlertBadge 컴포넌트 | 구현됨 | 연속 미복용 경고 배지 |
| 알림 설정 모델 | 미구현 | 추가 필요 |
| 백그라운드 스케줄러 | 미구현 | 추가 필요 |
| 인앱 알림 센터 | 미구현 | 추가 필요 |

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          알림 시스템 아키텍처                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     알림 스케줄러 (Rust)                            │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │ │
│  │  │ 복약 시간 체커   │  │ 미복용 감지기    │  │ 일일 요약 생성기    │ │ │
│  │  │ (매 분 실행)    │  │ (시간대별 체크)  │  │ (하루 1회)         │ │ │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │ │
│  │           │                    │                      │            │ │
│  │           ▼                    ▼                      ▼            │ │
│  │  ┌─────────────────────────────────────────────────────────────┐   │ │
│  │  │                    알림 디스패처                              │   │ │
│  │  │  ┌──────────────┬──────────────┬──────────────────────────┐ │   │ │
│  │  │  │ 데스크탑 알림 │  인앱 알림   │ 브라우저 알림 (웹 클라이언트)│ │   │ │
│  │  │  │ (Tauri)      │  (Zustand)  │ (Web Push API)           │ │   │ │
│  │  │  └──────────────┴──────────────┴──────────────────────────┘ │   │ │
│  │  └─────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     알림 설정 저장소                                │ │
│  │  ┌─────────────────────────────────────────────────────────────┐   │ │
│  │  │  notification_settings 테이블                                │   │ │
│  │  │  - 글로벌 설정: 알림 활성화, 사운드, 데스크탑 알림 등          │   │ │
│  │  │  - 스케줄별 설정: 개별 일정의 알림 on/off, 사전 알림 시간       │   │ │
│  │  └─────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     UI 컴포넌트                                    │ │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │ │
│  │  │ 알림 센터    │  │ 알림 설정 화면   │  │ 토스트 알림 컴포넌트     │ │ │
│  │  │ (사이드바)   │  │ (Settings)      │  │ (화면 우상단)           │ │ │
│  │  └─────────────┘  └─────────────────┘  └─────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 요구사항 (EARS Format)

### Ubiquitous (필수 요구사항)

> 시스템이 항상 준수해야 하는 요구사항

**REQ-U-001**: 시스템은 항상 알림을 SQLite에 영구 저장해야 한다.
- 알림 생성 시 즉시 데이터베이스에 저장
- 알림 읽음/해제 상태 추적
- 최근 30일간의 알림 이력 보존

**REQ-U-002**: 시스템은 항상 알림 설정을 사용자 선호도에 따라 적용해야 한다.
- 글로벌 알림 on/off 설정 존중
- 채널별 (데스크탑, 사운드, 인앱) 개별 설정 적용
- 스케줄별 알림 설정 우선 적용

**REQ-U-003**: 시스템은 항상 중복 알림을 방지해야 한다.
- 동일 schedule_id + 동일 시간대에 대해 1회만 알림 생성
- 이미 처리된(taken/skipped) 슬롯에 대해서는 알림 생성하지 않음

**REQ-U-004**: 시스템은 항상 알림 데이터를 기존 암호화 체계(SQLCipher)로 보호해야 한다.
- notification_settings, notifications 테이블도 암호화 DB에 저장
- 민감 정보(환자명 등) 알림 내용에 포함 시 주의

### Event-Driven (이벤트 기반 요구사항)

> 특정 이벤트 발생 시 시스템이 수행해야 하는 동작

**REQ-E-001**: WHEN 복약 시간 5분 전이 되면 THEN 사전 알림을 발송해야 한다.
- 알림 제목: "{환자명}님 복약 시간"
- 알림 본문: "{시간}에 복약 예정입니다"
- 알림 액션: 클릭 시 해당 환자의 복약 상세로 이동

**REQ-E-002**: WHEN 복약 시간이 30분 경과하고 기록이 없으면 THEN 미복용 알림을 발송해야 한다.
- 알림 제목: "복약 확인 필요"
- 알림 본문: "{환자명}님의 {시간} 복약이 기록되지 않았습니다"
- 알림 유형: 경고 (warning)

**REQ-E-003**: WHEN 매일 지정된 시간(기본 09:00)이 되면 THEN 일일 복약 요약을 발송해야 한다.
- 알림 제목: "오늘의 복약 현황"
- 알림 본문: "오늘 예정된 복약: {total}건, 완료: {completed}건"
- 알림 액션: 클릭 시 대시보드로 이동

**REQ-E-004**: WHEN 알림을 클릭하면 THEN 해당 컨텍스트 화면으로 이동해야 한다.
- 복약 관련 알림: 해당 환자의 복약 일정 상세
- 요약 알림: 대시보드
- 인앱 알림: 알림 센터 열기

**REQ-E-005**: WHEN 알림 설정이 변경되면 THEN 즉시 스케줄러에 반영해야 한다.
- 알림 비활성화 시 예정된 알림 취소
- 사전 알림 시간 변경 시 기존 예약 업데이트
- 채널 설정 변경 즉시 적용

**REQ-E-006**: WHEN 브라우저 알림 권한 요청이 필요하면 THEN 사용자에게 권한 요청 UI를 표시해야 한다.
- 웹 클라이언트 최초 방문 시 권한 요청
- 권한 거부 시 인앱 알림으로 fallback
- 권한 상태 저장

### State-Driven (조건 기반 요구사항)

> 특정 조건/상태에서 시스템이 수행해야 하는 동작

**REQ-S-001**: IF 애플리케이션이 포그라운드에 있으면 THEN 토스트 알림을 표시해야 한다.
- 화면 우상단에 토스트 형태로 표시
- 자동 사라짐 (5초 후)
- 클릭 시 해당 화면으로 이동

**REQ-S-002**: IF 애플리케이션이 백그라운드에 있으면 THEN 데스크탑 알림을 발송해야 한다.
- OS 네이티브 알림 사용 (Tauri Notification Plugin)
- 알림 클릭 시 앱을 포그라운드로 가져옴
- 사운드 설정에 따라 알림음 재생

**REQ-S-003**: IF 3일 연속 미복용이면 THEN 긴급 알림을 발송해야 한다.
- 알림 우선순위: 높음
- 알림 유형: 긴급 (critical)
- 인앱 알림 센터에 고정 표시

**REQ-S-004**: IF 알림 센터에 읽지 않은 알림이 있으면 THEN 사이드바에 배지를 표시해야 한다.
- 읽지 않은 알림 개수 표시
- 알림 읽음 처리 시 배지 업데이트
- 최대 99+ 표시

**REQ-S-005**: IF 웹 클라이언트에서 접속 중이면 THEN 브라우저 알림을 사용해야 한다.
- Notification API 사용
- 권한 허용 시에만 브라우저 알림 발송
- 폴링 또는 SSE로 알림 수신

**REQ-S-006**: IF 복약 일정이 비활성화(종료)되면 THEN 해당 일정의 알림을 중지해야 한다.
- 예약된 알림 취소
- 신규 알림 생성 방지
- 알림 이력은 보존

### Unwanted (금지 요구사항)

> 시스템이 수행해서는 안 되는 동작

**REQ-N-001**: 시스템은 사용자가 명시적으로 비활성화한 채널로 알림을 발송하지 않아야 한다.
- 데스크탑 알림 off → 데스크탑 알림 발송 금지
- 사운드 off → 알림음 재생 금지
- 인앱 알림 off → 토스트 표시 금지

**REQ-N-002**: 시스템은 업무 시간 외(기본 22:00~07:00)에 데스크탑 알림을 발송하지 않아야 한다.
- 방해 금지 시간대 설정 가능
- 해당 시간대의 알림은 인앱 알림으로만 저장
- 긴급 알림은 예외 (설정에 따라)

**REQ-N-003**: 시스템은 알림 스팸을 생성하지 않아야 한다.
- 동일 내용 알림 5분 내 재발송 금지
- 미확인 알림 누적 시 요약 알림으로 통합
- 1분당 최대 5개 알림 제한

**REQ-N-004**: 시스템은 민감 정보를 알림 미리보기(데스크탑)에 노출하지 않아야 한다.
- 데스크탑 알림에는 환자 전체 이름 대신 이니셜 또는 마스킹 사용 가능 (설정)
- 상세 정보는 앱 내에서만 확인

### Optional (선택 요구사항)

> 가능하면 제공하면 좋은 기능

**REQ-O-001**: 가능하면 알림 스케줄을 개별 환자/일정별로 커스터마이징할 수 있어야 한다.
- 스케줄별 사전 알림 시간 설정 (5분, 10분, 15분, 30분)
- 스케줄별 알림 on/off
- VIP 환자 우선 알림 설정

**REQ-O-002**: 가능하면 알림 이력을 검색 및 필터링할 수 있어야 한다.
- 날짜 범위 필터
- 알림 유형 필터 (일반, 경고, 긴급)
- 환자별 필터

**REQ-O-003**: 가능하면 알림 사운드를 커스터마이징할 수 있어야 한다.
- 기본 사운드 선택 (3-5개 프리셋)
- 알림 유형별 다른 사운드 설정
- 볼륨 조절

**REQ-O-004**: 가능하면 주간 복약 리포트 알림을 제공할 수 있어야 한다.
- 매주 월요일 이행률 요약
- 우수 이행 환자 하이라이트
- 주의 필요 환자 목록

---

## 데이터 모델

### NotificationSettings (알림 설정)

```typescript
interface NotificationSettings {
  id: string;                        // UUID v4
  // 글로벌 설정
  enabled: boolean;                  // 알림 전체 활성화
  desktop_enabled: boolean;          // 데스크탑 알림 활성화
  sound_enabled: boolean;            // 사운드 활성화
  inapp_enabled: boolean;            // 인앱 알림 활성화
  // 시간 설정
  advance_minutes: number;           // 사전 알림 시간 (분)
  daily_summary_time: string;        // 일일 요약 시간 (HH:mm)
  quiet_start: string;               // 방해 금지 시작 (HH:mm)
  quiet_end: string;                 // 방해 금지 종료 (HH:mm)
  quiet_allow_critical: boolean;     // 방해 금지 중 긴급 알림 허용
  // 프라이버시
  mask_patient_name: boolean;        // 환자명 마스킹 (데스크탑)
  // 사운드
  sound_preset: string;              // 사운드 프리셋 이름
  sound_volume: number;              // 볼륨 (0-100)
  // 메타
  created_at: string;
  updated_at: string;
}
```

### ScheduleNotificationConfig (일정별 알림 설정)

```typescript
interface ScheduleNotificationConfig {
  id: string;                        // UUID v4
  schedule_id: string;               // 복약 일정 ID (FK)
  enabled: boolean;                  // 이 일정에 대한 알림 활성화
  advance_minutes?: number;          // 사전 알림 시간 (null이면 글로벌 설정 사용)
  priority: 'normal' | 'high';       // 알림 우선순위
  created_at: string;
  updated_at: string;
}
```

### Notification (알림)

```typescript
interface Notification {
  id: string;                        // UUID v4
  type: NotificationType;            // 알림 유형
  priority: NotificationPriority;    // 우선순위
  title: string;                     // 알림 제목
  body: string;                      // 알림 본문
  // 연결 정보
  schedule_id?: string;              // 관련 복약 일정 ID
  patient_id?: string;               // 관련 환자 ID
  action_url?: string;               // 클릭 시 이동 URL
  // 상태
  is_read: boolean;                  // 읽음 여부
  is_dismissed: boolean;             // 해제 여부
  is_sent_desktop: boolean;          // 데스크탑 발송 여부
  is_sent_sound: boolean;            // 사운드 재생 여부
  // 메타
  created_at: string;
  read_at?: string;
  dismissed_at?: string;
}

type NotificationType =
  | 'medication_reminder'    // 복약 시간 알림
  | 'medication_missed'      // 미복용 알림
  | 'medication_critical'    // 연속 미복용 긴급
  | 'daily_summary'          // 일일 요약
  | 'weekly_report';         // 주간 리포트

type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';
```

---

## 기술 명세

### 프론트엔드

| 항목 | 기술 | 비고 |
|------|------|------|
| 알림 상태 관리 | Zustand | notificationStore 신규 생성 |
| 토스트 알림 | React Hot Toast 또는 커스텀 | 경량 라이브러리 |
| 알림 센터 UI | React 컴포넌트 | 사이드 패널 형태 |
| 브라우저 알림 | Notification API | 웹 클라이언트용 |
| 사운드 재생 | Web Audio API | 볼륨 조절 가능 |

### 백엔드 (Rust)

| 항목 | 기술 | 비고 |
|------|------|------|
| 데스크탑 알림 | tauri-plugin-notification | Tauri 2.x 호환 |
| 스케줄러 | tokio + chrono | 백그라운드 태스크 |
| DB 테이블 | SQLite + SQLCipher | notification_settings, notifications |
| API | Tauri IPC / Axum HTTP | 기존 패턴 준수 |

### API 엔드포인트 (추가 필요)

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| /notifications | GET | 알림 목록 조회 |
| /notifications/:id/read | POST | 알림 읽음 처리 |
| /notifications/:id/dismiss | POST | 알림 해제 |
| /notifications/read-all | POST | 전체 읽음 처리 |
| /notification-settings | GET | 알림 설정 조회 |
| /notification-settings | PUT | 알림 설정 수정 |
| /schedules/:id/notification-config | GET | 일정별 알림 설정 조회 |
| /schedules/:id/notification-config | PUT | 일정별 알림 설정 수정 |

---

## 제약사항

### 기술적 제약

- Tauri 2.x의 notification 플러그인 API 준수
- tokio 런타임 기반 비동기 스케줄러
- 기존 SQLCipher 암호화 체계 유지
- 웹 클라이언트는 Notification API 권한 필요

### 비즈니스 제약

- 방해 금지 시간대 기본 22:00-07:00
- 알림 이력 30일 보존
- 긴급 알림은 방해 금지 시간에도 선택적 발송 가능

### 성능 제약

- 스케줄러 체크 주기: 1분
- 알림 발송 지연: < 30초
- 알림 목록 로딩: < 500ms
- 메모리 사용: 스케줄러 상주로 인한 추가 < 10MB

---

## 트레이서빌리티

### 관련 문서

- .moai/specs/SPEC-MED-003/plan.md - 구현 계획
- .moai/specs/SPEC-MED-003/acceptance.md - 인수 조건

### 관련 코드 (수정/추가 대상)

- src-tauri/Cargo.toml - tauri-plugin-notification 추가
- src-tauri/src/models.rs - NotificationSettings, Notification 모델 추가
- src-tauri/src/db.rs - notification 테이블 및 CRUD 함수 추가
- src-tauri/src/notification.rs - 알림 스케줄러 모듈 (신규)
- src-tauri/src/web_api.rs - 알림 REST 엔드포인트 추가
- src/store/notificationStore.ts - 알림 상태 관리 (신규)
- src/components/notification/* - 알림 UI 컴포넌트 (신규)
- src/pages/Settings.tsx - 알림 설정 탭 추가

### 의존 SPEC

- SPEC-MED-001: 복약 기록 시스템 (MedicationSchedule, MedicationLog 모델)
- SPEC-MED-002: 복약관리 웹 클라이언트 API (REST API 패턴)

### 연관 기능

- 복약 일정 관리 (medication_schedules)
- 복약 기록 (medication_logs)
- 환자 관리 (patients)
- 대시보드 위젯

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
