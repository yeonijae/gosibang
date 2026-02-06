# SPEC-MED-002: 구현 계획

---
spec_id: SPEC-MED-002
version: 1.0.0
created: 2026-02-07
updated: 2026-02-07
---

## 마일스톤 개요

| 마일스톤 | 우선순위 | 설명 | 산출물 |
|---------|---------|------|--------|
| M1 | Primary | StaffPermissions 모델 확장 | models.rs 수정 |
| M2 | Primary | Rust db.rs CRUD 함수 구현 | db.rs 수정 |
| M3 | Primary | Rust web_api.rs 엔드포인트 구현 | web_api.rs 수정 |
| M4 | Primary | TypeScript webApiClient.ts 구현 | webApiClient.ts 수정 |
| M5 | Secondary | WebMedications.tsx 페이지 구현 | 신규 페이지 생성 |
| M6 | Secondary | 통합 테스트 및 검증 | 테스트 코드, 검증 리포트 |

---

## M1: StaffPermissions 모델 확장

### 목표

StaffPermissions 구조체에 medications_read, medications_write 필드를 추가하여 복약 관련 권한 제어를 활성화한다.

### 작업 항목

**T1.1**: StaffPermissions 구조체 확장
- 파일: `src-tauri/src/models.rs`
- 추가 필드:
  - `pub medications_read: bool`
  - `pub medications_write: bool`

**T1.2**: StaffPermissions::admin() 수정
- medications_read: true
- medications_write: true

**T1.3**: StaffPermissions::staff() 수정
- medications_read: true
- medications_write: true

**T1.4**: StaffPermissions::viewer() 수정
- medications_read: true
- medications_write: false

**T1.5**: 기존 계정 마이그레이션 고려
- 기존 JSON 직렬화된 permissions에 새 필드 추가 시 Default 처리
- `#[serde(default)]` 어트리뷰트 활용

### 기술 접근

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StaffPermissions {
    // 기존 필드들...
    pub settings_read: bool,
    // 신규 필드
    #[serde(default)]
    pub medications_read: bool,
    #[serde(default)]
    pub medications_write: bool,
}
```

### 위험 요소

| 위험 | 영향도 | 완화 전략 |
|-----|-------|----------|
| 기존 계정 역직렬화 실패 | 높음 | `#[serde(default)]` 사용으로 누락 필드 기본값 처리 |
| 권한 정책 일관성 | 중간 | admin/staff/viewer 프리셋 동시 수정 |

---

## M2: Rust db.rs CRUD 함수 구현

### 목표

Axum 핸들러에서 호출할 복약 관련 CRUD 함수를 db.rs에 구현한다.

### 작업 항목

**T2.1**: list_medication_schedules() 구현
- 전체 복약 일정 목록 조회
- 환자명, 처방명 JOIN 포함

**T2.2**: get_medication_schedule() 구현
- ID 기반 단일 조회

**T2.3**: get_medication_schedules_by_patient() 구현
- 환자 ID 기반 필터링 조회

**T2.4**: create_medication_schedule() 구현
- INSERT 쿼리 실행
- 생성된 ID 반환

**T2.5**: update_medication_schedule() 구현
- UPDATE 쿼리 실행

**T2.6**: delete_medication_schedule() 구현
- DELETE 또는 soft delete 실행

**T2.7**: list_medication_logs() 구현
- 전체 복약 기록 목록 조회

**T2.8**: get_medication_log() 구현
- ID 기반 단일 조회

**T2.9**: get_medication_logs_by_schedule() 구현
- schedule_id 기반 필터링 조회

**T2.10**: create_medication_log() 구현
- INSERT 쿼리 실행
- 중복 검사 (schedule_id + taken_at)

**T2.11**: update_medication_log() 구현
- UPDATE 쿼리 실행 (status, notes만)

**T2.12**: get_medication_stats_by_patient() 구현
- 환자별 통계 계산 쿼리
- COUNT + GROUP BY 활용

### 기술 접근

기존 db.rs 패턴을 따라 구현:

```rust
pub fn list_medication_schedules() -> Result<Vec<MedicationScheduleWithDetails>, String> {
    let conn = DB_CONNECTION.lock().map_err(|e| e.to_string())?;
    let conn = conn.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(r#"
        SELECT ms.*, p.name as patient_name, pr.prescription_date
        FROM medication_schedules ms
        LEFT JOIN patients p ON ms.patient_id = p.id
        LEFT JOIN prescriptions pr ON ms.prescription_id = pr.id
        ORDER BY ms.created_at DESC
    "#).map_err(|e| e.to_string())?;

    // ... 쿼리 실행 및 매핑
}
```

### 위험 요소

| 위험 | 영향도 | 완화 전략 |
|-----|-------|----------|
| JOIN 쿼리 성능 | 중간 | 인덱스 확인, 페이지네이션 고려 |
| 트랜잭션 일관성 | 중간 | 단일 연결 내에서 처리 |

---

## M3: Rust web_api.rs 엔드포인트 구현

### 목표

Axum 라우터에 복약 관련 REST 엔드포인트를 추가하고 권한 검증을 구현한다.

### 작업 항목

**T3.1**: require_medications_read! 매크로 구현
- medications_read 권한 검증
- 미보유 시 403 반환

**T3.2**: require_medications_write! 매크로 구현
- medications_write 권한 검증
- 미보유 시 403 반환

**T3.3**: 복약 일정 엔드포인트 구현
- GET /medications/schedules
- POST /medications/schedules
- GET /medications/schedules/{id}
- PUT /medications/schedules/{id}
- DELETE /medications/schedules/{id}
- GET /medications/schedules/patient/{patient_id}

**T3.4**: 복약 기록 엔드포인트 구현
- GET /medications/logs
- POST /medications/logs
- GET /medications/logs/{id}
- PUT /medications/logs/{id}
- GET /medications/logs/schedule/{schedule_id}

**T3.5**: 복약 통계 엔드포인트 구현
- GET /medications/stats/patient/{patient_id}

**T3.6**: 라우터 등록
- create_web_api_router()에 새 라우트 추가

### 기술 접근

기존 패턴 활용:

```rust
/// 권한 검증 매크로 (읽기)
macro_rules! require_medications_read {
    ($session:expr) => {{
        if !$session.permissions.medications_read {
            return (
                StatusCode::FORBIDDEN,
                Json(ApiResponse::<()>::err("복약 정보 읽기 권한이 없습니다")),
            )
                .into_response()
        }
    }};
}

/// 복약 일정 목록 조회
async fn list_medication_schedules_api(
    State(state): State<WebApiState>,
    headers: HeaderMap,
    Query(query): Query<AuthQuery>,
) -> impl IntoResponse {
    let session = require_auth!(state, headers, query);
    require_medications_read!(session);

    match db::list_medication_schedules() {
        Ok(schedules) => Json(ApiResponse::ok(schedules)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Vec<MedicationSchedule>>::err(e.to_string())),
        )
            .into_response(),
    }
}
```

### 위험 요소

| 위험 | 영향도 | 완화 전략 |
|-----|-------|----------|
| 권한 검증 누락 | 높음 | 모든 핸들러에 매크로 적용 검증 |
| 경로 충돌 | 중간 | 기존 라우트와 충돌 없는지 확인 |

---

## M4: TypeScript webApiClient.ts 구현

### 목표

프론트엔드에서 복약 REST API를 호출할 수 있는 클라이언트 함수를 구현한다.

### 작업 항목

**T4.1**: 타입 정의 추가 (types/index.ts 또는 인라인)
- CreateMedicationScheduleRequest
- UpdateMedicationScheduleRequest
- CreateMedicationLogRequest
- UpdateMedicationLogRequest
- MedicationStatsResponse

**T4.2**: 복약 일정 API 함수 구현
- listMedicationSchedules()
- getMedicationSchedule(id)
- getMedicationSchedulesByPatient(patientId)
- createMedicationSchedule(data)
- updateMedicationSchedule(id, data)
- deleteMedicationSchedule(id)

**T4.3**: 복약 기록 API 함수 구현
- listMedicationLogs()
- getMedicationLog(id)
- getMedicationLogsBySchedule(scheduleId)
- createMedicationLog(data)
- updateMedicationLog(id, data)

**T4.4**: 복약 통계 API 함수 구현
- getMedicationStatsByPatient(patientId, options?)

### 기술 접근

기존 apiFetch 래퍼 활용:

```typescript
// ============ 복약 API ============

export interface MedicationScheduleWithDetails extends MedicationSchedule {
  patient_name: string;
  prescription_date?: string;
}

export async function listMedicationSchedules(): Promise<MedicationScheduleWithDetails[]> {
  return apiFetch<MedicationScheduleWithDetails[]>('/medications/schedules');
}

export async function getMedicationSchedule(id: string): Promise<MedicationSchedule | null> {
  return apiFetch<MedicationSchedule | null>(`/medications/schedules/${id}`);
}

export async function createMedicationSchedule(
  data: Omit<MedicationSchedule, 'id' | 'created_at'>
): Promise<string> {
  return apiFetch<string>('/medications/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ... 기타 함수
```

### 위험 요소

| 위험 | 영향도 | 완화 전략 |
|-----|-------|----------|
| 타입 불일치 | 중간 | Rust/TS 타입 동기화 검증 |
| 에러 핸들링 | 낮음 | 기존 apiFetch 에러 처리 활용 |

---

## M5: WebMedications.tsx 페이지 구현

### 목표

웹 클라이언트에서 복약 관리 기능을 사용할 수 있는 UI 페이지를 구현한다.

### 작업 항목

**T5.1**: 페이지 기본 구조 구현
- 파일: `src/pages/WebMedications.tsx`
- 레이아웃: 탭 기반 (일정 목록 / 기록 입력 / 통계)

**T5.2**: 복약 일정 목록 섹션
- 기존 MedicationScheduleList 컴포넌트 재사용
- API 연동 (listMedicationSchedules)

**T5.3**: 복약 기록 입력 섹션
- 기존 MedicationLogList, MedicationLogItem 컴포넌트 재사용
- API 연동 (createMedicationLog, updateMedicationLog)

**T5.4**: 복약 통계 섹션
- 기존 MedicationStatsCard 컴포넌트 재사용
- API 연동 (getMedicationStatsByPatient)

**T5.5**: 권한 기반 UI 제어
- medications_read 미보유 시 접근 차단
- medications_write 미보유 시 입력 폼 비활성화

**T5.6**: 라우트 등록
- WebLayout.tsx에 /medications 라우트 추가

### 기술 접근

기존 웹 페이지 패턴 활용:

```tsx
import { useEffect, useState } from 'react';
import { useWebAuth } from '../hooks/useWebAuth';
import { listMedicationSchedules, getMedicationStatsByPatient } from '../lib/webApiClient';
import { MedicationScheduleList } from '../components/medication/MedicationScheduleList';

export function WebMedications() {
  const { user, hasPermission } = useWebAuth();
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    if (hasPermission('medications_read')) {
      loadSchedules();
    }
  }, []);

  const loadSchedules = async () => {
    const data = await listMedicationSchedules();
    setSchedules(data);
  };

  if (!hasPermission('medications_read')) {
    return <div>복약 정보 조회 권한이 없습니다.</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">복약 관리</h1>
      {/* ... */}
    </div>
  );
}
```

### 위험 요소

| 위험 | 영향도 | 완화 전략 |
|-----|-------|----------|
| 컴포넌트 호환성 | 중간 | 기존 컴포넌트 props 인터페이스 확인 |
| 상태 관리 | 낮음 | TanStack Query 또는 기존 패턴 활용 |

---

## M6: 통합 테스트 및 검증

### 목표

구현된 기능이 SPEC 요구사항을 만족하는지 검증한다.

### 작업 항목

**T6.1**: API 엔드포인트 테스트
- 인증/권한 검증 테스트
- CRUD 작동 테스트
- 에러 응답 테스트

**T6.2**: 프론트엔드 통합 테스트
- API 호출 검증
- UI 렌더링 테스트

**T6.3**: 시나리오 테스트
- acceptance.md의 Given-When-Then 시나리오 검증

### 검증 체크리스트

- [ ] 인증 없이 API 접근 시 401 반환
- [ ] medications_read 권한 없이 GET 시 403 반환
- [ ] medications_write 권한 없이 POST/PUT/DELETE 시 403 반환
- [ ] 복약 일정 CRUD 정상 작동
- [ ] 복약 기록 생성/수정 정상 작동 (삭제 불가 확인)
- [ ] 복약 통계 조회 정상 작동
- [ ] 웹 UI 페이지 정상 렌더링
- [ ] 권한 기반 UI 제어 정상 작동

---

## 구현 의존성 그래프

```
M1 (StaffPermissions)
    │
    ├──► M2 (db.rs CRUD)
    │        │
    │        └──► M3 (web_api.rs 엔드포인트)
    │                  │
    │                  └──► M4 (webApiClient.ts)
    │                            │
    │                            └──► M5 (WebMedications.tsx)
    │
    └──────────────────────────────────► M6 (통합 테스트)
```

---

## 수정 대상 파일 목록

| 파일 | 작업 유형 | 마일스톤 |
|-----|---------|---------|
| src-tauri/src/models.rs | 수정 | M1 |
| src-tauri/src/db.rs | 수정 | M2 |
| src-tauri/src/web_api.rs | 수정 | M3 |
| src/lib/webApiClient.ts | 수정 | M4 |
| src/types/index.ts | 수정 (선택) | M4 |
| src/pages/WebMedications.tsx | 신규 | M5 |
| src/components/web/WebLayout.tsx | 수정 | M5 |

---

*문서 버전: 1.0.0*
*최종 수정: 2026-02-07*
