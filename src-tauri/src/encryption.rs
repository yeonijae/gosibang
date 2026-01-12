//! 데이터베이스 암호화 키 관리 모듈
//!
//! Supabase에서 사용자별 암호화 키를 조회/생성하고, 오프라인 사용을 위해 로컬에 캐시합니다.

use crate::auth;
use crate::error::{AppError, AppResult};
use rand::Rng;
use serde::Deserialize;
use std::path::PathBuf;

/// Supabase에서 암호화 키 조회 응답
#[derive(Debug, Deserialize)]
struct EncryptionKeyRow {
    encryption_key: String,
}

/// 256비트 암호화 키 생성 (64자 hex string)
fn generate_encryption_key() -> String {
    let mut rng = rand::thread_rng();
    let key_bytes: [u8; 32] = rng.gen();
    key_bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Supabase에서 암호화 키 조회 또는 생성
///
/// 1. 기존 키가 있으면 조회하여 반환
/// 2. 없으면 새 키 생성 후 저장하고 반환
pub async fn fetch_or_create_key(access_token: &str, user_id: &str) -> AppResult<(String, bool)> {
    let config = auth::get_supabase_config()?;
    let client = auth::get_http_client()?;

    // 1. 기존 키 조회
    let select_url = format!(
        "{}/rest/v1/user_encryption_keys?user_id=eq.{}&select=encryption_key",
        config.url, user_id
    );

    let response = client
        .get(&select_url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await?;

    if response.status().is_success() {
        let keys: Vec<EncryptionKeyRow> = response.json().await?;
        if let Some(key_row) = keys.first() {
            log::info!("Existing encryption key found for user");
            return Ok((key_row.encryption_key.clone(), false));
        }
    }

    // 2. 새 키 생성
    log::info!("Creating new encryption key for user");
    let new_key = generate_encryption_key();

    let insert_url = format!("{}/rest/v1/user_encryption_keys", config.url);
    let payload = serde_json::json!({
        "user_id": user_id,
        "encryption_key": new_key
    });

    let insert_response = client
        .post(&insert_url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await?;

    if !insert_response.status().is_success() {
        let error_text = insert_response.text().await.unwrap_or_default();
        log::error!("Failed to store encryption key: {}", error_text);
        return Err(AppError::Custom(format!(
            "Failed to store encryption key: {}",
            error_text
        )));
    }

    log::info!("New encryption key created and stored");
    Ok((new_key, true))
}

/// 로컬 키 캐시 디렉토리 경로
fn get_cache_dir() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Custom("Cannot find data directory".to_string()))?;
    let cache_dir = data_dir.join("gosibang").join("keys");
    std::fs::create_dir_all(&cache_dir)?;
    Ok(cache_dir)
}

/// 캐시 파일 경로 (user_id 앞 8자리 사용)
fn get_cache_file_path(user_id: &str) -> AppResult<PathBuf> {
    let safe_id = &user_id[..8.min(user_id.len())];
    Ok(get_cache_dir()?.join(format!("{}.key", safe_id)))
}

/// 암호화 키를 로컬에 캐시 (오프라인 사용용)
///
/// 단순 XOR 난독화 적용 (프로덕션에서는 Windows DPAPI 사용 권장)
pub fn cache_key_locally(user_id: &str, key: &str) -> AppResult<()> {
    let cache_file = get_cache_file_path(user_id)?;
    let obfuscated = obfuscate(key, user_id);
    std::fs::write(&cache_file, obfuscated)?;
    log::info!("Encryption key cached locally");
    Ok(())
}

/// 로컬에 캐시된 암호화 키 조회
pub fn get_cached_key(user_id: &str) -> AppResult<Option<String>> {
    let cache_file = get_cache_file_path(user_id)?;

    if !cache_file.exists() {
        return Ok(None);
    }

    let obfuscated = std::fs::read_to_string(&cache_file)?;
    let key = deobfuscate(&obfuscated, user_id);
    Ok(Some(key))
}

/// 캐시된 키 삭제 (로그아웃 시)
#[allow(dead_code)]
pub fn clear_cached_key(user_id: &str) -> AppResult<()> {
    let cache_file = get_cache_file_path(user_id)?;
    if cache_file.exists() {
        std::fs::remove_file(&cache_file)?;
        log::info!("Cached encryption key cleared");
    }
    Ok(())
}

/// 단순 XOR 난독화 (보안 강화 필요시 Windows DPAPI 사용)
fn obfuscate(data: &str, salt: &str) -> String {
    let data_bytes = data.as_bytes();
    let salt_bytes = salt.as_bytes();

    data_bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ salt_bytes[i % salt_bytes.len()])
        .map(|b| format!("{:02x}", b))
        .collect()
}

/// XOR 난독화 해제
fn deobfuscate(obfuscated: &str, salt: &str) -> String {
    let salt_bytes = salt.as_bytes();

    (0..obfuscated.len())
        .step_by(2)
        .filter_map(|i| u8::from_str_radix(&obfuscated[i..i + 2], 16).ok())
        .enumerate()
        .map(|(i, b)| (b ^ salt_bytes[i % salt_bytes.len()]) as char)
        .collect()
}
