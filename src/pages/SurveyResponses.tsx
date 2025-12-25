import { useEffect, useState } from 'react';
import { Search, Eye, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useSurveyStore } from '../store/surveyStore';
import type { SurveyResponse, SurveyTemplate, SurveyAnswer } from '../types';

export function SurveyResponses() {
  const { responses, templates, isLoading, loadResponses, loadTemplates, getTemplate } = useSurveyStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [viewingResponse, setViewingResponse] = useState<SurveyResponse | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<SurveyTemplate | null>(null);

  useEffect(() => {
    loadResponses();
    loadTemplates();
  }, [loadResponses, loadTemplates]);

  const filteredResponses = responses.filter((response) => {
    const matchesSearch = !searchTerm ||
      response.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.template_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTemplate = !selectedTemplateId || response.template_id === selectedTemplateId;
    return matchesSearch && matchesTemplate;
  });

  const handleViewResponse = (response: SurveyResponse) => {
    const template = getTemplate(response.template_id);
    setViewingResponse(response);
    setViewingTemplate(template);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">설문 응답 관리</h1>
      </div>

      {/* 필터 */}
      <div className="flex gap-4">
        <div className="relative flex-1">
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
          className="input-field w-48"
        >
          <option value="">전체 설문</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {/* 응답 목록 */}
      <div className="card">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">로딩 중...</div>
        ) : filteredResponses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium text-gray-600">환자명</th>
                  <th className="pb-3 font-medium text-gray-600">설문명</th>
                  <th className="pb-3 font-medium text-gray-600">제출일시</th>
                  <th className="pb-3 font-medium text-gray-600">답변 수</th>
                  <th className="pb-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredResponses.map((response) => (
                  <tr key={response.id} className="hover:bg-gray-50">
                    <td className="py-3">{response.patient_name || '-'}</td>
                    <td className="py-3">{response.template_name || '-'}</td>
                    <td className="py-3">
                      {new Date(response.submitted_at).toLocaleString()}
                    </td>
                    <td className="py-3">{response.answers.length}개</td>
                    <td className="py-3">
                      <button
                        onClick={() => handleViewResponse(response)}
                        className="text-primary-600 hover:text-primary-800 flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {template.questions.map((question, index) => {
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
          })}
        </div>

        <div className="flex justify-end p-4 border-t bg-gray-50">
          <button onClick={onClose} className="btn-secondary">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default SurveyResponses;
