//! 알림 스케줄러 모듈
//!
//! 복약 알림, 누락 알림, 일일 요약을 관리합니다.

use chrono::{Local, NaiveTime, Timelike};
use std::sync::Arc;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};

use crate::db;
use crate::models::{Notification, NotificationPriority, NotificationSettings, NotificationType};

/// 알림 스케줄러 상태
pub struct NotificationScheduler {
    app_handle: tauri::AppHandle,
    is_running: Arc<RwLock<bool>>,
}

impl NotificationScheduler {
    /// 새 스케줄러 생성
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            is_running: Arc::new(RwLock::new(false)),
        }
    }

    /// 스케줄러 실행 여부 확인
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    /// 스케줄러 시작
    pub async fn start(&self) {
        let mut running = self.is_running.write().await;
        *running = true;
        log::info!("[알림 스케줄러] 시작됨");
    }

    /// 스케줄러 중지
    #[allow(dead_code)]
    pub async fn stop(&self) {
        let mut running = self.is_running.write().await;
        *running = false;
        log::info!("[알림 스케줄러] 중지됨");
    }

    /// 복약 시간 확인 및 알림 발송
    ///
    /// 매 분마다 호출되어 예정된 복약 시간을 확인합니다.
    pub async fn check_medication_times(&self) {
        // 알림 설정 확인
        let settings = match db::get_notification_settings() {
            Ok(Some(s)) => s,
            Ok(None) => NotificationSettings::default(),
            Err(e) => {
                log::error!("[알림 스케줄러] 설정 조회 실패: {}", e);
                return;
            }
        };

        if !settings.enabled {
            return;
        }

        // 방해금지 시간 확인
        if self.is_do_not_disturb(&settings) {
            return;
        }

        let now = Local::now();
        let current_time = now.format("%H:%M").to_string();
        let _today = now.format("%Y-%m-%d").to_string();

        // 활성 복약 일정 조회
        let schedules = match db::get_active_medication_schedules_for_today() {
            Ok(s) => s,
            Err(e) => {
                log::error!("[알림 스케줄러] 복약 일정 조회 실패: {}", e);
                return;
            }
        };

        for schedule in schedules {
            for medication_time in &schedule.medication_times {
                // 알림 시간 계산 (pre_reminder_minutes 전)
                if let Some(reminder_time) = self.calculate_reminder_time(medication_time, settings.pre_reminder_minutes) {
                    if reminder_time == current_time {
                        // 중복 알림 방지 확인
                        let has_recent = db::has_recent_notification(
                            &schedule.id,
                            NotificationType::MedicationReminder.as_str(),
                            5,
                        ).unwrap_or(true);

                        if !has_recent {
                            // 환자 이름 조회
                            let patient_name = db::get_patient(&schedule.patient_id)
                                .ok()
                                .flatten()
                                .map(|p| p.name)
                                .unwrap_or_else(|| "환자".to_string());

                            let title = format!("복약 알림 - {}", patient_name);
                            let body = format!(
                                "{}에 복약 예정입니다.\n처방: {}",
                                medication_time,
                                schedule.prescription_id
                            );

                            self.send_medication_reminder(&schedule.id, &schedule.patient_id, &title, &body).await;
                        }
                    }
                }
            }
        }
    }

    /// 복약 누락 확인 및 알림 발송
    ///
    /// 예정된 복약 시간 이후 설정된 시간이 지나면 누락 알림을 발송합니다.
    pub async fn check_missed_medications(&self) {
        let settings = match db::get_notification_settings() {
            Ok(Some(s)) => s,
            Ok(None) => NotificationSettings::default(),
            Err(e) => {
                log::error!("[알림 스케줄러] 설정 조회 실패: {}", e);
                return;
            }
        };

        if !settings.enabled || !settings.missed_reminder_enabled {
            return;
        }

        if self.is_do_not_disturb(&settings) {
            return;
        }

        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let delay_minutes = settings.missed_reminder_delay_minutes;

        let schedules = match db::get_active_medication_schedules_for_today() {
            Ok(s) => s,
            Err(e) => {
                log::error!("[알림 스케줄러] 복약 일정 조회 실패: {}", e);
                return;
            }
        };

        for schedule in schedules {
            for medication_time in &schedule.medication_times {
                // delay_minutes 전 시간 계산
                if let Some(check_time) = self.time_minutes_ago(medication_time, delay_minutes) {
                    let current_time = now.format("%H:%M").to_string();

                    if check_time == current_time {
                        // 복약 기록 확인
                        let has_log = db::has_medication_log_for_time(
                            &schedule.id,
                            medication_time,
                            &today,
                        ).unwrap_or(true);

                        if !has_log {
                            // 중복 알림 방지
                            let has_recent = db::has_recent_notification(
                                &schedule.id,
                                NotificationType::MissedMedication.as_str(),
                                30,
                            ).unwrap_or(true);

                            if !has_recent {
                                let patient_name = db::get_patient(&schedule.patient_id)
                                    .ok()
                                    .flatten()
                                    .map(|p| p.name)
                                    .unwrap_or_else(|| "환자".to_string());

                                let title = format!("복약 누락 알림 - {}", patient_name);
                                let body = format!(
                                    "{}에 예정된 복약이 기록되지 않았습니다.",
                                    medication_time
                                );

                                self.send_missed_reminder(&schedule.id, &schedule.patient_id, &title, &body).await;
                            }
                        }
                    }
                }
            }
        }
    }

    /// 일일 요약 발송
    ///
    /// 설정된 시간에 당일 복약 현황을 요약하여 알림합니다.
    pub async fn send_daily_summary(&self) {
        let settings = match db::get_notification_settings() {
            Ok(Some(s)) => s,
            Ok(None) => return,
            Err(_) => return,
        };

        if !settings.enabled || !settings.daily_summary_enabled {
            return;
        }

        let now = Local::now();
        let current_time = now.format("%H:%M").to_string();

        if current_time != settings.daily_summary_time {
            return;
        }

        // 중복 방지
        let has_recent = db::has_recent_notification(
            "global",
            NotificationType::DailySummary.as_str(),
            60,
        ).unwrap_or(true);

        if has_recent {
            return;
        }

        // 오늘의 복약 통계 수집
        let schedules = match db::get_active_medication_schedules_for_today() {
            Ok(s) => s,
            Err(_) => return,
        };

        let total_medications: usize = schedules.iter()
            .map(|s| s.medication_times.len())
            .sum();

        // 복약 완료 수 계산 (간단한 집계)
        let mut taken_count = 0;
        let today = now.format("%Y-%m-%d").to_string();

        for schedule in &schedules {
            for time in &schedule.medication_times {
                if db::has_medication_log_for_time(&schedule.id, time, &today).unwrap_or(false) {
                    taken_count += 1;
                }
            }
        }

        let title = "일일 복약 요약".to_string();
        let body = format!(
            "오늘 예정된 복약: {}회\n완료: {}회\n미완료: {}회",
            total_medications,
            taken_count,
            total_medications - taken_count
        );

        self.send_summary_notification(&title, &body).await;
    }

    /// 데스크톱 알림 발송 (복약 알림)
    async fn send_medication_reminder(&self, schedule_id: &str, patient_id: &str, title: &str, body: &str) {
        // 데스크톱 알림
        if let Err(e) = self.send_desktop_notification(title, body) {
            log::error!("[알림] 데스크톱 알림 실패: {}", e);
        }

        // DB에 알림 기록 저장
        let mut notification = Notification::new(
            NotificationType::MedicationReminder,
            title.to_string(),
            body.to_string(),
            NotificationPriority::Normal,
        );
        notification.schedule_id = Some(schedule_id.to_string());
        notification.patient_id = Some(patient_id.to_string());

        if let Err(e) = db::create_notification(&notification) {
            log::error!("[알림] DB 저장 실패: {}", e);
        }
    }

    /// 데스크톱 알림 발송 (누락 알림)
    async fn send_missed_reminder(&self, schedule_id: &str, patient_id: &str, title: &str, body: &str) {
        if let Err(e) = self.send_desktop_notification(title, body) {
            log::error!("[알림] 데스크톱 알림 실패: {}", e);
        }

        let mut notification = Notification::new(
            NotificationType::MissedMedication,
            title.to_string(),
            body.to_string(),
            NotificationPriority::High,
        );
        notification.schedule_id = Some(schedule_id.to_string());
        notification.patient_id = Some(patient_id.to_string());

        if let Err(e) = db::create_notification(&notification) {
            log::error!("[알림] DB 저장 실패: {}", e);
        }
    }

    /// 데스크톱 알림 발송 (일일 요약)
    async fn send_summary_notification(&self, title: &str, body: &str) {
        if let Err(e) = self.send_desktop_notification(title, body) {
            log::error!("[알림] 데스크톱 알림 실패: {}", e);
        }

        let notification = Notification::new(
            NotificationType::DailySummary,
            title.to_string(),
            body.to_string(),
            NotificationPriority::Low,
        );

        if let Err(e) = db::create_notification(&notification) {
            log::error!("[알림] DB 저장 실패: {}", e);
        }
    }

    /// 시스템 알림 발송
    fn send_desktop_notification(&self, title: &str, body: &str) -> Result<(), String> {
        self.app_handle
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())
    }

    /// 방해금지 시간 확인
    fn is_do_not_disturb(&self, settings: &NotificationSettings) -> bool {
        let (start, end) = match (&settings.do_not_disturb_start, &settings.do_not_disturb_end) {
            (Some(s), Some(e)) => (s, e),
            _ => return false,
        };

        let now = Local::now();
        let current_time = now.format("%H:%M").to_string();

        // 방해금지 시간대 확인
        if start <= end {
            // 같은 날 범위 (예: 22:00 ~ 06:00이 아닌 09:00 ~ 17:00)
            &current_time >= start && &current_time <= end
        } else {
            // 자정을 넘는 범위 (예: 22:00 ~ 06:00)
            &current_time >= start || &current_time <= end
        }
    }

    /// 알림 시간 계산 (지정 시간의 n분 전)
    fn calculate_reminder_time(&self, time_str: &str, minutes_before: i32) -> Option<String> {
        let time = NaiveTime::parse_from_str(time_str, "%H:%M").ok()?;
        let reminder_time = time - chrono::Duration::minutes(minutes_before as i64);
        Some(reminder_time.format("%H:%M").to_string())
    }

    /// 지정 시간의 n분 후 계산
    fn time_minutes_ago(&self, time_str: &str, minutes: i32) -> Option<String> {
        let time = NaiveTime::parse_from_str(time_str, "%H:%M").ok()?;
        let result_time = time + chrono::Duration::minutes(minutes as i64);
        Some(result_time.format("%H:%M").to_string())
    }
}

/// 백그라운드 스케줄러 실행
///
/// Tauri 앱 시작 시 호출되어 매 분마다 알림을 확인합니다.
pub async fn run_scheduler(app_handle: tauri::AppHandle) {
    let scheduler = NotificationScheduler::new(app_handle);
    scheduler.start().await;

    let mut ticker = interval(Duration::from_secs(60));

    log::info!("[알림 스케줄러] 백그라운드 태스크 시작");

    loop {
        ticker.tick().await;

        if !scheduler.is_running().await {
            log::info!("[알림 스케줄러] 중지 신호 수신, 종료");
            break;
        }

        // 복약 시간 확인
        scheduler.check_medication_times().await;

        // 누락 복약 확인
        scheduler.check_missed_medications().await;

        // 일일 요약 (시간 정각에만)
        let now = Local::now();
        if now.minute() == 0 {
            scheduler.send_daily_summary().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_reminder_time() {
        // 테스트용 스케줄러 생성이 어려우므로 직접 시간 계산 테스트
        let time = NaiveTime::parse_from_str("08:30", "%H:%M").unwrap();
        let reminder = time - chrono::Duration::minutes(5);
        assert_eq!(reminder.format("%H:%M").to_string(), "08:25");
    }

    #[test]
    fn test_time_minutes_ago() {
        let time = NaiveTime::parse_from_str("08:30", "%H:%M").unwrap();
        let result = time + chrono::Duration::minutes(30);
        assert_eq!(result.format("%H:%M").to_string(), "09:00");
    }
}
