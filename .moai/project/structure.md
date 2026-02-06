# 프로젝트 구조

Gosibang 프로젝트의 디렉토리 구조와 각 모듈의 역할을 설명합니다.

---

## 디렉토리 트리

```
gosibang/
├── src/                          # 프론트엔드 소스 코드
│   ├── App.tsx                   # 데스크톱 앱 메인 컴포넌트
│   ├── WebApp.tsx                # 웹 클라이언트 메인 컴포넌트
│   ├── main.tsx                  # 앱 엔트리 포인트
│   ├── index.css                 # 글로벌 스타일 (Tailwind)
│   ├── vite-env.d.ts             # Vite 환경 타입 선언
│   │
│   ├── pages/                    # 페이지 컴포넌트 (18개)
│   │   ├── Dashboard.tsx         # 대시보드
│   │   ├── Patients.tsx          # 환자 관리
│   │   ├── Charts.tsx            # 차트/진료 기록
│   │   ├── Prescriptions.tsx     # 처방 관리
│   │   ├── PrescriptionDefinitions.tsx  # 처방 템플릿 정의
│   │   ├── Medications.tsx       # 약품/복약 관리
│   │   ├── SurveyTemplates.tsx   # 설문 템플릿
│   │   ├── SurveyResponses.tsx   # 설문 응답
│   │   ├── PatientSurvey.tsx     # 환자 설문 입력
│   │   ├── KioskSurvey.tsx       # 키오스크 모드 설문
│   │   ├── Homework.tsx          # 숙제 (사용자)
│   │   ├── HomeworkAdmin.tsx     # 숙제 관리 (관리자)
│   │   ├── SubscriptionAdmin.tsx # 구독 관리
│   │   ├── Settings.tsx          # 설정
│   │   ├── Login.tsx             # 로그인
│   │   ├── WebLogin.tsx          # 웹 클라이언트 로그인
│   │   ├── WebDashboard.tsx      # 웹 대시보드
│   │   └── WebPatients.tsx       # 웹 환자 관리
│   │
│   ├── components/               # 재사용 UI 컴포넌트
│   │   ├── Layout.tsx            # 데스크톱 레이아웃
│   │   ├── WebLayout.tsx         # 웹 클라이언트 레이아웃
│   │   ├── Sidebar.tsx           # 사이드바 네비게이션
│   │   ├── InitialChartView.tsx  # 초진 차트 뷰
│   │   ├── ProgressNoteView.tsx  # 경과 기록 뷰
│   │   ├── PrescriptionInput.tsx # 처방 입력 컴포넌트
│   │   ├── StaffAccountsTab.tsx  # 내부계정 관리 탭
│   │   ├── AnnouncementBanner.tsx # 공지사항 배너
│   │   └── survey/               # 설문 관련 컴포넌트
│   │       ├── QuestionRenderer.tsx    # 질문 렌더러
│   │       └── SurveySessionModal.tsx  # 설문 세션 모달
│   │
│   ├── lib/                      # 유틸리티 모듈 (12개)
│   │   ├── localDb.ts            # 로컬 SQLite DB (sql.js)
│   │   ├── prescriptionData.ts   # 처방 데이터 관리
│   │   ├── supabase.ts           # Supabase 클라이언트
│   │   ├── backup.ts             # 백업/복원 기능
│   │   ├── surveyData.ts         # 설문 데이터
│   │   ├── surveyUtils.ts        # 설문 유틸리티
│   │   ├── menuConfig.ts         # 메뉴 설정
│   │   ├── platform.ts           # 플랫폼 감지 (Tauri/Web)
│   │   ├── tauri.ts              # Tauri IPC 래퍼
│   │   ├── webApi.ts             # 웹 API (서버측)
│   │   └── webApiClient.ts       # 웹 API 클라이언트
│   │
│   ├── store/                    # Zustand 상태 관리 (7개)
│   │   ├── authStore.ts          # 데스크톱 인증 (Supabase)
│   │   ├── webAuthStore.ts       # 웹 클라이언트 인증 (내부계정)
│   │   ├── patientStore.ts       # 환자 데이터 상태
│   │   ├── surveyStore.ts        # 설문 세션 상태
│   │   ├── homeworkStore.ts      # 숙제 목록/제출 상태
│   │   ├── clinicStore.ts        # 한의원 설정 캐시
│   │   └── featureStore.ts       # 기능 권한 상태
│   │
│   ├── hooks/                    # 커스텀 React 훅
│   │   ├── useAutoBackup.ts      # 자동 백업
│   │   ├── usePlanLimits.ts      # 플랜 제한 확인
│   │   └── useSurveyRealtime.ts  # 설문 실시간 동기화
│   │
│   ├── types/                    # TypeScript 타입 정의
│   │   └── index.ts              # 전체 타입 (495줄)
│   │
│   └── assets/                   # 정적 자원
│       └── react.svg             # React 로고
│
├── src-tauri/                    # Tauri Rust 백엔드
│   ├── Cargo.toml                # Rust 의존성
│   ├── Cargo.lock                # 의존성 락 파일
│   ├── tauri.conf.json           # Tauri 설정
│   ├── build.rs                  # 빌드 스크립트
│   ├── src/                      # Rust 소스 (11개 모듈)
│   │   ├── main.rs               # 앱 진입점
│   │   ├── lib.rs                # 라이브러리 모듈 정의
│   │   ├── commands.rs           # Tauri 커맨드 (IPC 핸들러)
│   │   ├── db.rs                 # SQLite 데이터베이스 관리
│   │   ├── models.rs             # 데이터 모델 정의
│   │   ├── auth.rs               # 인증 로직
│   │   ├── encryption.rs         # 암호화 유틸리티
│   │   ├── sync.rs               # 클라우드 동기화
│   │   ├── server.rs             # 내장 HTTP 서버 (Axum)
│   │   ├── web_api.rs            # 웹 API 엔드포인트
│   │   └── error.rs              # 에러 타입 정의
│   ├── icons/                    # 앱 아이콘
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   ├── icon.icns             # macOS
│   │   └── icon.ico              # Windows
│   ├── resources/                # 번들 리소스
│   │   ├── prescription_definitions.json  # 처방 템플릿 (51KB)
│   │   └── prescription_categories.json   # 처방 카테고리 (1.6KB)
│   └── target/                   # 빌드 출력 (Git 무시)
│
├── package.json                  # npm 의존성
├── vite.config.ts                # Vite 빌드 설정
├── tsconfig.json                 # TypeScript 설정
├── eslint.config.js              # ESLint 설정
├── index.html                    # HTML 진입점
└── .moai/                        # MoAI 프로젝트 설정
    └── project/                  # 프로젝트 문서
        ├── product.md            # 제품 문서
        ├── structure.md          # 구조 문서 (현재 파일)
        └── tech.md               # 기술 문서
```

---

## 디렉토리 용도 설명

### src/pages/ - 페이지 컴포넌트

각 페이지는 하나의 기능 단위를 담당합니다. React Router를 통해 라우팅됩니다.

| 파일 | 용도 | 라우트 |
|------|------|--------|
| Dashboard.tsx | 대시보드 (통계/현황) | / |
| Patients.tsx | 환자 CRUD | /patients |
| Charts.tsx | 초진/경과 기록 | /charts |
| Prescriptions.tsx | 처방전 관리 | /prescriptions |
| PrescriptionDefinitions.tsx | 처방 템플릿 | /prescription-definitions |
| Medications.tsx | 복약 관리 | /medications |
| SurveyTemplates.tsx | 설문 템플릿 | /survey-templates |
| SurveyResponses.tsx | 설문 응답 | /survey-responses |
| PatientSurvey.tsx | 환자용 설문 | /survey/:token |
| KioskSurvey.tsx | 키오스크 설문 | /kiosk |
| Homework.tsx | 숙제 (사용자) | /homework |
| HomeworkAdmin.tsx | 숙제 관리 | /homework-admin |
| SubscriptionAdmin.tsx | 구독 관리 | /subscription |
| Settings.tsx | 앱 설정 | /settings |
| Login.tsx | 데스크톱 로그인 | /login |
| WebLogin.tsx | 웹 로그인 | /web/login |
| WebDashboard.tsx | 웹 대시보드 | /web/dashboard |
| WebPatients.tsx | 웹 환자 관리 | /web/patients |

### src/lib/ - 핵심 유틸리티

| 파일 | 용도 | 설명 |
|------|------|------|
| localDb.ts | 로컬 DB | sql.js 기반 SQLite, 오프라인 데이터 저장 |
| prescriptionData.ts | 처방 데이터 | 처방 템플릿, 약재 데이터 관리 |
| supabase.ts | Supabase | 클라우드 인증 및 실시간 동기화 |
| backup.ts | 백업 | 데이터 백업/복원 기능 |
| tauri.ts | Tauri API | Tauri IPC 호출 래퍼 함수 |
| webApi.ts | HTTP 서버 | 웹 클라이언트용 내장 API 서버 로직 |
| webApiClient.ts | API 클라이언트 | 웹 클라이언트 HTTP API 호출 |
| platform.ts | 플랫폼 감지 | Tauri/Web 환경 구분 |
| menuConfig.ts | 메뉴 설정 | 사이드바 메뉴 구성 |
| surveyData.ts | 설문 데이터 | 설문 관련 데이터 처리 |
| surveyUtils.ts | 설문 유틸 | 설문 헬퍼 함수 |

### src/store/ - 상태 관리

Zustand를 사용한 전역 상태 관리 스토어입니다.

| 파일 | 용도 | 주요 상태 |
|------|------|----------|
| authStore.ts | 데스크톱 인증 | user, subscription, is_authenticated |
| webAuthStore.ts | 웹 인증 | staff_account, token, permissions |
| patientStore.ts | 환자 상태 | selectedPatient, searchQuery |
| surveyStore.ts | 설문 상태 | currentSession, responses |
| homeworkStore.ts | 숙제 상태 | homeworks, submissions |
| clinicStore.ts | 한의원 설정 | clinicSettings |
| featureStore.ts | 기능 권한 | planFeatures, featureAccess |

### src/hooks/ - 커스텀 훅

| 파일 | 용도 | 설명 |
|------|------|------|
| useAutoBackup.ts | 자동 백업 | 주기적 자동 백업 실행 |
| usePlanLimits.ts | 플랜 제한 | 구독 플랜별 기능 제한 확인 |
| useSurveyRealtime.ts | 실시간 동기화 | Supabase 실시간 구독 |

### src/components/ - UI 컴포넌트

재사용 가능한 UI 컴포넌트와 레이아웃입니다.

| 파일 | 용도 |
|------|------|
| Layout.tsx | 데스크톱 앱 기본 레이아웃 (Sidebar 포함) |
| WebLayout.tsx | 웹 클라이언트 레이아웃 |
| Sidebar.tsx | 메인 네비게이션 사이드바 |
| InitialChartView.tsx | 초진 차트 표시/편집 |
| ProgressNoteView.tsx | 경과 기록 (SOAP) 표시/편집 |
| PrescriptionInput.tsx | 처방 입력 폼 |
| StaffAccountsTab.tsx | 내부계정 관리 UI |
| AnnouncementBanner.tsx | 공지사항 배너 |
| survey/QuestionRenderer.tsx | 설문 질문 유형별 렌더러 |
| survey/SurveySessionModal.tsx | 설문 세션 관리 모달 |

---

## src-tauri/src/ - Rust 백엔드 모듈

Tauri 2.9 기반의 네이티브 백엔드입니다.

| 파일 | 용도 | 주요 기능 |
|------|------|----------|
| main.rs | 앱 진입점 | Tauri 앱 초기화 |
| lib.rs | 라이브러리 | 모듈 정의, Tauri 설정 |
| commands.rs | IPC 핸들러 | 프론트엔드 호출 처리 |
| db.rs | 데이터베이스 | SQLite + SQLCipher 관리 |
| models.rs | 데이터 모델 | Rust 구조체 정의 |
| auth.rs | 인증 | 비밀번호 해싱, 토큰 관리 |
| encryption.rs | 암호화 | DB 암호화 키 관리 |
| sync.rs | 동기화 | Supabase 클라우드 동기화 |
| server.rs | HTTP 서버 | Axum 기반 웹 서버 |
| web_api.rs | 웹 API | REST 엔드포인트 정의 |
| error.rs | 에러 처리 | 커스텀 에러 타입 |

---

## 핵심 파일 위치

### 신규 기능 추가 시 참조 파일

| 작업 | 프론트엔드 | 백엔드 |
|-----|-----------|--------|
| 새 페이지 추가 | src/pages/ | - |
| 새 컴포넌트 추가 | src/components/ | - |
| 새 상태 추가 | src/store/ | - |
| 새 타입 추가 | src/types/index.ts | src-tauri/src/models.rs |
| 새 IPC 커맨드 추가 | src/lib/tauri.ts | src-tauri/src/commands.rs |
| 새 DB 테이블 추가 | src/lib/localDb.ts | src-tauri/src/db.rs |
| 웹 API 추가 | src/lib/webApiClient.ts | src-tauri/src/web_api.rs |
| 라우트 추가 | src/App.tsx 또는 src/WebApp.tsx | - |

### 데이터 계층

- 로컬 DB 스키마: src/lib/localDb.ts
- 타입 정의: src/types/index.ts
- 처방 기본 데이터: src-tauri/resources/prescription_*.json

### 인증 계층

- Supabase 인증: src/store/authStore.ts + src/lib/supabase.ts
- 웹 내부계정 인증: src/store/webAuthStore.ts + src-tauri/src/auth.rs

### 설정 파일

- Vite 빌드: vite.config.ts
- TypeScript: tsconfig.json
- ESLint: eslint.config.js
- Tauri 앱: src-tauri/tauri.conf.json
- Rust 의존성: src-tauri/Cargo.toml

---

## 모듈 의존성 관계

### 프론트엔드 의존성

```
main.tsx (진입점)
├── App.tsx (데스크톱)
│   ├── Layout.tsx
│   │   └── Sidebar.tsx (menuConfig.ts)
│   └── pages/*.tsx
│       ├── lib/localDb.ts (로컬 저장)
│       ├── lib/tauri.ts (IPC 호출)
│       ├── lib/supabase.ts (클라우드)
│       └── store/*.ts (상태 관리)
│
└── WebApp.tsx (웹 클라이언트)
    ├── WebLayout.tsx
    └── Web*.tsx 페이지
        ├── lib/webApiClient.ts (HTTP API)
        └── store/webAuthStore.ts
```

### 백엔드 의존성

```
main.rs (진입점)
└── lib.rs (Tauri 설정)
    ├── commands.rs (IPC 핸들러)
    │   ├── db.rs (데이터베이스)
    │   │   └── encryption.rs (암호화)
    │   ├── auth.rs (인증)
    │   └── sync.rs (동기화)
    ├── server.rs (HTTP 서버)
    │   └── web_api.rs (REST API)
    │       ├── db.rs
    │       └── auth.rs
    ├── models.rs (데이터 모델)
    └── error.rs (에러 처리)
```

### 데이터 흐름

```
[React 컴포넌트]
    │
    ├─(Tauri IPC)─► [commands.rs] → [db.rs] → SQLite
    │
    └─(Supabase)──► [supabase.ts] → Supabase Cloud

[웹 브라우저]
    │
    └─(HTTP:8787)─► [server.rs] → [web_api.rs] → [db.rs] → SQLite
```

---

*마지막 업데이트: 2026-02-06*
