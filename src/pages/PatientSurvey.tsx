import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { initLocalDb } from '../lib/localDb';
import { useSurveyStore } from '../store/surveyStore';
import { QuestionRenderer } from '../components/survey/QuestionRenderer';
import type { SurveyTemplate, SurveySession, SurveyAnswer } from '../types';

type PageStatus = 'loading' | 'valid' | 'expired' | 'completed' | 'not_found' | 'error';

export function PatientSurvey() {
  const { token } = useParams<{ token: string }>();
  const { getSessionByToken, submitResponse } = useSurveyStore();

  const [status, setStatus] = useState<PageStatus>('loading');
  const [session, setSession] = useState<SurveySession | null>(null);
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSurvey = async () => {
      if (!token) {
        setStatus('not_found');
        return;
      }

      try {
        // DB 초기화 (공개 페이지이므로 직접 초기화)
        await initLocalDb();

        const result = await getSessionByToken(token);

        if (!result) {
          // 세션이 없거나 만료/완료됨
          setStatus('not_found');
          return;
        }

        setSession(result.session);
        setTemplate(result.template);
        setStatus('valid');
      } catch (err) {
        console.error('Survey load error:', err);
        setError(String(err));
        setStatus('error');
      }
    };

    loadSurvey();
  }, [token, getSessionByToken]);

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

  const getCurrentAnswer = () => {
    if (!template) return undefined;
    const question = template.questions[currentIndex];
    return getAnswerFor(question.id);
  };

  const canProceed = () => {
    if (!template) return false;
    const question = template.questions[currentIndex];
    const answer = getCurrentAnswer();

    if (!question.required) return true;
    if (!answer) return false;

    if (Array.isArray(answer.answer)) {
      return answer.answer.length > 0;
    }
    return answer.answer !== '' && answer.answer !== undefined;
  };

  // single_page 모드에서 모든 필수 질문이 답변되었는지 확인
  const canSubmitSinglePage = () => {
    if (!template) return false;
    return template.questions.every((q) => {
      if (!q.required) return true;
      const answer = getAnswerFor(q.id);
      if (!answer) return false;
      if (Array.isArray(answer.answer)) return answer.answer.length > 0;
      return answer.answer !== '' && answer.answer !== undefined;
    });
  };

  // 답변된 질문 수 계산
  const getAnsweredCount = () => {
    if (!template) return 0;
    return template.questions.filter((q) => {
      const answer = getAnswerFor(q.id);
      if (!answer) return false;
      if (Array.isArray(answer.answer)) return answer.answer.length > 0;
      return answer.answer !== '' && answer.answer !== undefined;
    }).length;
  };

  const handleNext = () => {
    if (!template) return;
    if (currentIndex < template.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (!session || !template) return;

    // 필수 질문 체크
    const missingRequired = template.questions.filter((q) => {
      if (!q.required) return false;
      const answer = answers.find((a) => a.question_id === q.id);
      if (!answer) return true;
      if (Array.isArray(answer.answer)) return answer.answer.length === 0;
      return answer.answer === '' || answer.answer === undefined;
    });

    if (missingRequired.length > 0) {
      alert(`필수 질문에 답변해주세요: ${missingRequired[0].question_text}`);
      const idx = template.questions.findIndex((q) => q.id === missingRequired[0].id);
      setCurrentIndex(idx);
      return;
    }

    setSubmitting(true);
    try {
      await submitResponse(session.id, answers);
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
      alert('설문 제출에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // 로딩 화면
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">설문을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">오류가 발생했습니다</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // 찾을 수 없음 / 만료 / 완료됨
  if (status === 'not_found' || status === 'expired' || status === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {status === 'expired' ? '설문이 만료되었습니다' :
             status === 'completed' ? '이미 제출된 설문입니다' :
             '설문을 찾을 수 없습니다'}
          </h1>
          <p className="text-gray-600">
            {status === 'expired'
              ? '이 설문 링크는 더 이상 유효하지 않습니다.'
              : status === 'completed'
              ? '이 설문은 이미 제출되었습니다.'
              : '올바른 링크인지 확인해주세요.'}
          </p>
        </div>
      </div>
    );
  }

  // 제출 완료 화면
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            설문이 제출되었습니다
          </h1>
          <p className="text-xl text-gray-600">
            참여해 주셔서 감사합니다.
          </p>
          <p className="text-gray-500 mt-4">
            이 창을 닫으셔도 됩니다.
          </p>
        </div>
      </div>
    );
  }

  // 설문 작성 화면
  if (!template || !session) return null;

  const isSinglePage = template.display_mode === 'single_page';
  const currentQuestion = template.questions[currentIndex];
  const progress = isSinglePage
    ? (getAnsweredCount() / template.questions.length) * 100
    : ((currentIndex + 1) / template.questions.length) * 100;
  const isLastQuestion = currentIndex === template.questions.length - 1;

  // Single Page 모드
  if (isSinglePage) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* 헤더 */}
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">{template.name}</h1>
            <div className="flex items-center justify-between">
              {session.patient_name && (
                <p className="text-sm text-gray-500">{session.patient_name}님</p>
              )}
              <p className="text-sm text-gray-500">
                {getAnsweredCount()} / {template.questions.length} 완료
              </p>
            </div>
          </div>
          {/* 진행률 바 */}
          <div className="h-1 bg-gray-200">
            <div
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </header>

        {/* 본문 - 모든 질문 표시 */}
        <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
          {template.description && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
              <p className="text-primary-800 text-sm">{template.description}</p>
            </div>
          )}

          <div className="space-y-6">
            {template.questions.map((question, index) => (
              <div
                key={question.id}
                className="bg-white rounded-xl shadow-sm p-5 md:p-6"
              >
                {/* 질문 번호 */}
                <p className="text-xs text-gray-400 mb-2">
                  {index + 1}. {question.required && <span className="text-red-500">*</span>}
                </p>

                {/* 질문 렌더링 */}
                <QuestionRenderer
                  question={question}
                  answer={getAnswerFor(question.id)}
                  onChange={handleAnswerChange}
                />
              </div>
            ))}
          </div>
        </main>

        {/* 하단 제출 버튼 */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSubmit}
              disabled={!canSubmitSinglePage() || submitting}
              className="w-full py-4 text-lg font-medium rounded-lg bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '제출 중...' : '설문 제출하기'}
            </button>
            {!canSubmitSinglePage() && (
              <p className="text-center text-sm text-gray-500 mt-2">
                필수 질문(*)에 모두 답변해주세요
              </p>
            )}
          </div>
        </footer>
      </div>
    );
  }

  // One by One 모드 (기존 방식)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">{template.name}</h1>
          {session.patient_name && (
            <p className="text-sm text-gray-500">{session.patient_name}님</p>
          )}
        </div>
        {/* 진행률 바 */}
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-primary-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* 본문 */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
          {/* 질문 번호 */}
          <p className="text-sm text-gray-500 mb-4">
            질문 {currentIndex + 1} / {template.questions.length}
          </p>

          {/* 질문 렌더링 */}
          <QuestionRenderer
            question={currentQuestion}
            answer={getCurrentAnswer()}
            onChange={handleAnswerChange}
          />
        </div>
      </main>

      {/* 하단 버튼 */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-2xl mx-auto flex gap-4">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="flex-1 py-4 text-lg font-medium rounded-lg border-2 border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            이전
          </button>

          {isLastQuestion ? (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="flex-1 py-4 text-lg font-medium rounded-lg bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '제출 중...' : '제출하기'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 py-4 text-lg font-medium rounded-lg bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          )}
        </div>
      </footer>

      {/* 하단 여백 */}
      <div className="h-24" />
    </div>
  );
}

export default PatientSurvey;
