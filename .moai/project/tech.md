# 기술 스택

Gosibang 프로젝트의 기술 스택, 선택 근거, 개발 환경 요구사항을 설명합니다.

---

## 기술 스택 개요

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                      고시방 시스템                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐        ┌─────────────────────────────┐ │
│  │  데스크톱 앱     │        │      웹 클라이언트           │ │
│  │  (Tauri Shell)  │        │   (브라우저 접속)            │ │
│  │  ┌───────────┐  │        │                             │ │
│  │  │  React 19 │  │        │       React 19              │ │
│  │  │ Frontend  │  │        │       Frontend              │ │
│  │  └─────┬─────┘  │        └──────────┬──────────────────┘ │
│  │        │IPC     │                   │HTTP                │
│  │  ┌─────▼─────┐  │        ┌──────────▼──────────────────┐ │
│  │  │   Rust    │  │        │     Axum HTTP Server        │ │
│  │  │  Backend  │◄─┼────────┤       (Port 8787)           │ │
│  │  └─────┬─────┘  │        └──────────┬──────────────────┘ │
│  └────────┼────────┘                   │                    │
│           │                            │                    │
│  ┌────────▼────────────────────────────▼──────────────────┐ │
│  │              SQLite + SQLCipher (암호화)                │ │
│  └─────────────────────────┬──────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │ (선택적 동기화)
                    ┌────────▼────────┐
                    │    Supabase     │
                    │  (클라우드 동기화) │
                    └─────────────────┘
```

---

## 프론트엔드 기술 스택

### 핵심 프레임워크

| 기술 | 버전 | 역할 |
|-----|------|------|
| React | 19.2.0 | UI 프레임워크 |
| TypeScript | 5.9.3 | 타입 안전성 |
| Vite | 7.2.4 | 번들러 및 개발 서버 |
| Tailwind CSS | 4.1.18 | 유틸리티 기반 스타일링 |

### 상태 관리 및 데이터

| 기술 | 버전 | 역할 |
|-----|------|------|
| Zustand | 5.0.9 | 전역 상태 관리 |
| TanStack React Query | 5.90.12 | 서버 상태 관리 및 캐싱 |
| sql.js | 1.13.0 | 브라우저용 SQLite |

### 라우팅 및 UI

| 기술 | 버전 | 역할 |
|-----|------|------|
| React Router DOM | 7.11.0 | 클라이언트 사이드 라우팅 |
| Lucide React | 0.562.0 | 아이콘 라이브러리 |

### 외부 서비스

| 기술 | 버전 | 역할 |
|-----|------|------|
| Supabase JS | 2.89.0 | 인증 및 클라우드 동기화 |

---

## 백엔드 기술 스택 (Rust)

### 핵심 프레임워크

| 기술 | 버전 | 역할 |
|-----|------|------|
| Rust | 1.77.2+ | 시스템 프로그래밍 언어 |
| Tauri | 2.9.5 | 데스크톱 앱 프레임워크 |
| Axum | 0.8 | HTTP 서버 프레임워크 |
| Tokio | 1.x (full) | 비동기 런타임 |

### 데이터베이스

| 기술 | 버전 | 역할 |
|-----|------|------|
| rusqlite | 0.32 | SQLite 바인딩 |
| SQLCipher | (bundled) | 데이터베이스 암호화 |

**SQLCipher 설정**:
- bundled-sqlcipher-vendored-openssl: OpenSSL도 정적으로 빌드하여 DLL 의존성 제거

### 보안

| 기술 | 버전 | 역할 |
|-----|------|------|
| Argon2 | 0.5 | 비밀번호 해싱 (권장) |
| Bcrypt | 0.15 | 비밀번호 해싱 (호환) |
| rand | 0.8 | 난수 생성 |

### HTTP 및 네트워킹

| 기술 | 버전 | 역할 |
|-----|------|------|
| reqwest | 0.12 | HTTP 클라이언트 (rustls-tls) |
| tower | 0.5 | 미들웨어 프레임워크 |
| tower-http | 0.6 | HTTP 미들웨어 (CORS, 정적파일) |

### 직렬화 및 유틸리티

| 기술 | 버전 | 역할 |
|-----|------|------|
| serde | 1.0 | 직렬화/역직렬화 |
| serde_json | 1.0 | JSON 처리 |
| chrono | 0.4 | 날짜/시간 처리 |
| uuid | 1.11 | UUID v4 생성 |
| thiserror | 2.0 | 에러 처리 |
| log | 0.4 | 로깅 |
| once_cell | 1.20 | 지연 초기화 |
| dirs | 5.0 | 시스템 디렉토리 경로 |

### QR 코드 및 이미지

| 기술 | 버전 | 역할 |
|-----|------|------|
| qrcode | 0.14 | QR 코드 생성 |
| image | 0.25 | 이미지 처리 |
| base64 | 0.22 | Base64 인코딩 |

### 정적 파일 임베딩

| 기술 | 버전 | 역할 |
|-----|------|------|
| rust-embed | 8.5 | 바이너리에 파일 임베딩 |
| mime_guess | 2.0 | MIME 타입 추론 |

### Tauri 플러그인

| 기술 | 버전 | 역할 |
|-----|------|------|
| tauri-plugin-log | 2.x | 로깅 플러그인 |
| tauri-plugin-shell | 2.x | 쉘 명령 실행 |

---

## 프레임워크 선택 근거

### Tauri 선택 이유

**장점**:
- Electron 대비 작은 바이너리 크기 (약 10-20MB vs 150MB+)
- 낮은 메모리 사용량
- Rust 백엔드로 높은 성능 및 보안
- 네이티브 시스템 API 접근
- 크로스 플랫폼 지원 (Windows, macOS, Linux)

**Electron 대비 트레이드오프**:
- Rust 학습 곡선
- 생태계 규모가 작음
- 웹뷰 기반으로 OS별 렌더링 차이 가능

### React 19 선택 이유

- 최신 Concurrent 기능 활용
- 풍부한 생태계 및 커뮤니티
- 컴포넌트 기반 아키텍처로 재사용성 향상
- Tauri와의 우수한 호환성

### Zustand 선택 이유

- Redux 대비 간결한 API (보일러플레이트 감소)
- 타입스크립트 친화적
- 작은 번들 크기 (~1KB gzipped)
- 미들웨어 지원 (persist, devtools)

### SQLCipher 선택 이유

- 의료 데이터 보안 요구사항 충족
- AES-256 암호화
- 투명한 암호화 (쿼리 코드 변경 불필요)
- 오프라인 환경에서도 데이터 보호

### Axum 선택 이유

- Tokio 기반으로 비동기 성능 우수
- Tower 미들웨어 생태계 활용
- 타입 안전한 라우팅
- Rust 웹 프레임워크 중 인기 상승

---

## 아키텍처 패턴

### Offline-First Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    사용자 인터페이스                      │
│                     (React + Tailwind)                   │
├─────────────────────────────────────────────────────────┤
│                      상태 관리 계층                       │
│              (Zustand + TanStack Query)                  │
├───────────────────────┬─────────────────────────────────┤
│    로컬 데이터베이스   │        클라우드 서비스           │
│      (sql.js)         │        (Supabase)               │
│                       │                                  │
│  - 환자 데이터        │  - 인증                          │
│  - 차트/처방          │  - 실시간 구독                   │
│  - 설문 응답          │  - 원격 백업                     │
└───────────────────────┴─────────────────────────────────┘
```

### Hybrid Application Pattern

데스크톱 앱과 웹 클라이언트가 동일한 백엔드를 공유합니다.

**데스크톱 앱 (Tauri)**:
- React 프론트엔드 (App.tsx + Layout.tsx)
- Rust 백엔드 (파일 시스템, 윈도우 관리)
- IPC 통신

**웹 클라이언트**:
- React 프론트엔드 (WebApp.tsx + WebLayout.tsx)
- 내장 HTTP 서버 (server.rs - 포트 8787)
- REST API 통신

---

## 개발 환경 요구사항

### 필수 도구

| 도구 | 최소 버전 | 용도 |
|------|----------|------|
| Node.js | 20.x LTS | JavaScript 런타임 |
| npm | 10.x | 패키지 관리 |
| Rust | 1.77.2+ | Tauri 백엔드 빌드 |
| cargo | (Rust 포함) | Rust 패키지 관리 |

### 시스템 요구사항

#### 개발 환경
- OS: Windows 10/11, macOS 10.15+, Ubuntu 20.04+
- RAM: 8GB 이상 권장
- 디스크: 5GB 이상 (Rust 툴체인 + node_modules)

#### Windows 추가 요구사항
- Visual Studio Build Tools (C++ 빌드 도구)
- WebView2 런타임 (빌드 시 자동 번들링)

#### Linux 추가 요구사항

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

### 권장 IDE 설정

**VS Code 확장**:
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- rust-analyzer (Rust 개발용)
- Tauri 확장
- ESLint

---

## 빌드 및 배포 설정

### 개발 모드

```bash
# 의존성 설치
npm install

# 프론트엔드만 실행 (Vite 개발 서버, 포트 5173)
npm run dev

# Tauri 개발 모드 (프론트엔드 + 백엔드)
npm run tauri:dev
```

### 프로덕션 빌드

```bash
# TypeScript 컴파일 + Vite 빌드
npm run build

# Tauri 프로덕션 빌드
npm run tauri:build
```

### 빌드 결과물

| 플랫폼 | 출력 경로 | 형식 |
|--------|----------|------|
| Windows | src-tauri/target/release/bundle/nsis/ | NSIS 인스톨러 (.exe) |
| macOS | src-tauri/target/release/bundle/macos/ | .app 번들, .dmg |
| Linux | src-tauri/target/release/bundle/ | AppImage, .deb |

### 번들 리소스

Tauri 빌드 시 포함되는 리소스 (tauri.conf.json):
- resources/prescription_definitions.json - 처방 템플릿 데이터 (51KB)
- resources/prescription_categories.json - 처방 카테고리 데이터 (1.6KB)

### 앱 설정 (tauri.conf.json)

**윈도우 설정**:
- 기본 크기: 1280x800
- 최소 크기: 1024x600
- 리사이즈 가능, 중앙 배치

**빌드 설정**:
- 대상: nsis (Windows NSIS 설치 프로그램)
- WebView 설치 모드: embedBootstrapper

---

## 보안 고려사항

### CSP (Content Security Policy)

tauri.conf.json에 정의된 보안 정책:

```
default-src 'self';
connect-src 'self' https://*.supabase.co https://sql.js.org http://localhost:* http://127.0.0.1:*;
style-src 'self' 'unsafe-inline';
script-src 'self' 'wasm-unsafe-eval'
```

**설명**:
- default-src 'self': 기본적으로 같은 출처만 허용
- connect-src: Supabase, sql.js CDN, localhost만 허용
- script-src 'wasm-unsafe-eval': sql.js WASM 실행 허용

### 데이터 보안

- **데이터베이스 암호화**: SQLCipher (AES-256)
- **암호화 키**: 32자 이상 요구
- **비밀번호 해싱**: Argon2 (권장) + Bcrypt (호환)
- **세션 관리**: 토큰 기반

### 네트워크 보안

- **HTTPS 통신**: Supabase 연결
- **로컬 네트워크**: 웹 클라이언트는 localhost/127.0.0.1만 접근
- **CORS 설정**: tower-http를 통한 CORS 관리

---

## 성능 최적화

### 프론트엔드 최적화

- Vite 기반 빠른 HMR (Hot Module Replacement)
- Tailwind CSS JIT 모드로 CSS 최소화
- React Query를 통한 서버 상태 캐싱
- 코드 스플리팅 (동적 import)
- Lucide React tree-shaking (사용 아이콘만 번들)

### 백엔드 최적화

- Tokio 비동기 런타임으로 높은 동시성 처리
- rusqlite 연결 관리
- rust-embed로 정적 파일 바이너리 임베딩
- SQLCipher 벤더링으로 DLL 의존성 제거

### 번들 크기 최적화

- bundled-sqlcipher-vendored-openssl: OpenSSL 정적 빌드
- default-features = false 사용 (reqwest)
- Tauri 번들러 최적화
- 릴리스 빌드 시 LTO (Link Time Optimization) 활성화

---

*마지막 업데이트: 2026-02-06*
