mod auth;
mod commands;
mod db;
mod encryption;
mod error;
mod models;
mod notification;
pub mod server;
mod sync;
pub mod web_api;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: Some("gosibang".into()) },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .build(),
        )
        .setup(|app| {
            // 동기화 모듈 초기화
            sync::init_sync();

            // 알림 스케줄러 시작
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                notification::run_scheduler(app_handle).await;
            });

            // 개발 모드에서 devtools 자동 열기
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 초기화
            initialize_app,
            initialize_with_encryption,
            initialize_encrypted_db,
            initialize_offline,
            // 인증
            login,
            logout,
            signup,
            get_auth_state,
            verify_auth,
            // 한의원 설정
            save_clinic_settings,
            get_clinic_settings,
            // 환자 관리
            create_patient,
            get_patient,
            list_patients,
            update_patient,
            delete_patient,
            // 처방 관리
            create_prescription,
            get_prescriptions_by_patient,
            // 차팅 관리
            create_chart_record,
            get_chart_records_by_patient,
            // 초진차트 관리
            create_initial_chart,
            get_initial_chart,
            get_initial_charts_by_patient,
            list_initial_charts,
            update_initial_chart,
            delete_initial_chart,
            // 경과기록 관리
            create_progress_note,
            get_progress_note,
            get_progress_notes_by_patient,
            update_progress_note,
            delete_progress_note,
            // 데이터 내보내기
            export_patient_data,
            export_all_data,
            // 직원 비밀번호 관리
            set_staff_password,
            has_staff_password,
            // HTTP 서버
            start_http_server,
            stop_http_server,
            get_server_status,
            get_server_autostart,
            set_server_autostart,
            // 설문 템플릿 관리
            list_survey_templates,
            get_survey_template,
            save_survey_template,
            delete_survey_template,
            restore_default_survey_templates,
            // 설문 응답 관리
            list_survey_responses,
            delete_survey_response,
            link_survey_response_to_patient,
            submit_survey_response,
            save_survey_response_sync,
            // QR 코드 생성
            generate_survey_qr,
            // 내부 직원 계정 관리
            create_staff_account,
            list_staff_accounts,
            get_staff_account,
            update_staff_account,
            delete_staff_account,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
