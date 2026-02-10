import { useEffect, useState, useMemo, useCallback } from 'react';
import { HelpCircle, Plus, Clock, CheckCircle, MessageSquare, Loader2, X, Edit2, Trash2, ExternalLink } from 'lucide-react';
import SimpleMDE from 'react-simplemde-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'easymde/dist/easymde.min.css';
import { useQuestionStore } from '../store/questionStore';
import { supabase } from '../lib/supabase';
import type { Question, QuestionCategory } from '../types';

// 카테고리 라벨
const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  general: '일반',
  prescription: '처방',
  treatment: '치료',
  study: '공부',
  other: '기타',
};

// 이미지 업로드 함수
async function uploadImage(file: File): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `questions/${fileName}`;

    const { error } = await supabase.storage
      .from('question-images')
      .upload(filePath, file);

    if (error) {
      console.error('Image upload error:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('question-images')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Image upload failed:', error);
    return null;
  }
}

export function Questions() {
  const {
    myQuestions,
    isLoading,
    loadMyQuestions,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    subscribeToQuestions,
  } = useQuestionStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [viewingAnswer, setViewingAnswer] = useState<Question | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'general' as QuestionCategory,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadMyQuestions();
    const unsubscribe = subscribeToQuestions();
    return unsubscribe;
  }, [loadMyQuestions, subscribeToQuestions]);

  // SimpleMDE 옵션
  const editorOptions = useMemo(() => ({
    spellChecker: false,
    placeholder: '질문 내용을 자세히 작성해주세요.\n\n이미지는 클립보드에서 붙여넣기(Ctrl+V)하거나 드래그앤드롭으로 추가할 수 있습니다.',
    status: false,
    toolbar: [
      'bold', 'italic', 'heading', '|',
      'quote', 'unordered-list', 'ordered-list', '|',
      'link', 'image', '|',
      'preview', 'side-by-side', 'fullscreen', '|',
      'guide'
    ] as const,
    minHeight: '250px',
  }), []);

  // 에디터 내용 변경 핸들러
  const handleContentChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, content: value }));
  }, []);

  // 이미지 붙여넣기 핸들러 (div onPaste용)
  const handleImagePaste = useCallback(async (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setIsUploading(true);
        const imageUrl = await uploadImage(file);
        setIsUploading(false);

        if (imageUrl) {
          const markdownImage = `\n![image](${imageUrl})\n`;
          setFormData(prev => ({
            ...prev,
            content: prev.content + markdownImage,
          }));
        } else {
          alert('이미지 업로드에 실패했습니다.');
        }
        break;
      }
    }
  }, []);

  // 이미지 드롭 핸들러
  const handleImageDrop = useCallback(async (event: React.DragEvent) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const imageFile = Array.from(files).find(file => file.type.startsWith('image/'));
    if (!imageFile) return;

    event.preventDefault();
    setIsUploading(true);

    const imageUrl = await uploadImage(imageFile);
    setIsUploading(false);

    if (imageUrl) {
      const markdownImage = `\n![image](${imageUrl})\n`;
      setFormData(prev => ({
        ...prev,
        content: prev.content + markdownImage,
      }));
    } else {
      alert('이미지 업로드에 실패했습니다.');
    }
  }, []);

  // 질문 제출
  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, formData);
      } else {
        await createQuestion(formData);
      }
      handleCloseModal();
    } catch (error) {
      alert('저장에 실패했습니다: ' + error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 질문 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('질문을 삭제하시겠습니까?')) return;

    try {
      await deleteQuestion(id);
    } catch (error) {
      alert('삭제에 실패했습니다: ' + error);
    }
  };

  // 모달 열기 (새 질문)
  const handleOpenNewModal = () => {
    setEditingQuestion(null);
    setFormData({ title: '', content: '', category: 'general' });
    setIsModalOpen(true);
  };

  // 모달 열기 (수정)
  const handleOpenEditModal = (question: Question) => {
    setEditingQuestion(question);
    setFormData({
      title: question.title,
      content: question.content,
      category: question.category || 'general',
    });
    setIsModalOpen(true);
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingQuestion(null);
    setFormData({ title: '', content: '', category: 'general' });
  };

  // 대기중/답변완료 개수
  const pendingCount = myQuestions.filter((q) => q.status === 'pending').length;
  const answeredCount = myQuestions.filter((q) => q.status === 'answered').length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">질문&답변</h1>
          <p className="text-sm text-gray-500 mt-1">
            대기중 {pendingCount}개 · 답변완료 {answeredCount}개
          </p>
        </div>
        <button onClick={handleOpenNewModal} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          새 질문
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : myQuestions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <HelpCircle className="w-16 h-16 mb-4 text-gray-300" />
          <p>등록된 질문이 없습니다</p>
          <button
            onClick={handleOpenNewModal}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            첫 번째 질문을 작성해보세요
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid gap-4">
            {myQuestions.map((question) => (
              <div
                key={question.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          question.status === 'answered'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {question.status === 'answered' ? '답변완료' : '대기중'}
                      </span>
                      {question.category && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                          {CATEGORY_LABELS[question.category]}
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 mb-1">
                      {question.title}
                    </h3>

                    <p className="text-gray-600 text-sm mb-3 whitespace-pre-wrap line-clamp-2">
                      {question.content.replace(/!\[.*?\]\(.*?\)/g, '[이미지]')}
                    </p>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {new Date(question.created_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {question.status === 'answered' ? (
                      <button
                        onClick={() => setViewingAnswer(question)}
                        className="btn-primary flex items-center gap-1"
                      >
                        <MessageSquare className="w-4 h-4" />
                        답변 보기
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenEditModal(question)}
                          className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(question.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 질문 작성/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingQuestion ? '질문 수정' : '새 질문'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="질문 제목을 입력하세요"
                    className="input w-full"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    카테고리
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value as QuestionCategory })
                    }
                    className="input w-full"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className="question-editor"
                onPaste={handleImagePaste}
                onDrop={handleImageDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내용 <span className="text-red-500">*</span>
                  {isUploading && (
                    <span className="ml-2 text-primary-600">
                      <Loader2 className="w-4 h-4 inline animate-spin" /> 이미지 업로드 중...
                    </span>
                  )}
                </label>
                <SimpleMDE
                  value={formData.content}
                  onChange={handleContentChange}
                  options={editorOptions}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={handleCloseModal} className="btn-secondary">
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.title.trim() || !formData.content.trim() || isSubmitting || isUploading}
                className="btn-primary flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {editingQuestion ? '수정' : '등록'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 답변 보기 모달 */}
      {viewingAnswer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">{viewingAnswer.title}</h2>
              <button
                onClick={() => setViewingAnswer(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">내 질문</h3>
                <div className="p-3 bg-gray-50 rounded-lg prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault();
                            if (href) {
                              window.open(href, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {children}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ),
                      img: ({ src, alt }) => (
                        <img
                          src={src}
                          alt={alt}
                          className="max-w-full rounded-lg border border-gray-200"
                        />
                      ),
                    }}
                  >
                    {viewingAnswer.content}
                  </ReactMarkdown>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  답변
                  {viewingAnswer.answered_at && (
                    <span className="text-gray-400 font-normal ml-2">
                      ({new Date(viewingAnswer.answered_at).toLocaleDateString('ko-KR')})
                    </span>
                  )}
                </h3>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault();
                            if (href) {
                              window.open(href, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {children}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ),
                      img: ({ src, alt }) => (
                        <img
                          src={src}
                          alt={alt}
                          className="max-w-full rounded-lg border border-gray-200"
                        />
                      ),
                    }}
                  >
                    {viewingAnswer.answer || '답변이 없습니다.'}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="flex justify-end p-4 border-t">
              <button
                onClick={() => setViewingAnswer(null)}
                className="btn-primary"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
