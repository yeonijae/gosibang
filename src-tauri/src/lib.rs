mod auth;
mod commands;
mod db;
mod encryption;
mod error;
mod models;
pub mod server;
mod sync;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
        .setup(|_app| {
            // 동기화 모듈 초기화
            sync::init_sync();
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
            // QR 코드 생성
            generate_survey_qr,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
