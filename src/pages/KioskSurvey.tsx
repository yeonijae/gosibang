import { useEffect, useState } from 'react';
import { Search, User, UserPlus, ChevronRight, Loader2, CheckCircle, FileText } from 'lucide-react';
import { initLocalDb, getDb, queryToObjects } from '../lib/localDb';
import { useSurveyStore } from '../store/surveyStore';
import { QuestionRenderer } from '../components/survey/QuestionRenderer';
import type { Patient, SurveyTemplate, SurveySession, SurveyAnswer } from '../types';

type PageState = 'loading' | 'patient_select' | 'template_select' | 'survey' | 'submitted';

export function KioskSurvey() {
  const { templates, loadTemplates, createKioskSession, submitResponse } = useSurveyStore();

  // 페이지 상태
  const [pageState, setPageState] = useState<PageState>('loading');
  const [error, setError] = useState<string | null>(null);

  // 환자 검색
  const [searchName, setSearchName] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  // 선택된 환자 또는 입력된 이름
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [guestName, setGuestName] = useState('');
  const [useGuestMode, setUseGuestMode] = useState(false);

  // 템플릿 선택
  const [selectedTemplate, setSelectedTemplate] = useState<SurveyTemplate | null>(null);

  // 설문 진행
  const [session, setSession] = useState<SurveySession | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 초기화
  useEffect(() => {
    const init = async () => {
      try {
        await initLocalDb();
        await loadTemplates();
        setPageState('patient_select');
      } catch (err) {
        console.error('초기화 실패:', err);
        setError('시스템 초기화에 실패했습니다.');
      }
    };
    init();
  }, [loadTemplates]);

  // 환자 검색
  const handleSearch = async () => {
    if (!searchName.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const db = getDb();
      if (!db) return;

      const results = queryToObjects<Patient>(
        db,
        `SELECT * FROM patients
         WHERE name LIKE ?
         ORDER BY name
         LIMIT 10`,
        [`%${searchName.trim()}%`]
      );
      setSearchResults(results);
    } catch (err) {
      console.error('검색 실패:', err);
    } finally {
      setSearching(false);
    }
  };

  // 검색어 변경 시 자동 검색
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchName.trim().length >= 1) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchName]);

  // 환자 선택
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setUseGuestMode(false);
    setGuestName('');
  };

  // 신규 환자 모드
  const handleGuestMode = () => {
    setSelectedPatient(null);
    setUseGuestMode(true);
  };

  // 다음 단계 (템플릿 선택)
  const handleProceedToTemplate = () => {
    if (!selectedPatient && !guestName.trim()) {
      alert('환자를 선택하거나 이름을 입력해주세요.');
      return;
    }
    setPageState('template_select');
  };

  // 설문 시작
  const handleStartSurvey = async () => {
    if (!selectedTemplate) {
      alert('설문을 선택해주세요.');
      return;
    }

    try {
      const newSession = await createKioskSession(
        selectedTemplate.id,
        selectedPatient?.id || null,
        selectedPatient?.name || guestName.trim()
      );
      setSession(newSession);
      setPageState('survey');
    } catch (err) {
      console.error('세션 생성 실패:', err);
      alert('설문 시작에 실패했습니다.');
    }
  };

  // 답변 변경
  const handleAnswerChange = (answer: SurveyAnswer) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.question_id === answer.question_id);
      if (existing >= 0) {
        const newAnswers = [...prev];
        newAnswers[existing] = answer;
        return newAnswers;
      }
      return [...prev, answer];
    });
  };

  const getAnswerFor = (questionId: string) => {
    return answers.find((a) => a.question_id === questionId);
  };

  // 답변 완료 여부
  const getAnsweredCount = () => {
    if (!selectedTemplate) return 0;
    return selectedTemplate.questions.filter((q) => {
      const answer = getAnswerFor(q.id);
      if (!answer) return false;
      if (Array.isArray(answer.answer)) return answer.answer.length > 0;
      return answer.answer !== '' && answer.answer !== undefined;
    }).length;
  };

  const canSubmit = () => {
    if (!selectedTemplate) return false;
    return selectedTemplate.questions.every((q) => {
      if (!q.required) return true;
      const answer = getAnswerFor(q.id);
      if (!answer) return false;
      if (Array.isArray(answer.answer)) return answer.answer.length > 0;
      return answer.answer !== '' && answer.answer !== undefined;
    });
  };

  // 제출
  const handleSubmit = async () => {
    if (!session || !selectedTemplate) return;

    const missingRequired = selectedTemplate.questions.filter((q) => {
      if (!q.required) return false;
      const answer = answers.find((a) => a.question_id === q.id);
      if (!answer) return true;
      if (Array.isArray(answer.answer)) return answer.answer.length === 0;
      return answer.answer === '' || answer.answer === undefined;
    });

    if (missingRequired.length > 0) {
      alert(`필수 질문에 답변해주세요: ${missingRequired[0].question_text}`);
      return;
    }

    setSubmitting(true);
    try {
      await submitResponse(session.id, answers);
      setPageState('submitted');
    } catch (err) {
      console.error('제출 실패:', err);
      alert('설문 제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // 처음으로
  const handleReset = () => {
    setSearchName('');
    setSearchResults([]);
    setSelectedPatient(null);
    setGuestName('');
    setUseGuestMode(false);
    setSelectedTemplate(null);
    setSession(null);
    setAnswers([]);
    setPageState('patient_select');
  };

  // 로딩 화면
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">설문 시스템을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <p className="text-red-600 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  // 제출 완료 화면
  if (pageState === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            설문이 제출되었습니다
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            참여해 주셔서 감사합니다.
          </p>
          <button
            onClick={handleReset}
            className="px-8 py-4 bg-primary-600 text-white text-lg font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            처음으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 환자 선택 화면
  if (pageState === 'patient_select') {
    const activeTemplates = templates.filter((t) => t.is_active);

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900 text-center">원내 설문</h1>
            <p className="text-gray-500 text-center mt-1">환자 정보를 확인해주세요</p>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          {/* 검색 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              환자 이름 검색
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20 outline-none"
                autoFocus
              />
              {searching && (
                <Loader2 className="w-5 h-5 animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
              )}
            </div>

            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <div className="mt-4 border rounded-lg divide-y max-h-60 overflow-y-auto">
                {searchResults.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => handleSelectPatient(patient)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between transition-colors ${
                      selectedPatient?.id === patient.id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{patient.name}</p>
                        <p className="text-sm text-gray-500">
                          {patient.birth_date && `${patient.birth_date.replace(/-/g, '/')} `}
                          {patient.gender === 'M' ? '남' : patient.gender === 'F' ? '여' : ''}
                          {patient.chart_number && ` (${patient.chart_number})`}
                        </p>
                      </div>
                    </div>
                    {selectedPatient?.id === patient.id && (
                      <CheckCircle className="w-5 h-5 text-primary-600" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* 검색 결과 없음 */}
            {searchName.trim() && !searching && searchResults.length === 0 && (
              <p className="mt-4 text-center text-gray-500 py-4">
                검색 결과가 없습니다
              </p>
            )}
          </div>

          {/* 선택된 환자 표시 */}
          {selectedPatient && !useGuestMode && (
            <div className="bg-primary-50 border-2 border-primary-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <p className="font-bold text-lg text-gray-900">{selectedPatient.name}</p>
                  <p className="text-sm text-gray-600">
                    {selectedPatient.birth_date?.replace(/-/g, '/')}
                    {selectedPatient.phone && ` | ${selectedPatient.phone}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 신규 환자 모드 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <button
              onClick={handleGuestMode}
              className={`w-full flex items-center gap-3 p-4 border-2 rounded-lg transition-colors ${
                useGuestMode
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <UserPlus className="w-6 h-6 text-gray-500" />
              <div className="text-left">
                <p className="font-medium text-gray-900">처음 방문이신가요?</p>
                <p className="text-sm text-gray-500">등록되지 않은 경우 이름만 입력하세요</p>
              </div>
            </button>

            {useGuestMode && (
              <div className="mt-4">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20 outline-none"
                />
              </div>
            )}
          </div>

          {/* 다음 버튼 */}
          <button
            onClick={handleProceedToTemplate}
            disabled={!selectedPatient && !guestName.trim()}
            className="w-full py-4 text-lg font-medium rounded-lg bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            다음
            <ChevronRight className="w-5 h-5" />
          </button>

          {activeTemplates.length === 0 && (
            <p className="text-center text-red-500 mt-4">
              활성화된 설문 템플릿이 없습니다. 관리자에게 문의하세요.
            </p>
          )}
        </main>
      </div>
    );
  }

  // 템플릿 선택 화면
  if (pageState === 'template_select') {
    const activeTemplates = templates.filter((t) => t.is_active);
    const displayName = selectedPatient?.name || guestName;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900 text-center">설문 선택</h1>
            <p className="text-gray-500 text-center mt-1">
              <span className="font-medium text-primary-600">{displayName}</span>님, 설문을 선택해주세요
            </p>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="space-y-4 mb-8">
            {activeTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={`w-full p-5 border-2 rounded-xl text-left transition-all ${
                  selectedTemplate?.id === template.id
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    selectedTemplate?.id === template.id
                      ? 'bg-primary-100'
                      : 'bg-gray-100'
                  }`}>
                    <FileText className={`w-6 h-6 ${
                      selectedTemplate?.id === template.id
                        ? 'text-primary-600'
                        : 'text-gray-500'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-gray-900">{template.name}</p>
                    <p className="text-sm text-gray-500">
                      {template.questions.length}개 질문
                      {template.description && ` • ${template.description}`}
                    </p>
                  </div>
                  {selectedTemplate?.id === template.id && (
                    <CheckCircle className="w-6 h-6 text-primary-600" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setPageState('patient_select')}
              className="flex-1 py-4 text-lg font-medium rounded-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              이전
            </button>
            <button
              onClick={handleStartSurvey}
              disabled={!selectedTemplate}
              className="flex-1 py-4 text-lg font-medium rounded-lg bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              설문 시작
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 설문 진행 화면
  if (pageState === 'survey' && selectedTemplate && session) {
    const progress = (getAnsweredCount() / selectedTemplate.questions.length) * 100;
    const displayName = selectedPatient?.name || guestName;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">{selectedTemplate.name}</h1>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{displayName}님</p>
              <p className="text-sm text-gray-500">
                {getAnsweredCount()} / {selectedTemplate.questions.length} 완료
              </p>
            </div>
          </div>
          <div className="h-1 bg-gray-200">
            <div
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
          {selectedTemplate.description && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
              <p className="text-primary-800 text-sm">{selectedTemplate.description}</p>
            </div>
          )}

          <div className="space-y-6">
            {selectedTemplate.questions.map((question, index) => (
              <div
                key={question.id}
                className="bg-white rounded-xl shadow-sm p-5 md:p-6"
              >
                <p className="text-xs text-gray-400 mb-2">
                  {index + 1}. {question.required && <span className="text-red-500">*</span>}
                </p>
                <QuestionRenderer
                  question={question}
                  answer={getAnswerFor(question.id)}
                  onChange={handleAnswerChange}
                />
              </div>
            ))}
          </div>
        </main>

        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit() || submitting}
              className="w-full py-4 text-lg font-medium rounded-lg bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '제출 중...' : '설문 제출하기'}
            </button>
            {!canSubmit() && (
              <p className="text-center text-sm text-gray-500 mt-2">
                필수 질문(*)에 모두 답변해주세요
              </p>
            )}
          </div>
        </footer>
      </div>
    );
  }

  return null;
}

export default KioskSurvey;
