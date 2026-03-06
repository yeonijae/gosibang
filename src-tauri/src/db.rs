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

/// 데이터베이스가 초기화되어 있는지 확인 (로그인 후 암호화 DB만 사용)
pub fn ensure_db_initialized() -> AppResult<()> {
    if DB_CONNECTION.get().is_none() {
        return Err(AppError::Custom("데이터베이스가 초기화되지 않았습니다. 로그인이 필요합니다.".to_string()));
    }
    Ok(())
}

/// 데이터베이스 초기화 (레거시 - 암호화 DB 전환으로 미사용)
#[allow(dead_code)]
fn init_database(_encryption_key: &str) -> AppResult<()> {
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

        -- 처방 (통합 스키마)
        CREATE TABLE IF NOT EXISTS prescriptions (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            patient_name TEXT,
            prescription_name TEXT,
            chart_number TEXT,
            patient_age TEXT,
            patient_gender TEXT,
            source_type TEXT,
            source_id TEXT,
            formula TEXT NOT NULL DEFAULT '',
            merged_herbs TEXT NOT NULL DEFAULT '[]',
            final_herbs TEXT NOT NULL DEFAULT '[]',
            total_doses REAL NOT NULL DEFAULT 0,
            days INTEGER NOT NULL DEFAULT 0,
            doses_per_day INTEGER NOT NULL DEFAULT 0,
            total_packs INTEGER NOT NULL DEFAULT 0,
            pack_volume REAL,
            water_amount REAL,
            herb_adjustment TEXT,
            total_dosage REAL NOT NULL DEFAULT 0,
            final_total_amount REAL NOT NULL DEFAULT 0,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            issued_at TEXT,
            created_by TEXT,
            deleted_at TEXT,
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

        -- 처방 카테고리
        CREATE TABLE IF NOT EXISTS prescription_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6B7280',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        -- 약재
        CREATE TABLE IF NOT EXISTS herbs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            default_dosage REAL,
            unit TEXT,
            description TEXT,
            created_at TEXT NOT NULL
        );

        -- 처방 정의
        CREATE TABLE IF NOT EXISTS prescription_definitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            alias TEXT,
            category TEXT,
            source TEXT,
            composition TEXT NOT NULL,
            description TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_prescription_definitions_name ON prescription_definitions(name);

        -- 처방 노트
        CREATE TABLE IF NOT EXISTS prescription_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_definition_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (prescription_definition_id) REFERENCES prescription_definitions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_prescription_notes_def ON prescription_notes(prescription_definition_id);

        -- 처방 치험례
        CREATE TABLE IF NOT EXISTS prescription_case_studies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_definition_id INTEGER NOT NULL,
            title TEXT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (prescription_definition_id) REFERENCES prescription_definitions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_prescription_case_studies_def ON prescription_case_studies(prescription_definition_id);

        -- 복약 관리 (해피콜)
        CREATE TABLE IF NOT EXISTS medication_management (
            id TEXT PRIMARY KEY,
            prescription_id TEXT NOT NULL,
            patient_id TEXT NOT NULL,
            patient_name TEXT,
            prescription_name TEXT,
            prescription_date TEXT,
            days INTEGER,
            delivery_days INTEGER,
            start_date TEXT,
            end_date TEXT,
            happy_call_date TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            notes TEXT,
            postpone_count INTEGER NOT NULL DEFAULT 0,
            postponed_to TEXT,
            contacted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_medication_management_patient ON medication_management(patient_id);
        CREATE INDEX IF NOT EXISTS idx_medication_management_status ON medication_management(status);
        CREATE INDEX IF NOT EXISTS idx_medication_management_happy_call ON medication_management(happy_call_date);

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

    // prescriptions 테이블 마이그레이션: 구 스키마(herbs/total_days NOT NULL) → 신 스키마(28컬럼)
    // 기존 DB에 herbs 컬럼이 있으면 구 스키마로 판단하여 테이블 재생성
    let has_old_schema = conn
        .prepare("SELECT herbs FROM prescriptions LIMIT 0")
        .is_ok();

    if has_old_schema {
        log::info!("[DB] prescriptions 테이블 스키마 마이그레이션 (구→신)...");
        conn.execute_batch(r#"
            ALTER TABLE prescriptions RENAME TO _prescriptions_old;

            CREATE TABLE prescriptions (
                id TEXT PRIMARY KEY,
                patient_id TEXT,
                patient_name TEXT,
                prescription_name TEXT,
                chart_number TEXT,
                patient_age TEXT,
                patient_gender TEXT,
                source_type TEXT,
                source_id TEXT,
                formula TEXT NOT NULL DEFAULT '',
                merged_herbs TEXT NOT NULL DEFAULT '[]',
                final_herbs TEXT NOT NULL DEFAULT '[]',
                total_doses REAL NOT NULL DEFAULT 0,
                days INTEGER NOT NULL DEFAULT 0,
                doses_per_day INTEGER NOT NULL DEFAULT 0,
                total_packs INTEGER NOT NULL DEFAULT 0,
                pack_volume REAL,
                water_amount REAL,
                herb_adjustment TEXT,
                total_dosage REAL NOT NULL DEFAULT 0,
                final_total_amount REAL NOT NULL DEFAULT 0,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                issued_at TEXT,
                created_by TEXT,
                deleted_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            );

            INSERT INTO prescriptions (
                id, patient_id, prescription_name, formula, merged_herbs,
                days, notes, status, created_at, updated_at
            )
            SELECT
                id, patient_id, prescription_name,
                COALESCE(prescription_name, ''),
                COALESCE(herbs, '[]'),
                COALESCE(total_days, 0),
                notes, 'issued', created_at, updated_at
            FROM _prescriptions_old;

            DROP TABLE _prescriptions_old;
        "#)?;
        log::info!("[DB] prescriptions 테이블 스키마 마이그레이션 완료");
    }

    // patients 테이블에 deleted_at 컬럼 추가 (휴지통 기능)
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN deleted_at TEXT", []);

    // 처방 정의 기본 데이터 삽입 (비어있을 때만)
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM prescription_definitions",
        [],
        |row| row.get(0),
    )?;

    if count == 0 {
        log::info!("[DB] 처방 정의 기본 데이터 삽입 중...");
        seed_prescription_definitions(conn)?;
        log::info!("[DB] 처방 정의 기본 데이터 삽입 완료");
    }

    // survey_sessions 테이블에 환자 정보 컬럼 추가
    let _ = conn.execute("ALTER TABLE survey_sessions ADD COLUMN patient_name TEXT", []);
    let _ = conn.execute("ALTER TABLE survey_sessions ADD COLUMN chart_number TEXT", []);
    let _ = conn.execute("ALTER TABLE survey_sessions ADD COLUMN patient_age TEXT", []);
    let _ = conn.execute("ALTER TABLE survey_sessions ADD COLUMN patient_gender TEXT", []);

    // 약재 기본 데이터 삽입 (비어있을 때만)
    let herb_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM herbs",
        [],
        |row| row.get(0),
    )?;

    if herb_count == 0 {
        log::info!("[DB] 약재 기본 데이터 삽입 중...");
        seed_herbs(conn)?;
        log::info!("[DB] 약재 기본 데이터 삽입 완료");
    }

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
             FROM patients WHERE name LIKE ?1 AND deleted_at IS NULL ORDER BY name"
        }
        None => {
            "SELECT id, name, chart_number, birth_date, gender, phone, address, notes, created_at, updated_at
             FROM patients WHERE deleted_at IS NULL ORDER BY name"
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
    log::info!("[DB] create_prescription 호출: id={}, formula={}", prescription.id, prescription.formula);
    let conn = get_conn()?;
    conn.execute(
        r#"INSERT INTO prescriptions (
            id, patient_id, patient_name, prescription_name, chart_number,
            patient_age, patient_gender, source_type, source_id,
            formula, merged_herbs, final_herbs, total_doses, days, doses_per_day,
            total_packs, pack_volume, water_amount, herb_adjustment, total_dosage,
            final_total_amount, notes, status, issued_at, created_by, deleted_at,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)"#,
        params![
            prescription.id,
            prescription.patient_id,
            prescription.patient_name,
            prescription.prescription_name,
            prescription.chart_number,
            prescription.patient_age,
            prescription.patient_gender,
            prescription.source_type,
            prescription.source_id,
            prescription.formula,
            prescription.merged_herbs,
            prescription.final_herbs,
            prescription.total_doses,
            prescription.days,
            prescription.doses_per_day,
            prescription.total_packs,
            prescription.pack_volume,
            prescription.water_amount,
            prescription.herb_adjustment,
            prescription.total_dosage,
            prescription.final_total_amount,
            prescription.notes,
            prescription.status,
            prescription.issued_at,
            prescription.created_by,
            prescription.deleted_at,
            prescription.created_at,
            prescription.updated_at,
        ],
    )?;
    Ok(())
}

fn row_to_prescription(row: &rusqlite::Row) -> rusqlite::Result<Prescription> {
    Ok(Prescription {
        id: row.get("id")?,
        patient_id: row.get("patient_id")?,
        patient_name: row.get("patient_name")?,
        prescription_name: row.get("prescription_name")?,
        chart_number: row.get("chart_number")?,
        patient_age: row.get("patient_age")?,
        patient_gender: row.get("patient_gender")?,
        source_type: row.get("source_type")?,
        source_id: row.get("source_id")?,
        formula: row.get("formula")?,
        merged_herbs: row.get("merged_herbs")?,
        final_herbs: row.get("final_herbs")?,
        total_doses: row.get("total_doses")?,
        days: row.get("days")?,
        doses_per_day: row.get("doses_per_day")?,
        total_packs: row.get("total_packs")?,
        pack_volume: row.get("pack_volume")?,
        water_amount: row.get("water_amount")?,
        herb_adjustment: row.get("herb_adjustment")?,
        total_dosage: row.get("total_dosage")?,
        final_total_amount: row.get("final_total_amount")?,
        notes: row.get("notes")?,
        status: row.get("status")?,
        issued_at: row.get("issued_at")?,
        created_by: row.get("created_by")?,
        deleted_at: row.get("deleted_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get_prescriptions_by_patient(patient_id: &str) -> AppResult<Vec<Prescription>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT * FROM prescriptions WHERE patient_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([patient_id], |row| row_to_prescription(row))?;

    let mut prescriptions = Vec::new();
    for row in rows {
        prescriptions.push(row?);
    }
    Ok(prescriptions)
}

pub fn list_all_prescriptions() -> AppResult<Vec<Prescription>> {
    log::info!("[DB] list_all_prescriptions 호출");
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT * FROM prescriptions WHERE deleted_at IS NULL ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([], |row| row_to_prescription(row))?;

    let mut prescriptions = Vec::new();
    for row in rows {
        prescriptions.push(row?);
    }
    log::info!("[DB] list_all_prescriptions 결과: {}건", prescriptions.len());
    Ok(prescriptions)
}

pub fn clear_all_prescriptions() -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM prescriptions", [])?;
    Ok(())
}

pub fn update_prescription(prescription: &Prescription) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        r#"UPDATE prescriptions SET
            patient_id = ?1, patient_name = ?2, prescription_name = ?3, chart_number = ?4,
            patient_age = ?5, patient_gender = ?6, source_type = ?7, source_id = ?8,
            formula = ?9, merged_herbs = ?10, final_herbs = ?11, total_doses = ?12,
            days = ?13, doses_per_day = ?14, total_packs = ?15, pack_volume = ?16,
            water_amount = ?17, herb_adjustment = ?18, total_dosage = ?19,
            final_total_amount = ?20, notes = ?21, status = ?22, issued_at = ?23,
            created_by = ?24, updated_at = ?25
        WHERE id = ?26"#,
        params![
            prescription.patient_id,
            prescription.patient_name,
            prescription.prescription_name,
            prescription.chart_number,
            prescription.patient_age,
            prescription.patient_gender,
            prescription.source_type,
            prescription.source_id,
            prescription.formula,
            prescription.merged_herbs,
            prescription.final_herbs,
            prescription.total_doses,
            prescription.days,
            prescription.doses_per_day,
            prescription.total_packs,
            prescription.pack_volume,
            prescription.water_amount,
            prescription.herb_adjustment,
            prescription.total_dosage,
            prescription.final_total_amount,
            prescription.notes,
            prescription.status,
            prescription.issued_at,
            prescription.created_by,
            prescription.updated_at,
            prescription.id,
        ],
    )?;
    Ok(())
}

pub fn soft_delete_prescription(id: &str) -> AppResult<()> {
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prescriptions SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
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

/// 설문 세션 정보 (환자명 포함, 프론트엔드용)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SurveySessionWithPatient {
    pub id: String,
    pub token: String,
    pub patient_id: Option<String>,
    pub template_id: String,
    pub respondent_name: Option<String>,
    pub status: String,
    pub expires_at: String,
    pub created_by: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub patient_name: Option<String>,
}

/// 설문 세션 정보 (DB용)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SurveySessionDb {
    pub id: String,
    pub token: String,
    pub patient_id: Option<String>,
    pub template_id: String,
    pub respondent_name: Option<String>,
    pub patient_name: Option<String>,
    pub chart_number: Option<String>,
    pub patient_age: Option<String>,
    pub patient_gender: Option<String>,
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
        "SELECT id, token, patient_id, template_id, respondent_name, status, expires_at, created_at, patient_name, chart_number, patient_age, patient_gender
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
            patient_name: row.get(8)?,
            chart_number: row.get(9)?,
            patient_age: row.get(10)?,
            patient_gender: row.get(11)?,
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
    token_override: Option<&str>,
    patient_name: Option<&str>,
    chart_number: Option<&str>,
    patient_age: Option<&str>,
    patient_gender: Option<&str>,
) -> AppResult<SurveySessionDb> {
    let conn = get_conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let token = token_override.map(|t| t.to_string()).unwrap_or_else(|| generate_survey_token());
    let now = Utc::now();
    let expires_at = (now + chrono::Duration::hours(24)).to_rfc3339();
    let created_at = now.to_rfc3339();

    conn.execute(
        r#"INSERT INTO survey_sessions (id, token, patient_id, template_id, respondent_name, status, expires_at, created_by, created_at, patient_name, chart_number, patient_age, patient_gender)
           VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
        params![id, token, patient_id, template_id, respondent_name, expires_at, created_by, created_at, patient_name, chart_number, patient_age, patient_gender],
    )?;

    Ok(SurveySessionDb {
        id,
        token,
        patient_id: patient_id.map(|s| s.to_string()),
        template_id: template_id.to_string(),
        respondent_name: respondent_name.map(|s| s.to_string()),
        patient_name: patient_name.map(|s| s.to_string()),
        chart_number: chart_number.map(|s| s.to_string()),
        patient_age: patient_age.map(|s| s.to_string()),
        patient_gender: patient_gender.map(|s| s.to_string()),
        status: SessionStatus::Pending,
        expires_at,
        created_at,
    })
}

/// 설문 세션 목록 조회 (환자명 포함)
pub fn list_survey_sessions(patient_id: Option<&str>, status: Option<&str>) -> AppResult<Vec<SurveySessionWithPatient>> {
    let conn = get_conn()?;
    let mut sql = String::from(
        "SELECT s.id, s.token, s.patient_id, s.template_id, s.respondent_name, s.status, s.expires_at, s.created_by, s.created_at, s.completed_at, p.name as patient_name
         FROM survey_sessions s
         LEFT JOIN patients p ON s.patient_id = p.id
         WHERE 1=1"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(pid) = patient_id {
        sql.push_str(&format!(" AND s.patient_id = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(pid.to_string()));
    }
    if let Some(st) = status {
        sql.push_str(&format!(" AND s.status = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(st.to_string()));
    }
    sql.push_str(" ORDER BY s.created_at DESC");

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        let status_str: String = row.get(5)?;
        let status = match status_str.as_str() {
            "completed" => "completed".to_string(),
            "expired" => "expired".to_string(),
            _ => "pending".to_string(),
        };
        Ok(SurveySessionWithPatient {
            id: row.get(0)?,
            token: row.get(1)?,
            patient_id: row.get(2)?,
            template_id: row.get(3)?,
            respondent_name: row.get(4)?,
            status,
            expires_at: row.get(6)?,
            created_by: row.get(7)?,
            created_at: row.get(8)?,
            completed_at: row.get(9)?,
            patient_name: row.get(10)?,
        })
    })?;

    let mut sessions = Vec::new();
    for row in rows {
        let mut session = row?;
        // 만료 확인
        if session.status == "pending" {
            if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&session.expires_at) {
                if expires < Utc::now() {
                    conn.execute(
                        "UPDATE survey_sessions SET status = 'expired' WHERE id = ?1",
                        [&session.id],
                    )?;
                    session.status = "expired".to_string();
                }
            }
        }
        sessions.push(session);
    }

    Ok(sessions)
}

/// 설문 세션 ID로 조회
pub fn get_survey_session(id: &str) -> AppResult<Option<SurveySessionDb>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, token, patient_id, template_id, respondent_name, status, expires_at, created_at, patient_name, chart_number, patient_age, patient_gender
         FROM survey_sessions WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
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
            patient_name: row.get(8)?,
            chart_number: row.get(9)?,
            patient_age: row.get(10)?,
            patient_gender: row.get(11)?,
            status,
            expires_at: row.get(6)?,
            created_at: row.get(7)?,
        })
    });

    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 설문 세션 만료 처리
pub fn expire_survey_session(id: &str) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE survey_sessions SET status = 'expired' WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

/// 설문 세션 삭제
pub fn delete_survey_session(id: &str) -> AppResult<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM survey_sessions WHERE id = ?1", [id])?;
    Ok(())
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
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let limit_val = limit.unwrap_or(100);

    let mut stmt = conn.prepare(
        r#"SELECT r.id, r.session_id, r.patient_id, r.template_id, r.respondent_name,
                  r.answers, r.submitted_at, t.name as template_name, p.name as patient_name,
                  p.chart_number
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
            chart_number: row.get(9)?,
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
    pub chart_number: Option<String>,
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

// ============ 설문 응답 관리 (Tauri 명령어용) ============

/// 설문 응답 제출 (프론트엔드에서 직접 호출)
/// 세션은 sql.js에만 존재하므로 FK 체크를 일시 비활성화
pub fn submit_survey_response(
    session_id: Option<&str>,
    template_id: &str,
    patient_id: Option<&str>,
    respondent_name: Option<&str>,
    answers: &[SurveyAnswer],
) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let answers_json = serde_json::to_string(answers)?;
    let now = Utc::now().to_rfc3339();

    // 세션은 sql.js에만 있고 clinic.db에는 없으므로 FK 체크 일시 비활성화
    conn.execute_batch("PRAGMA foreign_keys = OFF")?;

    let result = conn.execute(
        r#"INSERT INTO survey_responses (id, session_id, template_id, patient_id, respondent_name, answers, submitted_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        params![id, session_id, template_id, patient_id, respondent_name, answers_json, now],
    );

    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    result?;

    log::info!("설문 응답 제출됨: {} (template: {})", id, template_id);
    Ok(())
}

/// 동기화된 설문 응답 저장 (Supabase에서 수신, session_id로 중복 체크)
/// 이미 존재하면 false 반환, 새로 저장하면 true 반환
/// 세션은 sql.js에만 존재하므로 FK 체크를 일시 비활성화
pub fn save_survey_response_from_sync(
    session_id: &str,
    template_id: &str,
    patient_id: Option<&str>,
    respondent_name: Option<&str>,
    answers: &[SurveyAnswer],
    submitted_at: &str,
) -> AppResult<bool> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    // session_id로 중복 체크
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM survey_responses WHERE session_id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .ok();

    if existing.is_some() {
        log::info!("설문 응답 이미 존재 (session: {})", session_id);
        return Ok(false);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let answers_json = serde_json::to_string(answers)?;

    // 세션은 sql.js에만 있고 clinic.db에는 없으므로 FK 체크 일시 비활성화
    conn.execute_batch("PRAGMA foreign_keys = OFF")?;

    let result = conn.execute(
        r#"INSERT INTO survey_responses (id, session_id, template_id, patient_id, respondent_name, answers, submitted_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        params![id, session_id, template_id, patient_id, respondent_name, answers_json, submitted_at],
    );

    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    result?;

    log::info!("동기화 설문 응답 저장됨: {} (session: {})", id, session_id);
    Ok(true)
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

// ============ 처방 카테고리 ============
// (알림 관련 함수 제거됨)

// ============ 처방 카테고리 ============

pub fn list_prescription_categories() -> AppResult<Vec<PrescriptionCategory>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, color, sort_order, created_at FROM prescription_categories ORDER BY sort_order, name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PrescriptionCategory {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            sort_order: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn create_prescription_category(cat: &PrescriptionCategory) -> AppResult<i64> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO prescription_categories (name, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![cat.name, cat.color, cat.sort_order, cat.created_at],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_prescription_category(cat: &PrescriptionCategory) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE prescription_categories SET name = ?1, color = ?2, sort_order = ?3 WHERE id = ?4",
        params![cat.name, cat.color, cat.sort_order, cat.id],
    )?;
    Ok(())
}

pub fn delete_prescription_category(id: i64) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM prescription_categories WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 약재 ============

pub fn list_herbs() -> AppResult<Vec<Herb>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, default_dosage, unit, description, created_at FROM herbs ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Herb {
            id: row.get(0)?,
            name: row.get(1)?,
            default_dosage: row.get(2)?,
            unit: row.get(3)?,
            description: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn create_herb(herb: &Herb) -> AppResult<i64> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO herbs (name, default_dosage, unit, description, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![herb.name, herb.default_dosage, herb.unit, herb.description, herb.created_at],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_herb(herb: &Herb) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE herbs SET name = ?1, default_dosage = ?2, unit = ?3, description = ?4 WHERE id = ?5",
        params![herb.name, herb.default_dosage, herb.unit, herb.description, herb.id],
    )?;
    Ok(())
}

pub fn delete_herb(id: i64) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM herbs WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 처방 정의 ============

pub fn list_prescription_definitions() -> AppResult<Vec<PrescriptionDefinition>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, alias, category, source, composition, description, created_at, updated_at FROM prescription_definitions ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PrescriptionDefinition {
            id: row.get(0)?,
            name: row.get(1)?,
            alias: row.get(2)?,
            category: row.get(3)?,
            source: row.get(4)?,
            composition: row.get(5)?,
            description: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn get_prescription_definition(id: i64) -> AppResult<Option<PrescriptionDefinition>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let result = conn.query_row(
        "SELECT id, name, alias, category, source, composition, description, created_at, updated_at FROM prescription_definitions WHERE id = ?1",
        params![id],
        |row| {
            Ok(PrescriptionDefinition {
                id: row.get(0)?,
                name: row.get(1)?,
                alias: row.get(2)?,
                category: row.get(3)?,
                source: row.get(4)?,
                composition: row.get(5)?,
                description: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    );
    match result {
        Ok(def) => Ok(Some(def)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn create_prescription_definition(def: &PrescriptionDefinition) -> AppResult<i64> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prescription_definitions (name, alias, category, source, composition, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![def.name, def.alias, def.category, def.source, def.composition, def.description, now, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_prescription_definition(def: &PrescriptionDefinition) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prescription_definitions SET name = ?1, alias = ?2, category = ?3, source = ?4, composition = ?5, description = ?6, updated_at = ?7 WHERE id = ?8",
        params![def.name, def.alias, def.category, def.source, def.composition, def.description, now, def.id],
    )?;
    Ok(())
}

pub fn delete_prescription_definition(id: i64) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM prescription_definitions WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 처방 노트 ============

pub fn list_prescription_notes(prescription_definition_id: i64) -> AppResult<Vec<PrescriptionNote>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, prescription_definition_id, content, created_at, updated_at FROM prescription_notes WHERE prescription_definition_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map(params![prescription_definition_id], |row| {
        Ok(PrescriptionNote {
            id: row.get(0)?,
            prescription_definition_id: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn create_prescription_note(note: &PrescriptionNote) -> AppResult<i64> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prescription_notes (prescription_definition_id, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![note.prescription_definition_id, note.content, now, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_prescription_note(note: &PrescriptionNote) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prescription_notes SET content = ?1, updated_at = ?2 WHERE id = ?3",
        params![note.content, now, note.id],
    )?;
    Ok(())
}

pub fn delete_prescription_note(id: i64) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM prescription_notes WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 처방 치험례 ============

pub fn list_prescription_case_studies(prescription_definition_id: i64) -> AppResult<Vec<PrescriptionCaseStudy>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, prescription_definition_id, title, content, created_at, updated_at FROM prescription_case_studies WHERE prescription_definition_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map(params![prescription_definition_id], |row| {
        Ok(PrescriptionCaseStudy {
            id: row.get(0)?,
            prescription_definition_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn create_prescription_case_study(cs: &PrescriptionCaseStudy) -> AppResult<i64> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prescription_case_studies (prescription_definition_id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![cs.prescription_definition_id, cs.title, cs.content, now, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_prescription_case_study(cs: &PrescriptionCaseStudy) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prescription_case_studies SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        params![cs.title, cs.content, now, cs.id],
    )?;
    Ok(())
}

pub fn delete_prescription_case_study(id: i64) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM prescription_case_studies WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 복약 관리 (해피콜) ============

pub fn list_medication_management() -> AppResult<Vec<MedicationManagement>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, prescription_id, patient_id, patient_name, prescription_name, prescription_date, days, delivery_days, start_date, end_date, happy_call_date, status, notes, postpone_count, postponed_to, contacted_at, created_at, updated_at FROM medication_management ORDER BY happy_call_date ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(MedicationManagement {
            id: row.get(0)?,
            prescription_id: row.get(1)?,
            patient_id: row.get(2)?,
            patient_name: row.get(3)?,
            prescription_name: row.get(4)?,
            prescription_date: row.get(5)?,
            days: row.get(6)?,
            delivery_days: row.get(7)?,
            start_date: row.get(8)?,
            end_date: row.get(9)?,
            happy_call_date: row.get(10)?,
            status: row.get(11)?,
            notes: row.get(12)?,
            postpone_count: row.get(13)?,
            postponed_to: row.get(14)?,
            contacted_at: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn create_medication_management(mm: &MedicationManagement) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO medication_management (id, prescription_id, patient_id, patient_name, prescription_name, prescription_date, days, delivery_days, start_date, end_date, happy_call_date, status, notes, postpone_count, postponed_to, contacted_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            mm.id, mm.prescription_id, mm.patient_id, mm.patient_name, mm.prescription_name,
            mm.prescription_date, mm.days, mm.delivery_days, mm.start_date, mm.end_date,
            mm.happy_call_date, mm.status, mm.notes, mm.postpone_count, mm.postponed_to,
            mm.contacted_at, now, now
        ],
    )?;
    Ok(())
}

pub fn update_medication_management(mm: &MedicationManagement) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE medication_management SET status = ?1, notes = ?2, postpone_count = ?3, postponed_to = ?4, happy_call_date = ?5, contacted_at = ?6, updated_at = ?7 WHERE id = ?8",
        params![mm.status, mm.notes, mm.postpone_count, mm.postponed_to, mm.happy_call_date, mm.contacted_at, now, mm.id],
    )?;
    Ok(())
}

pub fn delete_medication_management(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM medication_management WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 복약 스케줄 (커맨드용) ============

pub fn list_medication_schedules_cmd(patient_id: Option<&str>) -> AppResult<Vec<MedicationSchedule>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut result = Vec::new();

    if let Some(pid) = patient_id {
        let mut stmt = conn.prepare(
            "SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at FROM medication_schedules WHERE patient_id = ?1 ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map(params![pid], |row| {
            let times_json: String = row.get(6)?;
            let medication_times: Vec<String> = serde_json::from_str(&times_json).unwrap_or_default();
            Ok(MedicationSchedule {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                prescription_id: row.get(2)?,
                start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?).unwrap().with_timezone(&Utc),
                end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?).unwrap().with_timezone(&Utc),
                times_per_day: row.get(5)?,
                medication_times,
                notes: row.get(7)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?).unwrap().with_timezone(&Utc),
            })
        })?;
        for row in rows {
            result.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at FROM medication_schedules ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            let times_json: String = row.get(6)?;
            let medication_times: Vec<String> = serde_json::from_str(&times_json).unwrap_or_default();
            Ok(MedicationSchedule {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                prescription_id: row.get(2)?,
                start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?).unwrap().with_timezone(&Utc),
                end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?).unwrap().with_timezone(&Utc),
                times_per_day: row.get(5)?,
                medication_times,
                notes: row.get(7)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?).unwrap().with_timezone(&Utc),
            })
        })?;
        for row in rows {
            result.push(row?);
        }
    }
    Ok(result)
}

pub fn get_medication_schedule_cmd(id: &str) -> AppResult<Option<MedicationSchedule>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let result = conn.query_row(
        "SELECT id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at FROM medication_schedules WHERE id = ?1",
        params![id],
        |row| {
            let times_json: String = row.get(6)?;
            let medication_times: Vec<String> = serde_json::from_str(&times_json).unwrap_or_default();
            Ok(MedicationSchedule {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                prescription_id: row.get(2)?,
                start_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?).unwrap().with_timezone(&Utc),
                end_date: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?).unwrap().with_timezone(&Utc),
                times_per_day: row.get(5)?,
                medication_times,
                notes: row.get(7)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?).unwrap().with_timezone(&Utc),
            })
        },
    );
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn create_medication_schedule_cmd(schedule: &MedicationSchedule) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let times_json = serde_json::to_string(&schedule.medication_times)?;
    conn.execute(
        "INSERT INTO medication_schedules (id, patient_id, prescription_id, start_date, end_date, times_per_day, medication_times, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            schedule.id, schedule.patient_id, schedule.prescription_id,
            schedule.start_date.to_rfc3339(), schedule.end_date.to_rfc3339(),
            schedule.times_per_day, times_json, schedule.notes,
            schedule.created_at.to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn update_medication_schedule_cmd(schedule: &MedicationSchedule) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let times_json = serde_json::to_string(&schedule.medication_times)?;
    conn.execute(
        "UPDATE medication_schedules SET patient_id = ?1, prescription_id = ?2, start_date = ?3, end_date = ?4, times_per_day = ?5, medication_times = ?6, notes = ?7 WHERE id = ?8",
        params![
            schedule.patient_id, schedule.prescription_id,
            schedule.start_date.to_rfc3339(), schedule.end_date.to_rfc3339(),
            schedule.times_per_day, times_json, schedule.notes,
            schedule.id
        ],
    )?;
    Ok(())
}

pub fn delete_medication_schedule_cmd(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM medication_logs WHERE schedule_id = ?1", params![id])?;
    conn.execute("DELETE FROM medication_schedules WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 복약 기록 (커맨드용) ============

pub fn list_medication_logs_cmd(schedule_id: &str) -> AppResult<Vec<MedicationLog>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, schedule_id, taken_at, status, notes FROM medication_logs WHERE schedule_id = ?1 ORDER BY taken_at DESC"
    )?;
    let rows = stmt.query_map(params![schedule_id], |row| {
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
            taken_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?).unwrap().with_timezone(&Utc),
            status,
            notes: row.get(4)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn create_medication_log_cmd(log: &MedicationLog) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let status_str = match log.status {
        MedicationStatus::Taken => "taken",
        MedicationStatus::Missed => "missed",
        MedicationStatus::Skipped => "skipped",
    };
    conn.execute(
        "INSERT INTO medication_logs (id, schedule_id, taken_at, status, notes) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![log.id, log.schedule_id, log.taken_at.to_rfc3339(), status_str, log.notes],
    )?;
    Ok(())
}

pub fn update_medication_log_cmd(id: &str, status: &str, notes: Option<&str>) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE medication_logs SET status = ?1, notes = ?2 WHERE id = ?3",
        params![status, notes, id],
    )?;
    Ok(())
}

pub fn delete_medication_log_cmd(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute("DELETE FROM medication_logs WHERE id = ?1", params![id])?;
    Ok(())
}

// ============ 사용량 카운트 (플랜 제한용) ============

pub fn get_usage_counts() -> AppResult<(i32, i32, i32)> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let patient_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM patients",
        [],
        |row| row.get(0),
    )?;

    let now = Utc::now();
    let first_day_of_month = format!("{}-{:02}-01", now.format("%Y"), now.format("%m"));

    let prescription_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM prescriptions WHERE created_at >= ?1",
        params![first_day_of_month],
        |row| row.get(0),
    )?;

    let chart_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM initial_charts WHERE created_at >= ?1",
        params![first_day_of_month],
        |row| row.get(0),
    )?;

    Ok((patient_count, prescription_count, chart_count))
}

// ============ 휴지통 관리 ============

/// 환자 소프트 삭제 (연관 데이터 cascade)
pub fn soft_delete_patient(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE patients SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    // cascade: prescriptions
    conn.execute(
        "UPDATE prescriptions SET deleted_at = ?1, updated_at = ?1 WHERE patient_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    // cascade: initial_charts
    conn.execute(
        "UPDATE initial_charts SET deleted_at = ?1, updated_at = ?1 WHERE patient_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    // cascade: progress_notes
    conn.execute(
        "UPDATE progress_notes SET deleted_at = ?1, updated_at = ?1 WHERE patient_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;

    Ok(())
}

/// 초진차트 소프트 삭제
pub fn soft_delete_initial_chart(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE initial_charts SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().to_rfc3339(), id],
    )?;
    Ok(())
}

/// 경과기록 소프트 삭제
pub fn soft_delete_progress_note(id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    conn.execute(
        "UPDATE progress_notes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().to_rfc3339(), id],
    )?;
    Ok(())
}

/// 휴지통에서 복원
pub fn restore_from_trash(table: &str, id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let now = Utc::now().to_rfc3339();

    match table {
        "patients" => {
            conn.execute(
                "UPDATE patients SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
            // cascade restore: related items
            conn.execute(
                "UPDATE prescriptions SET deleted_at = NULL, updated_at = ?1 WHERE patient_id = ?2",
                params![now, id],
            )?;
            conn.execute(
                "UPDATE initial_charts SET deleted_at = NULL, updated_at = ?1 WHERE patient_id = ?2",
                params![now, id],
            )?;
            conn.execute(
                "UPDATE progress_notes SET deleted_at = NULL, updated_at = ?1 WHERE patient_id = ?2",
                params![now, id],
            )?;
        }
        "prescriptions" => {
            conn.execute(
                "UPDATE prescriptions SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
        }
        "initial_charts" => {
            conn.execute(
                "UPDATE initial_charts SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
        }
        "progress_notes" => {
            conn.execute(
                "UPDATE progress_notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
        }
        _ => return Err(AppError::Custom(format!("Unknown table: {}", table))),
    }
    Ok(())
}

/// 영구 삭제
pub fn permanent_delete(table: &str, id: &str) -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    match table {
        "patients" => {
            conn.execute("DELETE FROM prescriptions WHERE patient_id = ?1", [id])?;
            conn.execute("DELETE FROM initial_charts WHERE patient_id = ?1", [id])?;
            conn.execute("DELETE FROM progress_notes WHERE patient_id = ?1", [id])?;
            conn.execute("DELETE FROM patients WHERE id = ?1", [id])?;
        }
        "prescriptions" => {
            conn.execute("DELETE FROM prescriptions WHERE id = ?1", [id])?;
        }
        "initial_charts" => {
            conn.execute("DELETE FROM initial_charts WHERE id = ?1", [id])?;
        }
        "progress_notes" => {
            conn.execute("DELETE FROM progress_notes WHERE id = ?1", [id])?;
        }
        _ => return Err(AppError::Custom(format!("Unknown table: {}", table))),
    }
    Ok(())
}

/// 휴지통 비우기
pub fn empty_trash() -> AppResult<TrashEmptyResult> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let p: i32 = conn.query_row(
        "SELECT COUNT(*) FROM patients WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;
    let rx: i32 = conn.query_row(
        "SELECT COUNT(*) FROM prescriptions WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;
    let ic: i32 = conn.query_row(
        "SELECT COUNT(*) FROM initial_charts WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;
    let pn: i32 = conn.query_row(
        "SELECT COUNT(*) FROM progress_notes WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;

    conn.execute("DELETE FROM patients WHERE deleted_at IS NOT NULL", [])?;
    conn.execute("DELETE FROM prescriptions WHERE deleted_at IS NOT NULL", [])?;
    conn.execute("DELETE FROM initial_charts WHERE deleted_at IS NOT NULL", [])?;
    conn.execute("DELETE FROM progress_notes WHERE deleted_at IS NOT NULL", [])?;

    Ok(TrashEmptyResult {
        deleted_patients: p,
        deleted_prescriptions: rx,
        deleted_initial_charts: ic,
        deleted_progress_notes: pn,
        total: p + rx + ic + pn,
    })
}

/// 휴지통 항목 조회
pub fn get_trash_items() -> AppResult<Vec<TrashItem>> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut items = Vec::new();

    // patients
    let mut stmt = conn.prepare(
        "SELECT id, name, deleted_at FROM patients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TrashItem {
            id: row.get(0)?,
            item_type: "patient".to_string(),
            name: row.get(1)?,
            deleted_at: row.get(2)?,
            extra_info: None,
        })
    })?;
    for r in rows { items.push(r?); }

    // prescriptions
    let mut stmt = conn.prepare(
        "SELECT id, COALESCE(prescription_name, formula, '처방'), deleted_at, patient_name FROM prescriptions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TrashItem {
            id: row.get(0)?,
            item_type: "prescription".to_string(),
            name: row.get(1)?,
            deleted_at: row.get(2)?,
            extra_info: row.get(3)?,
        })
    })?;
    for r in rows { items.push(r?); }

    // initial_charts
    let mut stmt = conn.prepare(
        "SELECT ic.id, COALESCE(p.name, '환자'), ic.deleted_at, ic.chart_date FROM initial_charts ic LEFT JOIN patients p ON ic.patient_id = p.id WHERE ic.deleted_at IS NOT NULL ORDER BY ic.deleted_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TrashItem {
            id: row.get(0)?,
            item_type: "initial_chart".to_string(),
            name: row.get::<_, String>(1)? + " 초진차트",
            deleted_at: row.get(2)?,
            extra_info: row.get(3)?,
        })
    })?;
    for r in rows { items.push(r?); }

    // progress_notes
    let mut stmt = conn.prepare(
        "SELECT pn.id, COALESCE(p.name, '환자'), pn.deleted_at, pn.note_date FROM progress_notes pn LEFT JOIN patients p ON pn.patient_id = p.id WHERE pn.deleted_at IS NOT NULL ORDER BY pn.deleted_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TrashItem {
            id: row.get(0)?,
            item_type: "progress_note".to_string(),
            name: row.get::<_, String>(1)? + " 경과기록",
            deleted_at: row.get(2)?,
            extra_info: row.get(3)?,
        })
    })?;
    for r in rows { items.push(r?); }

    // sort by deleted_at DESC
    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));

    Ok(items)
}

/// 휴지통 항목 수
pub fn get_trash_count() -> AppResult<TrashCount> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let p: i32 = conn.query_row(
        "SELECT COUNT(*) FROM patients WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;
    let rx: i32 = conn.query_row(
        "SELECT COUNT(*) FROM prescriptions WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;
    let ic: i32 = conn.query_row(
        "SELECT COUNT(*) FROM initial_charts WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;
    let pn: i32 = conn.query_row(
        "SELECT COUNT(*) FROM progress_notes WHERE deleted_at IS NOT NULL", [], |r| r.get(0),
    )?;

    Ok(TrashCount {
        patients: p,
        prescriptions: rx,
        initial_charts: ic,
        progress_notes: pn,
        total: p + rx + ic + pn,
    })
}

// ============ 사용량 통계 ============

/// 사용량 통계 (deleted_at IS NULL 기준)
pub fn get_usage_stats() -> AppResult<UsageStats> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    let patients: i32 = conn.query_row(
        "SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL", [], |r| r.get(0),
    )?;
    let prescriptions: i32 = conn.query_row(
        "SELECT COUNT(*) FROM prescriptions WHERE deleted_at IS NULL", [], |r| r.get(0),
    )?;
    let initial_charts: i32 = conn.query_row(
        "SELECT COUNT(*) FROM initial_charts WHERE deleted_at IS NULL", [], |r| r.get(0),
    )?;
    let progress_notes: i32 = conn.query_row(
        "SELECT COUNT(*) FROM progress_notes WHERE deleted_at IS NULL", [], |r| r.get(0),
    )?;

    Ok(UsageStats { patients, prescriptions, initial_charts, progress_notes })
}

// ============ 처방정의 초기화 ============

/// 처방 정의 초기화 (전체 삭제 후 시드 재삽입)
pub fn reset_prescription_definitions() -> AppResult<i32> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute("DELETE FROM prescription_notes", [])?;
    conn.execute("DELETE FROM prescription_case_studies", [])?;
    conn.execute("DELETE FROM prescription_definitions", [])?;
    conn.execute("DELETE FROM prescription_categories", [])?;

    seed_prescription_definitions(&conn)?;

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM prescription_definitions", [], |r| r.get(0),
    )?;
    Ok(count)
}

// ============ 전체 사용자 데이터 초기화 ============

/// 전체 사용자 데이터 삭제 (처방정의/카테고리/약재는 유지)
pub fn reset_all_user_data() -> AppResult<()> {
    ensure_db_initialized()?;
    let conn = get_conn()?;

    conn.execute("DELETE FROM progress_notes", [])?;
    conn.execute("DELETE FROM initial_charts", [])?;
    conn.execute("DELETE FROM prescriptions", [])?;
    conn.execute("DELETE FROM chart_records", [])?;
    conn.execute("DELETE FROM medication_logs", [])?;
    conn.execute("DELETE FROM medication_schedules", [])?;
    conn.execute("DELETE FROM medication_management", [])?;
    conn.execute("DELETE FROM survey_responses", [])?;
    conn.execute("DELETE FROM survey_sessions", [])?;
    conn.execute("DELETE FROM patients", [])?;

    Ok(())
}

// ============ 선택적 데이터 내보내기 ============

/// 선택된 테이블만 JSON 내보내기
pub fn export_selected_data(tables: Vec<String>) -> AppResult<String> {
    ensure_db_initialized()?;
    let conn = get_conn()?;
    let mut export = serde_json::Map::new();

    for table in &tables {
        match table.as_str() {
            "patients" => {
                let patients = list_patients(None)?;
                export.insert("patients".to_string(), serde_json::to_value(&patients)?);
            }
            "prescriptions" => {
                let items = list_all_prescriptions()?;
                export.insert("prescriptions".to_string(), serde_json::to_value(&items)?);
            }
            "initial_charts" => {
                let mut stmt = conn.prepare(
                    "SELECT id, patient_id, doctor_name, chart_date, chief_complaint, present_illness, past_medical_history, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at FROM initial_charts WHERE deleted_at IS NULL",
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "patient_id": row.get::<_, String>(1)?,
                        "doctor_name": row.get::<_, Option<String>>(2)?,
                        "chart_date": row.get::<_, String>(3)?,
                        "chief_complaint": row.get::<_, Option<String>>(4)?,
                        "present_illness": row.get::<_, Option<String>>(5)?,
                        "past_medical_history": row.get::<_, Option<String>>(6)?,
                        "notes": row.get::<_, Option<String>>(7)?,
                        "prescription_issued": row.get::<_, i32>(8)? != 0,
                        "prescription_issued_at": row.get::<_, Option<String>>(9)?,
                        "created_at": row.get::<_, String>(11)?,
                        "updated_at": row.get::<_, String>(12)?,
                    }))
                })?;
                let items: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
                export.insert("initial_charts".to_string(), serde_json::Value::Array(items));
            }
            "progress_notes" => {
                let mut stmt = conn.prepare(
                    "SELECT id, patient_id, doctor_name, note_date, subjective, objective, assessment, plan, follow_up_plan, notes, prescription_issued, prescription_issued_at, deleted_at, created_at, updated_at FROM progress_notes WHERE deleted_at IS NULL",
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "patient_id": row.get::<_, String>(1)?,
                        "doctor_name": row.get::<_, Option<String>>(2)?,
                        "note_date": row.get::<_, String>(3)?,
                        "subjective": row.get::<_, Option<String>>(4)?,
                        "objective": row.get::<_, Option<String>>(5)?,
                        "assessment": row.get::<_, Option<String>>(6)?,
                        "plan": row.get::<_, Option<String>>(7)?,
                        "follow_up_plan": row.get::<_, Option<String>>(8)?,
                        "notes": row.get::<_, Option<String>>(9)?,
                        "prescription_issued": row.get::<_, i32>(10)? != 0,
                        "prescription_issued_at": row.get::<_, Option<String>>(11)?,
                        "created_at": row.get::<_, String>(13)?,
                        "updated_at": row.get::<_, String>(14)?,
                    }))
                })?;
                let items: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
                export.insert("progress_notes".to_string(), serde_json::Value::Array(items));
            }
            "clinic_settings" => {
                let settings = get_clinic_settings()?;
                export.insert("clinic_settings".to_string(), serde_json::to_value(&settings)?);
            }
            "survey_templates" => {
                let items = list_survey_templates()?;
                export.insert("survey_templates".to_string(), serde_json::to_value(&items)?);
            }
            "survey_responses" => {
                let items = list_survey_responses(None)?;
                export.insert("survey_responses".to_string(), serde_json::to_value(&items)?);
            }
            _ => {
                log::warn!("Unknown table for export: {}", table);
            }
        }
    }

    export.insert("exported_at".to_string(), serde_json::Value::String(Utc::now().to_rfc3339()));
    Ok(serde_json::to_string_pretty(&serde_json::Value::Object(export))?)
}

// ============ DB 바이너리 백업/복원 ============

/// DB 파일을 바이너리로 읽기
pub fn export_db_binary() -> AppResult<Vec<u8>> {
    let db_path = get_db_path()?;
    let data = std::fs::read(&db_path)?;
    Ok(data)
}

/// DB 파일을 바이너리로 덮어쓰기
pub fn import_db_binary(data: Vec<u8>) -> AppResult<()> {
    let db_path = get_db_path()?;
    std::fs::write(&db_path, &data)?;
    log::info!("Database binary imported to {:?} ({} bytes)", db_path, data.len());
    Ok(())
}

// ============ 약재 기본 데이터 시드 ============

fn seed_herbs(conn: &Connection) -> AppResult<()> {
    let herbs = vec![
        ("감초", 4.0, "g"), ("갈근", 8.0, "g"), ("계지", 6.0, "g"), ("작약", 6.0, "g"),
        ("대추", 6.0, "g"), ("생강", 6.0, "g"), ("마황", 6.0, "g"), ("행인", 12.0, "g"),
        ("석고", 32.0, "g"), ("자감초", 4.0, "g"), ("반하", 16.0, "g"), ("황련", 2.0, "g"),
        ("황금", 6.0, "g"), ("인삼", 6.0, "g"), ("건강", 6.0, "g"), ("시호", 16.0, "g"),
        ("대황", 8.0, "g"), ("망초", 8.0, "g"), ("후박", 8.0, "g"), ("지실", 10.0, "g"),
        ("복령", 8.0, "g"), ("백출", 6.0, "g"), ("택사", 12.0, "g"), ("부자", 2.0, "g"),
        ("세신", 4.0, "g"), ("오미자", 6.0, "g"), ("당귀", 6.0, "g"), ("천궁", 6.0, "g"),
        ("숙지황", 8.0, "g"), ("산수유", 8.0, "g"), ("목단피", 6.0, "g"), ("산약", 8.0, "g"),
        ("도인", 6.0, "g"), ("지모", 12.0, "g"), ("치자", 14.0, "g"), ("길경", 4.0, "g"),
        ("방풍", 5.0, "g"), ("강활", 5.0, "g"), ("독활", 5.0, "g"), ("황기", 6.0, "g"),
        ("귤피", 5.0, "g"), ("향부자", 5.0, "g"), ("의이인", 12.0, "g"), ("아교주", 4.0, "g"),
        ("용골", 6.0, "g"), ("모려", 6.0, "g"), ("맥문동", 10.0, "g"), ("원지", 5.0, "g"),
        ("건지황", 8.0, "g"),
    ];

    let now = Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "INSERT INTO herbs (name, default_dosage, unit, created_at) VALUES (?1, ?2, ?3, ?4)"
    )?;

    for (name, dosage, unit) in &herbs {
        stmt.execute(params![name, dosage, unit, now])?;
    }

    Ok(())
}

// ============ 처방 정의 기본 데이터 시드 ============

fn seed_prescription_definitions(conn: &Connection) -> AppResult<()> {
    let definitions = vec![
        ("갈근가반하탕", "", "마황제", "상한금궤", "마황:6/계지:4/자감초:4/갈근:8/작약:4/대추:6/생강:6/반하:16"),
        ("갈근탕", "", "마황제", "상한금궤", "마황:6/계지:4/자감초:4/갈근:8/작약:4/대추:6/생강:6"),
        ("갈근탕가천궁신이", "갈근가천신", "", "후세방", "마황:6/계지:4/자감초:4/갈근:8/작약:4/대추:6/생강:6/천궁:4/신이:4"),
        ("갈근황금황련탕", "갈금련", "금련제", "상한금궤", "갈근:16/황련:6/황금:6/자감초:6"),
        ("감맥대조탕", "", "감초제", "상한금궤", "생감초:6/대추:5/부소맥:28"),
        ("감수반하탕", "", "함흉제", "상한금궤", "감수:0.6/반하:2/작약:2/자감초:1.4"),
        ("감초건강탕", "", "건강제", "상한금궤", "자감초:8/건강:6"),
        ("감초부자탕", "", "계지제", "상한금궤", "계지:8/자감초:4/부자:2/백출:4"),
        ("감초사심탕", "감사", "금련제", "상한금궤", "황련:2/황금:6/인삼:6/반하:16/자감초:8/대추:6/건강:6"),
        ("감초탕", "", "감초제", "상한금궤", "생감초:4"),
        ("강삼조이", "", "기능성약물", "후세방", "생강:6/대추:6"),
        ("건강부자탕", "", "부자제", "상한금궤", "건강:2/부자:2"),
        ("건강황금황련인삼탕", "강금련인", "금련제", "상한금궤", "건강:6/황금:6/황련:6/인삼:6"),
        ("계강조초황신부탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:6/마황:4/세신:4/부자:1"),
        ("계마각반탕", "", "마황제", "상한금궤", "마황:2/계지:3/자감초:2/행인:7/작약:2/대추:2/생강:2"),
        ("계작지모탕", "", "계지제", "상한금궤", "계지:8/작약:6/자감초:4/생강:10/지모:8/방풍:8/마황:4/백출:10/부자:2"),
        ("계지가갈근탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:6/생강:6/갈근:8"),
        ("계지가계탕", "", "계지제", "상한금궤", "계지:10/작약:6/자감초:4/대추:6/생강:6"),
        ("계지가대황탕", "", "계지제", "상한금궤", "계지:6/작약:12/자감초:4/대추:6/생강:6/대황:4"),
        ("계지가부자탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:6/대추:6/생강:6/부자:1"),
        ("계지가용골모려탕", "계용모", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:6/생강:6/용골:6/모려:6"),
        ("계지가작약생강인삼신가탕", "신가탕", "계지제", "상한금궤", "계지:6/작약:8/자감초:4/대추:6/생강:8/인삼:6"),
        ("계지가작약탕", "", "계지제", "상한금궤", "계지:6/작약:12/자감초:4/대추:6/생강:6"),
        ("계지가황기탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:6/생강:6/황기:4"),
        ("계지가후박행자탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:6/생강:6/후박:4/행인:15"),
        ("계지거계가복령백출탕", "거계가영출탕", "계지제", "상한금궤", "작약:6/자감초:4/대추:6/생강:6/백출:6/복령:6"),
        ("계지거작약가부자탕", "", "계지제", "상한금궤", "계지:6/자감초:4/생강:6/대추:6/부자:1"),
        ("계지거작약탕", "", "계지제", "상한금궤", "계지:6/자감초:4/대추:6/생강:6"),
        ("계지복령환", "계령", "도인제", "상한금궤", "계지:6/복령:8/도인:6/목단피:6/작약:6"),
        ("계지부자탕", "", "계지제", "상한금궤", "계지:8/자감초:4/대추:6/생강:6/부자:3"),
        ("계지생강지실탕", "계생지", "계지제", "상한금궤", "계지:6/생강:6/지실:10"),
        ("계지인삼탕", "", "건강제", "상한금궤", "인삼:6/백출:6/자감초:8/건강:6/계지:8"),
        ("계지탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:6/생강:6"),
        ("과루계지탕", "", "계지제", "상한금궤", "괄루근:4/계지:6/작약:6/자감초:4/생강:6/대추:6"),
        ("과루해백반하탕", "", "해백제", "상한금궤", "해백:6/과루인:16/반하:16"),
        ("과루해백백주탕", "", "해백제", "상한금궤", "해백:16/과루인:16"),
        ("곽향정기산", "곽정", "", "후세방", "곽향:7.5/자소엽:5/백지:2.5/대복피:2.5/복령:2.5/후박:2.5/백출:2.5/귤피:2.5/반하:2.5/길경:2.5/자감초:2.5/생강:3/대추:3"),
        ("교애사물탕", "", "", "후세방", "당귀:6/작약:8/천궁:4/아교주:4/자감초:4/애엽:6/숙지황:8"),
        ("구미강활탕", "", "", "후세방", "강활:7.5/방풍:7.5/천궁:6/백지:6/백출:6/황금:6/건지황:6/세신:2.5/자감초:2.5"),
        ("궁귀교애탕", "", "당귀제", "상한금궤", "당귀:6/작약:8/천궁:4/아교주:4/자감초:4/애엽:6/건지황:8"),
        ("귀비온담탕", "", "", "후세방", "귀비탕+온담탕"),
        ("귀비탕", "", "", "후세방", "당귀:5/용안육:5/산조인:5/원지:5/인삼:5/황기:5/백출:5/복령:5/목향:2.5/자감초:1.5/생강:3/대추:3"),
        ("귀비탕2", "", "", "후세방", "당귀:5/용안육:5/길초근:2/원지:5/인삼:5/황기:5/백출:5/복령:5/목향:2.5/자감초:1.5/생강:3/대추:3"),
        ("귀출파징탕", "", "", "후세방", "향부자:7.5/삼릉:5/봉출:5/작약:5/당귀미:5/청피:5/오약:3.5/홍화:2.5/소목:2.5/육계:2.5"),
        ("귤피대황박초탕", "", "귤피제", "상한금궤", "귤피:3/대황:6/망초:6"),
        ("귤피죽여탕", "귤죽", "귤피제", "상한금궤", "귤피:16/죽여:4/대추:15/생강:16/자감초:10/인삼:2"),
        ("귤피지실생강탕", "귤지생", "귤피제", "상한금궤", "귤피:32/지실:6/생강:16"),
        ("귤피탕", "", "귤피제", "상한금궤", "귤피:8/생강:16"),
        ("금은화연교", "", "기능성약물", "후세방", "금은화:16/연교:8"),
        ("길경탕", "", "감초제", "상한금궤", "생감초:4/길경:2"),
        ("녹용쌍금탕", "", "", "후세방", "숙지황:5/황기:5/당귀:5/천궁:5/육계:3.5/작약:12.5/백출:10/후박:5/귤피:5/곽향:5/반하:5/자감초:5/생강:3/대추:3/뉴분골:2"),
        ("녹용쌍패탕", "", "", "후세방", "숙지황:5/황기:5/당귀:5/천궁:5/육계:3.5/작약:12.5/인삼:5/시호:5/전호:5/독활:5/강활:5/지각:5/길경:5/복령:5/자감초:5/생강:3/대추:3/박하:3/뉴분골:2"),
        ("녹용쌍화탕", "", "", "후세방", "숙지황:5/황기:5/당귀:5/천궁:5/계지:3.5/자감초:3.5/작약:12.5/생강:3/대추:3/뉴분골:2.5"),
        ("당귀건중탕", "", "계지제", "상한금궤", "계지:6/작약:12/자감초:4/대추:6/생강:6/당귀:8"),
        ("당귀사역가오수유생강탕", "당사오", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:12/생강:16/당귀:6/목통:4/세신:6/오수유:4"),
        ("당귀사역탕", "", "계지제", "상한금궤", "계지:6/작약:6/자감초:4/대추:12/당귀:6/목통:4/세신:6"),
        ("당귀수산", "", "", "후세방", "당귀미:7.5/적작약:5/오약:5/향부자:5/소목:5/홍화:4/도인:3.5/육계:3/자감초:2.5"),
        ("당귀작약산", "당작", "당귀제", "상한금궤", "당귀:6/작약:12/천궁:12/복령:8/백출:8/택사:12"),
        ("대건중탕", "", "건강제", "상한금궤", "인삼:4/건강:8/교이:20/촉초:2"),
        ("대승기탕", "", "대황제", "상한금궤", "대황:8/망초:7/후박:16/지실:10"),
        ("대시함", "", "", "고시방", "대시호탕+소함흉탕"),
        ("대시함마", "", "", "고시방", "대시호탕+소함흉탕+마행의감"),
        ("대시함박", "", "", "고시방", "대시호탕+소함흉탕+반하후박탕"),
        ("대시호가망초탕", "", "시호제", "상한금궤", "시호:16/반하:16/황금:6/지실:8/작약:6/대황:4/생강:10/대추:6/망초:4"),
        ("대시호탕", "", "시호제", "상한금궤", "시호:16/반하:16/황금:6/지실:8/작약:6/대황:4/생강:10/대추:6"),
        ("대영전", "", "", "후세방", "숙지황:15/당귀:10/구기자:10/두충:10/우슬:7.5/육계:5/자감초:5"),
        ("대청룡탕", "", "마황제", "상한금궤", "마황:12/계지:4/자감초:4/행인:12/석고:24/대추:5/생강:6"),
        ("대탕포방기", "대포", "", "고시방", "대함흉탕+목방기탕+방기황기탕+방기복령탕+방기지황탕"),
        ("대함흉탕", "", "함흉제", "상한금궤", "대황:12/망초:24/감수:2"),
        ("대함흉환", "", "함흉제", "상한금궤", "대황:16/정력자:16/망초:12/행인:10/감수:2"),
        ("대함흉환급탕", "대함환급탕", "", "고시방", "대함흉탕+대함흉환"),
        ("대황감수탕", "", "대황제", "상한금궤", "대황:8/감수:4/아교주:4"),
        ("대황망초탕", "", "대황제", "상한금궤", "대황:8/황백:8/망초:8/치자:3"),
        ("대황목단피탕", "", "도인제", "상한금궤", "도인:8/망초:8/대황:8/목단피:6/동과자:12"),
        ("대황부자탕", "", "대황제", "상한금궤", "대황:6/부자:3/세신:4"),
        ("대황황련사심탕", "", "금련제", "상한금궤", "황련:2/황금:2/대황:4"),
        ("도핵승기탕", "", "도인제", "상한금궤", "도인:6/계지:4/망초:4/대황:8/자감초:4"),
        ("도화탕", "", "기타고방", "상한금궤", "적석지:32/건강:2/갱미:30"),
        ("독활기생탕", "", "", "후세방", "독활:7/당귀:7/작약:7/상기생:7/숙지황:5/천궁:5/인삼:5/복령:5/우슬:5/두충:5/진교:5/세신:5/방풍:5/육계:5/자감초:3/생강:3"),
        ("독활지황탕", "", "", "사상방", "숙지황:16/산수유:8/복령:6/택사:6/목단피:4/방풍:4/독활:4"),
        ("두충우슬", "", "기능성약물", "후세방", "두충:6/우슬:6"),
        ("마자인환", "", "대황제", "상한금궤", "마자인:32/작약:16/지실:16/대황:32/후박:20/행인:20"),
        ("마행감석탕", "", "마황제", "상한금궤", "마황:8/행인:15/자감초:4/석고:16"),
        ("마행의감2", "", "마황제", "상한금궤", "마황:8/행인:4/의이인:24/자감초:4"),
        ("마행의감3", "", "마황제", "상한금궤", "마황:8/행인:4/의이인:36/자감초:4"),
        ("마행의감탕", "", "마황제", "상한금궤", "마황:8/행인:4/의이인:12/자감초:4"),
        ("마황가출탕", "", "마황제", "상한금궤", "마황:6/계지:4/자감초:2/행인:21/백출:8"),
        ("마황부자감초탕", "", "마황제", "상한금궤", "마황:4/자감초:4/부자:1"),
        ("마황부자세신탕", "마부신/마신부", "마황제", "상한금궤", "마황:4/부자:1/세신:4"),
        ("마황연교적소두탕", "마연적", "마황제", "상한금궤", "마황:4/연교:4/행인:4/적소두:28/대추:6/상백피:20/생강:4/자감초:4"),
        ("마황탕", "", "마황제", "상한금궤", "마황:6/계지:4/자감초:2/행인:21"),
        ("맥문동탕", "", "반하제", "상한금궤", "반하:32/인삼:6/대추:6/자감초:4/갱미:9/맥문동:15"),
        ("맥문후박탕", "", "", "고시방", "맥문동탕+반하후박탕"),
        ("목방기탕", "", "방기제", "상한금궤", "방기:6/계지:4/석고:24/인삼:8"),
        ("목방기탕거석고가복령망초탕", "거석복망/복망탕/복망", "방기제", "상한금궤", "방기:4/계지:4/인삼:8/망초:8/복령:8"),
        ("반하백출천마탕", "반백천", "", "후세방", "반하:7/귤피:7/맥아:7/백출:5/신곡:5/인삼:2.5/황기:2.5/천마:2.5/복령:2.5/택사:2.5/건강:1.5/황백:1/생강:3"),
        ("반하백출천마탕2", "반백천2", "", "후세방", "반하:7/귤피:7/맥아:7/백출:5/신곡:5/인삼:2.5/황기:2.5/천마:2.5/복령:2.5/택사:2.5/건강:1.5/황금:2/생강:3"),
        ("반하사심탕", "반사", "금련제", "상한금궤", "황련:2/황금:6/인삼:6/반하:16/자감초:6/대추:6/건강:6"),
        ("반하후박탕", "", "반하제", "상한금궤", "반하:32/생강:10/복령:8/후박:6/자소엽:4"),
        ("방기복령탕", "방복", "방기제", "상한금궤", "방기:6/계지:6/황기:6/자감초:4/복령:12"),
        ("방기지황탕", "방지", "방기제", "상한금궤", "방기:6/계지:6/자감초:2/건지황:8/방풍:6"),
        ("방기황기탕", "방황", "방기제", "상한금궤", "방기:8/황기:9/백출:6/자감초:4"),
        ("배농산", "", "감초제", "상한금궤", "길경:2/작약:6/지실:10"),
        ("배농산급탕", "", "감초제", "상한금궤", "생감초:4/길경:6/대추:5/생강:2/작약:6/지실:10"),
        ("배농탕", "", "감초제", "상한금궤", "생감초:4/길경:6/대추:5/생강:2"),
        ("백대갈", "", "", "고시방", "백호탕+대시호탕+갈금련"),
        ("백엽탕", "", "기타고방", "상한금궤", "측백엽:9/건강:9/애엽:9"),
        ("백인2", "", "석고제", "상한금궤", "석고:64/지모:24/갱미:18/자감초:4/인삼:6"),
        ("백인3", "", "석고제", "상한금궤", "석고:96/지모:36/갱미:18/자감초:4/인삼:6"),
        ("백자팔", "", "", "고시방", "백인+자감+팔미"),
        ("백출부자탕", "", "계지제", "상한금궤", "자감초:4/대추:6/생강:6/부자:3/백출:8"),
        ("백호2", "", "석고제", "상한금궤", "석고:64/지모:24/갱미:18/자감초:4"),
        ("백호3", "", "석고제", "상한금궤", "석고:96/지모:36/갱미:18/자감초:4"),
        ("백호가계지탕", "", "석고제", "상한금궤", "석고:32/지모:12/갱미:6/자감초:4/계지:6"),
        ("백호가인삼탕", "백인", "석고제", "상한금궤", "석고:32/지모:12/갱미:18/자감초:4/인삼:6"),
        ("백호탕", "", "석고제", "상한금궤", "석고:32/지모:12/갱미:18/자감초:4"),
        ("보중익기탕", "", "", "후세방", "황기:7.5/인삼:5/백출:5/자감초:5/당귀:2.5/귤피:2.5/승마:1.5/시호:1.5"),
        ("보중치습탕", "", "", "후세방", "인삼:5/백출:5/창출:3.5/귤피:3.5/복령:3.5/맥문동:3.5/목통:3.5/당귀:3.5/황금:2.5/후박:1.5/승마:1.5"),
        ("보화탕", "", "", "후세방", "귤피:7.5/나복자:5/맥아:5/산사:5/향부자:5/후박:5/자감초:2.5/연교:2.5/"),
        ("복령사역탕", "", "부자제", "상한금궤", "부자:2/자감초:4/건강:3/인삼:2/복령:8"),
        ("복령음", "", "귤피제", "상한금궤", "인삼:6/백출:6/복령:6/지실:4/귤피:5/생강:8"),
        ("복령택사탕", "", "복령제", "상한금궤", "복령:16/계지:4/자감초:2/백출:6/택사:8/생강:8"),
        ("복령행인감초탕", "", "복령제", "상한금궤", "복령:6/행인:4/자감초:2"),
        ("부자갱미탕", "", "부자제", "상한금궤", "부자:1/자감초:2/반하:16/대추:5/갱미:15"),
        ("부자사심탕", "", "금련제", "상한금궤", "대황:4/황련:2/황금:2/부자:2"),
        ("부자탕", "", "부자제", "상한금궤", "부자:2/인삼:4/백출:8/복령:6/작약:6"),
        ("불수산", "", "", "후세방", "당귀:30/천궁:20"),
        ("불환금정기산", "", "", "후세방", "백출:10/후박:5/귤피:5/곽향:5/반하:5/자감초:5/생강:3/대추:3"),
        ("사간마황탕", "", "마황제", "상한금궤", "사간:6/마황:8/생강:8/세신:6/자완:6/관동화:6/오미자:6/대추:3/반하:16"),
        ("사군자탕", "", "", "후세방", "인삼:6/백출:6/복령:6/자감초:6"),
        ("사물탕", "", "", "후세방", "숙지황:6/당귀:6/천궁:6/작약:6"),
        ("사역가인삼탕", "", "부자제", "상한금궤", "부자:2/자감초:4/건강:3/인삼:2"),
        ("사역산", "", "시호제", "상한금궤", "시호:16/지실:16/작약:16/자감초:16"),
        ("사역탕", "", "부자제", "상한금궤", "부자:2/자감초:4/건강:3"),
        ("산조인탕", "", "당귀제", "상한금궤", "산조인:9/자감초:2/지모:4/복령:4/천궁:4"),
        ("삼단탕", "", "", "현대처방", "단삼:6/적작약:6/홍화:6"),
        ("삼릉봉출", "", "기능성약물", "후세방", "삼릉:6/봉출:6"),
        ("삼물황금탕", "", "금련제", "상한금궤", "황금:2/고삼:4/건지황:8"),
        ("삼방기탕", "", "", "고시방", "방기황기탕+방기복령탕+방기지황탕"),
        ("삼출건비탕", "", "", "후세방", "인삼:5/백출:5/복령:5/후박:5/귤피:5/산사:5/지실:4/작약:4/사인:2.5/신곡:2.5/맥아:2.5/자감초:2.5/생강:3/대추:3"),
        ("삼황사심탕", "", "금련제", "상한금궤", "황련:6/황금:6/대황:6"),
        ("생간건비탕1", "", "", "현대처방", "인진호:12/갈근:8/울금:6/단삼:6/하수오:6/구기자:10/산사:6/백출:6/귤피:6/후박:6/자감초:3/곽향:3/신곡:3/맥아:3"),
        ("생강감초탕", "", "건강제", "상한금궤", "생강:10/인삼:6/자감초:8/대추:6"),
        ("생강사심탕", "생사", "금련제", "상한금궤", "황련:2/황금:6/인삼:6/반하:16/자감초:6/대추:6/건강:2/생강:8"),
        ("생맥산", "", "", "후세방", "맥문동:10/인삼:5/오미자:5"),
        ("선복대자석탕", "", "금련제", "상한금궤", "선복화:6/인삼:4/생강:10/대자석:2/자감초:6/반하:10/대추:6"),
        ("소건중탕", "", "계지제", "상한금궤", "계지:6/작약:12/자감초:4/대추:6/생강:6/교이:40"),
        ("소건중탕2", "소건중2", "계지제", "상한금궤", "계지:6/작약:12/자감초:4/대추:6/생강:6/교이:20"),
        ("소목홍화", "", "기능성약물", "후세방", "소목:6/홍화:6"),
        ("소반하가복령탕", "", "반하제", "상한금궤", "반하:32/생강:16/복령:6"),
        ("소반하탕", "", "반하제", "상한금궤", "반하:32/생강:16"),
        ("소승기탕", "", "대황제", "상한금궤", "대황:8/후박:4/지실:6"),
        ("소시호가망초탕", "", "시호제", "상한금궤", "시호:16/반하:16/황금:6/인삼:6/자감초:6/생강:6/대추:6/망초:4"),
        ("소시호탕", "", "시호제", "상한금궤", "시호:16/반하:16/황금:6/인삼:6/자감초:6/생강:6/대추:6"),
        ("소청룡가석고탕", "소청룡석고", "마황제", "상한금궤", "마황:6/계지:6/자감초:6/작약:6/오미자:6/반하:16/건강:6/세신:6/석고:4"),
        ("소청룡탕", "", "마황제", "상한금궤", "마황:6/계지:6/자감초:6/작약:6/오미자:6/반하:16/건강:6/세신:6"),
        ("소함흉탕", "", "함흉제", "상한금궤", "황련:3/반하:16/과루인:16"),
        ("소함흉탕2", "소함흉2", "금련제", "상한금궤", "황련:3/반하:16/과루실:16"),
        ("승마갈근탕", "", "", "후세방", "갈근:10/승마:5/작약:5/자감초:5/생강:5"),
        ("시령탕", "", "", "고시방", "소시호탕+오령산"),
        ("시박탕", "", "", "고시방", "소시호탕+반하후박탕"),
        ("시평탕", "", "", "고시방", "소시호탕+평위산"),
        ("시함마", "", "", "고시방", "소시호탕+소함흉탕+마행의감탕"),
        ("시함마농", "", "", "고시방", "시함마+배농산급탕"),
        ("시함박", "", "", "고시방", "소시호탕+소함흉탕+반하후박탕"),
        ("시함박농", "", "", "고시방", "시함박+배농산급탕"),
        ("시함은화탕", "", "", "고시방", "시함마농+시함박농+금은화연교"),
        ("시함중", "", "", "고시방", "시함탕+이중탕"),
        ("시함탕", "", "", "후세방", "소시호탕+소함흉탕"),
        ("시호가용골모려탕", "시용모/시모", "시호제", "상한금궤", "시호:8/반하:8/황금:3/인삼:3/생강:3/대추:3/대황:4/복령:3/계지:3/용골:3/모려:3"),
        ("시호거반하가과루탕", "", "금련제", "상한금궤", "시호:16/인삼:6/황금:6/자감초:6/괄루근:8/생강:4/대추:6"),
        ("시호계지건강탕", "시계건", "시호제", "상한금궤", "시호:16/계지:6/건강:4/괄루근:8/황금:6/모려:4/자감초:4"),
        ("시호계지탕", "시계", "시호제", "상한금궤", "시호:8/반하:8/황금:3/인삼:3/자감초:2/생강:3/대추:3/작약:3/계지:3"),
        ("십미패독산", "", "", "후세방", "시호:5/화피:5/길경:5/천궁:5/복령:5/독활:3.5/방풍:3.5/형개:2.5/생감초:2.5/생강:3.5"),
        ("십전대보탕", "", "", "후세방", "인삼:6/백출:6/복령:6/자감초:6/숙지황:6/작약:6/천궁:6/당귀:6/황기:5/육계:5/생강:5/대추:5"),
        ("쌍갈탕", "", "", "후세방", "원방쌍화탕+갈근탕"),
        ("쌍금탕", "", "", "후세방", "숙지황:5/황기:5/당귀:5/천궁:5/육계:3.5/작약:12.5/백출:10/후박:5/귤피:5/곽향:5/반하:5/자감초:5/생강:3/대추:3"),
        ("쌍패탕", "", "", "후세방", "원방쌍화탕+인삼패독산"),
        ("억간산", "", "", "후세방", "백출:10/복령:10/당귀:7.5/천궁:7.5/조구등:7.5/시호:5/자감초:4"),
        ("연령고본단", "", "", "후세방", "구기자:10/두충:10/맥문동:10/목향:10/백자인:10/복령:10/복분자:7.5/산수유:10/산약:10/건지황:10/석창포:5/숙지황:10/오미자:10/우슬:10/원지:5/육종용:20/인삼:10/지골피:7.5/차전자:7.5/천문동:10/천초:5/택사:5/토사자:20/파극천:10"),
        ("영감강미신탕", "", "복령제", "상한금궤", "복령:8/자감초:6/건강:6/오미자:6/세신:6"),
        ("영감강미신하인탕", "", "복령제", "상한금궤", "복령:8/자감초:6/건강:6/오미자:6/세신:6/반하:16/행인:6"),
        ("영감강미신하인황탕", "", "복령제", "상한금궤", "복령:8/자감초:6/건강:6/오미자:6/세신:6/반하:16/행인:6/대황:6"),
        ("영감강미신하탕", "", "복령제", "상한금궤", "복령:8/자감초:6/건강:6/오미자:6/세신:6/반하:16"),
        ("영강출감탕", "", "복령제", "상한금궤", "복령:8/자감초:4/건강:8/백출:4"),
        ("영계감조탕", "", "복령제", "상한금궤", "복령:16/계지:8/자감초:4/대추:8"),
        ("영계미감탕", "", "복령제", "상한금궤", "복령:8/계지:8/오미자:6/자감초:6"),
        ("영계출감탕", "", "복령제", "상한금궤", "복령:8/계지:6/자감초:4/백출:4"),
        ("오령산", "", "복령제", "상한금궤", "복령:6/계지:4/백출:6/택사:10/저령:6"),
        ("오매환", "", "금련제", "상한금궤", "오매:6/건강:6/당귀:6/세신:4/계지:4/인삼:4/황련:4/황백:3/촉초:2/부자:2"),
        ("오수유탕", "", "당귀제", "상한금궤", "오수유:5/인삼:6/대추:6/생강:12"),
        ("오자탕", "", "", "후세방", "사상자:5/육종용:5/복분자:5/구기자:5/토사자:5"),
        ("온경탕", "", "당귀제", "상한금궤", "당귀:4/작약:4/천궁:4/아교주:4/자감초:4/인삼:4/계지:4/생강:4/목단피:4/반하:16/맥문동:5/오수유:6"),
        ("온담탕", "", "", "후세방", "반하:10/귤피:10/복령:10/지실:10/죽여:5/자감초:2.5/생강:3/대추:3"),
        ("원방쌍화탕", "", "", "후세방", "숙지황:5/황기:5/당귀:5/천궁:5/육계:3.5/자감초:3.5/작약:12.5/생강:3/대추:3"),
        ("월비가반하탕", "", "마황제", "상한금궤", "마황:12/석고:16/생강:6/대추:8/자감초:4/반하:16"),
        ("월비가출탕", "", "마황제", "상한금궤", "마황:12/자감초:4/석고:16/대추:8/생강:6/백출:8"),
        ("월비탕", "", "마황제", "상한금궤", "마황:12/자감초:4/석고:16/대추:8/생강:6"),
        ("육군자탕", "", "", "후세방", "반하:7.5/백출:7.5/귤피:5/복령:5/인삼:5/자감초:2.5"),
        ("육미지황탕", "육미", "복령제", "상한금궤", "건지황:16/산약:8/산수유:8/복령:6/택사:6/목단피:6"),
        ("육미지황탕2", "육미2", "복령제", "상한금궤", "숙지황:16/산약:8/산수유:8/복령:6/택사:6/목단피:6"),
        ("의이부자패장산", "", "부자제", "상한금궤", "부자:2/의이인:16/패장:8"),
        ("이진탕", "", "", "후세방", "반하:10/귤피:5/복령:5/자감초:2.5"),
        ("인삼탕", "이중탕", "건강제", "상한금궤", "인삼:6/백출:6/자감초:6/건강:6"),
        ("인삼패독산", "", "", "후세방", "인삼:5/시호:5/전호:5/독활:5/강활:5/지각:5/길경:5/천궁:5/복령:5/자감초:5/생강:3/박하:3"),
        ("인숙산", "", "", "후세방", "백자인:8/숙지황:8/인삼:6/지각:6/오미자:6/계지:6/산수유:6/감국:6/복령:6/구기자:6"),
        ("인진오령산", "", "복령제", "상한금궤", "인진호:12/택사:8/복령:8/백출:6/계지:6/저령:6"),
        ("인진호탕", "", "치자제", "상한금궤", "치자:14/대황:4/인진호:12"),
        ("일반쌍화탕", "", "", "후세방", "숙지황:5/황기:5/당귀:5/천궁:5/계지:3.5/자감초:3.5/작약:12.5/생강:3/대추:3"),
        ("자감초탕", "자감", "계지제", "상한금궤", "계지:6/자감초:8/대추:10/생강:6/인삼:4/맥문동:10/건지황:8/마자인:8/아교주:4"),
        ("자음강화탕", "", "", "후세방", "작약:6.5/당귀:6/숙지황:5/천문동:5/맥문동:5/백출:5/건지황:4/귤피:3.5/지모:2.5/황백:2.5/자감초:2.5/생강:3/대추:3"),
        ("작약감초부자탕", "", "계지제", "상한금궤", "작약:6/자감초:6/부자:1"),
        ("작약감초탕", "작감탕", "계지제", "상한금궤", "작약:8/자감초:8"),
        ("저령차전자탕", "", "", "사상방", "택사:10/복령:10/저령:7.5/차전자:7.5/지모:5/석고:5/강활:5/독활:5/형개:5/방풍:5"),
        ("저령탕", "", "복령제", "상한금궤", "복령:6/택사:6/저령:6/아교주:6"),
        ("적소두당귀산", "", "당귀제", "상한금궤", "적소두:42/당귀:3"),
        ("조경종옥탕", "", "", "후세방", "숙지황:7.5/향부자:7.5/당귀:5/오수유:5/천궁:5/작약:4/복령:4/귤피:4/현호색:4/목단피:4/건강:4/육계:2.5/애엽:2.5/생강:3"),
        ("조위승기탕", "", "대황제", "상한금궤", "대황:8/망초:12/자감초:4"),
        ("죽엽석고탕", "죽석", "석고제", "상한금궤", "석고:32/갱미:15/자감초:4/죽엽:4/인삼:4/맥문동:20/반하:16"),
        ("중시호가망초탕", "", "", "시호제", "소시호가망초탕+대시호가망초탕"),
        ("중시호탕", "", "시호제", "상한금궤", "시호:16/반하:16/황금:6/인삼:6/자감초:6/지실:8/작약:6/대황:4/생강:10/대추:6"),
        ("지백지황환", "", "", "후세방", "건지황:16/산약:8/산수유:8/복령:6/택사:6/목단피:6/지모:4/황백:4"),
        ("지실치자탕", "", "치자제", "상한금궤", "지실:6/치자:14/두시:3"),
        ("지실해백계지탕", "", "해백제", "상한금궤", "해백:16/과루인:16/계지:2/후박:8/지실:8"),
        ("지출탕", "", "기타고방", "상한금궤", "지실:10/백출:8"),
        ("진무탕", "", "부자제", "상한금궤", "부자:1/백출:4/복령:6/작약:6/생강:6"),
        ("천마구등음", "", "", "후세방", "조구등:12/천마:9/황금:9/복령:9/익모초:9/야교등:9/석결명:18/상기생:9/치자:9/두충:9/우슬:12"),
        ("천왕보심단", "", "", "후세방", "길경:2.5/단삼:2.5/당귀:5/맥문동:5/백자인:5/복령:2.5/산조인:5/건지황:5/오미자:5/원지:2.5/인삼:2.5/천문동:5/현삼:2.5"),
        ("체감탕", "체감탕", "다이어트", "", "의이인:300/숙지황:160/용안육:120/당귀:120/황기:120/괄루근:80/산약:80/상백피:80/귤피:80/천궁:60"),
        ("총명탕", "", "", "후세방", "원지:10/석창포:10/복령:10"),
        ("축천환", "", "", "후세방", "오약:5/익지인:5"),
        ("치자감초시탕", "", "치자제", "상한금궤", "치자:14/자감초:4/두시:20"),
        ("치자건강탕", "", "치자제", "상한금궤", "치자:14/건강:2"),
        ("치자대황탕", "", "치자제", "상한금궤", "치자:14/대황:2/지실:10/두시:20"),
        ("치자벽피탕", "", "치자제", "상한금궤", "치자:14/황백:4/자감초:2"),
        ("치자생강시탕", "", "치자제", "상한금궤", "치자:14/생강:10/두시:20"),
        ("치자시탕", "치시", "치자제", "상한금궤", "치자:14/두시:20"),
        ("치자시탕2", "치자시2", "치자제", "상한금궤", "치자:6/두시:20"),
        ("치자후박탕", "", "치자제", "상한금궤", "치자:14/후박:8/지실:8"),
        ("택사탕", "", "복령제", "상한금궤", "백출:4/택사:10"),
        ("통맥사역탕", "", "부자제", "상한금궤", "부자:3/자감초:4/건강:6"),
        ("팔미환", "팔미", "복령제", "상한금궤", "건지황:16/산약:8/산수유:8/복령:6/택사:6/목단피:6/계지:2/부자:2"),
        ("팔미환2", "팔미2", "복령제", "상한금궤", "숙지황:16/산약:8/산수유:8/복령:6/택사:6/목단피:6/육계:2/부자:2"),
        ("평위산", "", "", "후세방", "백출:10/귤피:7/후박:5/자감초:3/생강:3/대추:3"),
        ("포방기탕", "", "", "고시방", "목방기탕+방기황기탕+방기복령탕+방기지황탕"),
        ("향사갈금련", "", "", "고시방", "향사평위산+갈금련"),
        ("향사육군자탕", "", "", "후세방", "향부자:5/백출:5/복령:5/반하:5/귤피:5/백두구:5/후박:5/사인:2.5/인삼:2.5/목향:2.5/익지인:2.5/자감초:2.5/생강:3/대추:3"),
        ("향사평위산", "", "", "후세방", "백출:10/귤피:5/향부자:5/지실:4/곽향:4/후박:3.5/사인:3.5/목향:2.5/자감초:2.5/생강:3"),
        ("현부이경탕", "", "", "후세방", "육계:3.5/귤피:5/당귀:5/도인:5/목향:3.5/작약:5/봉출:5/생강:6/오약:7.5/지각:5/백출:7.5/천궁:5/향부자:15/현호색:5/홍화:3.5"),
        ("형방사백산", "", "", "사상방", "건지황:10/복령:10/택사:10/석고:5/지모:5/강활:5/독활:5/형개:5/방풍:5"),
        ("형방지황탕", "", "", "사상방", "숙지황:10/산수유:10/복령:10/택사:10/차전자:5/강활:5/독활:5/형개:5/방풍:5"),
        ("형방패독산", "", "", "후세방", "인삼:5/시호:5/전호:5/독활:5/강활:5/지각:5/길경:5/천궁:5/복령:5/자감초:5/형개:5/방풍:5"),
        ("환탕포방기", "환포", "", "고시방", "대함흉탕+대함흉환+목방기탕+방기황기탕+방기복령탕+방기지황탕"),
        ("황금탕", "", "금련제", "상한금궤", "황금:6/작약:4/자감초:4/대추:6"),
        ("황기건중탕", "", "계지제", "상한금궤", "계지:6/작약:12/자감초:6/대추:6/생강:6/교이:40/황기:3"),
        ("황기건중탕2", "황기건중2", "계지제", "상한금궤", "계지:6/작약:12/자감초:6/대추:6/생강:6/교이:20/황기:6"),
        ("황기계지오물탕", "황계오물탕/황계오물", "계지제", "상한금궤", "황기:6/계지:6/작약:6/생강:12/대추:6"),
        ("황기작약계지고주탕", "기작계주", "계지제", "상한금궤", "황기:10/작약:6/계지:6"),
        ("황련아교탕", "황아", "금련제", "상한금궤", "황련:8/황금:4/작약:4/아교주:3"),
        ("황련탕", "", "금련제", "상한금궤", "황련:6/건강:6/인삼:4/자감초:6/대추:6/반하:16/계지:6"),
        ("황련해독탕", "", "", "후세방", "황련:6/황금:6/황백:6/치자:6"),
        ("후박마황탕", "", "마황제", "상한금궤", "후박:10/마황:8/석고:20/행인:8/반하:16/건강:4/세신:4/부소맥:28/오미자:6"),
        ("후박삼물탕", "", "대황제", "상한금궤", "후박:16/대황:8/지실:10"),
        ("후박칠물탕", "", "대황제", "상한금궤", "대황:6/후박:16/지실:10/자감초:6/대추:5/계지:4/생강:10"),
        ("후생반감인탕", "", "반하제", "상한금궤", "후박:16/생강:16/반하:16/자감초:4/인삼:2"),
    ];

    let now = Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "INSERT INTO prescription_definitions (name, alias, category, source, composition, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    )?;

    for (name, alias, category, source, composition) in &definitions {
        let alias_val = if alias.is_empty() { None } else { Some(*alias) };
        let category_val = if category.is_empty() { None } else { Some(*category) };
        stmt.execute(params![name, alias_val, category_val, source, composition, now, now])?;
    }

    Ok(())
}
