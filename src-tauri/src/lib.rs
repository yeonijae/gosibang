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
        .plugin(tauri_plugin_fs::init())
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
        .setup(|app| {
            // 동기화 모듈 초기화
            sync::init_sync();

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
            list_all_prescriptions,
            update_prescription,
            soft_delete_prescription,
            clear_all_prescriptions,
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
            // 설문 세션 관리
            list_survey_sessions,
            create_survey_session,
            get_survey_session_by_token,
            get_survey_session,
            complete_survey_session,
            expire_survey_session,
            delete_survey_session,
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
            // 처방 카테고리
            list_prescription_categories,
            create_prescription_category,
            update_prescription_category,
            delete_prescription_category,
            // 약재
            list_herbs,
            create_herb,
            update_herb,
            delete_herb,
            // 처방 정의
            list_prescription_definitions,
            get_prescription_definition,
            create_prescription_definition,
            update_prescription_definition,
            delete_prescription_definition,
            // 처방 노트
            list_prescription_notes,
            create_prescription_note,
            update_prescription_note,
            delete_prescription_note,
            // 처방 치험례
            list_prescription_case_studies,
            create_prescription_case_study,
            update_prescription_case_study,
            delete_prescription_case_study,
            // 복약 관리 (해피콜)
            list_medication_management,
            create_medication_management,
            update_medication_management,
            delete_medication_management,
            // 복약 스케줄
            list_medication_schedules,
            get_medication_schedule,
            create_medication_schedule,
            update_medication_schedule,
            delete_medication_schedule,
            // 복약 기록
            list_medication_logs,
            create_medication_log,
            update_medication_log,
            delete_medication_log,
            // 사용량 카운트
            get_usage_counts,
            // 휴지통 관리
            soft_delete_patient,
            soft_delete_initial_chart,
            soft_delete_progress_note,
            restore_from_trash,
            permanent_delete,
            empty_trash,
            get_trash_items,
            get_trash_count,
            // 사용량 통계
            get_usage_stats,
            // 초기화
            reset_prescription_definitions,
            reset_all_user_data,
            // 선택적 데이터 내보내기
            export_selected_data,
            // DB 바이너리 백업/복원
            export_db_binary,
            import_db_binary,
            // 약재 재고관리
            list_herb_inventory,
            create_herb_inventory,
            update_herb_inventory,
            delete_herb_inventory,
            bulk_import_herb_inventory,
            list_herb_stock_logs,
            add_stock_log,
            deduct_stock_by_prescription,
            restore_stock_by_prescription,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
