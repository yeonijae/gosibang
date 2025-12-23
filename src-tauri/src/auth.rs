use crate::error::{AppError, AppResult};
use crate::models::{AuthState, Subscription, SubscriptionStatus};
use chrono::{DateTime, Utc};
use once_cell::sync::OnceCell;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static AUTH_STATE: OnceCell<Mutex<AuthState>> = OnceCell::new();
static HTTP_CLIENT: OnceCell<Client> = OnceCell::new();

/// Supabase 설정
#[derive(Clone)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

static SUPABASE_CONFIG: OnceCell<SupabaseConfig> = OnceCell::new();

/// Supabase 초기화
pub fn init_supabase(url: &str, anon_key: &str) {
    let _ = SUPABASE_CONFIG.set(SupabaseConfig {
        url: url.to_string(),
        anon_key: anon_key.to_string(),
    });

    let _ = HTTP_CLIENT.set(
        Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client"),
    );

    let _ = AUTH_STATE.set(Mutex::new(AuthState::default()));
}

fn get_config() -> AppResult<&'static SupabaseConfig> {
    SUPABASE_CONFIG
        .get()
        .ok_or_else(|| AppError::Custom("Supabase not initialized".to_string()))
}

fn get_client() -> AppResult<&'static Client> {
    HTTP_CLIENT
        .get()
        .ok_or_else(|| AppError::Custom("HTTP client not initialized".to_string()))
}

fn get_auth_state() -> AppResult<std::sync::MutexGuard<'static, AuthState>> {
    AUTH_STATE
        .get()
        .ok_or_else(|| AppError::Custom("Auth state not initialized".to_string()))?
        .lock()
        .map_err(|_| AppError::Custom("Auth state lock error".to_string()))
}

/// Supabase 로그인 응답
#[derive(Debug, Deserialize)]
struct SupabaseAuthResponse {
    access_token: String,
    token_type: String,
    expires_in: i64,
    refresh_token: String,
    user: SupabaseUser,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: String,
    email: Option<String>,
}

/// 구독 정보 조회 응답
#[derive(Debug, Deserialize)]
struct SubscriptionResponse {
    id: String,
    user_id: String,
    plan: String,
    status: String,
    expires_at: String,
}

/// 이메일/비밀번호로 로그인
pub async fn login(email: &str, password: &str) -> AppResult<AuthState> {
    let config = get_config()?;
    let client = get_client()?;

    let login_url = format!("{}/auth/v1/token?grant_type=password", config.url);

    let response = client
        .post(&login_url)
        .header("apikey", &config.anon_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "email": email,
            "password": password
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!("Login failed: {}", error_text);
        return Err(AppError::InvalidCredentials);
    }

    let auth_response: SupabaseAuthResponse = response.json().await?;

    // 구독 정보 확인
    let subscription = verify_subscription(&auth_response.access_token, &auth_response.user.id).await?;

    // 구독이 유효한지 확인
    if subscription.status != SubscriptionStatus::Active && subscription.status != SubscriptionStatus::Trial {
        return Err(AppError::SubscriptionExpired);
    }

    let auth_state = AuthState {
        is_authenticated: true,
        user_email: auth_response.user.email,
        subscription: Some(subscription),
        last_verified: Some(Utc::now()),
    };

    // 상태 저장
    let mut state = get_auth_state()?;
    *state = auth_state.clone();

    log::info!("User logged in successfully");
    Ok(auth_state)
}

/// 구독 정보 확인
async fn verify_subscription(access_token: &str, user_id: &str) -> AppResult<Subscription> {
    let config = get_config()?;
    let client = get_client()?;

    let url = format!(
        "{}/rest/v1/subscriptions?user_id=eq.{}&select=*",
        config.url, user_id
    );

    let response = client
        .get(&url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(AppError::Auth("Failed to verify subscription".to_string()));
    }

    let subscriptions: Vec<SubscriptionResponse> = response.json().await?;

    if subscriptions.is_empty() {
        return Err(AppError::SubscriptionExpired);
    }

    let sub = &subscriptions[0];
    let expires_at = DateTime::parse_from_rfc3339(&sub.expires_at)
        .map_err(|_| AppError::Auth("Invalid expiry date".to_string()))?
        .with_timezone(&Utc);

    let status = match sub.status.as_str() {
        "active" => SubscriptionStatus::Active,
        "trial" => SubscriptionStatus::Trial,
        "cancelled" => SubscriptionStatus::Cancelled,
        _ => SubscriptionStatus::Expired,
    };

    // 만료 날짜 확인
    let final_status = if expires_at < Utc::now() && status == SubscriptionStatus::Active {
        SubscriptionStatus::Expired
    } else {
        status
    };

    Ok(Subscription {
        user_id: sub.user_id.clone(),
        plan: sub.plan.clone(),
        status: final_status,
        expires_at,
    })
}

/// 현재 인증 상태 확인
pub fn get_current_auth_state() -> AppResult<AuthState> {
    let state = get_auth_state()?;
    Ok(state.clone())
}

/// 로그아웃
pub fn logout() -> AppResult<()> {
    let mut state = get_auth_state()?;
    *state = AuthState::default();
    log::info!("User logged out");
    Ok(())
}

/// 인증 상태 검증 (앱 시작 시 호출)
pub async fn verify_auth_status() -> AppResult<bool> {
    let state = get_auth_state()?;

    if !state.is_authenticated {
        return Ok(false);
    }

    // 구독 상태 확인
    if let Some(ref subscription) = state.subscription {
        if subscription.status != SubscriptionStatus::Active
            && subscription.status != SubscriptionStatus::Trial
        {
            return Ok(false);
        }

        if subscription.expires_at < Utc::now() {
            return Ok(false);
        }
    } else {
        return Ok(false);
    }

    Ok(true)
}

/// 회원가입
pub async fn signup(email: &str, password: &str) -> AppResult<String> {
    let config = get_config()?;
    let client = get_client()?;

    let signup_url = format!("{}/auth/v1/signup", config.url);

    let response = client
        .post(&signup_url)
        .header("apikey", &config.anon_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "email": email,
            "password": password
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("Signup failed: {}", error_text)));
    }

    Ok("회원가입이 완료되었습니다. 이메일을 확인해주세요.".to_string())
}

/// DB 암호화 키 생성 (사용자별 고유 키)
pub fn generate_db_encryption_key(user_id: &str, master_secret: &str) -> String {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };

    // 고정 salt 사용 (사용자 ID 기반)
    let salt_input = format!("gosibang-{}", user_id);
    let salt_bytes: [u8; 22] = {
        let mut arr = [0u8; 22];
        let bytes = salt_input.as_bytes();
        for (i, byte) in bytes.iter().take(22).enumerate() {
            arr[i] = *byte;
        }
        arr
    };

    // Base64 인코딩된 salt 생성
    let salt = SaltString::encode_b64(&salt_bytes).expect("Salt encoding failed");

    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(master_secret.as_bytes(), &salt)
        .expect("Hashing failed");

    hash.to_string()
}
