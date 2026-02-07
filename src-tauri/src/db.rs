use crate::error::{AppError, AppResult};
use crate::models::*;
use chrono::Utc;
use once_cell::sync::OnceCell;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

static DB_CONNECTION: OnceCell<Mutex<Connection>> = OnceCell::new();
static CURRENT_USER_ID: OnceCell<Mutex<Option<String>>> = OnceCell::new();

/// 데이터베이스 경로 가져오기
fn get_db_path() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Custom("Cannot find data directory".to_string()))?;
    let app_dir = data_dir.join("gosibang");
    std::fs::create_dir_all(&app_dir)?;
    Ok(app_dir.join("clinic.db"))
}

/// 데이터베이스가 초기화되어 있는지 확인하고, 안 되어 있으면 자동 초기화
pub fn ensure_db_initialized() -> AppResult<()> {
    if DB_CONNECTION.get().is_none() {
        log::info!("[DB] ensure_db_initialized: DB가 초기화되지 않음, init_database 호출");
        init_database("")?;
    } else {
        log::debug!("[DB] ensure_db_initialized: DB 이미 초기화됨");
    }
    Ok(())
}

/// 데이터베이스 초기화 (암호화 키 설정)
pub fn init_database(_encryption_key: &str) -> AppResult<()> {
    // 이미 초기화되어 있으면 스킵
    if DB_CONNECTION.get().is_some() {
        log::info!("[DB] init_database: 이미 초기화됨, 스킵");
        return Ok(());
    }

    let db_path = get_db_path()?;
    log::info!("[DB] init_database: DB 경로 = {:?}", db_path);
    let conn = Connection::open(&db_path)?;
    log::info!("[DB] init_database: DB 연결 성공");

    // TODO: 배포 시 SQLCipher 활성화 후 아래 주석 해제
    // conn.execute_batch(&format!("PRAGMA key = '{}';", encryption_key))?;

    // 테이블 생성
    create_tables(&conn)?;

    // 마이그레이션 실행
    run_migrations(&conn)?;

    let _ = DB_CONNECTION.set(Mutex::new(conn));

    // 기본 설문 템플릿 삽입
    ensure_default_templates()?;

    log::info!("Database initialized at {:?}", db_path);
    Ok(())
}

/// 사용자별 암호화된 데이터베이스 경로
fn get_user_db_path(user_id: &str) -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Custom("Cannot find data directory".to_string()))?;
    let app_dir = data_dir.join("gosibang").join("databases");
    std::fs::create_dir_all(&app_dir)?;

    // user_id 앞 8자리를 파일명으로 사용
    let safe_id = &user_id[..8.min(user_id.len())];
    Ok(app_dir.join(format!("{}.db", safe_id)))
}

/// SQLCipher 암호화를 적용한 데이터베이스 초기화
///
/// 사용자별로 별도의 암호화된 데이터베이스 파일 생성
pub fn init_database_encrypted(user_id: &str, encryption_key: &str) -> AppResult<()> {
    // 이미 초기화되어 있으면 스킵
    if DB_CONNECTION.get().is_some() {
        log::info!("Database already initialized, skipping");
        return Ok(());
    }

    let db_path = get_user_db_path(user_id)?;
    let conn = Connection::open(&db_path)?;

    // SQLCipher 암호화 키 설정
    conn.execute_batch(&format!(
        "PRAGMA key = 'x\"{}\"';
         PRAGMA cipher_compatibility = 4;",
        encryption_key
    ))?;

    // 키 검증 (잘못된 키면 여기서 에러 발생)
    conn.execute_batch("SELECT count(*) FROM sqlite_master;")
        .map_err(|e| {
            AppError::Custom(format!(
                "Database key verification failed (wrong key?): {}",
                e
            ))
        })?;

    log::info!("SQLCipher encryption enabled");

    // 테이블 생성
    create_tables(&conn)?;

    // 마이그레이션 실행
    run_migrations(&conn)?;

    let _ = DB_CONNECTION.set(Mutex::new(conn));

    // 현재 사용자 ID 저장
    if let Some(user_mutex) = CURRENT_USER_ID.get() {
        if let Ok(mut user) = user_mutex.lock() {
            *user = Some(user_id.to_string());
        }
    } else {
        let _ = CURRENT_USER_ID.set(Mutex::new(Some(user_id.to_string())));
    }

    // 기본 설문 템플릿 삽입
    ensure_default_templates()?;

    log::info!("Encrypted database initialized at {:?}", db_path);
    Ok(())
}

/// 현재 로그인한 사용자 ID 조회
#[allow(dead_code)]
pub fn get_current_user_id() -> Option<String> {
    CURRENT_USER_ID
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|u| u.clone())
}

/// 데이터베이스 연결 상태 확인
#[allow(dead_code)]
pub fn is_database_initialized() -> bool {
    DB_CONNECTION.get().is_some()
}

/// 기본 설문 템플릿 삽입 또는 업데이트
fn ensure_default_templates() -> AppResult<()> {
    let conn = get_conn()?;
    let now = chrono::Utc::now().to_rfc3339();

    // 여성 건강 설문지
    let female_questions = get_female_health_survey_questions();
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM survey_templates WHERE id = ?1",
        ["default_female_health"],
        |row| row.get(0),
    )?;

    if count > 0 {
        conn.execute(
            "UPDATE survey_templates SET name = ?1, description = ?2, questions = ?3, updated_at = ?4 WHERE id = ?5",
            rusqlite::params![
                "기본설문지-여성",
                "여성 환자용 기본 건강 설문지입니다.",
                female_questions,
                now,
                "default_female_health"
            ],
        )?;
        log::info!("기본 설문 템플릿 '기본설문지-여성' 업데이트됨");
    } else {
        conn.execute(
            "INSERT INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                "default_female_health",
                "기본설문지-여성",
                "여성 환자용 기본 건강 설문지입니다.",
                female_questions,
                "single_page",
                1,
                now,
                now
            ],
        )?;
        log::info!("기본 설문 템플릿 '기본설문지-여성' 삽입됨");
    }

    // 소아 건강 설문지
    let child_questions = get_child_health_survey_questions();
    let child_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM survey_templates WHERE id = ?1",
        ["default_child_health"],
        |row| row.get(0),
    )?;

    if child_count > 0 {
        conn.execute(
            "UPDATE survey_templates SET name = ?1, description = ?2, questions = ?3, updated_at = ?4 WHERE id = ?5",
            rusqlite::params![
                "기본설문지-소아",
                "소아 환자용 기본 건강 설문지입니다.",
                child_questions,
                now,
                "default_child_health"
            ],
        )?;
        log::info!("기본 설문 템플릿 '기본설문지-소아' 업데이트됨");
    } else {
        conn.execute(
            "INSERT INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                "default_child_health",
                "기본설문지-소아",
                "소아 환자용 기본 건강 설문지입니다.",
                child_questions,
                "single_page",
                1,
                now,
                now
            ],
        )?;
        log::info!("기본 설문 템플릿 '기본설문지-소아' 삽입됨");
    }

    Ok(())
}

/// 여성 건강 설문지 질문 데이터 (JSON) - 원본 form1.html 기반 (내용 변경 없이 그대로)
fn get_female_health_survey_questions() -> String {
    r#"[
        {"id":"name","question_text":"이름","question_type":"text","required":true,"order":1},
        {"id":"chart_number","question_text":"차트번호","question_type":"text","required":false,"order":2},
        {"id":"doctor","question_text":"담당의","question_type":"text","required":false,"order":3},
        {"id":"gender_age","question_text":"성별/나이","question_type":"text","required":true,"order":4},
        {"id":"height_weight","question_text":"키/몸무게","question_type":"text","required":true,"order":5},
        {"id":"meal_pattern","question_text":"> 식사패턴","question_type":"single_choice","options":["규칙적","불규칙","교대근무"],"required":true,"order":6},
        {"id":"meal_breakfast","question_text":"- 아침식사 (복수선택)","question_type":"multiple_choice","options":["6시","7시","8시","9시","10시","불규칙한 시간","안먹는다","간단하게","밥1/2공기","밥1공기"],"required":false,"order":7},
        {"id":"meal_lunch","question_text":"- 점심식사 (복수선택)","question_type":"multiple_choice","options":["11시","12시","1시","2시","3시","불규칙한 시간","안먹는다","간단하게","밥1/2공기","밥1공기","밥2공기"],"required":false,"order":8},
        {"id":"meal_dinner","question_text":"- 저녁식사 (복수선택)","question_type":"multiple_choice","options":["5시","6시","7시","8시","9시","불규칙한 시간","안먹는다","간단하게","밥1/2공기","밥1공기","밥2공기"],"required":false,"order":9},
        {"id":"meal_night","question_text":"- 야식 (10시이후/복수선택)","question_type":"single_choice","options":["안먹는다","가끔 먹는다.","주1~2회","주3~4회","주5~6회","매일 먹는다."],"required":false,"order":10},
        {"id":"eating_habit","question_text":"- 식습관","question_type":"multiple_choice","options":["밥보다 반찬을 더 많이","밥 위주로 먹고, 반찬은 적게","국이나 물 말아먹어야 한다.","밥보다 간식 종류를 좋아한다."],"required":false,"order":11},
        {"id":"appetite_digestion","question_text":"> 식욕/소화","question_type":"text","required":false,"order":12},
        {"id":"hunger","question_text":"- 배고픔 :","question_type":"single_choice","options":["잘 못느낀다.","가끔 느낀다.","때가 되면 느낀다.","항상 배가 고프다."],"required":false,"order":13},
        {"id":"appetite","question_text":"- 입맛 :","question_type":"single_choice","options":["항상 입맛이 없다.","아침에만 입맛이 없다.","스트레스 받으면 입맛이 없다.","입맛 괜찮다.","입맛이 매우 좋다."],"required":false,"order":14},
        {"id":"digestion","question_text":"- 소화상태 (복수선택) :","question_type":"multiple_choice","options":["잘 체함","더부룩함","속쓰림","트림 자주","신물 자주","소화제 자주"],"required":false,"order":15},
        {"id":"food_preference","question_text":"> 음식/기호","question_type":"text","required":false,"order":16},
        {"id":"food_meat","question_text":"- 고기 :","question_type":"single_choice","options":["자주 먹는다.","반찬수준으로 먹는다.","잘 안먹는다.","일부러 먹는다."],"required":false,"order":17},
        {"id":"food_seafood","question_text":"- 해산물 :","question_type":"single_choice","options":["자주 먹는다.","반찬수준으로 먹는다.","잘 안먹는다.","일부러 먹는다."],"required":false,"order":18},
        {"id":"food_vegetable","question_text":"- 생야채 :","question_type":"single_choice","options":["자주 먹는다.","반찬수준으로 먹는다.","잘 안먹는다.","일부러 먹는다."],"required":false,"order":19},
        {"id":"food_flour","question_text":"- 밀가루류 :","question_type":"single_choice","options":["자주 먹는다.","반찬수준으로 먹는다.","잘 안먹는다.","일부러 먹는다."],"required":false,"order":20},
        {"id":"food_spicy","question_text":"- 매운것 (복수선택) :","question_type":"multiple_choice","options":["잘 먹는다.","못먹는다.","자주 먹는다.","매운 것을 피한다.","먹으면 배아프다.","먹으면 설사한다."],"required":false,"order":21},
        {"id":"food_dairy","question_text":"- 유제품 (복수선택) :","question_type":"multiple_choice","options":["매일","자주","가끔","먹으면 배아프다.","먹으면 설사한다.","우유","요거트","장 음료"],"required":false,"order":22},
        {"id":"beverage","question_text":"- 음료수 :","question_type":"single_choice","options":["매일","자주","가끔","잘안마신다."],"required":false,"order":23},
        {"id":"beverage_type","question_text":"- 음료수 종류 (복수선택) :","question_type":"multiple_choice","options":["제로콜라","과일주스","일반 탄산음료","이온음료","에너지 드링크","기타(보기에 없음)"],"required":false,"order":24},
        {"id":"fruit","question_text":"- 과일 :","question_type":"single_choice","options":["매일","자주","가끔","잘안먹는다."],"required":false,"order":25},
        {"id":"fruit_prefer","question_text":"- 좋아하는 과일 (복수선택) :","question_type":"multiple_choice","options":["바나나","귤,오렌지","딸기","사과,배","참외,멜론,수박","복숭아,자두","기타(보기에 없음)"],"required":false,"order":26},
        {"id":"water_habit","question_text":"> 물 :","question_type":"single_choice","options":["일부러 마시려고 노력한다.","갈증 나서 마신다.","입이 말라서 마신다."],"required":false,"order":27},
        {"id":"water_amount","question_text":"- 물의 양 (순수하게 물만) :","question_type":"single_choice","options":["하루1~2잔","하루3~4잔","500미리","800미리","1리터","1.5리터","2리터","3리터","거의 안마신다.","기타(보기에 없음)"],"required":false,"order":28},
        {"id":"water_temp","question_text":"- 물 종류 :","question_type":"single_choice","options":["찬물이 좋다.","따뜻한 물이 좋다.","찬물이 좋지만, 미지근하게 마신다.","찬물이 좋지만, 따뜻하게 마신다."],"required":false,"order":29},
        {"id":"coffee","question_text":"> 커피  :","question_type":"single_choice","options":["안마신다","가끔 마신다.","하루 딱 1잔","하루1~2잔","하루2~3잔","하루3잔 이상"],"required":false,"order":30},
        {"id":"coffee_type","question_text":"- 커피 종류 (복수선택) :","question_type":"multiple_choice","options":["커피믹스","블랙커피(인스턴트)","아메리카노","카페라떼","에스프레소","디카페인","편의점 커피","기타(보기에 없음)"],"required":false,"order":31},
        {"id":"coffee_effect","question_text":"- 커피 반응 (복수선택) :","question_type":"multiple_choice","options":["잠이 안온다.","소변을 자주 본다.","소화가 안된다.","배가 아프다.","머리가 아프다.","두근거린다."],"required":false,"order":32},
        {"id":"alcohol","question_text":"> 술 :","question_type":"single_choice","options":["술 안마신다.","한달에 1~2회","주1~2회","주3~4회","주5~6회","매일"],"required":false,"order":33},
        {"id":"alcohol_when","question_text":"- 술 자리 (복수선택) :","question_type":"multiple_choice","options":["비지니스","회식으로","모임으로","집에서 반주로"],"required":false,"order":34},
        {"id":"alcohol_type","question_text":"- 술 종류/양 (복수선택) :","question_type":"multiple_choice","options":["맥주 1~2캔","맥주 2000cc 이상","소주 3~4잔","소주 1~2병","막걸리","와인","40도 이상","기타(보기에 없음)"],"required":false,"order":35},
        {"id":"stool_frequency","question_text":"> 대변 :","question_type":"single_choice","options":["매일 한번","하루 1~2회","하루 3회 이상","1~2일에 한번","2~3일에 한번","3~4일에 한번","1주일에 한번","심한 변비"],"required":false,"order":36},
        {"id":"stool_form","question_text":"- 대변 형태 (복수선택) :","question_type":"multiple_choice","options":["보통이다","가늘다","물설사","약간 묽다","딱딱하다","토끼똥","불규칙하다","콧물변"],"required":false,"order":37},
        {"id":"stool_feeling","question_text":"- 대변 느낌 (복수선택) :","question_type":"multiple_choice","options":["시원하다","덜 본것 같다","힘들게 나온다","휴지를 많이 쓴다","오래 앉아있다","변 볼때 아프다."],"required":false,"order":38},
        {"id":"gas_pain","question_text":"- 가스/복통 (복수선택) :","question_type":"multiple_choice","options":["가스가 자주 찬다.","방귀냄새가 안좋다.","방귀가 잘 안나온다.","배가 자주 아프다.","배에서 소리가 많이 난다."],"required":false,"order":39},
        {"id":"urine_frequency","question_text":"> 소변 :","question_type":"single_choice","options":["하루 1~2회","하루 2~3회","하루 3~4회","3~4시간에 한번","2~3시간에 한번","1~2시간에 한번","1시간에 한번","더 자주 본다."],"required":false,"order":40},
        {"id":"urine_night","question_text":"- 야간뇨 :","question_type":"single_choice","options":["가끔 소변 때문에 잠에서 깬다.","거의 매일 한번씩 소변 때문에 깬다.","매일 1~2회 자다가 소변 본다.","거의 2시간마다 깨서 소변 본다.","거의 1시간마다 깨서 소변 본다."],"required":false,"order":41},
        {"id":"urine_color","question_text":"- 소변 형태 (복수선택) :","question_type":"multiple_choice","options":["보통이다","진하다","거품이 많다","맑고 양이 많다","조금씩 자주 본다"],"required":false,"order":42},
        {"id":"urine_feeling","question_text":"- 소변 느낌 (복수선택) :","question_type":"multiple_choice","options":["시원하다","덜 시원하다","느리게 나온다","금방 다시 마렵다","갑자기 참기 어렵다","힘들게 나온다.","소변 나올 때 아프다","소변 보고나면 아프다","항상 들어있는 것 같다","요실금"],"required":false,"order":43},
        {"id":"sleep_pattern","question_text":"> 수면 :","question_type":"single_choice","options":["규칙적","불규칙","교대근무"],"required":false,"order":44},
        {"id":"sleep_bedtime","question_text":"- 눕는시간 :","question_type":"single_choice","options":["9~10시","10시~11시","11시~12시","12시~1시","1시~2시","2시~3시","기타(보기에 없음)"],"required":false,"order":45},
        {"id":"sleep_waketime","question_text":"- 일어나는 시간 :","question_type":"single_choice","options":["5시~6시","6시~7시","7시~8시","8시~9시","9시~10시","10시~11시","기타(보기에 없음)"],"required":false,"order":46},
        {"id":"sleep_onset","question_text":"- 잠드는데 걸리는 시간 :","question_type":"single_choice","options":["금방 잠든다","10~20분 걸림","30~40분 걸림","1시간 정도 걸림","12시간 걸림","거의 못 잠"],"required":false,"order":47},
        {"id":"sleep_maintenance","question_text":"- 수면유지 (복수선택) :","question_type":"multiple_choice","options":["잠이 깊이 안든다","중간에 자주 깬다","새벽에 깨서 잠이 안온다","소변 때문에 깬다","잠이 너무 일찍 깬다"],"required":false,"order":48},
        {"id":"dream","question_text":"- 꿈 (복수선택) :","question_type":"multiple_choice","options":["안꾼다","꾸는데 기억안남","많이 꾼다","이상한 꿈","현실적인 내용","무서운 꿈","싸우는 꿈","가위에 잘 눌린다","잠꼬대 많이 한다"],"required":false,"order":49},
        {"id":"fatigue","question_text":"> 피로감 (복수선택) :","question_type":"multiple_choice","options":["많이 자도 피곤하다.","아침에만 일어나기 힘들다.","아침부터 하루종일 피곤하다.","오후3~4시부터 피곤하다.","해질/퇴근 무렵에 피곤해진다.","초저녁에 피곤해서 잠든다."],"required":false,"order":50},
        {"id":"cold_heat","question_text":"> 한열 (복수선택) :","question_type":"multiple_choice","options":["더위를 많이 탄다","추위를 많이 탄다","더위/추위 둘다 탄다","바람이 닿으면 싫다","사우나가 싫다","기타(보기에 없음)"],"required":false,"order":51},
        {"id":"cold_area","question_text":"- 국소적 (복수선택) : ","question_type":"multiple_choice","options":["손이 차다","발이 차다","배가 차다","손이 뜨겁다","발이 뜨겁다","얼굴이 붉고 뜨겁다","갱년기처럼 열이 오르내린다","기타(보기에 없음)"],"required":false,"order":52},
        {"id":"sweat","question_text":"> 땀 (복수선택) :","question_type":"multiple_choice","options":["더우면 많이 난다","덥지 않아도 많이 난다","식은땀이 잘난다","땀이 거의 안난다","보통이다.(다른 사람과 비슷하게)","자고 나면 땀에 젖어있다","땀이 나면 기운이 빠진다","항상 찝찝하고 끈적하게 난다"],"required":false,"order":53},
        {"id":"sweat_area","question_text":"- 땀 많이 나는 부위 (복수선택) :","question_type":"multiple_choice","options":["손바닥","발바닥","겨드랑이","얼굴","머리","가슴","등","사타구니","엉덩이","기타(보기에 없음)"],"required":false,"order":54},
        {"id":"menstrual_cycle","question_text":"> 월경 - 주기 :","question_type":"single_choice","options":["불규칙하다","28~30일","30~35일","35~40일","40~45일","2~3개월에 한번","3개월 이상 무월경","생리가 끝남"],"required":false,"order":55},
        {"id":"menstrual_recent","question_text":"- 최근 생리일자 :","question_type":"single_choice","options":["기억 안남","기억 함(진료시 말씀해주세요)"],"required":false,"order":56},
        {"id":"menstrual_duration","question_text":"- 생리기간 :","question_type":"single_choice","options":["1~2일","3~4일","5~7일","7~10일","10일 이상 지속됨"],"required":false,"order":57},
        {"id":"menstrual_pain","question_text":"- 생리통 (복수선택) : ","question_type":"multiple_choice","options":["전혀 없음","진통제 없이 참을만함","진통제 먹으면 참을 만함","심하면 진통제를 먹는다","미리 진통제를 먹는다","진통제가 효과 없다"],"required":false,"order":58},
        {"id":"menstrual_pain_area","question_text":"- 생리통 부위 (복수선택) :","question_type":"multiple_choice","options":["아랫배","골반 전체","복부 전체","허리","명치","가슴","머리","기타(보기에 없음)"],"required":false,"order":59},
        {"id":"menstrual_amount","question_text":"- 생리양 :","question_type":"single_choice","options":["보통이다(다른 사람과 비슷)","원래 많은 편이다.","원래 적은 편이다.","예전보다 줄었다.","예전보다 늘었다."],"required":false,"order":60},
        {"id":"menstrual_color","question_text":"- 생리혈 (복수선택) :","question_type":"multiple_choice","options":["보통이다(맑은 선홍색)","아주 묽게 나온다.","찌꺼기가 많이 보인다.","큰 덩어리가 많다.","냄새가 많이 난다."],"required":false,"order":61},
        {"id":"menstrual_pms","question_text":"- 월경전증후군 (복수선택)","question_type":"multiple_choice","options":["어지러움","두통","소화불량","식욕항진","체중증가","부종","짜증폭발","기타(보기에 없음)"],"required":false,"order":62},
        {"id":"supplement","question_text":"> 건강기능식품 (진료시 자세히 말씀해주세요) :","question_type":"single_choice","options":["특별히 먹는게 없다.","가끔 먹는다.","항상 먹는다."],"required":false,"order":63},
        {"id":"medication","question_text":"> 양약 (진료시 자세히 말씀해주세요) :","question_type":"multiple_choice","options":["고혈압약","고지혈증약","당뇨약","식도염약","비염약","알레르기약","감기약","정형외과약","정신의학과약","기타(보기에 없음)"],"required":false,"order":64},
        {"id":"disease","question_text":"> 평소 질환 (진료시 자세히 말씀해주세요) : ","question_type":"multiple_choice","options":["소화기 질환","심장 질환","호흡기 질환(비염)","피부 질환","부인과 질환","B형 간염 보균자","콩팥 질환","기타(보기에 없음)"],"required":false,"order":65}
    ]"#.to_string()
}

/// 소아 건강 설문지 질문 데이터 (JSON) - 원본 form5.html 기반
fn get_child_health_survey_questions() -> String {
    r#"[
        {"id":"name","question_text":"이름","question_type":"text","required":true,"order":1},
        {"id":"chart_number","question_text":"차트번호","question_type":"text","required":false,"order":2},
        {"id":"doctor","question_text":"담당의","question_type":"text","required":false,"order":3},
        {"id":"gender_age","question_text":"성별/나이","question_type":"text","required":true,"order":4},
        {"id":"height_weight","question_text":"키/몸무게","question_type":"text","required":true,"order":5},
        {"id":"cold_tendency","question_text":"> 감기 / 경향 :","question_type":"single_choice","options":["감기에 자주 걸리는 편이다.","감기에 잘 걸리지 않는다."],"required":false,"order":6},
        {"id":"cold_symptoms","question_text":"- 주로 나타나는 감기증상 (복수선택) :","question_type":"multiple_choice","options":["발열","콧물","코막힘","기침","가래"],"required":false,"order":7},
        {"id":"cold_complications","question_text":"- 감기가 심해지면 나타나는 질환 (복수선택) :","question_type":"multiple_choice","options":["편도염","중이염","축농증","후두염","폐렴","기관지염"],"required":false,"order":8},
        {"id":"fever_medicine","question_text":"- 해열제를 투여하는 체온을 골라주세요","question_type":"single_choice","options":["38도 넘으면 바로 준다.","38.5도 전후","39.0도 전후","39.4도","컨디션이 괜찮으면 주지 않는다."],"required":false,"order":9},
        {"id":"meal_amount","question_text":"> 소화 / 식사량 :","question_type":"single_choice","options":["또래보다 적게 먹는다.","또래만큼 먹는 편이다.","또래보다 잘 먹는다.","성인만큼 먹는다."],"required":false,"order":10},
        {"id":"digestion_status","question_text":"- 소화상태 (복수선택) :","question_type":"multiple_choice","options":["아침을 거의 먹지 않는다.","배고프다는 말을 잘 안한다.","입이 짧은 편이다.","밥보다 간식을 찾는 편이다.","밥 먹는데 시간이 오래 걸린다.","배 아프다고 자주 한다.","입에서 구린내가 자주 난다.","비위가 약한 것 같다.","안 먹는 음식이 많다.","멀미를 잘 하는 편이다."],"required":false,"order":11},
        {"id":"food_preference","question_text":"> 음식 기호 (복수선택) :","question_type":"multiple_choice","options":["단것을 특히 좋아한다.","밥보다 면 종류를 좋아한다.","찬물을 찾는다.","얼음을 씹어먹는다.","아이스크림을 자주 먹는다.","고기만 좋아한다.","생선만 좋아한다.","야채만 좋아한다."],"required":false,"order":12},
        {"id":"beverage","question_text":"- 음료수 (복수선택) :","question_type":"multiple_choice","options":["우유를 매일 먹는다.","우유를 가끔 먹는다.","우유를 안먹는다.","과일 주스를 자주 마신다.","뽀로로 주스를 자주 마신다.","바나나/딸기/초코 우유를 자주마신다.","탄산음료를 좋아한다."],"required":false,"order":13},
        {"id":"fruit","question_text":"- 자주먹는 과일 (복수선택) :","question_type":"multiple_choice","options":["바나나","딸기","귤","사과","배","복숭아","수박","참외","멜론","포도","망고","키위","토마토","기타(보기에 없음)"],"required":false,"order":14},
        {"id":"stool_frequency","question_text":"> 대변 / 횟수 :","question_type":"single_choice","options":["매일 한번","하루 1~2회","하루 3회 이상","1-2일에 한번","2-3일에 한번","3-4일에 한번","1주일에 한번","심한 변비"],"required":false,"order":15},
        {"id":"stool_form","question_text":"- 대변 형태 (복수선택) :","question_type":"multiple_choice","options":["보통이다","가늘다","물설사","약간 묽다","딱딱하다","토끼똥","불규칙하다","콧물변"],"required":false,"order":16},
        {"id":"stool_feeling","question_text":"- 대변 느낌 (복수선택) :","question_type":"multiple_choice","options":["시원하다","덜 본것 같다","힘들게 나온다","휴지를 많이 쓴다","오래 앉아있다","변 볼때 아프다."],"required":false,"order":17},
        {"id":"gas_pain","question_text":"- 가스/복통 (복수선택) :","question_type":"multiple_choice","options":["가스가 자주 찬다.","방귀냄새가 안좋다.","방귀가 잘 안나온다.","배가 자주 아프다.","배에서 소리가 많이 난다."],"required":false,"order":18},
        {"id":"urine_frequency","question_text":"> 소변 / 횟수 :","question_type":"single_choice","options":["하루 2-3회","하루 3-4회","3-4시간 마다","2-3시간 마다","1시간 마다","더 자주 본다"],"required":false,"order":19},
        {"id":"urine_problem","question_text":"- 소변 문제","question_type":"multiple_choice","options":["야뇨 : 아주 가끔","야뇨 : 피곤할때만","야뇨 : 주 2-3회","야뇨 : 거의 매일","소변 볼 때 아프다고 한다"],"required":false,"order":20},
        {"id":"sleep_bedtime","question_text":"> 수면 / 눕는 시간 :","question_type":"single_choice","options":["8시-9시","9시-10시","10시-11시","11시-12시","12시-1시","기타(보기에 없음)"],"required":false,"order":21},
        {"id":"sleep_waketime","question_text":"- 일어나는 시간 :","question_type":"single_choice","options":["5시-6시","6시-7시","7시-8시","8시-9시","9시-10시","기타(보기에 없음)"],"required":false,"order":22},
        {"id":"sleep_onset","question_text":"- 입면 :","question_type":"single_choice","options":["금방 잠든다","10-20분 걸림","30-40분 걸림","1시간 정도 걸림","1-2시간 걸림"],"required":false,"order":23},
        {"id":"sleep_maintenance","question_text":"- 수면 유지 (복수선택) :","question_type":"multiple_choice","options":["중간에 깨서 엄마를 찾는다.","중간에 깨서 운다.","새벽에 깨서 못잔다.","소변 마렵다고 매번 깬다.","너무 일찍(5-6시) 일어난다."],"required":false,"order":24},
        {"id":"sleep_quality","question_text":"- 수면의 질 (복수선택) :","question_type":"multiple_choice","options":["잠꼬대를 많이 한다.","꿈을 많이 꾼다.","잘 때 심하게 굴러다닌다.","엎드려서 잔다.","자면서 땀을 많이 흘린다."],"required":false,"order":25},
        {"id":"sweat","question_text":"> 땀 (복수선택) :","question_type":"multiple_choice","options":["땀이 거의 없는 편이다","조금만 움직여도 땀을 많이 흘린다","특히 머리로 땀이 많이 나는 편이다","손에 땀이 많다","발에 땀이 많다"],"required":false,"order":26},
        {"id":"supplement","question_text":"> 건강기능식품 (진료시 자세히 말씀해주세요) :","question_type":"single_choice","options":["특별히 먹는게 없다.","가끔 먹는다.","항상 먹는다."],"required":false,"order":27},
        {"id":"medication","question_text":"> 양약 (진료시 자세히 말씀해주세요) :","question_type":"multiple_choice","options":["비염약","알레르기약","감기약","기타(보기에 없음)"],"required":false,"order":28},
        {"id":"disease","question_text":"> 평소 질환 (진료시 자세히 말씀해주세요) :","question_type":"multiple_choice","options":["비염","아토피","두드러기","물사마귀","여드름","ADHD","기타(보기에 없음)"],"required":false,"order":29}
    ]"#.to_string()
}

/// 테이블 생성
fn create_tables(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        -- 한의원 설정
        CREATE TABLE IF NOT EXISTS clinic_settings (
            id TEXT PRIMARY KEY,
            clinic_name TEXT NOT NULL,
            clinic_address TEXT,
            clinic_phone TEXT,
            doctor_name TEXT,
            license_number TEXT,
            staff_password_hash TEXT,
            http_server_port INTEGER DEFAULT 3030,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 환자 정보
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            chart_number TEXT,
            birth_date TEXT,
            gender TEXT,
            phone TEXT,
            address TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 처방
        CREATE TABLE IF NOT EXISTS prescriptions (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            prescription_name TEXT NOT NULL,
            herbs TEXT NOT NULL,
            dosage_instructions TEXT,
            total_days INTEGER NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );

        -- 차팅 기록
        CREATE TABLE IF NOT EXISTS chart_records (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            visit_date TEXT NOT NULL,
            chief_complaint TEXT,
            symptoms TEXT,
            diagnosis TEXT,
            treatment TEXT,
            prescription_id TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        );

        -- 초진차트
        CREATE TABLE IF NOT EXISTS initial_charts (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            doctor_name TEXT,
            chart_date TEXT NOT NULL,
            chief_complaint TEXT,
            present_illness TEXT,
            past_medical_history TEXT,
            notes TEXT,
            prescription_issued INTEGER DEFAULT 0,
            prescription_issued_at TEXT,
            deleted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );
        CREATE INDEX IF NOT EXISTS idx_initial_charts_patient ON initial_charts(patient_id);
        CREATE INDEX IF NOT EXISTS idx_initial_charts_date ON initial_charts(chart_date);

        -- 경과기록
        CREATE TABLE IF NOT EXISTS progress_notes (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            doctor_name TEXT,
            note_date TEXT NOT NULL,
            subjective TEXT,
            objective TEXT,
            assessment TEXT,
            plan TEXT,
            follow_up_plan TEXT,
            notes TEXT,
            prescription_issued INTEGER DEFAULT 0,
            prescription_issued_at TEXT,
            deleted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );
        CREATE INDEX IF NOT EXISTS idx_progress_notes_patient ON progress_notes(patient_id);
        CREATE INDEX IF NOT EXISTS idx_progress_notes_date ON progress_notes(note_date);

        -- 설문지 템플릿
        CREATE TABLE IF NOT EXISTS survey_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            questions TEXT NOT NULL,
            display_mode TEXT DEFAULT 'one_by_one',
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 설문 세션 (온라인 설문용)
        CREATE TABLE IF NOT EXISTS survey_sessions (
            id TEXT PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            patient_id TEXT,
            template_id TEXT NOT NULL,
            respondent_name TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            expires_at TEXT NOT NULL,
            created_by TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (template_id) REFERENCES survey_templates(id)
        );
        CREATE INDEX IF NOT EXISTS idx_survey_sessions_token ON survey_sessions(token);

        -- 설문 응답
        CREATE TABLE IF NOT EXISTS survey_responses (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            patient_id TEXT,
            template_id TEXT NOT NULL,
            respondent_name TEXT,
            answers TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES survey_sessions(id),
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (template_id) REFERENCES survey_templates(id)
        );

        -- 복약 일정
        CREATE TABLE IF NOT EXISTS medication_schedules (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            prescription_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            times_per_day INTEGER NOT NULL,
            medication_times TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        );

        -- 복약 기록
        CREATE TABLE IF NOT EXISTS medication_logs (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL,
            taken_at TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY (schedule_id) REFERENCES medication_schedules(id)
        );

        -- 내부 직원 계정 (웹 클라이언트용)
        CREATE TABLE IF NOT EXISTS staff_accounts (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            permissions TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_login_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_staff_accounts_username ON staff_accounts(username);

        -- 알림 설정
        CREATE TABLE IF NOT EXISTS notification_settings (
            id TEXT PRIMARY KEY,
            schedule_id TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            pre_reminder_minutes INTEGER NOT NULL DEFAULT 5,
            missed_reminder_enabled INTEGER NOT NULL DEFAULT 1,
            missed_reminder_delay_minutes INTEGER NOT NULL DEFAULT 30,
            daily_summary_enabled INTEGER NOT NULL DEFAULT 0,
            daily_summary_time TEXT NOT NULL DEFAULT '09:00',
            sound_enabled INTEGER NOT NULL DEFAULT 1,
            sound_preset TEXT NOT NULL DEFAULT 'default',
            do_not_disturb_start TEXT,
            do_not_disturb_end TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (schedule_id) REFERENCES medication_schedules(id)
        );
        CREATE INDEX IF NOT EXISTS idx_notification_settings_schedule ON notification_settings(schedule_id);

        -- 알림 기록
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            notification_type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'normal',
            schedule_id TEXT,
            patient_id TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            is_dismissed INTEGER NOT NULL DEFAULT 0,
            action_url TEXT,
            created_at TEXT NOT NULL,
            read_at TEXT,
            FOREIGN KEY (schedule_id) REFERENCES medication_schedules(id),
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
        CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

        -- 인덱스 생성
        CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
        CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
        CREATE INDEX IF NOT EXISTS idx_chart_records_patient ON chart_records(patient_id);
        CREATE INDEX IF NOT EXISTS idx_chart_records_date ON chart_records(visit_date);
        "#,
    )?;
    Ok(())
}

/// 마이그레이션 실행
fn run_migrations(conn: &Connection) -> AppResult<()> {
    // 환자 테이블에 chart_number 컬럼 추가
    let _ = conn.execute(
        "ALTER TABLE patients ADD COLUMN chart_number TEXT",
        [],
    );

    Ok(())
}

/// DB 연결 가져오기
fn get_conn() -> AppResult<std::sync::MutexGuard<'static, Connection>> {
    DB_CONNECTION
        .get()
        .ok_or_else(|| AppError::Custom("Database not initialized".to_string()))?
        .lock()
        .map_err(|_| AppError::Custom("Database lock error".to_string()))
}

// ============ 한의원 설정 ============

pub fn save_clinic_settings(settings: &ClinicSettings) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 기존 설정에서 staff_password_hash 보존
    let existing_password_hash: Option<String> = conn
        .query_row(
            "SELECT staff_password_hash FROM clinic_settings WHERE staff_password_hash IS NOT NULL LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    log::info!("save_clinic_settings: preserving password_hash = {:?}", existing_password_hash.is_some());

    // 모든 기존 row 삭제
    let deleted = conn.execute("DELETE FROM clinic_settings", [])?;
    log::info!("save_clinic_settings: deleted {} existing rows", deleted);

    // 새 row 생성 (비밀번호 해시 보존)
    conn.execute(
        r#"INSERT INTO clinic_settings
           (id, clinic_name, clinic_address, clinic_phone, doctor_name, license_number, staff_password_hash, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            settings.id,
            settings.clinic_name,
            settings.clinic_address,
            settings.clinic_phone,
            settings.doctor_name,
            settings.license_number,
            existing_password_hash,
            settings.created_at.to_rfc3339(),
            Utc::now().to_rfc3339(),
        ],
    )?;
    log::info!("save_clinic_settings: INSERT completed with clinic_name = '{}'", settings.clinic_name);

    Ok(())
}

pub fn get_clinic_settings() -> AppResult<Option<ClinicSettings>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 디버그: 현재 clinic_name 확인
    let debug_name: Option<String> = conn
        .query_row("SELECT clinic_name FROM clinic_settings LIMIT 1", [], |row| row.get(0))
        .ok();
    log::info!("get_clinic_settings: reading clinic_name = {:?}", debug_name);

    let mut stmt = conn.prepare(
        "SELECT id, clinic_name, clinic_address, clinic_phone, doctor_name, license_number, created_at, updated_at
         FROM clinic_settings LIMIT 1",
    )?;

    let result = stmt.query_row([], |row| {
        Ok(ClinicSettings {
            id: row.get(0)?,
            clinic_name: row.get(1)?,
            clinic_address: row.get(2)?,
            clinic_phone: row.get(3)?,
            doctor_name: row.get(4)?,
            license_number: row.get(5)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    });

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 디버그: 모든 clinic_settings row 조회
pub fn debug_get_all_clinic_rows() -> AppResult<Vec<String>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare("SELECT id, clinic_name FROM clinic_settings")?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        Ok(format!("id={}, clinic_name='{}'", id, name))
    })?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(s) = row {
            result.push(s);
        }
    }
    Ok(result)
}

// ============ 환자 관리 ============

pub fn create_patient(patient: &Patient) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        r#"INSERT INTO patients (id, name, chart_number, birth_date, gender, phone, address, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
        params![
            patient.id,
            patient.name,
            patient.chart_number,
            patient.birth_date,
            patient.gender,
            patient.phone,
            patient.address,
            patient.notes,
            patient.created_at.to_rfc3339(),
            patient.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_patient(id: &str) -> AppResult<Option<Patient>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, chart_number, birth_date, gender, phone, address, notes, created_at, updated_at
         FROM patients WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(Patient {
            id: row.get(0)?,
            name: row.get(1)?,
            chart_number: row.get(2)?,
            birth_date: row.get(3)?,
            gender: row.get(4)?,
            phone: row.get(5)?,
            address: row.get(6)?,
            notes: row.get(7)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    });

    match result {
        Ok(patient) => Ok(Some(patient)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn list_patients(search: Option<&str>) -> AppResult<Vec<Patient>> {
    log::info!("[DB] list_patients 호출, search: {:?}", search);
    ensure_db_initialized()?;
    let conn = get_conn()?;
    log::info!("[DB] list_patients: DB 연결 획득 성공");

    let query = match search {
        Some(_) => {
            "SELECT id, name, chart_number, birth_date, gender, phone, address, notes, created_at, updated_at
             FROM patients WHERE name LIKE ?1 ORDER BY name"
        }
        None => {
            "SELECT id, name, chart_number, birth_date, gender, phone, address, notes, created_at, updated_at
             FROM patients ORDER BY name"
        }
    };

    let mut stmt = conn.prepare(query)?;
    let rows = if let Some(s) = search {
        stmt.query_map([format!("%{}%", s)], map_patient_row)?
    } else {
        stmt.query_map([], map_patient_row)?
    };

    let mut patients = Vec::new();
    for row in rows {
        patients.push(row?);
    }
    log::info!("[DB] list_patients: 결과 {}명", patients.len());
    Ok(patients)
}

fn map_patient_row(row: &rusqlite::Row) -> rusqlite::Result<Patient> {
    Ok(Patient {
        id: row.get(0)?,
        name: row.get(1)?,
        chart_number: row.get(2)?,
        birth_date: row.get(3)?,
        gender: row.get(4)?,
        phone: row.get(5)?,
        address: row.get(6)?,
        notes: row.get(7)?,
        created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
            .unwrap()
            .with_timezone(&Utc),
        updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
            .unwrap()
            .with_timezone(&Utc),
    })
}

pub fn update_patient(patient: &Patient) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        r#"UPDATE patients SET name = ?2, chart_number = ?3, birth_date = ?4, gender = ?5, phone = ?6,
           address = ?7, notes = ?8, updated_at = ?9 WHERE id = ?1"#,
        params![
            patient.id,
            patient.name,
            patient.chart_number,
            patient.birth_date,
            patient.gender,
            patient.phone,
            patient.address,
            patient.notes,
            Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn delete_patient(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM patients WHERE id = ?1", [id])?;
    Ok(())
}

// ============ 처방 관리 ============

pub fn create_prescription(prescription: &Prescription) -> AppResult<()> {
    let conn = get_conn()?;
    let herbs_json = serde_json::to_string(&prescription.herbs)?;
    conn.execute(
        r#"INSERT INTO prescriptions (id, patient_id, prescription_name, herbs, dosage_instructions, total_days, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            prescription.id,
            prescription.patient_id,
            prescription.prescription_name,
            herbs_json,
            prescription.dosage_instructions,
            prescription.total_days,
            prescription.notes,
            prescription.created_at.to_rfc3339(),
            prescription.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_prescriptions_by_patient(patient_id: &str) -> AppResult<Vec<Prescription>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, prescription_name, herbs, dosage_instructions, total_days, notes, created_at, updated_at
         FROM prescriptions WHERE patient_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        let herbs_json: String = row.get(3)?;
        let herbs: Vec<HerbItem> = serde_json::from_str(&herbs_json).unwrap_or_default();
        Ok(Prescription {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            prescription_name: row.get(2)?,
            herbs,
            dosage_instructions: row.get(4)?,
            total_days: row.get(5)?,
            notes: row.get(6)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut prescriptions = Vec::new();
    for row in rows {
        prescriptions.push(row?);
    }
    Ok(prescriptions)
}

// ============ 차팅 관리 ============

pub fn create_chart_record(record: &ChartRecord) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        r#"INSERT INTO chart_records (id, patient_id, visit_date, chief_complaint, symptoms, diagnosis, treatment, prescription_id, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#,
        params![
            record.id,
            record.patient_id,
            record.visit_date.to_rfc3339(),
            record.chief_complaint,
            record.symptoms,
            record.diagnosis,
            record.treatment,
            record.prescription_id,
            record.notes,
            record.created_at.to_rfc3339(),
            record.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn get_chart_records_by_patient(patient_id: &str) -> AppResult<Vec<ChartRecord>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, visit_date, chief_complaint, symptoms, diagnosis, treatment, prescription_id, notes, created_at, updated_at
         FROM chart_records WHERE patient_id = ?1 ORDER BY visit_date DESC",
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        Ok(ChartRecord {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            visit_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                .unwrap()
                .with_timezone(&Utc),
            chief_complaint: row.get(3)?,
            symptoms: row.get(4)?,
            diagnosis: row.get(5)?,
            treatment: row.get(6)?,
            prescription_id: row.get(7)?,
            notes: row.get(8)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

// ============ 데이터 내보내기 ============

pub fn export_patient_data(patient_id: &str) -> AppResult<String> {
    let patient = get_patient(patient_id)?
        .ok_or_else(|| AppError::Custom("Patient not found".to_string()))?;
    let prescriptions = get_prescriptions_by_patient(patient_id)?;
    let chart_records = get_chart_records_by_patient(patient_id)?;

    let export_data = serde_json::json!({
        "patient": patient,
        "prescriptions": prescriptions,
        "chart_records": chart_records,
        "exported_at": Utc::now().to_rfc3339(),
    });

    Ok(serde_json::to_string_pretty(&export_data)?)
}

pub fn export_all_data() -> AppResult<String> {
    let patients = list_patients(None)?;
    let settings = get_clinic_settings()?;

    let mut all_data = Vec::new();
    for patient in &patients {
        let prescriptions = get_prescriptions_by_patient(&patient.id)?;
        let chart_records = get_chart_records_by_patient(&patient.id)?;
        all_data.push(serde_json::json!({
            "patient": patient,
            "prescriptions": prescriptions,
            "chart_records": chart_records,
        }));
    }

    let export_data = serde_json::json!({
        "clinic_settings": settings,
        "patients_data": all_data,
        "exported_at": Utc::now().to_rfc3339(),
    });

    Ok(serde_json::to_string_pretty(&export_data)?)
}

// ============ 설문 세션 관리 (HTTP 서버용) ============

/// 설문 세션 정보 (DB용)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SurveySessionDb {
    pub id: String,
    pub token: String,
    pub patient_id: Option<String>,
    pub template_id: String,
    pub respondent_name: Option<String>,
    pub status: SessionStatus,
    pub expires_at: String,
    pub created_at: String,
}

/// 설문 템플릿 정보 (DB용)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SurveyTemplateDb {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub questions: Vec<SurveyQuestion>,
    pub display_mode: Option<String>,
    pub is_active: bool,
}

/// 설문 응답 정보 (DB용)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SurveyResponseDb {
    pub id: String,
    pub session_id: Option<String>,
    pub template_id: String,
    pub patient_id: Option<String>,
    pub respondent_name: Option<String>,
    pub answers: String,
    pub submitted_at: String,
}

use crate::models::{SessionStatus, SurveyAnswer, SurveyQuestion};

/// 토큰으로 설문 세션 조회
pub fn get_survey_session_by_token(token: &str) -> AppResult<Option<SurveySessionDb>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, token, patient_id, template_id, respondent_name, status, expires_at, created_at
         FROM survey_sessions WHERE token = ?1",
    )?;

    let result = stmt.query_row([token], |row| {
        let status_str: String = row.get(5)?;
        let status = match status_str.as_str() {
            "completed" => SessionStatus::Completed,
            "expired" => SessionStatus::Expired,
            _ => SessionStatus::Pending,
        };
        Ok(SurveySessionDb {
            id: row.get(0)?,
            token: row.get(1)?,
            patient_id: row.get(2)?,
            template_id: row.get(3)?,
            respondent_name: row.get(4)?,
            status,
            expires_at: row.get(6)?,
            created_at: row.get(7)?,
        })
    });

    match result {
        Ok(session) => {
            // 만료 확인
            if session.status == SessionStatus::Pending {
                if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&session.expires_at) {
                    if expires < Utc::now() {
                        // 만료 처리
                        conn.execute(
                            "UPDATE survey_sessions SET status = 'expired' WHERE id = ?1",
                            [&session.id],
                        )?;
                        return Ok(Some(SurveySessionDb {
                            status: SessionStatus::Expired,
                            ..session
                        }));
                    }
                }
            }
            Ok(Some(session))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 설문 템플릿 저장
pub fn save_survey_template(template: &SurveyTemplateDb) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let questions_json = serde_json::to_string(&template.questions)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        r#"INSERT OR REPLACE INTO survey_templates (id, name, description, questions, display_mode, is_active, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
        params![
            template.id,
            template.name,
            template.description,
            questions_json,
            template.display_mode,
            if template.is_active { 1 } else { 0 },
            now,
            now,
        ],
    )?;
    Ok(())
}

/// 설문 템플릿 조회
pub fn get_survey_template(id: &str) -> AppResult<Option<SurveyTemplateDb>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, questions, display_mode, is_active
         FROM survey_templates WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
        let questions_json: String = row.get(3)?;
        let questions: Vec<SurveyQuestion> = serde_json::from_str(&questions_json).unwrap_or_default();
        let is_active: i32 = row.get(5)?;
        Ok(SurveyTemplateDb {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            questions,
            display_mode: row.get(4)?,
            is_active: is_active != 0,
        })
    });

    match result {
        Ok(template) => Ok(Some(template)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 설문 응답 저장 (동기화용 데이터 반환)
pub fn save_survey_response(
    session_id: &str,
    template_id: &str,
    patient_id: Option<&str>,
    respondent_name: Option<&str>,
    answers: &[SurveyAnswer],
) -> AppResult<SurveyResponseDb> {
    let conn = get_conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let answers_json = serde_json::to_string(answers)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        r#"INSERT INTO survey_responses (id, session_id, template_id, patient_id, respondent_name, answers, submitted_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        params![id, session_id, template_id, patient_id, respondent_name, answers_json, now.clone()],
    )?;

    let response = SurveyResponseDb {
        id,
        session_id: Some(session_id.to_string()),
        template_id: template_id.to_string(),
        patient_id: patient_id.map(|s| s.to_string()),
        respondent_name: respondent_name.map(|s| s.to_string()),
        answers: answers_json,
        submitted_at: now,
    };

    Ok(response)
}

/// 설문 세션 완료 처리
pub fn complete_survey_session(session_id: &str) -> AppResult<()> {
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE survey_sessions SET status = 'completed', completed_at = ?1 WHERE id = ?2",
        params![now, session_id],
    )?;

    Ok(())
}

/// 설문 세션 생성
pub fn create_survey_session(
    patient_id: Option<&str>,
    template_id: &str,
    respondent_name: Option<&str>,
    created_by: Option<&str>,
) -> AppResult<SurveySessionDb> {
    let conn = get_conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let token = generate_survey_token();
    let now = Utc::now();
    let expires_at = (now + chrono::Duration::hours(24)).to_rfc3339();
    let created_at = now.to_rfc3339();

    conn.execute(
        r#"INSERT INTO survey_sessions (id, token, patient_id, template_id, respondent_name, status, expires_at, created_by, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8)"#,
        params![id, token, patient_id, template_id, respondent_name, expires_at, created_by, created_at],
    )?;

    Ok(SurveySessionDb {
        id,
        token,
        patient_id: patient_id.map(|s| s.to_string()),
        template_id: template_id.to_string(),
        respondent_name: respondent_name.map(|s| s.to_string()),
        status: SessionStatus::Pending,
        expires_at,
        created_at,
    })
}

/// 8자리 토큰 생성
fn generate_survey_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| {
            let idx = rng.gen_range(0..36);
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect()
}

// ============ 직원 비밀번호 관리 ============

/// 직원 비밀번호 설정
pub fn set_staff_password(password: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Custom(format!("Password hash error: {}", e)))?;

    // 기존 설정이 있는지 확인
    let existing: Option<String> = conn
        .query_row("SELECT id FROM clinic_settings LIMIT 1", [], |row| row.get(0))
        .ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE clinic_settings SET staff_password_hash = ?, updated_at = ? WHERE id = ?",
            params![hash, Utc::now().to_rfc3339(), id],
        )?;
    } else {
        // 설정이 없으면 새로 생성
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO clinic_settings (id, clinic_name, staff_password_hash, created_at, updated_at) VALUES (?, '', ?, ?, ?)",
            params![id, hash, now, now],
        )?;
    }

    log::info!("Staff password updated");
    Ok(())
}

/// 직원 비밀번호 검증
pub fn verify_staff_password(password: &str) -> AppResult<bool> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let hash: Option<String> = conn
        .query_row(
            "SELECT staff_password_hash FROM clinic_settings LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    match hash {
        Some(h) => {
            let valid = bcrypt::verify(password, &h)
                .map_err(|e| AppError::Custom(format!("Password verify error: {}", e)))?;
            Ok(valid)
        }
        None => Ok(false), // 비밀번호 미설정
    }
}

/// 직원 비밀번호 설정 여부 확인
pub fn has_staff_password() -> AppResult<bool> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let hash: Option<String> = conn
        .query_row(
            "SELECT staff_password_hash FROM clinic_settings LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    Ok(hash.is_some())
}

/// HTTP 서버 포트 가져오기
pub fn get_http_server_port() -> AppResult<u16> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let port: Option<i32> = conn
        .query_row(
            "SELECT http_server_port FROM clinic_settings LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    Ok(port.unwrap_or(3030) as u16)
}

/// HTTP 서버 포트 설정
#[allow(dead_code)]
pub fn set_http_server_port(port: u16) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE clinic_settings SET http_server_port = ?, updated_at = ?",
        params![port as i32, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

/// HTTP 서버 자동 시작 설정 조회
pub fn get_server_autostart() -> AppResult<bool> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 컬럼이 없으면 추가
    let _ = conn.execute(
        "ALTER TABLE clinic_settings ADD COLUMN http_server_autostart INTEGER DEFAULT 0",
        [],
    );

    let autostart: Option<i32> = conn
        .query_row(
            "SELECT http_server_autostart FROM clinic_settings LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    Ok(autostart.unwrap_or(0) == 1)
}

/// HTTP 서버 자동 시작 설정 저장
pub fn set_server_autostart(enabled: bool) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 컬럼이 없으면 추가
    let _ = conn.execute(
        "ALTER TABLE clinic_settings ADD COLUMN http_server_autostart INTEGER DEFAULT 0",
        [],
    );

    conn.execute(
        "UPDATE clinic_settings SET http_server_autostart = ?, updated_at = ?",
        params![if enabled { 1 } else { 0 }, Utc::now().to_rfc3339()],
    )?;

    log::info!("HTTP 서버 자동 시작 설정: {}", enabled);
    Ok(())
}

// ============ 설문 응답 목록 조회 (직원용) ============

/// 설문 응답 목록 조회
pub fn list_survey_responses(limit: Option<i32>) -> AppResult<Vec<SurveyResponseWithTemplate>> {
    let conn = get_conn()?;
    let limit_val = limit.unwrap_or(100);

    let mut stmt = conn.prepare(
        r#"SELECT r.id, r.session_id, r.patient_id, r.template_id, r.respondent_name,
                  r.answers, r.submitted_at, t.name as template_name, p.name as patient_name
           FROM survey_responses r
           LEFT JOIN survey_templates t ON r.template_id = t.id
           LEFT JOIN patients p ON r.patient_id = p.id
           ORDER BY r.submitted_at DESC
           LIMIT ?"#,
    )?;

    let rows = stmt.query_map([limit_val], |row| {
        let answers_json: String = row.get(5)?;
        let answers: Vec<SurveyAnswer> = serde_json::from_str(&answers_json).unwrap_or_default();
        Ok(SurveyResponseWithTemplate {
            id: row.get(0)?,
            session_id: row.get(1)?,
            patient_id: row.get(2)?,
            template_id: row.get(3)?,
            respondent_name: row.get(4)?,
            answers,
            submitted_at: row.get(6)?,
            template_name: row.get(7)?,
            patient_name: row.get(8)?,
        })
    })?;

    let mut responses = Vec::new();
    for row in rows {
        responses.push(row?);
    }
    Ok(responses)
}

/// 설문 응답 (템플릿 이름 포함)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SurveyResponseWithTemplate {
    pub id: String,
    pub session_id: Option<String>,
    pub patient_id: Option<String>,
    pub template_id: String,
    pub respondent_name: Option<String>,
    pub answers: Vec<SurveyAnswer>,
    pub submitted_at: String,
    pub template_name: Option<String>,
    pub patient_name: Option<String>,
}

/// 모든 설문 템플릿 목록 조회
pub fn list_survey_templates() -> AppResult<Vec<SurveyTemplateDb>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, questions, display_mode, is_active FROM survey_templates WHERE is_active = 1 ORDER BY name",
    )?;

    let rows = stmt.query_map([], |row| {
        let questions_json: String = row.get(3)?;
        let questions: Vec<SurveyQuestion> = serde_json::from_str(&questions_json).unwrap_or_default();
        let is_active: i32 = row.get(5)?;
        Ok(SurveyTemplateDb {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            questions,
            display_mode: row.get(4)?,
            is_active: is_active != 0,
        })
    })?;

    let mut templates = Vec::new();
    for row in rows {
        templates.push(row?);
    }
    Ok(templates)
}

/// 설문 템플릿 삭제
pub fn delete_survey_template(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM survey_templates WHERE id = ?1", [id])?;
    log::info!("설문 템플릿 삭제됨: {}", id);
    Ok(())
}

/// 설문 응답 삭제
pub fn delete_survey_response(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM survey_responses WHERE id = ?1", [id])?;
    log::info!("설문 응답 삭제됨: {}", id);
    Ok(())
}

/// 설문 응답에 환자 연결
pub fn link_survey_response_to_patient(response_id: &str, patient_id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 환자 이름 조회
    let patient_name: Option<String> = conn.query_row(
        "SELECT name FROM patients WHERE id = ?1",
        [patient_id],
        |row| row.get(0),
    ).ok();

    conn.execute(
        "UPDATE survey_responses SET patient_id = ?1 WHERE id = ?2",
        params![patient_id, response_id],
    )?;

    log::info!("설문 응답 환자 연결: {} -> {} ({})", response_id, patient_id, patient_name.unwrap_or_default());
    Ok(())
}

/// 기본 설문 템플릿 복원
pub fn restore_default_templates() -> AppResult<()> {
    ensure_db_initialized()?;
    ensure_default_templates()?;
    log::info!("기본 설문 템플릿이 복원되었습니다.");
    Ok(())
}

// ============ 내부 직원 계정 관리 ============

/// 직원 계정 생성
pub fn create_staff_account(account: &StaffAccount) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let permissions_json = serde_json::to_string(&account.permissions)?;

    conn.execute(
        r#"INSERT INTO staff_accounts (id, username, display_name, password_hash, role, permissions, is_active, last_login_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
        params![
            account.id,
            account.username,
            account.display_name,
            account.password_hash,
            account.role.as_str(),
            permissions_json,
            account.is_active,
            account.last_login_at.map(|d| d.to_rfc3339()),
            account.created_at.to_rfc3339(),
            account.updated_at.to_rfc3339(),
        ],
    )?;

    log::info!("직원 계정 생성됨: {} ({})", account.username, account.role.as_str());
    Ok(())
}

/// 직원 계정 조회 (ID로)
pub fn get_staff_account(id: &str) -> AppResult<Option<StaffAccount>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, username, display_name, password_hash, role, permissions, is_active, last_login_at, created_at, updated_at
           FROM staff_accounts WHERE id = ?1"#,
    )?;

    let result = stmt.query_row([id], |row| {
        let permissions_str: String = row.get(5)?;
        let permissions: StaffPermissions = serde_json::from_str(&permissions_str).unwrap_or_default();
        let role_str: String = row.get(4)?;

        Ok(StaffAccount {
            id: row.get(0)?,
            username: row.get(1)?,
            display_name: row.get(2)?,
            password_hash: row.get(3)?,
            role: StaffRole::from_str(&role_str),
            permissions,
            is_active: row.get(6)?,
            last_login_at: row.get::<_, Option<String>>(7)?
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|d| d.with_timezone(&Utc)),
            created_at: row.get::<_, String>(8)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(9)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    });

    match result {
        Ok(account) => Ok(Some(account)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 직원 계정 조회 (username으로)
pub fn get_staff_account_by_username(username: &str) -> AppResult<Option<StaffAccount>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, username, display_name, password_hash, role, permissions, is_active, last_login_at, created_at, updated_at
           FROM staff_accounts WHERE username = ?1"#,
    )?;

    let result = stmt.query_row([username], |row| {
        let permissions_str: String = row.get(5)?;
        let permissions: StaffPermissions = serde_json::from_str(&permissions_str).unwrap_or_default();
        let role_str: String = row.get(4)?;

        Ok(StaffAccount {
            id: row.get(0)?,
            username: row.get(1)?,
            display_name: row.get(2)?,
            password_hash: row.get(3)?,
            role: StaffRole::from_str(&role_str),
            permissions,
            is_active: row.get(6)?,
            last_login_at: row.get::<_, Option<String>>(7)?
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|d| d.with_timezone(&Utc)),
            created_at: row.get::<_, String>(8)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(9)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    });

    match result {
        Ok(account) => Ok(Some(account)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 직원 계정 목록 조회
pub fn list_staff_accounts() -> AppResult<Vec<StaffAccountInfo>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, username, display_name, password_hash, role, permissions, is_active, last_login_at, created_at, updated_at
           FROM staff_accounts ORDER BY created_at DESC"#,
    )?;

    let rows = stmt.query_map([], |row| {
        let permissions_str: String = row.get(5)?;
        let permissions: StaffPermissions = serde_json::from_str(&permissions_str).unwrap_or_default();
        let role_str: String = row.get(4)?;

        Ok(StaffAccountInfo {
            id: row.get(0)?,
            username: row.get(1)?,
            display_name: row.get(2)?,
            role: StaffRole::from_str(&role_str),
            permissions,
            is_active: row.get(6)?,
            last_login_at: row.get::<_, Option<String>>(7)?
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|d| d.with_timezone(&Utc)),
            created_at: row.get::<_, String>(8)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(9)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    })?;

    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row?);
    }
    Ok(accounts)
}

/// 직원 계정 수정
pub fn update_staff_account(account: &StaffAccount) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let permissions_json = serde_json::to_string(&account.permissions)?;

    conn.execute(
        r#"UPDATE staff_accounts
           SET username = ?2, display_name = ?3, password_hash = ?4, role = ?5,
               permissions = ?6, is_active = ?7, updated_at = ?8
           WHERE id = ?1"#,
        params![
            account.id,
            account.username,
            account.display_name,
            account.password_hash,
            account.role.as_str(),
            permissions_json,
            account.is_active,
            Utc::now().to_rfc3339(),
        ],
    )?;

    log::info!("직원 계정 수정됨: {}", account.username);
    Ok(())
}

/// 직원 계정 삭제
pub fn delete_staff_account(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM staff_accounts WHERE id = ?1", [id])?;
    log::info!("직원 계정 삭제됨: {}", id);
    Ok(())
}

/// 직원 로그인 시간 업데이트
pub fn update_staff_last_login(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE staff_accounts SET last_login_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

/// 직원 비밀번호 검증
pub fn verify_staff_account_password(username: &str, password: &str) -> AppResult<Option<StaffAccount>> {
    let account = get_staff_account_by_username(username)?;

    match account {
        Some(acc) if acc.is_active => {
            // bcrypt 비밀번호 검증
            match bcrypt::verify(password, &acc.password_hash) {
                Ok(true) => {
                    // 로그인 시간 업데이트
                    let _ = update_staff_last_login(&acc.id);
                    Ok(Some(acc))
                }
                _ => Ok(None),
            }
        }
        _ => Ok(None),
    }
}

/// 비밀번호 해시 생성
pub fn hash_staff_password(password: &str) -> AppResult<String> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Custom(format!("Password hashing failed: {}", e)))
}

// ============ 초진차트 관리 ============

use crate::models::{InitialChart, ProgressNote};

/// 초진차트 생성
pub fn create_initial_chart(chart: &InitialChart) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute(
        r#"INSERT INTO initial_charts (id, patient_id, doctor_name, chart_date, chief_complaint, present_illness, past_medical_history, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
        params![
            chart.id,
            chart.patient_id,
            chart.doctor_name,
            chart.chart_date,
            chart.chief_complaint,
            chart.present_illness,
            chart.past_medical_history,
            chart.notes,
            if chart.prescription_issued { 1 } else { 0 },
            chart.prescription_issued_at,
            chart.deleted_at,
            chart.created_at.to_rfc3339(),
            chart.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

/// 초진차트 조회
pub fn get_initial_chart(id: &str) -> AppResult<Option<InitialChart>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, doctor_name, chart_date, chief_complaint, present_illness, past_medical_history, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at
           FROM initial_charts WHERE id = ?1 AND deleted_at IS NULL"#,
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(InitialChart {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            doctor_name: row.get(2)?,
            chart_date: row.get(3)?,
            chief_complaint: row.get(4)?,
            present_illness: row.get(5)?,
            past_medical_history: row.get(6)?,
            notes: row.get(7)?,
            prescription_issued: row.get::<_, i32>(8)? != 0,
            prescription_issued_at: row.get(9)?,
            deleted_at: row.get(10)?,
            created_at: row.get::<_, String>(11)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(12)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    });

    match result {
        Ok(chart) => Ok(Some(chart)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 환자별 초진차트 목록 조회
pub fn get_initial_charts_by_patient(patient_id: &str) -> AppResult<Vec<InitialChart>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, doctor_name, chart_date, chief_complaint, present_illness, past_medical_history, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at
           FROM initial_charts WHERE patient_id = ?1 AND deleted_at IS NULL ORDER BY chart_date DESC"#,
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        Ok(InitialChart {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            doctor_name: row.get(2)?,
            chart_date: row.get(3)?,
            chief_complaint: row.get(4)?,
            present_illness: row.get(5)?,
            past_medical_history: row.get(6)?,
            notes: row.get(7)?,
            prescription_issued: row.get::<_, i32>(8)? != 0,
            prescription_issued_at: row.get(9)?,
            deleted_at: row.get(10)?,
            created_at: row.get::<_, String>(11)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(12)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    })?;

    let mut charts = Vec::new();
    for row in rows {
        charts.push(row?);
    }
    Ok(charts)
}

/// 모든 초진차트 목록 조회 (환자 이름 포함)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InitialChartWithPatient {
    #[serde(flatten)]
    pub chart: InitialChart,
    pub patient_name: String,
}

pub fn list_initial_charts() -> AppResult<Vec<InitialChartWithPatient>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT ic.id, ic.patient_id, ic.doctor_name, ic.chart_date, ic.chief_complaint, ic.present_illness, ic.past_medical_history, ic.notes, ic.prescription_issued, ic.prescription_issued_at, ic.deleted_at, ic.created_at, ic.updated_at, p.name as patient_name
           FROM initial_charts ic
           LEFT JOIN patients p ON ic.patient_id = p.id
           WHERE ic.deleted_at IS NULL
           ORDER BY ic.chart_date DESC"#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(InitialChartWithPatient {
            chart: InitialChart {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                doctor_name: row.get(2)?,
                chart_date: row.get(3)?,
                chief_complaint: row.get(4)?,
                present_illness: row.get(5)?,
                past_medical_history: row.get(6)?,
                notes: row.get(7)?,
                prescription_issued: row.get::<_, i32>(8)? != 0,
                prescription_issued_at: row.get(9)?,
                deleted_at: row.get(10)?,
                created_at: row.get::<_, String>(11)?
                    .parse::<chrono::DateTime<Utc>>()
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: row.get::<_, String>(12)?
                    .parse::<chrono::DateTime<Utc>>()
                    .unwrap_or_else(|_| Utc::now()),
            },
            patient_name: row.get(13)?,
        })
    })?;

    let mut charts = Vec::new();
    for row in rows {
        charts.push(row?);
    }
    Ok(charts)
}

/// 초진차트 수정
pub fn update_initial_chart(chart: &InitialChart) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute(
        r#"UPDATE initial_charts SET
           doctor_name = ?2, chart_date = ?3, chief_complaint = ?4, present_illness = ?5,
           past_medical_history = ?6, notes = ?7, prescription_issued = ?8, prescription_issued_at = ?9,
           updated_at = ?10
           WHERE id = ?1"#,
        params![
            chart.id,
            chart.doctor_name,
            chart.chart_date,
            chart.chief_complaint,
            chart.present_illness,
            chart.past_medical_history,
            chart.notes,
            if chart.prescription_issued { 1 } else { 0 },
            chart.prescription_issued_at,
            Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}

/// 초진차트 소프트 삭제
pub fn delete_initial_chart(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE initial_charts SET deleted_at = ?2 WHERE id = ?1",
        params![id, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

// ============ 경과기록 관리 ============

/// 경과기록 생성
pub fn create_progress_note(note: &ProgressNote) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute(
        r#"INSERT INTO progress_notes (id, patient_id, doctor_name, note_date, subjective, objective, assessment, plan, follow_up_plan, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"#,
        params![
            note.id,
            note.patient_id,
            note.doctor_name,
            note.note_date,
            note.subjective,
            note.objective,
            note.assessment,
            note.plan,
            note.follow_up_plan,
            note.notes,
            if note.prescription_issued { 1 } else { 0 },
            note.prescription_issued_at,
            note.deleted_at,
            note.created_at.to_rfc3339(),
            note.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

/// 경과기록 조회
pub fn get_progress_note(id: &str) -> AppResult<Option<ProgressNote>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, doctor_name, note_date, subjective, objective, assessment, plan, follow_up_plan, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at
           FROM progress_notes WHERE id = ?1 AND deleted_at IS NULL"#,
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(ProgressNote {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            doctor_name: row.get(2)?,
            note_date: row.get(3)?,
            subjective: row.get(4)?,
            objective: row.get(5)?,
            assessment: row.get(6)?,
            plan: row.get(7)?,
            follow_up_plan: row.get(8)?,
            notes: row.get(9)?,
            prescription_issued: row.get::<_, i32>(10)? != 0,
            prescription_issued_at: row.get(11)?,
            deleted_at: row.get(12)?,
            created_at: row.get::<_, String>(13)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(14)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    });

    match result {
        Ok(note) => Ok(Some(note)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 환자별 경과기록 목록 조회
pub fn get_progress_notes_by_patient(patient_id: &str) -> AppResult<Vec<ProgressNote>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, doctor_name, note_date, subjective, objective, assessment, plan, follow_up_plan, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at
           FROM progress_notes WHERE patient_id = ?1 AND deleted_at IS NULL ORDER BY note_date DESC"#,
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        Ok(ProgressNote {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            doctor_name: row.get(2)?,
            note_date: row.get(3)?,
            subjective: row.get(4)?,
            objective: row.get(5)?,
            assessment: row.get(6)?,
            plan: row.get(7)?,
            follow_up_plan: row.get(8)?,
            notes: row.get(9)?,
            prescription_issued: row.get::<_, i32>(10)? != 0,
            prescription_issued_at: row.get(11)?,
            deleted_at: row.get(12)?,
            created_at: row.get::<_, String>(13)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(14)?
                .parse::<chrono::DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    })?;

    let mut notes = Vec::new();
    for row in rows {
        notes.push(row?);
    }
    Ok(notes)
}

/// 경과기록 수정
pub fn update_progress_note(note: &ProgressNote) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute(
        r#"UPDATE progress_notes SET
           doctor_name = ?2, note_date = ?3, subjective = ?4, objective = ?5,
           assessment = ?6, plan = ?7, follow_up_plan = ?8, notes = ?9,
           prescription_issued = ?10, prescription_issued_at = ?11, updated_at = ?12
           WHERE id = ?1"#,
        params![
            note.id,
            note.doctor_name,
            note.note_date,
            note.subjective,
            note.objective,
            note.assessment,
            note.plan,
            note.follow_up_plan,
            note.notes,
            if note.prescription_issued { 1 } else { 0 },
            note.prescription_issued_at,
            Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}

/// 경과기록 소프트 삭제
pub fn delete_progress_note(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE progress_notes SET deleted_at = ?2 WHERE id = ?1",
        params![id, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

// ============ 복약 일정 관리 ============

use crate::models::{MedicationSchedule, MedicationLog, MedicationStatus, MedicationStats};

/// 복약 일정 목록 조회
pub fn list_medication_schedules() -> AppResult<Vec<MedicationSchedule>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at
           FROM medication_schedules ORDER BY created_at DESC"#,
    )?;

    let rows = stmt.query_map([], |row| {
        let medication_times_json: String = row.get(6)?;
        let medication_times: Vec<String> = serde_json::from_str(&medication_times_json).unwrap_or_default();
        Ok(MedicationSchedule {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            prescription_id: row.get(2)?,
            start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                .unwrap()
                .with_timezone(&Utc),
            end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                .unwrap()
                .with_timezone(&Utc),
            times_per_day: row.get(5)?,
            medication_times,
            notes: row.get(7)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut schedules = Vec::new();
    for row in rows {
        schedules.push(row?);
    }
    Ok(schedules)
}

/// 복약 일정 조회 (ID로)
pub fn get_medication_schedule(id: &str) -> AppResult<Option<MedicationSchedule>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at
           FROM medication_schedules WHERE id = ?1"#,
    )?;

    let result = stmt.query_row([id], |row| {
        let medication_times_json: String = row.get(6)?;
        let medication_times: Vec<String> = serde_json::from_str(&medication_times_json).unwrap_or_default();
        Ok(MedicationSchedule {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            prescription_id: row.get(2)?,
            start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                .unwrap()
                .with_timezone(&Utc),
            end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                .unwrap()
                .with_timezone(&Utc),
            times_per_day: row.get(5)?,
            medication_times,
            notes: row.get(7)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    });

    match result {
        Ok(schedule) => Ok(Some(schedule)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 환자별 복약 일정 조회
pub fn get_medication_schedules_by_patient(patient_id: &str) -> AppResult<Vec<MedicationSchedule>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at
           FROM medication_schedules WHERE patient_id = ?1 ORDER BY created_at DESC"#,
    )?;

    let rows = stmt.query_map([patient_id], |row| {
        let medication_times_json: String = row.get(6)?;
        let medication_times: Vec<String> = serde_json::from_str(&medication_times_json).unwrap_or_default();
        Ok(MedicationSchedule {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            prescription_id: row.get(2)?,
            start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                .unwrap()
                .with_timezone(&Utc),
            end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                .unwrap()
                .with_timezone(&Utc),
            times_per_day: row.get(5)?,
            medication_times,
            notes: row.get(7)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut schedules = Vec::new();
    for row in rows {
        schedules.push(row?);
    }
    Ok(schedules)
}

/// 복약 일정 생성
pub fn create_medication_schedule(schedule: &MedicationSchedule) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let medication_times_json = serde_json::to_string(&schedule.medication_times)?;

    conn.execute(
        r#"INSERT INTO medication_schedules (id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            schedule.id,
            schedule.patient_id,
            schedule.prescription_id,
            schedule.start_date.to_rfc3339(),
            schedule.end_date.to_rfc3339(),
            schedule.times_per_day,
            medication_times_json,
            schedule.notes,
            schedule.created_at.to_rfc3339(),
        ],
    )?;

    log::info!("복약 일정 생성됨: {}", schedule.id);
    Ok(())
}

/// 복약 일정 수정
pub fn update_medication_schedule(id: &str, schedule: &MedicationSchedule) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let medication_times_json = serde_json::to_string(&schedule.medication_times)?;

    conn.execute(
        r#"UPDATE medication_schedules SET
           patient_id = ?2, prescription_id = ?3, start_date = ?4, end_date = ?5,
           times_per_day = ?6, medication_times = ?7, notes = ?8
           WHERE id = ?1"#,
        params![
            id,
            schedule.patient_id,
            schedule.prescription_id,
            schedule.start_date.to_rfc3339(),
            schedule.end_date.to_rfc3339(),
            schedule.times_per_day,
            medication_times_json,
            schedule.notes,
        ],
    )?;

    log::info!("복약 일정 수정됨: {}", id);
    Ok(())
}

/// 복약 일정 삭제
pub fn delete_medication_schedule(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 연관된 복약 기록도 삭제
    conn.execute("DELETE FROM medication_logs WHERE schedule_id = ?1", [id])?;
    conn.execute("DELETE FROM medication_schedules WHERE id = ?1", [id])?;

    log::info!("복약 일정 삭제됨: {}", id);
    Ok(())
}

// ============ 복약 기록 관리 ============

/// 복약 기록 목록 조회
pub fn list_medication_logs() -> AppResult<Vec<MedicationLog>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, schedule_id, taken_at, status, notes
           FROM medication_logs ORDER BY taken_at DESC"#,
    )?;

    let rows = stmt.query_map([], |row| {
        let status_str: String = row.get(3)?;
        let status = match status_str.as_str() {
            "taken" => MedicationStatus::Taken,
            "missed" => MedicationStatus::Missed,
            "skipped" => MedicationStatus::Skipped,
            _ => MedicationStatus::Taken,
        };
        Ok(MedicationLog {
            id: row.get(0)?,
            schedule_id: row.get(1)?,
            taken_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                .unwrap()
                .with_timezone(&Utc),
            status,
            notes: row.get(4)?,
        })
    })?;

    let mut logs = Vec::new();
    for row in rows {
        logs.push(row?);
    }
    Ok(logs)
}

/// 복약 기록 조회 (ID로)
pub fn get_medication_log(id: &str) -> AppResult<Option<MedicationLog>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, schedule_id, taken_at, status, notes
           FROM medication_logs WHERE id = ?1"#,
    )?;

    let result = stmt.query_row([id], |row| {
        let status_str: String = row.get(3)?;
        let status = match status_str.as_str() {
            "taken" => MedicationStatus::Taken,
            "missed" => MedicationStatus::Missed,
            "skipped" => MedicationStatus::Skipped,
            _ => MedicationStatus::Taken,
        };
        Ok(MedicationLog {
            id: row.get(0)?,
            schedule_id: row.get(1)?,
            taken_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                .unwrap()
                .with_timezone(&Utc),
            status,
            notes: row.get(4)?,
        })
    });

    match result {
        Ok(log) => Ok(Some(log)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 일정별 복약 기록 조회
pub fn get_medication_logs_by_schedule(schedule_id: &str) -> AppResult<Vec<MedicationLog>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, schedule_id, taken_at, status, notes
           FROM medication_logs WHERE schedule_id = ?1 ORDER BY taken_at DESC"#,
    )?;

    let rows = stmt.query_map([schedule_id], |row| {
        let status_str: String = row.get(3)?;
        let status = match status_str.as_str() {
            "taken" => MedicationStatus::Taken,
            "missed" => MedicationStatus::Missed,
            "skipped" => MedicationStatus::Skipped,
            _ => MedicationStatus::Taken,
        };
        Ok(MedicationLog {
            id: row.get(0)?,
            schedule_id: row.get(1)?,
            taken_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                .unwrap()
                .with_timezone(&Utc),
            status,
            notes: row.get(4)?,
        })
    })?;

    let mut logs = Vec::new();
    for row in rows {
        logs.push(row?);
    }
    Ok(logs)
}

/// 복약 기록 생성
pub fn create_medication_log(log: &MedicationLog) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let status_str = match log.status {
        MedicationStatus::Taken => "taken",
        MedicationStatus::Missed => "missed",
        MedicationStatus::Skipped => "skipped",
    };

    conn.execute(
        r#"INSERT INTO medication_logs (id, schedule_id, taken_at, status, notes)
           VALUES (?1, ?2, ?3, ?4, ?5)"#,
        params![
            log.id,
            log.schedule_id,
            log.taken_at.to_rfc3339(),
            status_str,
            log.notes,
        ],
    )?;

    log::info!("복약 기록 생성됨: {}", log.id);
    Ok(())
}

/// 복약 기록 수정
pub fn update_medication_log(id: &str, log: &MedicationLog) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let status_str = match log.status {
        MedicationStatus::Taken => "taken",
        MedicationStatus::Missed => "missed",
        MedicationStatus::Skipped => "skipped",
    };

    conn.execute(
        r#"UPDATE medication_logs SET
           schedule_id = ?2, taken_at = ?3, status = ?4, notes = ?5
           WHERE id = ?1"#,
        params![
            id,
            log.schedule_id,
            log.taken_at.to_rfc3339(),
            status_str,
            log.notes,
        ],
    )?;

    log::info!("복약 기록 수정됨: {}", id);
    Ok(())
}

/// 환자별 복약 통계 조회
pub fn get_medication_stats_by_patient(patient_id: &str) -> AppResult<MedicationStats> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // 전체 일정 수
    let total_schedules: i32 = conn.query_row(
        "SELECT COUNT(*) FROM medication_schedules WHERE patient_id = ?1",
        [patient_id],
        |row| row.get(0),
    )?;

    // 활성 일정 수 (종료일이 현재 시간 이후)
    let now = Utc::now().to_rfc3339();
    let active_schedules: i32 = conn.query_row(
        "SELECT COUNT(*) FROM medication_schedules WHERE patient_id = ?1 AND end_date > ?2",
        params![patient_id, now],
        |row| row.get(0),
    )?;

    // 복약 기록 통계
    let total_logs: i32 = conn.query_row(
        r#"SELECT COUNT(*) FROM medication_logs ml
           JOIN medication_schedules ms ON ml.schedule_id = ms.id
           WHERE ms.patient_id = ?1"#,
        [patient_id],
        |row| row.get(0),
    )?;

    let taken_count: i32 = conn.query_row(
        r#"SELECT COUNT(*) FROM medication_logs ml
           JOIN medication_schedules ms ON ml.schedule_id = ms.id
           WHERE ms.patient_id = ?1 AND ml.status = 'taken'"#,
        [patient_id],
        |row| row.get(0),
    )?;

    let missed_count: i32 = conn.query_row(
        r#"SELECT COUNT(*) FROM medication_logs ml
           JOIN medication_schedules ms ON ml.schedule_id = ms.id
           WHERE ms.patient_id = ?1 AND ml.status = 'missed'"#,
        [patient_id],
        |row| row.get(0),
    )?;

    let skipped_count: i32 = conn.query_row(
        r#"SELECT COUNT(*) FROM medication_logs ml
           JOIN medication_schedules ms ON ml.schedule_id = ms.id
           WHERE ms.patient_id = ?1 AND ml.status = 'skipped'"#,
        [patient_id],
        |row| row.get(0),
    )?;

    // 복약 순응률 계산 (복용한 횟수 / 전체 기록 수 * 100)
    let compliance_rate = if total_logs > 0 {
        (taken_count as f64 / total_logs as f64) * 100.0
    } else {
        0.0
    };

    Ok(MedicationStats {
        patient_id: patient_id.to_string(),
        total_schedules,
        active_schedules,
        total_logs,
        taken_count,
        missed_count,
        skipped_count,
        compliance_rate,
    })
}

// ============ 알림 설정 관리 ============

use crate::models::{NotificationSettings, Notification};

/// 전역 알림 설정 조회
pub fn get_notification_settings() -> AppResult<Option<NotificationSettings>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, schedule_id, enabled, pre_reminder_minutes, missed_reminder_enabled,
                  missed_reminder_delay_minutes, daily_summary_enabled, daily_summary_time,
                  sound_enabled, sound_preset, do_not_disturb_start, do_not_disturb_end,
                  created_at, updated_at
           FROM notification_settings WHERE schedule_id IS NULL LIMIT 1"#,
    )?;

    let result = stmt.query_row([], |row| {
        Ok(NotificationSettings {
            id: row.get(0)?,
            schedule_id: row.get(1)?,
            enabled: row.get::<_, i32>(2)? != 0,
            pre_reminder_minutes: row.get(3)?,
            missed_reminder_enabled: row.get::<_, i32>(4)? != 0,
            missed_reminder_delay_minutes: row.get(5)?,
            daily_summary_enabled: row.get::<_, i32>(6)? != 0,
            daily_summary_time: row.get(7)?,
            sound_enabled: row.get::<_, i32>(8)? != 0,
            sound_preset: row.get(9)?,
            do_not_disturb_start: row.get(10)?,
            do_not_disturb_end: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    });

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 복약 일정별 알림 설정 조회
#[allow(dead_code)]
pub fn get_notification_settings_by_schedule(schedule_id: &str) -> AppResult<Option<NotificationSettings>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, schedule_id, enabled, pre_reminder_minutes, missed_reminder_enabled,
                  missed_reminder_delay_minutes, daily_summary_enabled, daily_summary_time,
                  sound_enabled, sound_preset, do_not_disturb_start, do_not_disturb_end,
                  created_at, updated_at
           FROM notification_settings WHERE schedule_id = ?1"#,
    )?;

    let result = stmt.query_row([schedule_id], |row| {
        Ok(NotificationSettings {
            id: row.get(0)?,
            schedule_id: row.get(1)?,
            enabled: row.get::<_, i32>(2)? != 0,
            pre_reminder_minutes: row.get(3)?,
            missed_reminder_enabled: row.get::<_, i32>(4)? != 0,
            missed_reminder_delay_minutes: row.get(5)?,
            daily_summary_enabled: row.get::<_, i32>(6)? != 0,
            daily_summary_time: row.get(7)?,
            sound_enabled: row.get::<_, i32>(8)? != 0,
            sound_preset: row.get(9)?,
            do_not_disturb_start: row.get(10)?,
            do_not_disturb_end: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    });

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 알림 설정 생성 또는 업데이트
#[allow(dead_code)]
pub fn upsert_notification_settings(settings: &NotificationSettings) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        r#"INSERT OR REPLACE INTO notification_settings
           (id, schedule_id, enabled, pre_reminder_minutes, missed_reminder_enabled,
            missed_reminder_delay_minutes, daily_summary_enabled, daily_summary_time,
            sound_enabled, sound_preset, do_not_disturb_start, do_not_disturb_end,
            created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"#,
        params![
            settings.id,
            settings.schedule_id,
            if settings.enabled { 1 } else { 0 },
            settings.pre_reminder_minutes,
            if settings.missed_reminder_enabled { 1 } else { 0 },
            settings.missed_reminder_delay_minutes,
            if settings.daily_summary_enabled { 1 } else { 0 },
            settings.daily_summary_time,
            if settings.sound_enabled { 1 } else { 0 },
            settings.sound_preset,
            settings.do_not_disturb_start,
            settings.do_not_disturb_end,
            settings.created_at,
            now,
        ],
    )?;

    log::info!("알림 설정 저장됨: {}", settings.id);
    Ok(())
}

// ============ 알림 기록 관리 ============

/// 알림 목록 조회
#[allow(dead_code)]
pub fn list_notifications(limit: Option<i32>) -> AppResult<Vec<Notification>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let limit_val = limit.unwrap_or(100);

    let mut stmt = conn.prepare(
        r#"SELECT id, notification_type, title, body, priority, schedule_id, patient_id,
                  is_read, is_dismissed, action_url, created_at, read_at
           FROM notifications
           ORDER BY created_at DESC
           LIMIT ?"#,
    )?;

    let rows = stmt.query_map([limit_val], |row| {
        Ok(Notification {
            id: row.get(0)?,
            notification_type: row.get(1)?,
            title: row.get(2)?,
            body: row.get(3)?,
            priority: row.get(4)?,
            schedule_id: row.get(5)?,
            patient_id: row.get(6)?,
            is_read: row.get::<_, i32>(7)? != 0,
            is_dismissed: row.get::<_, i32>(8)? != 0,
            action_url: row.get(9)?,
            created_at: row.get(10)?,
            read_at: row.get(11)?,
        })
    })?;

    let mut notifications = Vec::new();
    for row in rows {
        notifications.push(row?);
    }
    Ok(notifications)
}

/// 읽지 않은 알림 목록 조회
#[allow(dead_code)]
pub fn list_unread_notifications() -> AppResult<Vec<Notification>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        r#"SELECT id, notification_type, title, body, priority, schedule_id, patient_id,
                  is_read, is_dismissed, action_url, created_at, read_at
           FROM notifications
           WHERE is_read = 0 AND is_dismissed = 0
           ORDER BY created_at DESC"#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(Notification {
            id: row.get(0)?,
            notification_type: row.get(1)?,
            title: row.get(2)?,
            body: row.get(3)?,
            priority: row.get(4)?,
            schedule_id: row.get(5)?,
            patient_id: row.get(6)?,
            is_read: row.get::<_, i32>(7)? != 0,
            is_dismissed: row.get::<_, i32>(8)? != 0,
            action_url: row.get(9)?,
            created_at: row.get(10)?,
            read_at: row.get(11)?,
        })
    })?;

    let mut notifications = Vec::new();
    for row in rows {
        notifications.push(row?);
    }
    Ok(notifications)
}

/// 알림 생성
pub fn create_notification(notification: &Notification) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute(
        r#"INSERT INTO notifications
           (id, notification_type, title, body, priority, schedule_id, patient_id,
            is_read, is_dismissed, action_url, created_at, read_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
        params![
            notification.id,
            notification.notification_type,
            notification.title,
            notification.body,
            notification.priority,
            notification.schedule_id,
            notification.patient_id,
            if notification.is_read { 1 } else { 0 },
            if notification.is_dismissed { 1 } else { 0 },
            notification.action_url,
            notification.created_at,
            notification.read_at,
        ],
    )?;

    log::info!("알림 생성됨: {} - {}", notification.id, notification.title);
    Ok(())
}

/// 알림 읽음 처리
#[allow(dead_code)]
pub fn mark_notification_read(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE notifications SET is_read = 1, read_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;

    log::info!("알림 읽음 처리: {}", id);
    Ok(())
}

/// 모든 알림 읽음 처리
#[allow(dead_code)]
pub fn mark_all_notifications_read() -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    let count = conn.execute(
        "UPDATE notifications SET is_read = 1, read_at = ?1 WHERE is_read = 0",
        params![now],
    )?;

    log::info!("모든 알림 읽음 처리: {}개", count);
    Ok(())
}

/// 알림 해제 처리
#[allow(dead_code)]
pub fn dismiss_notification(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute(
        "UPDATE notifications SET is_dismissed = 1 WHERE id = ?1",
        params![id],
    )?;

    log::info!("알림 해제됨: {}", id);
    Ok(())
}

/// 읽지 않은 알림 수 조회
pub fn get_unread_notification_count() -> AppResult<i32> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE is_read = 0 AND is_dismissed = 0",
        [],
        |row| row.get(0),
    )?;

    Ok(count)
}

/// 알림 설정 업데이트
pub fn update_notification_settings(settings: &NotificationSettings) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        r#"UPDATE notification_settings SET
            enabled = ?1,
            pre_reminder_minutes = ?2,
            missed_reminder_enabled = ?3,
            missed_reminder_delay_minutes = ?4,
            daily_summary_enabled = ?5,
            daily_summary_time = ?6,
            sound_enabled = ?7,
            sound_preset = ?8,
            do_not_disturb_start = ?9,
            do_not_disturb_end = ?10,
            updated_at = ?11
           WHERE id = ?12"#,
        params![
            settings.enabled,
            settings.pre_reminder_minutes,
            settings.missed_reminder_enabled,
            settings.missed_reminder_delay_minutes,
            settings.daily_summary_enabled,
            settings.daily_summary_time,
            settings.sound_enabled,
            settings.sound_preset,
            settings.do_not_disturb_start,
            settings.do_not_disturb_end,
            now,
            settings.id,
        ],
    )?;

    log::info!("알림 설정 업데이트: {}", settings.id);
    Ok(())
}

/// 오래된 알림 삭제
#[allow(dead_code)]
pub fn delete_old_notifications(days_old: i32) -> AppResult<i32> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let cutoff_date = (Utc::now() - chrono::Duration::days(days_old as i64)).to_rfc3339();

    let count = conn.execute(
        "DELETE FROM notifications WHERE created_at < ?1",
        params![cutoff_date],
    )?;

    log::info!("오래된 알림 삭제: {}일 이전 {}개", days_old, count);
    Ok(count as i32)
}

/// 복약 일정에 대한 최근 알림 확인 (중복 방지용)
pub fn has_recent_notification(schedule_id: &str, notification_type: &str, minutes: i32) -> AppResult<bool> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let cutoff = (Utc::now() - chrono::Duration::minutes(minutes as i64)).to_rfc3339();

    let count: i32 = conn.query_row(
        r#"SELECT COUNT(*) FROM notifications
           WHERE schedule_id = ?1 AND notification_type = ?2 AND created_at > ?3"#,
        params![schedule_id, notification_type, cutoff],
        |row| row.get(0),
    )?;

    Ok(count > 0)
}

/// 활성 복약 일정 목록 조회 (오늘 날짜 기준)
pub fn get_active_medication_schedules_for_today() -> AppResult<Vec<MedicationSchedule>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let today = Utc::now().to_rfc3339();

    let mut stmt = conn.prepare(
        r#"SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at
           FROM medication_schedules
           WHERE start_date <= ?1 AND end_date >= ?1
           ORDER BY created_at DESC"#,
    )?;

    let rows = stmt.query_map([today], |row| {
        let medication_times_json: String = row.get(6)?;
        let medication_times: Vec<String> = serde_json::from_str(&medication_times_json).unwrap_or_default();
        Ok(MedicationSchedule {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            prescription_id: row.get(2)?,
            start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                .unwrap()
                .with_timezone(&Utc),
            end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                .unwrap()
                .with_timezone(&Utc),
            times_per_day: row.get(5)?,
            medication_times,
            notes: row.get(7)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap()
                .with_timezone(&Utc),
        })
    })?;

    let mut schedules = Vec::new();
    for row in rows {
        schedules.push(row?);
    }
    Ok(schedules)
}

/// 특정 시간대의 복약 기록 존재 여부 확인
pub fn has_medication_log_for_time(schedule_id: &str, time_str: &str, date: &str) -> AppResult<bool> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // date와 time_str을 결합하여 시작/종료 범위 생성 (±30분)
    let datetime_str = format!("{}T{}:00", date, time_str);
    let target_time = chrono::DateTime::parse_from_rfc3339(&format!("{}+00:00", datetime_str))
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    let start_time = (target_time - chrono::Duration::minutes(30)).to_rfc3339();
    let end_time = (target_time + chrono::Duration::minutes(30)).to_rfc3339();

    let count: i32 = conn.query_row(
        r#"SELECT COUNT(*) FROM medication_logs
           WHERE schedule_id = ?1 AND taken_at >= ?2 AND taken_at <= ?3 AND status = 'taken'"#,
        params![schedule_id, start_time, end_time],
        |row| row.get(0),
    )?;

    Ok(count > 0)
}
