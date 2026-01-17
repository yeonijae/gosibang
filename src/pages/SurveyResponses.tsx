import { useEffect, useState } from 'react';
import { Search, Eye, X, ChevronDown, ChevronUp, Plus, Link2, Copy, Check, Loader2, UserPlus, User, AlertCircle } from 'lucide-react';
import { useSurveyStore } from '../store/surveyStore';
import { QuestionRenderer } from '../components/survey/QuestionRenderer';
import { useAuthStore } from '../store/authStore';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { supabase } from '../lib/supabase';
import { getDb, saveDb, generateUUID, queryToObjects } from '../lib/localDb';
import { generateExpiresAt } from '../lib/surveyUtils';
import type { SurveyResponse, SurveyTemplate, SurveyAnswer, Patient } from '../types';

// Vercel 설문 앱 URL
const SURVEY_APP_URL = 'https://gosibang-survey.vercel.app';

export function SurveyResponses() {
  const { responses, templates, isLoading, loadResponses, loadTemplates, getTemplate, createDirectResponse, linkResponseToPatient } = useSurveyStore();
  const { authState } = useAuthStore();
  const { canUseFeature } = usePlanLimits();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [viewingResponse, setViewingResponse] = useState<SurveyResponse | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<SurveyTemplate | null>(null);

  // 새 설문 작성 모달 상태
  const [showNewSurveyModal, setShowNewSurveyModal] = useState(false);

  // 온라인 링크 생성 모달 상태
  const [showLinkModal, setShowLinkModal] = useState(false);

  // 미연결 응답만 보기 필터
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);

  // 환자 연결 모달 상태
  const [linkingResponse, setLinkingResponse] = useState<SurveyResponse | null>(null);

  useEffect(() => {
    loadResponses();
    loadTemplates();
  }, [loadResponses, loadTemplates]);

  // 미연결 응답 수
  const unlinkedCount = responses.filter(r => !r.patient_id).length;

  const filteredResponses = responses.filter((response) => {
    const matchesSearch = !searchTerm ||
      response.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.template_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTemplate = !selectedTemplateId || response.template_id === selectedTemplateId;
    const matchesUnlinked = !showUnlinkedOnly || !response.patient_id;
    return matchesSearch && matchesTemplate && matchesUnlinked;
  });

  const handleViewResponse = (response: SurveyResponse) => {
    const template = getTemplate(response.template_id);
    setViewingResponse(response);
    setViewingTemplate(template);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설문 관리</h1>
          <p className="text-sm text-gray-500 mt-1">응답 {filteredResponses.length}건</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 온라인 링크 생성 버튼 - 프리미엄 플랜만 */}
          {canUseFeature('survey_external') && (
            <button
              onClick={() => setShowLinkModal(true)}
              className="btn-secondary flex items-center gap-2"
              disabled={templates.filter(t => t.is_active).length === 0}
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">온라인 링크 생성</span>
              <span className="sm:hidden">링크</span>
            </button>
          )}
          <button
            onClick={() => setShowNewSurveyModal(true)}
            className="btn-primary flex items-center gap-2"
            disabled={templates.filter(t => t.is_active).length === 0}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">새 설문 작성</span>
            <span className="sm:hidden">작성</span>
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 sm:gap-4 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="환자명 또는 설문명 검색..."
            className="input-field !pl-11"
          />
        </div>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          className="input-field w-40 sm:w-48"
        >
          <option value="">전체 설문</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        {/* 미연결 응답 필터 */}
        <button
          onClick={() => setShowUnlinkedOnly(!showUnlinkedOnly)}
          className={`px-3 sm:px-4 py-2 rounded-lg border flex items-center gap-1 sm:gap-2 transition-colors whitespace-nowrap ${
            showUnlinkedOnly
              ? 'bg-orange-100 border-orange-300 text-orange-700'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          <span className="hidden sm:inline">미연결</span> {unlinkedCount > 0 && `(${unlinkedCount})`}
        </button>
      </div>

      {/* 응답 목록 */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">로딩 중...</div>
        ) : filteredResponses.length > 0 ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b text-left">
                  <th className="px-3 sm:px-4 py-3 font-medium text-gray-600">환자명</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-gray-600">설문명</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">제출일시</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-gray-600 hidden md:table-cell">답변 수</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-gray-600 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredResponses.map((response) => (
                  <tr key={response.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate max-w-[120px] sm:max-w-none">
                          {response.patient_name || response.respondent_name || '-'}
                        </span>
                        {!response.patient_id && (
                          <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded flex-shrink-0">
                            미연결
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <span className="truncate block max-w-[100px] sm:max-w-none">
                        {response.template_name || '-'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden sm:table-cell text-sm text-gray-600">
                      {new Date(response.submitted_at).toLocaleString()}
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden md:table-cell">{response.answers.length}개</td>
                    <td className="px-3 sm:px-4 py-3">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => handleViewResponse(response)}
                          className="text-primary-600 hover:text-primary-800 flex items-center gap-1 p-1"
                          title="보기"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">보기</span>
                        </button>
                        {!response.patient_id && (
                          <button
                            onClick={() => setLinkingResponse(response)}
                            className="text-orange-600 hover:text-orange-800 flex items-center gap-1 p-1"
                            title="연결"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">연결</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>제출된 설문 응답이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 응답 상세 모달 */}
      {viewingResponse && viewingTemplate && (
        <ResponseViewerModal
          response={viewingResponse}
          template={viewingTemplate}
          onClose={() => {
            setViewingResponse(null);
            setViewingTemplate(null);
          }}
        />
      )}

      {/* 새 설문 작성 모달 */}
      {showNewSurveyModal && (
        <NewSurveyModal
          templates={templates.filter(t => t.is_active)}
          onSubmit={createDirectResponse}
          onClose={() => setShowNewSurveyModal(false)}
        />
      )}

      {/* 온라인 링크 생성 모달 */}
      {showLinkModal && (
        <LinkGeneratorModal
          templates={templates.filter(t => t.is_active)}
          userId={authState?.user?.id || ''}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {/* 환자 연결 모달 */}
      {linkingResponse && (
        <PatientLinkModal
          response={linkingResponse}
          onLink={async (patientId) => {
            await linkResponseToPatient(linkingResponse.id, patientId);
            setLinkingResponse(null);
          }}
          onClose={() => setLinkingResponse(null)}
        />
      )}
    </div>
  );
}

// ===== 응답 상세 보기 모달 =====

interface ResponseViewerModalProps {
  response: SurveyResponse;
  template: SurveyTemplate;
  onClose: () => void;
}

function ResponseViewerModal({ response, template, onClose }: ResponseViewerModalProps) {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set(template.questions.map((q) => q.id))
  );
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'full' | 'preview'>('full');

  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const getAnswerForQuestion = (questionId: string): SurveyAnswer | undefined => {
    return response.answers.find((a) => a.question_id === questionId);
  };

  const formatAnswer = (answer: SurveyAnswer | undefined): string => {
    if (!answer) return '(답변 없음)';
    if (Array.isArray(answer.answer)) {
      return answer.answer.join(', ') || '(선택 없음)';
    }
    if (typeof answer.answer === 'number') {
      return String(answer.answer);
    }
    return answer.answer || '(답변 없음)';
  };

  // 설문 결과를 컴팩트 텍스트로 변환 (모든 템플릿에서 동작)
  const formatSurveyAsText = (): string => {
    const getAnswer = (qId: string): string => {
      const answer = response.answers.find(a => a.question_id === qId);
      if (!answer) return '';
      if (Array.isArray(answer.answer)) return answer.answer.join(' / ');
      return String(answer.answer || '');
    };

    const hasAnswer = (qId: string): boolean => {
      const answer = response.answers.find(a => a.question_id === qId);
      if (!answer) return false;
      if (Array.isArray(answer.answer)) return answer.answer.length > 0;
      return !!answer.answer;
    };

    const lines: string[] = [];

    // 템플릿의 질문 순서대로 출력
    let currentSection = '';

    for (const question of template.questions) {
      const qId = question.id;
      const qText = question.question_text;

      // 답변이 없으면 건너뛰기
      if (!hasAnswer(qId)) continue;

      const answerText = getAnswer(qId);

      // 섹션 헤더 (>로 시작하는 질문)
      if (qText.startsWith('>')) {
        // 이전 섹션과 구분하기 위해 빈 줄 추가
        if (lines.length > 0 && currentSection !== '') {
          lines.push('');
        }
        currentSection = qText;
        lines.push(`${qText} ${answerText}`);
      }
      // 하위 항목 (-로 시작하는 질문)
      else if (qText.startsWith('-')) {
        lines.push(`${qText} ${answerText}`);
      }
      // 일반 질문 (이름, 차트번호, 성별/나이, 키/몸무게 등)
      else {
        // 기본정보 (이름, 차트번호는 제외하고 성별/나이, 키/몸무게만)
        if (qId === 'name' || qId === 'chart_number' || qId === 'doctor') {
          // 기본정보는 첫 줄에 표시
          continue;
        }
        // 성별/나이, 키/몸무게는 첫 줄에 표시
        if (qId === 'gender_age' || qId === 'height_weight') {
          // 이미 처리됨
          continue;
        }
        // 그 외 일반 질문
        lines.push(`${qText}: ${answerText}`);
      }
    }

    // 기본정보 먼저 추가 (성별/나이, 키/몸무게)
    const basicInfo = [getAnswer('gender_age'), getAnswer('height_weight')].filter(Boolean).join(' / ');

    // 최종 결과 조합
    const result: string[] = [];
    if (basicInfo) {
      result.push(basicInfo);
    }

    // [문진] 헤더와 내용
    if (lines.length > 0) {
      result.push('[문진]');
      result.push(...lines);
    } else if (response.answers.length > 0) {
      // 구조화된 출력이 없지만 답변이 있는 경우 (구 템플릿 등)
      result.push('[문진]');
      for (const answer of response.answers) {
        const question = template.questions.find(q => q.id === answer.question_id);
        const qText = question?.question_text || answer.question_id;
        let ansText = '';
        if (Array.isArray(answer.answer)) {
          ansText = answer.answer.join(' / ');
        } else {
          ansText = String(answer.answer || '');
        }
        if (ansText) {
          result.push(`${qText}: ${ansText}`);
        }
      }
    }

    return result.join('\n');
  };

  // 클립보드에 복사
  const handleCopyToClipboard = async () => {
    const text = formatSurveyAsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('복사 실패:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <p className="text-sm text-gray-500">
              {response.patient_name} · {new Date(response.submitted_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 보기 모드 토글 */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('full')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'full'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                전체 보기
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                답변만 보기
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 답변만 보기 모드 */}
          {viewMode === 'preview' ? (
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed">
              {formatSurveyAsText()}
            </div>
          ) : (
            /* 전체 보기 모드 */
            template.questions.map((question, index) => {
            const answer = getAnswerForQuestion(question.id);
            const isExpanded = expandedQuestions.has(question.id);

            return (
              <div key={question.id} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleQuestion(question.id)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <div className="flex-1">
                    <span className="text-sm text-gray-500 mr-2">Q{index + 1}.</span>
                    <span className="font-medium">{question.question_text}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="p-4 bg-white">
                    <div className="text-sm text-gray-500 mb-2">
                      {question.question_type === 'single_choice' && '단일 선택'}
                      {question.question_type === 'multiple_choice' && '복수 선택'}
                      {question.question_type === 'text' && '주관식'}
                      {question.question_type === 'scale' && '척도'}
                    </div>
                    <div className="text-gray-900">
                      {question.question_type === 'scale' && answer?.answer ? (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-primary-600">
                            {answer.answer}
                          </span>
                          <span className="text-gray-500">
                            / {question.scale_config?.max || 5}
                          </span>
                        </div>
                      ) : (
                        <p className={!answer ? 'text-gray-400 italic' : ''}>
                          {formatAnswer(answer)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
          )}
        </div>

        <div className="flex justify-between p-4 border-t bg-gray-50">
          <button
            onClick={handleCopyToClipboard}
            className="btn-secondary flex items-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-green-600">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                문진 복사
              </>
            )}
          </button>
          <button onClick={onClose} className="btn-secondary">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 새 설문 작성 모달 =====

interface NewSurveyModalProps {
  templates: SurveyTemplate[];
  onSubmit: (templateId: string, answers: SurveyAnswer[], respondentName?: string) => Promise<void>;
  onClose: () => void;
}

function NewSurveyModal({ templates, onSubmit, onClose }: NewSurveyModalProps) {
  const [step, setStep] = useState<'select' | 'fill'>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<SurveyTemplate | null>(null);
  const [respondentName, setRespondentName] = useState('');
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectTemplate = (template: SurveyTemplate) => {
    setSelectedTemplate(template);
    setAnswers([]);
    setCurrentIndex(0);
    setStep('fill');
  };

  const handleAnswer = (answer: SurveyAnswer) => {
    setAnswers(prev => {
      const existing = prev.findIndex(a => a.question_id === answer.question_id);
      if (existing >= 0) {
        const newAnswers = [...prev];
        newAnswers[existing] = answer;
        return newAnswers;
      }
      return [...prev, answer];
    });
  };

  const handleSubmit = async () => {
    if (!selectedTemplate) return;

    // 필수 항목 검증
    const requiredQuestions = selectedTemplate.questions.filter(q => q.required);
    const unanswered = requiredQuestions.find(q => {
      const answer = answers.find(a => a.question_id === q.id);
      if (!answer) return true;
      if (Array.isArray(answer.answer) && answer.answer.length === 0) return true;
      if (typeof answer.answer === 'string' && !answer.answer.trim()) return true;
      return false;
    });

    if (unanswered) {
      alert(`"${unanswered.question_text}" 질문에 답변해주세요.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedTemplate.id, answers, respondentName || undefined);
      onClose();
    } catch (error) {
      console.error('Failed to submit survey:', error);
      alert('설문 제출에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentQuestion = selectedTemplate?.questions[currentIndex];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {step === 'select' ? '설문 템플릿 선택' : selectedTemplate?.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'select' ? (
            // 템플릿 선택 화면
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  응답자 이름 (선택)
                </label>
                <input
                  type="text"
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  className="input-field"
                  placeholder="이름을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  설문 템플릿 선택
                </label>
                {templates.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">활성화된 템플릿이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className="w-full p-4 text-left border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <h3 className="font-medium text-gray-900">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          질문 {template.questions.length}개 ·
                          {template.display_mode === 'single_page' ? ' 원페이지' : ' 한문항씩'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : selectedTemplate ? (
            // 설문 작성 화면
            <div>
              {selectedTemplate.display_mode === 'one_by_one' && currentQuestion ? (
                // 한 문항씩 보기
                <div className="space-y-6">
                  <div className="text-sm text-gray-500 text-center">
                    {currentIndex + 1} / {selectedTemplate.questions.length}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-6">
                    <QuestionRenderer
                      question={currentQuestion}
                      answer={answers.find(a => a.question_id === currentQuestion.id)}
                      onChange={handleAnswer}
                    />
                  </div>
                  <div className="flex justify-between">
                    <button
                      type="button"
                      onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                      disabled={currentIndex === 0}
                      className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                    >
                      이전
                    </button>
                    {currentIndex === selectedTemplate.questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        {isSubmitting ? '제출 중...' : '제출'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCurrentIndex(i => i + 1)}
                        className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                      >
                        다음
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                // 원페이지 스크롤
                <div className="space-y-6">
                  {selectedTemplate.questions.map((question, idx) => (
                    <div key={question.id} className="bg-gray-50 rounded-lg p-6">
                      <div className="text-sm text-gray-500 mb-2">Q{idx + 1}.</div>
                      <QuestionRenderer
                        question={question}
                        answer={answers.find(a => a.question_id === question.id)}
                        onChange={handleAnswer}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          {step === 'fill' && (
            <button
              type="button"
              onClick={() => setStep('select')}
              className="btn-secondary"
            >
              템플릿 다시 선택
            </button>
          )}
          {step === 'select' ? (
            <button type="button" onClick={onClose} className="btn-secondary">
              취소
            </button>
          ) : selectedTemplate?.display_mode === 'single_page' ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? '제출 중...' : '제출'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ===== 온라인 링크 생성 모달 =====

interface LinkGeneratorModalProps {
  templates: SurveyTemplate[];
  userId: string;
  onClose: () => void;
}

function LinkGeneratorModal({ templates, userId, onClose }: LinkGeneratorModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 토큰 생성 함수
  const generateToken = () => {
    return Math.random().toString(36).substring(2, 10) +
           Math.random().toString(36).substring(2, 10);
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId) {
      setError('템플릿을 선택해주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const token = generateToken();
      const sessionId = generateUUID();
      const expiresAt = generateExpiresAt(24); // 24시간 만료
      const now = new Date().toISOString();

      // 선택된 템플릿 찾기
      const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
      if (!selectedTemplate) {
        throw new Error('템플릿을 찾을 수 없습니다.');
      }

      // 1. 로컬 DB에 세션 저장 (patient_id는 빈 문자열로 - NOT NULL 제약조건)
      const db = getDb();
      if (db) {
        db.run(
          `INSERT INTO survey_sessions (id, token, patient_id, template_id, status, expires_at, created_by, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
          [sessionId, token, '', selectedTemplateId, expiresAt, userId, now]
        );
        saveDb();
        console.log('[Survey] 로컬 DB에 세션 저장:', sessionId);
      }

      // 2. Supabase에 템플릿 복사 (아직 없으면)
      const { data: existingTemplate } = await supabase
        .from('survey_templates')
        .select('id')
        .eq('id', selectedTemplateId)
        .single();

      if (!existingTemplate) {
        // 템플릿 복사
        const { error: templateError } = await supabase
          .from('survey_templates')
          .insert({
            id: selectedTemplateId,
            user_id: userId,
            name: selectedTemplate.name,
            description: selectedTemplate.description || null,
            questions: selectedTemplate.questions,
            display_mode: selectedTemplate.display_mode || 'single_page',
          });

        if (templateError) {
          console.error('Template insert error:', templateError);
          // 이미 존재하는 경우 무시
        }
      }

      // 3. Supabase에 세션 생성
      const { error: sessionError } = await supabase
        .from('survey_sessions')
        .insert({
          id: sessionId,
          user_id: userId,
          template_id: selectedTemplateId,
          token,
          respondent_name: respondentName || null,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (sessionError) {
        throw sessionError;
      }

      console.log('[Survey] Supabase에 세션 저장:', sessionId);

      // Vercel URL 반환
      const link = `${SURVEY_APP_URL}/s/${token}`;
      setGeneratedLink(link);
    } catch (e) {
      console.error('Link generation error:', e);
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 복사 실패 시 수동 복사 안내
      alert('URL을 직접 복사해주세요: ' + generatedLink);
    }
  };

  const handleNewLink = () => {
    setGeneratedLink(null);
    setSelectedTemplateId('');
    setRespondentName('');
    setCopied(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">온라인 설문 링크 생성</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          {generatedLink ? (
            // 링크 생성 완료
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-gray-600">설문 링크가 생성되었습니다!</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={generatedLink}
                    readOnly
                    className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className={`p-2 rounded-lg transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center">
                이 링크는 24시간 동안 유효합니다.<br />
                응답자에게 공유하여 설문을 받으세요.
              </p>
            </div>
          ) : (
            // 링크 생성 폼
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설문 템플릿 <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="input-field"
                >
                  <option value="">템플릿 선택...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  응답자 이름 (선택)
                </label>
                <input
                  type="text"
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  className="input-field"
                />
              </div>

              <p className="text-xs text-gray-500">
                생성된 링크로 접속하면 설문을 작성할 수 있습니다.<br />
                링크는 24시간 동안 유효합니다.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          {generatedLink ? (
            <>
              <button onClick={handleNewLink} className="btn-secondary">
                새 링크 생성
              </button>
              <button onClick={onClose} className="btn-primary">
                완료
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">
                취소
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedTemplateId}
                className="btn-primary flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    링크 생성
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 환자 연결 모달 =====

interface PatientLinkModalProps {
  response: SurveyResponse;
  onLink: (patientId: string) => Promise<void>;
  onClose: () => void;
}

function PatientLinkModal({ response, onLink, onClose }: PatientLinkModalProps) {
  const [searchName, setSearchName] = useState(response.respondent_name || '');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [linking, setLinking] = useState(false);

  // 검색
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

  // 연결 처리
  const handleLink = async () => {
    if (!selectedPatient) return;

    setLinking(true);
    try {
      await onLink(selectedPatient.id);
    } catch (err) {
      console.error('연결 실패:', err);
      alert('환자 연결에 실패했습니다.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">환자 연결</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 응답 정보 */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">설문 응답</p>
            <p className="font-medium">{response.respondent_name || '이름 없음'}</p>
            <p className="text-sm text-gray-500">
              {response.template_name} · {new Date(response.submitted_at).toLocaleDateString()}
            </p>
          </div>

          {/* 환자 검색 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              환자 검색
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="환자 이름 입력"
                className="input-field pr-10"
                autoFocus
              />
              {searching && (
                <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              )}
            </div>
          </div>

          {/* 검색 결과 */}
          {searchResults.length > 0 && (
            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {searchResults.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                    selectedPatient?.id === patient.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <User className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{patient.name}</p>
                    <p className="text-sm text-gray-500">
                      {patient.birth_date && `${patient.birth_date} `}
                      {patient.gender === 'M' ? '남' : patient.gender === 'F' ? '여' : ''}
                      {patient.chart_number && ` (${patient.chart_number})`}
                    </p>
                  </div>
                  {selectedPatient?.id === patient.id && (
                    <Check className="w-5 h-5 text-primary-600" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 검색 결과 없음 */}
          {searchName.trim() && !searching && searchResults.length === 0 && (
            <p className="text-center text-gray-500 py-4">
              검색 결과가 없습니다
            </p>
          )}

          {/* 선택된 환자 */}
          {selectedPatient && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
              <p className="text-sm text-primary-600">선택된 환자</p>
              <p className="font-medium text-primary-900">{selectedPatient.name}</p>
              {selectedPatient.birth_date && (
                <p className="text-sm text-primary-700">{selectedPatient.birth_date}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button onClick={onClose} className="btn-secondary">
            취소
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedPatient || linking}
            className="btn-primary flex items-center gap-2"
          >
            {linking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                연결 중...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                환자 연결
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SurveyResponses;
