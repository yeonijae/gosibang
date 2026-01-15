import { useEffect, useState } from 'react';
import { BookOpen, Clock, CheckCircle, Send, FileText, ExternalLink, MessageSquare, Loader2, X } from 'lucide-react';
import { useHomeworkStore } from '../store/homeworkStore';
import type { Homework as HomeworkType, HomeworkSubmission } from '../types';

export function Homework() {
  const {
    homeworks,
    mySubmissions,
    isLoading,
    loadHomeworks,
    loadMySubmissions,
    submitHomework,
    updateSubmission,
    subscribeToHomeworks,
  } = useHomeworkStore();

  const [selectedHomework, setSelectedHomework] = useState<HomeworkType | null>(null);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingFeedback, setViewingFeedback] = useState<HomeworkSubmission | null>(null);

  useEffect(() => {
    loadHomeworks();
    loadMySubmissions();
    const unsubscribe = subscribeToHomeworks();
    return unsubscribe;
  }, [loadHomeworks, loadMySubmissions, subscribeToHomeworks]);

  // 해당 숙제에 대한 내 제출 찾기
  const getMySubmission = (homeworkId: string) => {
    return mySubmissions.find((s) => s.homework_id === homeworkId);
  };

  // 마감 상태 확인
  const getDueStatus = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) return 'overdue';
    if (diffHours < 24) return 'urgent';
    if (diffHours < 72) return 'soon';
    return 'normal';
  };

  // 제출 핸들러
  const handleSubmit = async () => {
    if (!selectedHomework || !answer.trim()) return;

    setIsSubmitting(true);
    try {
      const existingSubmission = getMySubmission(selectedHomework.id);
      if (existingSubmission) {
        await updateSubmission(existingSubmission.id, answer);
      } else {
        await submitHomework(selectedHomework.id, answer);
      }
      await loadMySubmissions();
      setSelectedHomework(null);
      setAnswer('');
    } catch (error) {
      alert('제출에 실패했습니다: ' + error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 숙제 선택 시 기존 답안 로드
  const handleSelectHomework = (homework: HomeworkType) => {
    const existingSubmission = getMySubmission(homework.id);
    setSelectedHomework(homework);
    setAnswer(existingSubmission?.answer || '');
  };

  // 활성화된 숙제만 필터링
  const activeHomeworks = homeworks.filter((h) => h.is_active);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">나의숙제</h1>
          <p className="text-sm text-gray-500 mt-1">
            총 {activeHomeworks.length}개의 숙제
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : activeHomeworks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <BookOpen className="w-16 h-16 mb-4 text-gray-300" />
          <p>등록된 숙제가 없습니다</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid gap-4">
            {activeHomeworks.map((homework) => {
              const submission = getMySubmission(homework.id);
              const dueStatus = getDueStatus(homework.due_date);
              const isOverdue = dueStatus === 'overdue';

              return (
                <div
                  key={homework.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">
                          {homework.title}
                        </h3>
                        {submission && (
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              submission.status === 'reviewed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {submission.status === 'reviewed' ? '피드백 완료' : '제출 완료'}
                          </span>
                        )}
                      </div>

                      {homework.description && (
                        <p className="text-gray-600 text-sm mb-3 whitespace-pre-wrap">
                          {homework.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm">
                        <div
                          className={`flex items-center gap-1 ${
                            isOverdue
                              ? 'text-red-600'
                              : dueStatus === 'urgent'
                              ? 'text-orange-600'
                              : dueStatus === 'soon'
                              ? 'text-yellow-600'
                              : 'text-gray-500'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                          <span>
                            마감: {new Date(homework.due_date).toLocaleDateString('ko-KR', {
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isOverdue && <span className="font-medium">(마감됨)</span>}
                        </div>

                        {homework.attachment_url && (
                          <a
                            href={homework.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                          >
                            <FileText className="w-4 h-4" />
                            <span>{homework.attachment_name || '첨부파일'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {submission?.status === 'reviewed' && (
                        <button
                          onClick={() => setViewingFeedback(submission)}
                          className="btn-secondary flex items-center gap-1"
                        >
                          <MessageSquare className="w-4 h-4" />
                          피드백 보기
                        </button>
                      )}
                      <button
                        onClick={() => handleSelectHomework(homework)}
                        className={`flex items-center gap-1 ${
                          submission ? 'btn-secondary' : 'btn-primary'
                        }`}
                        disabled={isOverdue && !submission}
                      >
                        {submission ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            수정하기
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            제출하기
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 제출 모달 */}
      {selectedHomework && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">{selectedHomework.title}</h2>
              <button
                onClick={() => {
                  setSelectedHomework(null);
                  setAnswer('');
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {selectedHomework.description && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {selectedHomework.description}
                  </p>
                </div>
              )}

              {selectedHomework.attachment_url && (
                <div className="mb-4">
                  <a
                    href={selectedHomework.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{selectedHomework.attachment_name || '첨부파일 다운로드'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  답변 작성
                </label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="답변을 입력하세요..."
                  className="input-field min-h-[300px] resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => {
                  setSelectedHomework(null);
                  setAnswer('');
                }}
                className="btn-secondary"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={!answer.trim() || isSubmitting}
                className="btn-primary flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    제출 중...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {getMySubmission(selectedHomework.id) ? '수정 제출' : '제출'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 피드백 보기 모달 */}
      {viewingFeedback && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">피드백</h2>
              <button
                onClick={() => setViewingFeedback(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">내 답변</h3>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{viewingFeedback.answer}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  피드백
                  {viewingFeedback.reviewed_at && (
                    <span className="text-gray-400 font-normal ml-2">
                      ({new Date(viewingFeedback.reviewed_at).toLocaleDateString('ko-KR')})
                    </span>
                  )}
                </h3>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {viewingFeedback.feedback || '피드백이 없습니다.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end p-4 border-t">
              <button
                onClick={() => setViewingFeedback(null)}
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
