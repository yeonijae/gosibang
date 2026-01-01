//! Supabase 동기화 모듈
//!
//! 로컬 설문 응답을 Supabase 클라우드에 자동 동기화합니다.

use crate::auth;
use crate::db;
use crate::error::{AppError, AppResult};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// 동기화 상태
static SYNC_ENABLED: AtomicBool = AtomicBool::new(false);
static PENDING_SYNC: OnceCell<Mutex<Vec<PendingSyncItem>>> = OnceCell::new();

/// 동기화 대기 항목
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PendingSyncItem {
    pub id: String,
    pub item_type: SyncItemType,
    pub data: serde_json::Value,
    pub created_at: String,
    pub retry_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SyncItemType {
    SurveyResponse,
}

/// 동기화 초기화
pub fn init_sync() {
    let _ = PENDING_SYNC.set(Mutex::new(Vec::new()));
    SYNC_ENABLED.store(true, Ordering::SeqCst);
    log::info!("Sync module initialized");
}

/// 동기화 활성화 여부
pub fn is_sync_enabled() -> bool {
    SYNC_ENABLED.load(Ordering::SeqCst)
}

/// 동기화 활성화/비활성화
pub fn set_sync_enabled(enabled: bool) {
    SYNC_ENABLED.store(enabled, Ordering::SeqCst);
    log::info!("Sync enabled: {}", enabled);
}

/// 설문 응답을 Supabase에 동기화
pub async fn sync_survey_response(response: &db::SurveyResponseDb) -> AppResult<()> {
    if !is_sync_enabled() {
        log::debug!("Sync is disabled, skipping");
        return Ok(());
    }

    // Supabase 설정 확인 (인증 여부와 관계없이 anon_key로 동기화)
    if auth::get_supabase_config().is_err() {
        log::warn!("Supabase not configured, queuing for later sync");
        queue_for_sync(response)?;
        return Ok(());
    }

    // Supabase REST API 호출 (anon_key 사용)
    match send_to_supabase(response).await {
        Ok(_) => {
            log::info!("Survey response synced successfully: {}", response.id);
            Ok(())
        }
        Err(e) => {
            log::warn!("Sync failed, queuing for retry: {}", e);
            queue_for_sync(response)?;
            Err(e)
        }
    }
}

/// Supabase에 설문 응답 전송
async fn send_to_supabase(response: &db::SurveyResponseDb) -> AppResult<()> {
    let config = auth::get_supabase_config()?;
    let client = auth::get_http_client()?;

    // survey_responses_temp 테이블에 INSERT (anon_key 사용)
    let payload = serde_json::json!({
        "id": response.id,
        "session_id": response.session_id,
        "template_id": response.template_id,
        "patient_id": response.patient_id,
        "respondent_name": response.respondent_name,
        "answers": serde_json::from_str::<serde_json::Value>(&response.answers).unwrap_or_default(),
        "synced": true,
        "created_at": response.submitted_at,
    });

    let url = format!("{}/rest/v1/survey_responses_temp", config.url);

    let res = client
        .post(&url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", &config.anon_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Custom(format!("Network error: {}", e)))?;

    if res.status().is_success() {
        Ok(())
    } else {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(AppError::Custom(format!(
            "Supabase error {}: {}",
            status, body
        )))
    }
}

/// 동기화 대기열에 추가
fn queue_for_sync(response: &db::SurveyResponseDb) -> AppResult<()> {
    let pending = PENDING_SYNC
        .get()
        .ok_or_else(|| AppError::Custom("Sync not initialized".to_string()))?;

    let mut queue = pending
        .lock()
        .map_err(|_| AppError::Custom("Sync queue lock error".to_string()))?;

    // 이미 대기 중인지 확인
    if queue.iter().any(|item| item.id == response.id) {
        return Ok(());
    }

    queue.push(PendingSyncItem {
        id: response.id.clone(),
        item_type: SyncItemType::SurveyResponse,
        data: serde_json::to_value(response).unwrap_or_default(),
        created_at: chrono::Utc::now().to_rfc3339(),
        retry_count: 0,
    });

    log::info!("Queued for sync: {}, total pending: {}", response.id, queue.len());
    Ok(())
}

/// 대기 중인 항목 동기화 재시도
pub async fn retry_pending_sync() -> AppResult<u32> {
    if !is_sync_enabled() {
        return Ok(0);
    }

    let auth_state = auth::get_current_auth_state()?;
    if !auth_state.is_authenticated {
        return Ok(0);
    }

    let pending = PENDING_SYNC
        .get()
        .ok_or_else(|| AppError::Custom("Sync not initialized".to_string()))?;

    let items: Vec<PendingSyncItem> = {
        let queue = pending
            .lock()
            .map_err(|_| AppError::Custom("Sync queue lock error".to_string()))?;
        queue.clone()
    };

    let mut synced_count = 0;
    let mut failed_items = Vec::new();

    for item in items {
        if item.retry_count >= 5 {
            log::warn!("Max retries exceeded for: {}", item.id);
            continue;
        }

        match item.item_type {
            SyncItemType::SurveyResponse => {
                if let Ok(response) = serde_json::from_value::<db::SurveyResponseDb>(item.data.clone()) {
                    match send_to_supabase(&response).await {
                        Ok(_) => {
                            synced_count += 1;
                            log::info!("Retry sync successful: {}", item.id);
                        }
                        Err(e) => {
                            log::warn!("Retry sync failed: {}: {}", item.id, e);
                            let mut failed = item.clone();
                            failed.retry_count += 1;
                            failed_items.push(failed);
                        }
                    }
                }
            }
        }
    }

    // 실패한 항목 다시 저장
    {
        let mut queue = pending
            .lock()
            .map_err(|_| AppError::Custom("Sync queue lock error".to_string()))?;
        *queue = failed_items;
    }

    Ok(synced_count)
}

/// 대기 중인 동기화 항목 수
pub fn get_pending_count() -> usize {
    PENDING_SYNC
        .get()
        .and_then(|p| p.lock().ok())
        .map(|q| q.len())
        .unwrap_or(0)
}
