import { useEffect, useState } from 'react';
import { Search, Eye, X, ChevronDown, ChevronUp, Plus, Link2, Copy, Check, Loader2, UserPlus, User, AlertCircle, Edit2, Trash2, GripVertical, EyeOff, FileText, ClipboardList, Clock } from 'lucide-react';
import { useSurveyStore } from '../store/surveyStore';
import { QuestionRenderer } from '../components/survey/QuestionRenderer';
import { useAuthStore } from '../store/authStore';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useSurveyRealtime } from '../hooks/useSurveyRealtime';
import { supabase } from '../lib/supabase';
import { getDb, saveDb, generateUUID, queryToObjects } from '../lib/localDb';
import { generateExpiresAt, generateQuestionId } from '../lib/surveyUtils';
import type { SurveyResponse, SurveyTemplate, SurveyAnswer, Patient, SurveyQuestion, QuestionType, ScaleConfig, SurveyDisplayMode } from '../types';

// Vercel 설문 앱 URL
const SURVEY_APP_URL = 'https://gosibang-survey.vercel.app';

export function SurveyResponses() {
  const { responses, templates, sessions, isLoading, loadResponses, loadTemplates, loadSessions, getTemplate, linkResponseToPatient, deleteResponse, createTemplate, updateTemplate, deleteTemplate, deleteSession } = useSurveyStore();
  const { authState } = useAuthStore();
  const { canUseFeature } = usePlanLimits();

  // Supabase에서 응답 동기화
  const { syncPendingResponses } = useSurveyRealtime(authState?.user?.id || null);

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'pending' | 'responses' | 'templates'>('pending');

  // 응답 관리 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [viewingResponse, setViewingResponse] = useState<SurveyResponse | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<SurveyTemplate | null>(null);

  // 온라인 링크 생성 모달 상태
  const [showLinkModal, setShowLinkModal] = useState(false);

  // 미연결 응답만 보기 필터
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);

  // 환자 연결 모달 상태
  const [linkingResponse, setLinkingResponse] = useState<SurveyResponse | null>(null);

  // 템플릿 관리 상태
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SurveyTemplate | null>(null);

  useEffect(() => {
    loadResponses();
    loadTemplates();
    loadSessions();
    // Supabase에서 미동기화된 응답 가져오기
    syncPendingResponses();
  }, [loadResponses, loadTemplates, loadSessions, syncPendingResponses]);

  // 페이지 포커스 시 자동 새로고침 및 Supabase 동기화
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Supabase에서 새 응답 동기화
        await syncPendingResponses();
        // 로컬 데이터 새로고침
        loadResponses();
        loadSessions();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadResponses, loadSessions, syncPendingResponses]);

  // 주기적 폴링 (10초마다 새 응답 확인)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        await syncPendingResponses();
        loadResponses();
        loadSessions();
      }
    }, 10000); // 10초

    return () => clearInterval(pollInterval);
  }, [syncPendingResponses, loadResponses, loadSessions]);

  // 템플릿 관리 핸들러
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setIsTemplateModalOpen(true);
  };

  const handleEditTemplate = (template: SurveyTemplate) => {
    setEditingTemplate(template);
    setIsTemplateModalOpen(true);
  };

  const handleDeleteTemplate = async (template: SurveyTemplate) => {
    if (confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`)) {
      await deleteTemplate(template.id);
    }
  };

  const handleSaveTemplate = async (data: { name: string; description?: string; display_mode: SurveyDisplayMode; questions: SurveyQuestion[] }) => {
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, { ...data, is_active: editingTemplate.is_active });
    } else {
      await createTemplate(data);
    }
    setIsTemplateModalOpen(false);
  };

  const handleDuplicateTemplate = async (template: SurveyTemplate) => {
    const newQuestions = template.questions.map(q => ({ ...q, id: generateQuestionId() }));
    await createTemplate({
      name: `${template.name} (복사본)`,
      description: template.description,
      display_mode: template.display_mode,
      questions: newQuestions,
    });
  };

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
    if (!template) {
      alert('템플릿 정보를 찾을 수 없습니다. 템플릿이 삭제되었을 수 있습니다.');
      return;
    }
    setViewingResponse(response);
    setViewingTemplate(template);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설문 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === 'pending' && `대기 중 ${sessions.filter(s => s.status === 'pending').length}건`}
            {activeTab === 'responses' && `응답 ${filteredResponses.length}건`}
            {activeTab === 'templates' && `템플릿 ${templates.length}개`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTab === 'pending' && canUseFeature('survey_external') && (
            <button
              onClick={() => setShowLinkModal(true)}
              className="btn-primary flex items-center gap-2"
              disabled={templates.filter(t => t.is_active).length === 0}
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">온라인 링크 생성</span>
              <span className="sm:hidden">링크</span>
            </button>
          )}
          {activeTab === 'templates' && (
            <button onClick={handleCreateTemplate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              새 템플릿
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          답변대기
        </button>
        <button
          onClick={() => setActiveTab('responses')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'responses'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          응답 관리
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          템플릿 관리
        </button>
      </div>

      {/* 답변대기 탭 */}
      {activeTab === 'pending' && (
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_100px] gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
            <div>템플릿</div>
            <div>응답자</div>
            <div>생성일시</div>
            <div>만료일시</div>
            <div className="text-center">액션</div>
          </div>

          {/* 세션 목록 */}
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                <Clock className="w-12 h-12 mb-4" />
                <p>대기 중인 설문이 없습니다.</p>
                <p className="text-sm mt-1">온라인 링크를 생성하여 설문을 보내보세요.</p>
              </div>
            ) : (
              sessions.map((session) => {
                const isExpired = session.status === 'expired' || new Date(session.expires_at) < new Date();
                return (
                  <div
                    key={session.id}
                    className={`grid grid-cols-[1fr_1fr_1fr_1fr_100px] gap-4 px-4 py-3 border-b border-gray-100 items-center hover:bg-gray-50 ${
                      isExpired ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 truncate">
                      {session.template_name || '알 수 없는 템플릿'}
                    </div>
                    <div className="text-gray-600 truncate">
                      {session.respondent_name || session.patient_name || '-'}
                    </div>
                    <div className="text-gray-500 text-sm">
                      {new Date(session.created_at).toLocaleString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isExpired ? 'text-red-500' : 'text-gray-500'}`}>
                        {new Date(session.expires_at).toLocaleString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isExpired && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                          만료
                        </span>
                      )}
                      {!isExpired && session.status === 'pending' && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-600 text-xs rounded">
                          대기중
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {!isExpired && (
                        <button
                          onClick={async () => {
                            const link = `${SURVEY_APP_URL}/s/${session.token}`;
                            await navigator.clipboard.writeText(link);
                            alert('링크가 복사되었습니다.');
                          }}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                          title="링크 복사"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (confirm('이 세션을 삭제하시겠습니까?')) {
                            await deleteSession(session.id);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 응답 관리 탭 */}
      {activeTab === 'responses' && (
        <>
          {/* 필터 - 한 줄 표시 */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="input-field w-32 sm:w-40 flex-shrink-0"
            >
              <option value="">전체 설문</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="환자명/설문명 검색"
                className="input-field !pl-9 w-full"
              />
            </div>
            {/* 미연결 응답 필터 */}
            <button
              onClick={() => setShowUnlinkedOnly(!showUnlinkedOnly)}
              className={`px-3 py-2 rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap flex-shrink-0 ${
                showUnlinkedOnly
                  ? 'bg-orange-100 border-orange-300 text-orange-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              <span className="hidden sm:inline">미연결</span>{unlinkedCount > 0 && <span className="ml-1">({unlinkedCount})</span>}
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
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleViewResponse(response)}
                              className="px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded transition-colors"
                              title="보기"
                            >
                              보기
                            </button>
                            {!response.patient_id && (
                              <button
                                onClick={() => setLinkingResponse(response)}
                                className="px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                title="연결"
                              >
                                연결
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm('이 설문 응답을 삭제하시겠습니까?')) {
                                  deleteResponse(response.id);
                                }
                              }}
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="삭제"
                            >
                              삭제
                            </button>
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
        </>
      )}

      {/* 템플릿 관리 탭 */}
      {activeTab === 'templates' && (
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">로딩 중...</div>
          ) : templates.length > 0 ? (
            <div className="flex-1 overflow-auto divide-y divide-gray-200 px-4">
              {templates.map((template) => (
                <div key={template.id} className="py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{template.name}</h3>
                      {!template.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">비활성</span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                    )}
                    <p className="text-sm text-gray-400 mt-1">
                      질문 {template.questions.length}개 ·
                      {template.display_mode === 'single_page' ? ' 원페이지' : ' 한문항씩'} ·
                      {new Date(template.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDuplicateTemplate(template)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title="복제"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEditTemplate(template)}
                      className="p-2 text-slate-600 hover:text-slate-800"
                      title="수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template)}
                      className="p-2 text-red-600 hover:text-red-800"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <p>등록된 설문 템플릿이 없습니다.</p>
              <button onClick={handleCreateTemplate} className="text-primary-600 hover:underline mt-2">
                새 템플릿 만들기
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* 템플릿 편집 모달 */}
      {isTemplateModalOpen && (
        <TemplateEditorModal
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setIsTemplateModalOpen(false)}
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

// ===== 온라인 링크 생성 모달 =====

interface LinkGeneratorModalProps {
  templates: SurveyTemplate[];
  userId: string;
  onClose: () => void;
}

function LinkGeneratorModal({ templates, userId, onClose }: LinkGeneratorModalProps) {
  const { loadSessions } = useSurveyStore();
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
          `INSERT INTO survey_sessions (id, token, patient_id, template_id, respondent_name, status, expires_at, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          [sessionId, token, '', selectedTemplateId, respondentName || null, expiresAt, userId, now]
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

      // 세션 목록 새로고침
      await loadSessions();
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

// ===== 템플릿 편집 모달 =====

interface TemplateEditorModalProps {
  template: SurveyTemplate | null;
  onSave: (data: { name: string; description?: string; display_mode: SurveyDisplayMode; questions: SurveyQuestion[] }) => Promise<void>;
  onClose: () => void;
}

function TemplateEditorModal({ template, onSave, onClose }: TemplateEditorModalProps) {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [displayMode, setDisplayMode] = useState<SurveyDisplayMode>(template?.display_mode || 'one_by_one');
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    template?.questions || []
  );
  const [saving, setSaving] = useState(false);

  // 미리보기 관련 상태
  const [showPreview, setShowPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<SurveyAnswer[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const handleAddQuestion = () => {
    const newQuestion: SurveyQuestion = {
      id: generateQuestionId(),
      question_text: '',
      question_type: 'single_choice',
      options: ['옵션 1', '옵션 2'],
      required: true,
      order: questions.length,
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleUpdateQuestion = (index: number, updated: Partial<SurveyQuestion>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updated };
    setQuestions(newQuestions);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === questions.length - 1)
    ) {
      return;
    }
    const newQuestions = [...questions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setQuestions(newQuestions.map((q, i) => ({ ...q, order: i })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('템플릿 이름을 입력해주세요.');
      return;
    }
    if (questions.length === 0) {
      alert('최소 하나의 질문을 추가해주세요.');
      return;
    }
    const invalidQuestion = questions.find(q => !q.question_text.trim());
    if (invalidQuestion) {
      alert('모든 질문의 내용을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ name, description, display_mode: displayMode, questions });
    } finally {
      setSaving(false);
    }
  };

  // 미리보기 토글
  const togglePreview = () => {
    if (!showPreview) {
      setPreviewAnswers([]);
      setPreviewIndex(0);
    }
    setShowPreview(!showPreview);
  };

  // 미리보기 답변 핸들러
  const handlePreviewAnswer = (answer: SurveyAnswer) => {
    setPreviewAnswers(prev => {
      const existing = prev.findIndex(a => a.question_id === answer.question_id);
      if (existing >= 0) {
        const newAnswers = [...prev];
        newAnswers[existing] = answer;
        return newAnswers;
      }
      return [...prev, answer];
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {template ? '템플릿 수정' : '새 템플릿 만들기'}
          </h2>
          <div className="flex items-center gap-2">
            {questions.length > 0 && (
              <button
                type="button"
                onClick={togglePreview}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors ${
                  showPreview
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPreview ? '편집' : '미리보기'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showPreview ? (
          // 미리보기 모드
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto">
              <div className="mb-6 text-center">
                <h3 className="text-xl font-bold text-gray-900">{name || '(제목 없음)'}</h3>
                {description && <p className="text-gray-600 mt-1">{description}</p>}
                <div className="mt-2 text-sm text-gray-500">
                  표시방식: {displayMode === 'one_by_one' ? '한 문항씩 보기' : '원페이지 스크롤'}
                </div>
              </div>

              {displayMode === 'one_by_one' ? (
                <div className="space-y-6">
                  {questions[previewIndex] && (
                    <>
                      <div className="text-sm text-gray-500 text-center">
                        {previewIndex + 1} / {questions.length}
                      </div>
                      <div className="bg-gray-50 rounded-lg p-6">
                        <QuestionRenderer
                          question={questions[previewIndex]}
                          answer={previewAnswers.find(a => a.question_id === questions[previewIndex].id)}
                          onChange={handlePreviewAnswer}
                        />
                      </div>
                      <div className="flex justify-between">
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(i => Math.max(0, i - 1))}
                          disabled={previewIndex === 0}
                          className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                        >
                          이전
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(i => Math.min(questions.length - 1, i + 1))}
                          disabled={previewIndex === questions.length - 1}
                          className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {previewIndex === questions.length - 1 ? '완료' : '다음'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {questions.map((question, idx) => (
                    <div key={question.id} className="bg-gray-50 rounded-lg p-6">
                      <div className="text-sm text-gray-500 mb-2">Q{idx + 1}.</div>
                      <QuestionRenderer
                        question={question}
                        answer={previewAnswers.find(a => a.question_id === question.id)}
                        onChange={handlePreviewAnswer}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          // 편집 모드
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                템플릿 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="예: 초진 설문지"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
                rows={2}
                placeholder="설문지에 대한 간단한 설명"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">표시 방식</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    value="one_by_one"
                    checked={displayMode === 'one_by_one'}
                    onChange={() => setDisplayMode('one_by_one')}
                    className="text-primary-600"
                  />
                  <span className="text-sm">한 문항씩 보기</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    value="single_page"
                    checked={displayMode === 'single_page'}
                    onChange={() => setDisplayMode('single_page')}
                    className="text-primary-600"
                  />
                  <span className="text-sm">원페이지 스크롤</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {displayMode === 'one_by_one'
                  ? '질문을 하나씩 순서대로 표시합니다.'
                  : '모든 질문을 한 페이지에 표시하여 스크롤로 작성합니다.'}
              </p>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">질문 목록</h3>
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  질문 추가
                </button>
              </div>

              {questions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                  <p>아직 질문이 없습니다.</p>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="text-primary-600 hover:underline mt-1"
                  >
                    첫 번째 질문 추가하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {questions.map((question, index) => (
                    <QuestionEditor
                      key={question.id}
                      question={question}
                      index={index}
                      totalCount={questions.length}
                      onUpdate={(updated) => handleUpdateQuestion(index, updated)}
                      onDelete={() => handleDeleteQuestion(index)}
                      onMove={(direction) => handleMoveQuestion(index, direction)}
                    />
                  ))}
                </div>
              )}
            </div>
          </form>
        )}

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button type="button" onClick={onClose} className="btn-secondary">
            취소
          </button>
          {showPreview ? (
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="btn-primary"
            >
              편집으로 돌아가기
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 질문 편집기 =====

interface QuestionEditorProps {
  question: SurveyQuestion;
  index: number;
  totalCount: number;
  onUpdate: (updated: Partial<SurveyQuestion>) => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
}

function QuestionEditor({ question, index, totalCount, onUpdate, onDelete, onMove }: QuestionEditorProps) {
  const questionTypes: { value: QuestionType; label: string }[] = [
    { value: 'single_choice', label: '단일 선택' },
    { value: 'multiple_choice', label: '복수 선택' },
    { value: 'text', label: '주관식' },
    { value: 'scale', label: '척도' },
  ];

  const handleTypeChange = (type: QuestionType) => {
    const updates: Partial<SurveyQuestion> = { question_type: type };
    if (type === 'single_choice' || type === 'multiple_choice') {
      if (!question.options || question.options.length === 0) {
        updates.options = ['옵션 1', '옵션 2'];
      }
      updates.scale_config = undefined;
    } else if (type === 'scale') {
      updates.scale_config = question.scale_config || { min: 1, max: 5, minLabel: '전혀 아님', maxLabel: '매우 그렇다' };
      updates.options = undefined;
    } else {
      updates.options = undefined;
      updates.scale_config = undefined;
    }
    onUpdate(updates);
  };

  const handleAddOption = () => {
    const options = [...(question.options || []), `옵션 ${(question.options?.length || 0) + 1}`];
    onUpdate({ options });
  };

  const handleUpdateOption = (optIndex: number, value: string) => {
    const options = [...(question.options || [])];
    options[optIndex] = value;
    onUpdate({ options });
  };

  const handleDeleteOption = (optIndex: number) => {
    const options = (question.options || []).filter((_, i) => i !== optIndex);
    onUpdate({ options });
  };

  const handleScaleConfigChange = (config: Partial<ScaleConfig>) => {
    onUpdate({ scale_config: { ...question.scale_config!, ...config } });
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 text-gray-400">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            className="p-1 hover:text-gray-600 disabled:opacity-30"
          >
            ▲
          </button>
          <GripVertical className="w-4 h-4 mx-auto" />
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === totalCount - 1}
            className="p-1 hover:text-gray-600 disabled:opacity-30"
          >
            ▼
          </button>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <span className="text-sm font-medium text-gray-500 mt-2">Q{index + 1}.</span>
            <input
              type="text"
              value={question.question_text}
              onChange={(e) => onUpdate({ question_text: e.target.value })}
              className="input-field flex-1"
              placeholder="질문 내용을 입력하세요"
            />
          </div>

          <div className="flex items-center gap-4">
            <select
              value={question.question_type}
              onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
              className="input-field w-auto"
            >
              {questionTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="rounded"
              />
              필수
            </label>
          </div>

          {(question.question_type === 'single_choice' || question.question_type === 'multiple_choice') && (
            <div className="space-y-2 pl-4">
              {question.options?.map((option, optIndex) => (
                <div key={optIndex} className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">{optIndex + 1}.</span>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleUpdateOption(optIndex, e.target.value)}
                    className="input-field flex-1"
                    placeholder={`옵션 ${optIndex + 1}`}
                  />
                  {(question.options?.length || 0) > 2 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteOption(optIndex)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddOption}
                className="text-sm text-primary-600 hover:underline"
              >
                + 옵션 추가
              </button>
            </div>
          )}

          {question.question_type === 'scale' && question.scale_config && (
            <div className="grid grid-cols-2 gap-4 pl-4">
              <div>
                <label className="text-sm text-gray-600">최소값</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={question.scale_config.min}
                    onChange={(e) => handleScaleConfigChange({ min: parseInt(e.target.value) || 1 })}
                    className="input-field w-20"
                    min={0}
                    max={question.scale_config.max - 1}
                  />
                  <input
                    type="text"
                    value={question.scale_config.minLabel || ''}
                    onChange={(e) => handleScaleConfigChange({ minLabel: e.target.value })}
                    className="input-field flex-1"
                    placeholder="라벨 (선택)"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">최대값</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={question.scale_config.max}
                    onChange={(e) => handleScaleConfigChange({ max: parseInt(e.target.value) || 5 })}
                    className="input-field w-20"
                    min={question.scale_config.min + 1}
                    max={10}
                  />
                  <input
                    type="text"
                    value={question.scale_config.maxLabel || ''}
                    onChange={(e) => handleScaleConfigChange({ maxLabel: e.target.value })}
                    className="input-field flex-1"
                    placeholder="라벨 (선택)"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 p-1"
          title="질문 삭제"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default SurveyResponses;
