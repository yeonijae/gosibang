/**
 * 설문 응답 상세 보기 모달
 * - 설문관리, 환자관리에서 공통으로 사용
 */

import { useState } from 'react';
import { X, ChevronUp, ChevronDown, Copy, Check } from 'lucide-react';
import type { SurveyResponse, SurveyTemplate, SurveyAnswer } from '../../types';

interface ResponseViewerModalProps {
  response: SurveyResponse;
  template: SurveyTemplate;
  onClose: () => void;
}

export function ResponseViewerModal({ response, template, onClose }: ResponseViewerModalProps) {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set(template.questions.map((q) => q.id))
  );
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'full' | 'preview'>('preview');

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

  // 설문 결과를 컴팩트 텍스트로 변환
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
    let currentSection = '';

    for (const question of template.questions) {
      const qId = question.id;
      const qText = question.question_text;

      if (!hasAnswer(qId)) continue;

      const answerText = getAnswer(qId);

      // 섹션 헤더 (>로 시작하는 질문)
      if (qText.startsWith('>')) {
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
      // 일반 질문
      else {
        if (qId === 'name' || qId === 'chart_number' || qId === 'doctor') {
          continue;
        }
        if (qId === 'gender_age' || qId === 'height_weight') {
          continue;
        }
        lines.push(`${qText}: ${answerText}`);
      }
    }

    // 기본정보 먼저 추가
    const basicInfo = [getAnswer('gender_age'), getAnswer('height_weight')].filter(Boolean).join(' / ');

    const result: string[] = [];
    if (basicInfo) {
      result.push(basicInfo);
    }

    if (lines.length > 0) {
      result.push('[문진]');
      result.push(...lines);
    } else if (response.answers.length > 0) {
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
              {response.patient_name || response.respondent_name || '-'} · {new Date(response.submitted_at).toLocaleString('ko-KR')}
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
          {viewMode === 'preview' ? (
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed">
              {formatSurveyAsText()}
            </div>
          ) : template.questions.length > 0 ? (
            // 템플릿에 질문이 있는 경우: 질문 기반으로 표시
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
          ) : (
            // 템플릿에 질문이 없는 경우: 답변 기반으로 표시
            response.answers.map((answer, index) => {
              const answerText = Array.isArray(answer.answer)
                ? answer.answer.join(' / ')
                : String(answer.answer || '');

              if (!answerText) return null;

              return (
                <div key={answer.question_id} className="border rounded-lg overflow-hidden">
                  <div className="p-4 bg-gray-50">
                    <span className="text-sm text-gray-500 mr-2">Q{index + 1}.</span>
                    <span className="font-medium">{answer.question_id}</span>
                  </div>
                  <div className="p-4 bg-white">
                    <p className="text-gray-900">{answerText}</p>
                  </div>
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
