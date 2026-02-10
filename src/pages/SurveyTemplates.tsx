import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X, GripVertical, Copy, Eye, EyeOff } from 'lucide-react';
import { useSurveyStore } from '../store/surveyStore';
import { generateQuestionId } from '../lib/surveyUtils';
import { QuestionRenderer } from '../components/survey/QuestionRenderer';
import type { SurveyTemplate, SurveyQuestion, QuestionType, ScaleConfig, SurveyDisplayMode, SurveyAnswer } from '../types';

export function SurveyTemplates() {
  const { templates, isLoading, loadTemplates, createTemplate, updateTemplate, deleteTemplate } = useSurveyStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SurveyTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = () => {
    setEditingTemplate(null);
    setIsModalOpen(true);
  };

  const handleEdit = (template: SurveyTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleDelete = async (template: SurveyTemplate) => {
    if (confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`)) {
      await deleteTemplate(template.id);
    }
  };

  const handleSave = async (data: { name: string; description?: string; display_mode: SurveyDisplayMode; questions: SurveyQuestion[] }) => {
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, { ...data, is_active: editingTemplate.is_active });
    } else {
      await createTemplate(data);
    }
    setIsModalOpen(false);
  };

  const handleDuplicate = async (template: SurveyTemplate) => {
    const newQuestions = template.questions.map(q => ({ ...q, id: generateQuestionId() }));
    await createTemplate({
      name: `${template.name} (복사본)`,
      description: template.description,
      display_mode: template.display_mode,
      questions: newQuestions,
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설문 템플릿 관리</h1>
          <p className="text-sm text-gray-500 mt-1">템플릿 {templates.length}개</p>
        </div>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          새 템플릿
        </button>
      </div>

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
                    {new Date(template.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDuplicate(template)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="복제"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-2 text-slate-600 hover:text-slate-800"
                    title="수정"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
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
            <button onClick={handleCreate} className="text-primary-600 hover:underline mt-2">
              새 템플릿 만들기
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <TemplateEditorModal
          template={editingTemplate}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}
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
      // 미리보기 시작 시 답변 초기화
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
              {/* 미리보기 헤더 */}
              <div className="mb-6 text-center">
                <h3 className="text-xl font-bold text-gray-900">{name || '(제목 없음)'}</h3>
                {description && <p className="text-gray-600 mt-1">{description}</p>}
                <div className="mt-2 text-sm text-gray-500">
                  표시방식: {displayMode === 'one_by_one' ? '한 문항씩 보기' : '원페이지 스크롤'}
                </div>
              </div>

              {displayMode === 'one_by_one' ? (
                // 한 문항씩 보기
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
                // 원페이지 스크롤
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

export default SurveyTemplates;
