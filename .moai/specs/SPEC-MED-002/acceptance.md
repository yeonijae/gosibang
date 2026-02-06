# SPEC-MED-002: 인수 조건

---
spec_id: SPEC-MED-002
version: 1.0.0
created: 2026-02-07
updated: 2026-02-07
---

## 인수 조건 개요

| 카테고리 | 시나리오 수 | 우선순위 |
|---------|-----------|---------|
| 인증 및 권한 | 6 | 필수 |
| 복약 일정 CRUD | 8 | 필수 |
| 복약 기록 CRUD | 6 | 필수 |
| 복약 통계 | 3 | 필수 |
| 웹 UI | 5 | 필수 |
| 선택 기능 | 4 | 선택 |

---

## 1. 인증 및 권한 (Authentication & Authorization)

### AC-AUTH-001: 인증 없이 API 접근 시 거부

**Given** 인증 토큰이 없는 상태에서
**When** GET /api/web/medications/schedules 요청을 보내면
**Then** HTTP 401 Unauthorized 응답을 받아야 한다
**And** 응답 본문에 "인증이 필요합니다" 메시지가 포함되어야 한다

### AC-AUTH-002: 만료된 토큰으로 접근 시 거부

**Given** 24시간이 경과한 세션 토큰으로
**When** GET /api/web/medications/schedules 요청을 보내면
**Then** HTTP 401 Unauthorized 응답을 받아야 한다

### AC-AUTH-003: medications_read 권한 없이 GET 요청 시 거부

**Given** medications_read=false인 계정으로 로그인한 상태에서
**When** GET /api/web/medications/schedules 요청을 보내면
**Then** HTTP 403 Forbidden 응답을 받아야 한다
**And** 응답 본문에 "복약 정보 읽기 권한이 없습니다" 메시지가 포함되어야 한다

### AC-AUTH-004: medications_write 권한 없이 POST 요청 시 거부

**Given** medications_read=true, medications_write=false인 계정으로 로그인한 상태에서
**When** POST /api/web/medications/schedules 요청을 보내면
**Then** HTTP 403 Forbidden 응답을 받아야 한다
**And** 응답 본문에 "복약 정보 쓰기 권한이 없습니다" 메시지가 포함되어야 한다

### AC-AUTH-005: 관리자 계정은 모든 복약 API 접근 가능

**Given** StaffRole::Admin 계정으로 로그인한 상태에서
**When** 모든 복약 API 엔드포인트에 요청을 보내면
**Then** 인증/권한 관련 오류 없이 요청이 처리되어야 한다

### AC-AUTH-006: Viewer 계정은 읽기만 가능

**Given** StaffRole::Viewer 계정으로 로그인한 상태에서
**When** GET /api/web/medications/schedules 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다

**Given** StaffRole::Viewer 계정으로 로그인한 상태에서
**When** POST /api/web/medications/logs 요청을 보내면
**Then** HTTP 403 Forbidden 응답을 받아야 한다

---

## 2. 복약 일정 CRUD (Medication Schedules)

### AC-SCHED-001: 복약 일정 목록 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**And** 데이터베이스에 3개의 복약 일정이 존재할 때
**When** GET /api/web/medications/schedules 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 3개의 복약 일정이 포함되어야 한다
**And** 각 일정에 patient_name 필드가 포함되어야 한다

### AC-SCHED-002: 특정 복약 일정 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**And** ID가 "schedule-001"인 복약 일정이 존재할 때
**When** GET /api/web/medications/schedules/schedule-001 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 해당 복약 일정의 상세 정보가 포함되어야 한다

### AC-SCHED-003: 존재하지 않는 일정 조회 시 처리

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**When** GET /api/web/medications/schedules/non-existent-id 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** data 필드가 null이어야 한다

### AC-SCHED-004: 환자별 복약 일정 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**And** 환자 "patient-001"에게 2개의 복약 일정이 있을 때
**When** GET /api/web/medications/schedules/patient/patient-001 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 2개의 복약 일정이 포함되어야 한다
**And** 모든 일정의 patient_id가 "patient-001"이어야 한다

### AC-SCHED-005: 복약 일정 생성

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**When** POST /api/web/medications/schedules 요청을 다음 데이터로 보내면:
```json
{
  "patient_id": "patient-001",
  "prescription_id": "prescription-001",
  "start_date": "2026-02-07",
  "end_date": "2026-02-14",
  "times_per_day": 3,
  "medication_times": ["08:00", "12:00", "18:00"],
  "notes": "식후 30분"
}
```
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 생성된 일정의 ID가 포함되어야 한다
**And** 데이터베이스에 해당 일정이 저장되어야 한다

### AC-SCHED-006: 복약 일정 수정

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**And** ID가 "schedule-001"인 복약 일정이 존재할 때
**When** PUT /api/web/medications/schedules/schedule-001 요청을 다음 데이터로 보내면:
```json
{
  "end_date": "2026-02-21",
  "notes": "식후 즉시 복용으로 변경"
}
```
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 데이터베이스의 해당 일정이 업데이트되어야 한다

### AC-SCHED-007: 복약 일정 삭제

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**And** ID가 "schedule-001"인 복약 일정이 존재할 때
**When** DELETE /api/web/medications/schedules/schedule-001 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 해당 일정이 삭제되거나 비활성화되어야 한다

### AC-SCHED-008: 필수 필드 누락 시 일정 생성 실패

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**When** POST /api/web/medications/schedules 요청을 patient_id 없이 보내면
**Then** HTTP 400 Bad Request 또는 500 Internal Server Error 응답을 받아야 한다
**And** 응답 본문에 오류 메시지가 포함되어야 한다

---

## 3. 복약 기록 CRUD (Medication Logs)

### AC-LOG-001: 복약 기록 목록 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**When** GET /api/web/medications/logs 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 복약 기록 배열이 포함되어야 한다

### AC-LOG-002: 일정별 복약 기록 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**And** "schedule-001"에 5개의 복약 기록이 있을 때
**When** GET /api/web/medications/logs/schedule/schedule-001 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 5개의 복약 기록이 포함되어야 한다
**And** 모든 기록의 schedule_id가 "schedule-001"이어야 한다

### AC-LOG-003: 복약 기록 생성

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**And** "schedule-001" 복약 일정이 존재할 때
**When** POST /api/web/medications/logs 요청을 다음 데이터로 보내면:
```json
{
  "schedule_id": "schedule-001",
  "taken_at": "2026-02-07T08:00:00Z",
  "status": "taken",
  "notes": "정상 복용"
}
```
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 생성된 기록의 ID가 포함되어야 한다

### AC-LOG-004: 중복 복약 기록 생성 거부

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**And** schedule_id="schedule-001", taken_at="2026-02-07T08:00:00Z"인 기록이 이미 존재할 때
**When** 동일한 schedule_id와 taken_at으로 POST 요청을 보내면
**Then** HTTP 409 Conflict 또는 적절한 오류 응답을 받아야 한다

### AC-LOG-005: 복약 기록 수정

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**And** ID가 "log-001"인 복약 기록이 존재할 때
**When** PUT /api/web/medications/logs/log-001 요청을 다음 데이터로 보내면:
```json
{
  "status": "missed",
  "notes": "외출로 인해 미복용"
}
```
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 데이터베이스의 해당 기록이 업데이트되어야 한다

### AC-LOG-006: 복약 기록 삭제 불가

**Given** medications_write 권한이 있는 계정으로 로그인한 상태에서
**When** DELETE /api/web/medications/logs/log-001 요청을 보내면
**Then** HTTP 404 Not Found 또는 405 Method Not Allowed 응답을 받아야 한다
**And** 해당 기록은 삭제되지 않아야 한다

---

## 4. 복약 통계 (Medication Stats)

### AC-STAT-001: 환자별 복약 통계 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**And** 환자 "patient-001"에게 복약 기록이 있을 때:
- 총 슬롯: 21개
- taken: 15개
- missed: 4개
- skipped: 2개
**When** GET /api/web/medications/stats/patient/patient-001 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 다음이 포함되어야 한다:
- total_slots: 21
- taken_count: 15
- missed_count: 4
- skipped_count: 2
- adherence_rate: 약 71.43 (15/21 * 100)

### AC-STAT-002: 복약 기록 없는 환자 통계 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**And** 환자 "patient-new"에게 복약 기록이 없을 때
**When** GET /api/web/medications/stats/patient/patient-new 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 응답에 다음이 포함되어야 한다:
- total_slots: 0
- adherence_rate: 0 또는 null

### AC-STAT-003: 존재하지 않는 환자 통계 조회

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**When** GET /api/web/medications/stats/patient/non-existent-patient 요청을 보내면
**Then** HTTP 200 OK 응답을 받아야 한다
**And** 빈 통계 또는 null이 반환되어야 한다

---

## 5. 웹 UI (WebMedications.tsx)

### AC-UI-001: 복약 관리 페이지 접근

**Given** medications_read 권한이 있는 계정으로 웹 클라이언트에 로그인한 상태에서
**When** /medications URL로 이동하면
**Then** 복약 관리 페이지가 렌더링되어야 한다
**And** 복약 일정 목록이 표시되어야 한다

### AC-UI-002: 권한 없을 시 페이지 접근 차단

**Given** medications_read=false인 계정으로 웹 클라이언트에 로그인한 상태에서
**When** /medications URL로 이동하면
**Then** "복약 정보 조회 권한이 없습니다" 메시지가 표시되어야 한다
**Or** 해당 메뉴가 표시되지 않아야 한다

### AC-UI-003: 복약 기록 입력 폼 표시

**Given** medications_write 권한이 있는 계정으로 복약 관리 페이지에 접근한 상태에서
**When** 특정 복약 일정을 선택하면
**Then** 복약 기록 입력 폼이 활성화되어야 한다
**And** status 선택 옵션(taken, missed, skipped)이 표시되어야 한다

### AC-UI-004: 쓰기 권한 없을 시 입력 폼 비활성화

**Given** medications_read=true, medications_write=false인 계정으로 복약 관리 페이지에 접근한 상태에서
**When** 복약 일정 목록을 확인하면
**Then** 복약 일정 목록은 정상 표시되어야 한다
**And** 복약 기록 입력/수정 버튼은 비활성화되거나 숨겨져야 한다

### AC-UI-005: 복약 통계 표시

**Given** medications_read 권한이 있는 계정으로 복약 관리 페이지에 접근한 상태에서
**When** 환자를 선택하여 통계를 조회하면
**Then** 복약 이행률(adherence_rate)이 백분율로 표시되어야 한다
**And** taken, missed, skipped 카운트가 표시되어야 한다

---

## 6. 선택 기능 (Optional)

### AC-OPT-001: 날짜 범위 필터링

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**When** GET /api/web/medications/logs?start_date=2026-02-01&end_date=2026-02-07 요청을 보내면
**Then** 해당 기간 내의 복약 기록만 반환되어야 한다

### AC-OPT-002: 기간별 통계 집계

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**When** GET /api/web/medications/stats/patient/patient-001?period=weekly 요청을 보내면
**Then** 주간 단위로 집계된 통계가 반환되어야 한다

### AC-OPT-003: 복약 일정 검색

**Given** medications_read 권한이 있는 계정으로 로그인한 상태에서
**When** GET /api/web/medications/schedules?search=홍길동 요청을 보내면
**Then** 환자명에 "홍길동"이 포함된 일정만 반환되어야 한다

### AC-OPT-004: 캘린더 뷰 표시

**Given** medications_read 권한이 있는 계정으로 복약 관리 페이지에 접근한 상태에서
**When** 캘린더 뷰 탭을 선택하면
**Then** 월간 캘린더 형태로 복약 현황이 표시되어야 한다
**And** 각 날짜에 복약 상태 아이콘이 표시되어야 한다

---

## 품질 게이트

### 필수 통과 조건

| 항목 | 기준 | 상태 |
|-----|------|------|
| 인증 검증 | AC-AUTH-001 ~ AC-AUTH-006 모두 통과 | [ ] |
| 일정 CRUD | AC-SCHED-001 ~ AC-SCHED-008 모두 통과 | [ ] |
| 기록 CRUD | AC-LOG-001 ~ AC-LOG-006 모두 통과 | [ ] |
| 통계 조회 | AC-STAT-001 ~ AC-STAT-003 모두 통과 | [ ] |
| 웹 UI | AC-UI-001 ~ AC-UI-005 모두 통과 | [ ] |

### 선택 통과 조건

| 항목 | 기준 | 상태 |
|-----|------|------|
| 날짜 필터링 | AC-OPT-001 통과 | [ ] |
| 기간 집계 | AC-OPT-002 통과 | [ ] |
| 검색 기능 | AC-OPT-003 통과 | [ ] |
| 캘린더 뷰 | AC-OPT-004 통과 | [ ] |

### 비기능 요구사항

| 항목 | 기준 | 상태 |
|-----|------|------|
| API 응답 시간 | < 500ms | [ ] |
| 에러 메시지 | 한글 메시지 제공 | [ ] |
| 데이터 암호화 | SQLCipher 사용 확인 | [ ] |

---

## 테스트 도구 및 방법

### API 테스트

- **도구**: curl, Postman, 또는 HTTPie
- **서버**: http://localhost:8787/api/web

### 인증 토큰 획득

```bash
# 로그인
curl -X POST http://localhost:8787/api/web/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'

# 토큰 사용
curl http://localhost:8787/api/web/medications/schedules \
  -H "Authorization: Bearer <token>"
```

### UI 테스트

- **브라우저**: Chrome DevTools Network 탭으로 API 호출 확인
- **경로**: http://localhost:8787 (웹 클라이언트)

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
