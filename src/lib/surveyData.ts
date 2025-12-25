import type { SurveyQuestion, SurveyTemplate } from '../types';

// 여성 건강 설문지 - form1.html 기반
export const FEMALE_HEALTH_SURVEY: Omit<SurveyTemplate, 'id' | 'created_at' | 'updated_at'> = {
  name: '여성 종합 건강 설문지',
  description: '여성 환자용 종합 건강 상태 설문지입니다. 식사, 소화, 수면, 월경 등 전반적인 건강 상태를 파악합니다.',
  display_mode: 'single_page',  // 원페이지 스크롤 방식
  is_active: true,
  questions: [
    // === 기본 정보 ===
    {
      id: 'basic_gender_age',
      question_text: '성별/나이를 입력해주세요 (예: 여/30)',
      question_type: 'text',
      required: true,
      order: 1
    },
    {
      id: 'basic_height_weight',
      question_text: '키/몸무게를 입력해주세요 (예: 165/55)',
      question_type: 'text',
      required: true,
      order: 2
    },

    // === 식사패턴 ===
    {
      id: 'meal_pattern',
      question_text: '식사패턴은 어떠신가요?',
      question_type: 'single_choice',
      options: ['규칙적', '불규칙', '정해다름'],
      required: true,
      order: 3
    },
    {
      id: 'meal_breakfast',
      question_text: '아침식사는 언제 하시나요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['6시', '7시', '8시', '9시', '10시', '불규칙한 시간', '안먹는다', '간단하게', '밥1/2공기', '밥1공기'],
      required: false,
      order: 4
    },
    {
      id: 'meal_lunch',
      question_text: '점심식사는 언제 하시나요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['11시', '12시', '1시', '2시', '3시', '불규칙한 시간', '안먹는다', '간단하게', '밥1/2공기', '밥1공기', '밥2공기'],
      required: false,
      order: 5
    },
    {
      id: 'meal_dinner',
      question_text: '저녁식사는 언제 하시나요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['5시', '6시', '7시', '8시', '9시', '불규칙한 시간', '안먹는다', '간단하게', '밥1/2공기', '밥1공기', '밥2공기'],
      required: false,
      order: 6
    },
    {
      id: 'meal_late_night',
      question_text: '야식은 얼마나 자주 드시나요?',
      question_type: 'single_choice',
      options: ['안먹는다', '가끔 먹는다', '주1~2회', '주3~4회', '주5~6회', '매일 먹는다'],
      required: true,
      order: 7
    },
    {
      id: 'eating_habit',
      question_text: '식습관은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['빨리 먹음', '천천히 먹음', '잘 씹어먹음', '눈으로 먹음(골고루)'],
      required: false,
      order: 8
    },

    // === 식욕/소화 ===
    {
      id: 'hunger',
      question_text: '배고픔은 어떠신가요?',
      question_type: 'single_choice',
      options: ['잘 안고프다', '가끔 고프다', '밥때 되면 고프다', '항상 배가 고프다'],
      required: true,
      order: 9
    },
    {
      id: 'appetite',
      question_text: '입맛은 어떠신가요?',
      question_type: 'single_choice',
      options: ['항상 입맛이 좋다', '아침에만 입맛이 없다', '스트레스 받으면 입맛이 없다', '입맛 없다', '입맛이 매우 없다'],
      required: true,
      order: 10
    },
    {
      id: 'digestion_state',
      question_text: '소화상태는 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['잘 체함', '속이 더부룩', '메스꺼움', '트림 자주', '신물 올라옴', '소화가 잘됨'],
      required: false,
      order: 11
    },

    // === 음식/기호 ===
    {
      id: 'food_meat',
      question_text: '고기를 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['자주 먹는다', '보통정도로 먹는다', '잘 안먹는다', '일부러 먹는다'],
      required: true,
      order: 12
    },
    {
      id: 'food_seafood',
      question_text: '해산물을 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['자주 먹는다', '보통정도로 먹는다', '잘 안먹는다', '일부러 먹는다'],
      required: true,
      order: 13
    },
    {
      id: 'food_vegetable',
      question_text: '녹황채소를 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['자주 먹는다', '보통정도로 먹는다', '잘 안먹는다', '일부러 먹는다'],
      required: true,
      order: 14
    },
    {
      id: 'food_flour',
      question_text: '밀가루류를 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['자주 먹는다', '보통정도로 먹는다', '잘 안먹는다', '일부러 먹는다'],
      required: true,
      order: 15
    },
    {
      id: 'food_spicy',
      question_text: '매운맛은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['잘 먹는다', '좋아한다', '싫어 먹는다', '매우 싫어 싫는다', '소화가 안된다', '소화가 잘된다'],
      required: false,
      order: 16
    },
    {
      id: 'food_dairy',
      question_text: '유제품은 어떻게 드시나요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['우유', '치즈', '버터', '소화가 안된다', '소화가 잘된다', '요거트', '아이스크림', '잘 안먹음'],
      required: false,
      order: 17
    },
    {
      id: 'food_beverage',
      question_text: '음료는 주로 어떤 것을 드시나요?',
      question_type: 'single_choice',
      options: ['물만', '음료만', '물+음료', '잘안마신다'],
      required: true,
      order: 18
    },
    {
      id: 'food_beverage_type',
      question_text: '선호하는 음료 종류는? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['코카콜라', '사이다', '일반 탄산음료', '이온음료', '에너지 드링크', '기타'],
      required: false,
      order: 19
    },
    {
      id: 'food_fruit',
      question_text: '과일을 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['자주', '보통', '가끔', '잘안먹는다'],
      required: true,
      order: 20
    },
    {
      id: 'food_fruit_prefer',
      question_text: '선호하는 과일은? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['바나나', '귤,오렌지', '사과', '배,감', '딸기,복숭아,체리', '포도,자두', '기타'],
      required: false,
      order: 21
    },

    // === 물 ===
    {
      id: 'water_habit',
      question_text: '물은 어떻게 드시나요?',
      question_type: 'single_choice',
      options: ['일부러 갈증없어도 마신다', '목이 마를 때 마신다', '거의 안 마신다'],
      required: true,
      order: 22
    },
    {
      id: 'water_amount',
      question_text: '하루에 물을 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['하루1~2컵', '하루3~4컵', '500미만', '800미만', '1리터', '1.5리터', '2리터', '3리터', '거의 안마신다', '기타'],
      required: true,
      order: 23
    },
    {
      id: 'water_temp',
      question_text: '물 온도는 어떤 것을 선호하시나요?',
      question_type: 'single_choice',
      options: ['따뜻한 물만', '따뜻한 물 선호', '따뜻한 상관없이 시원하게 마심', '따뜻한 상관없이 따뜻하게 마심'],
      required: true,
      order: 24
    },

    // === 커피 ===
    {
      id: 'coffee',
      question_text: '커피를 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['안마신다', '가끔 마신다', '하루 약 1잔', '하루1~2잔', '하루2~3잔', '하루3잔 이상'],
      required: true,
      order: 25
    },
    {
      id: 'coffee_type',
      question_text: '주로 드시는 커피 종류는? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['커피믹스', '블랙커피(인스턴트)', '아메리카노', '카푸치노', '바닐라라떼', '모카커피', '캡슐 커피', '기타'],
      required: false,
      order: 26
    },
    {
      id: 'coffee_effect',
      question_text: '커피 마신 후 영향은? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['전혀 안온다', '소변이 자주 나옴', '소화가 안된다', '배가 고프다', '머리가 아프다', '심장이 뜀'],
      required: false,
      order: 27
    },

    // === 술 ===
    {
      id: 'alcohol',
      question_text: '술을 얼마나 드시나요?',
      question_type: 'single_choice',
      options: ['전 안마신다', '한달에 1~2회', '주1~2회', '주3~4회', '주5~6회', '매일'],
      required: true,
      order: 28
    },
    {
      id: 'alcohol_occasion',
      question_text: '주로 언제 술을 드시나요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['비즈니스', '회사회식', '친목모임', '스트레스 풀려고'],
      required: false,
      order: 29
    },
    {
      id: 'alcohol_type',
      question_text: '주로 드시는 술 종류/양은? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['맥주 1~2캔', '맥주 2000cc 이상', '소주 3~4잔', '소주 1~2병', '막걸리', '와인', '40도 이상', '기타'],
      required: false,
      order: 30
    },

    // === 대변 ===
    {
      id: 'stool_frequency',
      question_text: '대변은 얼마나 보시나요?',
      question_type: 'single_choice',
      options: ['매일 한번', '하루 1~2회', '하루 3회 이상', '1~2일에 한번', '2~3일에 한번', '3~4일에 한번', '1주일에 한번', '기타 변비'],
      required: true,
      order: 31
    },
    {
      id: 'stool_form',
      question_text: '대변 형태는 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['보통이다', '무르다', '딱딱함', '약간 무름', '가늘다', '토끼똥', '불규칙하다', '설사'],
      required: false,
      order: 32
    },
    {
      id: 'stool_state',
      question_text: '대변 상태는 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['시원하다', '잘 나옴', '시원하게 나옴', '빈번히 나옴', '변이 길어짐', '잘 안나온다'],
      required: false,
      order: 33
    },
    {
      id: 'stool_bowel',
      question_text: '변비/설사 관련 증상은? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['변비가 전혀 없다', '고기나 유제품 먹으면', '고기가 잘 안나온다', '배가 자주 아프다', '배에서 소리가 자주 난다'],
      required: false,
      order: 34
    },

    // === 소변 ===
    {
      id: 'urine_frequency',
      question_text: '소변은 얼마나 자주 보시나요?',
      question_type: 'single_choice',
      options: ['하루 1~2회', '하루 2~3회', '하루 3~4회', '3~4시간에 한번', '2~3시간에 한번', '1~2시간에 한번', '1시간에 한번', '잘 모름'],
      required: true,
      order: 35
    },
    {
      id: 'urine_night',
      question_text: '야간뇨는 어떠신가요?',
      question_type: 'single_choice',
      options: ['전혀 소변 때문에 안일어남', '밤에 가끔 한번씩 소변 보러', '밤에 1~2회 자다가 소변', '밤에 2시간마다 자주 소변', '밤에 1시간마다 자주 소변'],
      required: true,
      order: 36
    },
    {
      id: 'urine_color',
      question_text: '소변 색깔은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['보통이다', '맑다', '노란색 진함', '거품이 많음', '조금씩 자주 나옴'],
      required: false,
      order: 37
    },
    {
      id: 'urine_state',
      question_text: '소변 상태는 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['시원하다', '잘 시원하다', '끊어져 나온다', '찔끔 다시 나온다', '갑자기 요의 느낌', '참기가 어렵다', '소변 보고 개운함', '소변 본다음에 아직도', '항상 남아있는 듯', '요실금'],
      required: false,
      order: 38
    },

    // === 수면 ===
    {
      id: 'sleep_pattern',
      question_text: '수면은 어떠신가요?',
      question_type: 'single_choice',
      options: ['규칙적', '불규칙', '정해다름'],
      required: true,
      order: 39
    },
    {
      id: 'sleep_bedtime',
      question_text: '취침시간은 언제인가요?',
      question_type: 'single_choice',
      options: ['9~10시', '10~11시', '11~12시', '12~1시', '1~2시', '2~3시', '기타'],
      required: true,
      order: 40
    },
    {
      id: 'sleep_waketime',
      question_text: '일어나는 시간은 언제인가요?',
      question_type: 'single_choice',
      options: ['5~6시', '6~7시', '7~8시', '8~9시', '9~10시', '10~11시', '기타'],
      required: true,
      order: 41
    },
    {
      id: 'sleep_onset',
      question_text: '잠드는데 걸리는 시간은?',
      question_type: 'single_choice',
      options: ['금방 잠듦', '10~20분 걸림', '30~40분 걸림', '1시간 이상 걸림', '1~2시간 걸림', '잠이 안 옴'],
      required: true,
      order: 42
    },
    {
      id: 'sleep_disorder',
      question_text: '수면장애가 있으신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['잠이 잘 안옴', '중간에 자주 깸', '새벽에 일찍 잠이 안옴', '소변 때문에 깸', '잠을 너무 많이 잠', '없음'],
      required: false,
      order: 43
    },
    {
      id: 'sleep_dream',
      question_text: '꿈은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['안꾸다', '꾸는데 기억안남', '자주 꾼다', '이상한 꿈', '무서운거 나옴', '좋은거 꿈', '우울한 꿈', '생생한 꿈 기억남', '깨면 잊어버림'],
      required: false,
      order: 44
    },

    // === 피로감 ===
    {
      id: 'fatigue',
      question_text: '피로감은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['자고 자면 괜찮다', '아침부터 일어나기 힘들다', '아침부터 하루종일 피곤하다', '오후3~4시부터 피곤하다', '저녁/밤에 돌아올 때 피곤하다', '주말까지 피곤해서 쉰다'],
      required: false,
      order: 45
    },

    // === 한열 ===
    {
      id: 'cold_heat',
      question_text: '한열(추위/더위)은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['손발이 많이 차다', '손발이 자주 차다', '손/발만 많이 차다', '바람에 민감한 편', '여름나면 괜찮다', '기타'],
      required: false,
      order: 46
    },
    {
      id: 'cold_area',
      question_text: '시린부위가 있으신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['몸이 찬듯', '몸이 찬듯', '배가 차다', '손이 시리고', '발이 시리고', '등과 어깨 시리고', '아랫배가 시려 통증', '기타'],
      required: false,
      order: 47
    },

    // === 땀 ===
    {
      id: 'sweat',
      question_text: '땀은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['움직이면 땀이 많음', '안해도 땀이 많음', '식은땀이 흘러나옴', '땀을 거의 안냄', '다한증(다른 사람과 비교해서)', '자고 일어나 땀에 젖어있다', '항상 손발이 축축하다', '항상 건조하게 끈적하게 난다'],
      required: false,
      order: 48
    },
    {
      id: 'sweat_area',
      question_text: '땀이 많이 나는 부위는? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['손바닥', '발바닥', '겨드랑이', '등', '머리', '가슴', '배', '얼굴전체', '온몸', '기타'],
      required: false,
      order: 49
    },

    // === 생리 (여성) ===
    {
      id: 'menstrual_cycle',
      question_text: '생리 주기는 어떠신가요?',
      question_type: 'single_choice',
      options: ['불규칙하다', '28~30일', '30~35일', '35~40일', '40~45일', '2~3개월에 한번', '3개월 이상 없음', '폐경후 없음'],
      required: true,
      order: 50
    },
    {
      id: 'menstrual_regular',
      question_text: '주기 정기여부는?',
      question_type: 'single_choice',
      options: ['예전 같음', '예전 달라짐(자세히 적어주세요)'],
      required: true,
      order: 51
    },
    {
      id: 'menstrual_duration',
      question_text: '생리기간은 얼마나 되시나요?',
      question_type: 'single_choice',
      options: ['1~2일', '3~4일', '5~7일', '7~10일', '10일 이상 지속'],
      required: true,
      order: 52
    },
    {
      id: 'menstrual_pain',
      question_text: '생리통은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['거의 없음', '생리전 조금 있다가', '생리전 시작해서 몇일 지속', '생리 시작 후 약먹음', '미리 진통제 먹음', '진통제가 효과 없음'],
      required: false,
      order: 53
    },
    {
      id: 'menstrual_pain_area',
      question_text: '생리통 부위는? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['아랫배', '배꼽 전체', '배꼽 아래', '허리', '꼬리뼈', '다리', '머리', '기타'],
      required: false,
      order: 54
    },
    {
      id: 'menstrual_amount',
      question_text: '생리량은 어떠신가요?',
      question_type: 'single_choice',
      options: ['보통이다(다른 사람과 비슷)', '조금 적은 편이다', '조금 많은 편이다', '점점부터 줄어듦', '점점부터 늘어남'],
      required: true,
      order: 55
    },
    {
      id: 'menstrual_color',
      question_text: '생리색은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['보통이다(진한 붉은색)', '색이 맑게 나온다', '덩어리가 많이 섞인다', '큰 덩어리 나옴', '짙고짙어 검은 나옴'],
      required: false,
      order: 56
    },
    {
      id: 'menstrual_pms',
      question_text: '생리전후증상은 어떠신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['몸이무거움', '피로', '소화불량', '식욕증가', '체중증가', '부종', '짜증남', '기타'],
      required: false,
      order: 57
    },

    // === 건강기능식품/복약 ===
    {
      id: 'supplement',
      question_text: '건강기능식품을 드시나요?',
      question_type: 'single_choice',
      options: ['특별히 먹는게 없다', '가끔 먹는다', '항상 먹는다'],
      required: true,
      order: 58
    },
    {
      id: 'medication',
      question_text: '현재 복용중인 약은? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['고혈압약', '당뇨약', '갑상선약', '위장약', '비염약', '알러지약', '진통제', '수면제', '신경정신과약', '기타'],
      required: false,
      order: 59
    },
    {
      id: 'disease',
      question_text: '기타 질환이 있으신가요? (복수선택 가능)',
      question_type: 'multiple_choice',
      options: ['소화기 질환', '심장 질환', '호흡기 질환(폐)', '피부 질환', '신장(콩팥) 질환', 'B형 간염 보균자', '간장 질환', '기타'],
      required: false,
      order: 60
    },

    // === 기타 ===
    {
      id: 'additional_notes',
      question_text: '추가로 알려주실 내용이 있으시면 적어주세요.',
      question_type: 'text',
      required: false,
      order: 61
    }
  ] as SurveyQuestion[]
};

// 기본 설문지 템플릿 목록
export const SURVEY_TEMPLATES = [FEMALE_HEALTH_SURVEY];
