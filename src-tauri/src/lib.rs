mod auth;
mod commands;
mod db;
mod error;
mod models;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 초기화
            initialize_app,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
