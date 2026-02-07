# SPEC-MED-003: 복약 알림 시스템 - 구현 계획

---
spec_id: SPEC-MED-003
version: 1.0.0
status: planned
created: 2026-02-07
updated: 2026-02-07
author: yeonijae
---

## 구현 개요

복약 알림 시스템을 5개 단계로 나누어 구현한다. Tauri 알림 플러그인 설치, 백엔드 스케줄러 구현, 프론트엔드 알림 UI 구현, 알림 설정 관리, 웹 클라이언트 알림 지원 순으로 진행한다.

---

## 마일스톤

### Primary Goal: 기본 알림 인프라

**범위:**
- Tauri Notification 플러그인 설치 및 설정
- 알림 데이터 모델 및 DB 테이블 생성
- 기본 알림 스케줄러 구현 (복약 시간 알림)
- 인앱 토스트 알림 컴포넌트

**산출물:**
- src-tauri/Cargo.toml 수정 (tauri-plugin-notification)
- src-tauri/src/models.rs 모델 추가
- src-tauri/src/db.rs 테이블 및 CRUD 추가
- src-tauri/src/notification.rs 스케줄러 모듈 (신규)
- src/components/notification/Toast.tsx (신규)

### Secondary Goal: 알림 센터 및 설정

**범위:**
- 알림 센터 UI (사이드 패널)
- 알림 설정 화면
- 알림 읽음/해제 처리
- 미복용 알림 기능

**산출물:**
- src/components/notification/NotificationCenter.tsx (신규)
- src/components/notification/NotificationItem.tsx (신규)
- src/components/notification/NotificationSettings.tsx (신규)
- src/store/notificationStore.ts (신규)
- src/pages/Settings.tsx 알림 탭 추가

### Tertiary Goal: 고급 알림 기능

**범위:**
- 일일 복약 요약 알림
- 연속 미복용 긴급 알림
- 방해 금지 시간대 설정
- 사운드 알림 기능

**산출물:**
- src-tauri/src/notification.rs 일일 요약 스케줄러 추가
- src/lib/notificationSound.ts 사운드 관리 (신규)
- 사운드 프리셋 오디오 파일

### Optional Goal: 웹 클라이언트 알림

**범위:**
- 브라우저 Notification API 통합
- 알림 권한 관리 UI
- SSE 또는 폴링 기반 알림 수신
- 웹용 알림 REST API

**산출물:**
- src/lib/browserNotification.ts (신규)
- src-tauri/src/web_api.rs 알림 엔드포인트 추가
- src/components/WebLayout.tsx 알림 권한 요청 UI

---

## 작업 분해

### Phase 1: 플러그인 및 데이터 계층

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-001 | tauri-plugin-notification 설치 | src-tauri/Cargo.toml | High |
| T-002 | Tauri 설정에 플러그인 등록 | src-tauri/src/lib.rs | High |
| T-003 | NotificationSettings 모델 정의 | src-tauri/src/models.rs | High |
| T-004 | Notification 모델 정의 | src-tauri/src/models.rs | High |
| T-005 | notification_settings 테이블 생성 | src-tauri/src/db.rs | High |
| T-006 | notifications 테이블 생성 | src-tauri/src/db.rs | High |
| T-007 | 알림 CRUD 함수 구현 | src-tauri/src/db.rs | High |

### Phase 2: 알림 스케줄러

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-008 | notification.rs 모듈 생성 | src-tauri/src/notification.rs | High |
| T-009 | 복약 시간 체커 구현 | src-tauri/src/notification.rs | High |
| T-010 | 데스크탑 알림 발송 함수 | src-tauri/src/notification.rs | High |
| T-011 | 미복용 감지기 구현 | src-tauri/src/notification.rs | Medium |
| T-012 | 일일 요약 생성기 구현 | src-tauri/src/notification.rs | Medium |
| T-013 | 스케줄러 백그라운드 태스크 등록 | src-tauri/src/lib.rs | High |

### Phase 3: 프론트엔드 알림 UI

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-014 | notificationStore 생성 | src/store/notificationStore.ts | High |
| T-015 | Toast 컴포넌트 | src/components/notification/Toast.tsx | High |
| T-016 | ToastContainer 컴포넌트 | src/components/notification/ToastContainer.tsx | High |
| T-017 | NotificationItem 컴포넌트 | src/components/notification/NotificationItem.tsx | High |
| T-018 | NotificationCenter 컴포넌트 | src/components/notification/NotificationCenter.tsx | High |
| T-019 | NotificationBadge 컴포넌트 | src/components/notification/NotificationBadge.tsx | Medium |
| T-020 | Sidebar에 알림 센터 진입점 추가 | src/components/Sidebar.tsx | Medium |

### Phase 4: 알림 설정 UI

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-021 | NotificationSettings 컴포넌트 | src/components/notification/NotificationSettings.tsx | High |
| T-022 | ScheduleNotificationConfig 컴포넌트 | src/components/notification/ScheduleNotificationConfig.tsx | Medium |
| T-023 | Settings 페이지에 알림 탭 추가 | src/pages/Settings.tsx | High |
| T-024 | TypeScript 타입 정의 | src/types/index.ts | High |
| T-025 | localDb 알림 쿼리 함수 | src/lib/localDb.ts | High |

### Phase 5: 사운드 및 고급 기능

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-026 | notificationSound.ts 모듈 | src/lib/notificationSound.ts | Medium |
| T-027 | 사운드 프리셋 오디오 파일 추가 | public/sounds/*.mp3 | Medium |
| T-028 | 볼륨 조절 UI | src/components/notification/SoundSettings.tsx | Low |
| T-029 | 알림 이력 검색/필터 | src/components/notification/NotificationHistory.tsx | Low |

### Phase 6: 웹 클라이언트 알림 (Optional)

| 작업 ID | 작업명 | 파일 | 우선순위 |
|---------|--------|------|----------|
| T-030 | browserNotification.ts 모듈 | src/lib/browserNotification.ts | Low |
| T-031 | 알림 권한 요청 UI | src/components/NotificationPermission.tsx | Low |
| T-032 | 알림 REST API 엔드포인트 | src-tauri/src/web_api.rs | Low |
| T-033 | webApiClient 알림 함수 | src/lib/webApiClient.ts | Low |
| T-034 | WebLayout 알림 통합 | src/components/WebLayout.tsx | Low |

---

## 기술 접근 방식

### Tauri Notification Plugin 설정

```toml
# src-tauri/Cargo.toml에 추가
[dependencies]
tauri-plugin-notification = "2"
```

```rust
// src-tauri/src/lib.rs에 플러그인 등록
tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    // ...
```

```json
// src-tauri/capabilities/default.json에 권한 추가
{
  "permissions": [
    "notification:default",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify"
  ]
}
```

### 알림 스케줄러 구조

```rust
// src-tauri/src/notification.rs

use chrono::{Local, NaiveTime};
use tokio::time::{interval, Duration};

pub struct NotificationScheduler {
    // 설정 및 상태
}

impl NotificationScheduler {
    pub fn new() -> Self { /* ... */ }

    /// 매 분마다 실행되는 복약 시간 체커
    pub async fn check_medication_times(&self) {
        // 1. 현재 시간 기준 +-5분 이내 예정된 복약 조회
        // 2. 아직 알림 발송 안 된 건 필터링
        // 3. 데스크탑 알림 발송
        // 4. 인앱 알림 저장
    }

    /// 복약 시간 30분 경과 후 미복용 감지
    pub async fn check_missed_medications(&self) {
        // 1. 30분 전 복약 시간대 중 기록 없는 건 조회
        // 2. 미복용 알림 발송
    }

    /// 일일 요약 생성 (지정 시간에 1회)
    pub async fn send_daily_summary(&self) {
        // 1. 오늘 예정된 복약 건수 집계
        // 2. 완료/미완료 현황 포함 알림 발송
    }
}

/// 백그라운드 태스크로 스케줄러 실행
pub async fn run_scheduler(app_handle: tauri::AppHandle) {
    let scheduler = NotificationScheduler::new();
    let mut interval = interval(Duration::from_secs(60)); // 1분 간격

    loop {
        interval.tick().await;
        scheduler.check_medication_times().await;
        scheduler.check_missed_medications().await;

        // 일일 요약은 지정 시간에만
        if is_daily_summary_time() {
            scheduler.send_daily_summary().await;
        }
    }
}
```

### 프론트엔드 알림 스토어

```typescript
// src/store/notificationStore.ts

interface NotificationState {
  // 상태
  notifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings | null;
  isLoading: boolean;
  isCenterOpen: boolean;

  // 액션
  loadNotifications: () => Promise<void>;
  loadSettings: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<NotificationSettings>) => Promise<void>;

  // UI 액션
  showToast: (notification: Notification) => void;
  openCenter: () => void;
  closeCenter: () => void;
}
```

### 토스트 알림 컴포넌트

```typescript
// src/components/notification/Toast.tsx

interface ToastProps {
  notification: Notification;
  onClose: () => void;
  onAction?: () => void;
}

export function Toast({ notification, onClose, onAction }: ToastProps) {
  const priorityStyles = {
    low: 'bg-gray-100 border-gray-300',
    normal: 'bg-blue-50 border-blue-300',
    high: 'bg-yellow-50 border-yellow-300',
    critical: 'bg-red-50 border-red-300',
  };

  return (
    <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg border ${priorityStyles[notification.priority]}`}>
      <div className="flex items-start gap-3">
        <NotificationIcon type={notification.type} />
        <div>
          <h4 className="font-medium">{notification.title}</h4>
          <p className="text-sm text-gray-600">{notification.body}</p>
        </div>
        <button onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

### 브라우저 알림 모듈 (웹 클라이언트)

```typescript
// src/lib/browserNotification.ts

export class BrowserNotificationService {
  private permission: NotificationPermission = 'default';

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    const result = await Notification.requestPermission();
    this.permission = result;
    return result === 'granted';
  }

  async show(title: string, options?: NotificationOptions): Promise<void> {
    if (this.permission !== 'granted') {
      return;
    }

    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}
```

---

## 의존성 분석

### 내부 의존성

| 모듈 | 의존 대상 | 의존 유형 |
|------|-----------|-----------|
| notification.rs | db.rs | 데이터 소스 |
| notification.rs | models.rs | 데이터 모델 |
| notificationStore | localDb | 데이터 소스 |
| NotificationCenter | notificationStore | 상태 관리 |
| NotificationSettings | notificationStore | 상태 관리 |
| Toast | notificationStore | 상태 관리 |

### 외부 의존성

| 라이브러리 | 용도 | 버전 |
|------------|------|------|
| tauri-plugin-notification | 데스크탑 알림 | 2.x (신규) |
| chrono | 시간 처리 | 0.4 (기존) |
| tokio | 비동기 스케줄러 | 1.x (기존) |
| zustand | 상태 관리 | 5.0.9 (기존) |
| lucide-react | 아이콘 | 0.562.0 (기존) |

---

## 위험 분석

### 기술적 위험

| 위험 | 영향도 | 발생 가능성 | 대응 방안 |
|------|--------|-------------|-----------|
| Tauri 플러그인 호환성 | High | Low | Tauri 2.9.5 공식 지원 플러그인 사용 |
| 스케줄러 메모리 누수 | Medium | Low | 주기적 상태 정리, 오래된 알림 자동 삭제 |
| 브라우저 알림 권한 거부 | Medium | Medium | 인앱 알림 fallback 제공 |
| 동시성 이슈 (다중 알림) | Medium | Medium | 알림 큐 및 디바운싱 적용 |

### 비즈니스 위험

| 위험 | 영향도 | 발생 가능성 | 대응 방안 |
|------|--------|-------------|-----------|
| 알림 과다로 사용자 피로도 증가 | High | Medium | 스마트 그룹핑, 알림 빈도 제한 |
| 긴급 알림 누락 | High | Low | 다중 채널 발송, 확인 요청 |
| 방해 금지 시간 혼란 | Low | Low | 명확한 시간대 표시, 테스트 기능 |

---

## 품질 기준

### 코드 품질

- TypeScript strict 모드 준수
- Rust clippy 경고 0개
- ESLint 경고 0개
- 알림 관련 함수 단위 테스트

### 성능 기준

- 스케줄러 1분 주기 정확도: 오차 < 5초
- 알림 발송 지연: < 30초
- 알림 목록 로딩: < 500ms
- 스케줄러 메모리 추가 사용: < 10MB

### 접근성 기준

- 토스트 알림 스크린 리더 호환
- 키보드로 알림 해제 가능
- 색상만으로 우선순위 구분하지 않음 (아이콘 병행)

---

## 연관 문서

- spec.md - 요구사항 정의
- acceptance.md - 인수 조건

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
