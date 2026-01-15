import { useEffect, useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  MessageSquare,
  Loader2,
  X,
  BookOpen,
  Users,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useHomeworkStore } from '../store/homeworkStore';
import { useAuthStore } from '../store/authStore';
import type { Homework, HomeworkSubmission } from '../types';

export function HomeworkAdmin() {
  const {
    homeworks,
    submissions,
    isLoading,
    loadHomeworks,
    loadAllSubmissions,
    createHomework,
    updateHomework,
    deleteHomework,
    reviewSubmission,
  } = useHomeworkStore();
  const { authState } = useAuthStore();

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'homeworks' | 'submissions'>('homeworks');

  // 숙제 모달 상태
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [homeworkForm, setHomeworkForm] = useState({
    title: '',
    description: '',
    attachment_url: '',
    attachment_name: '',
    due_date: '',
    is_active: true,
  });

  // 제출 상세 모달
  const [viewingSubmission, setViewingSubmission] = useState<HomeworkSubmission | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 필터
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>('');

  useEffect(() => {
    loadHomeworks();
    loadAllSubmissions();
  }, [loadHomeworks, loadAllSubmissions]);

  // 숙제 모달 열기
  const handleOpenHomeworkModal = (homework?: Homework) => {
    if (homework) {
      setEditingHomework(homework);
      setHomeworkForm({
        title: homework.title,
        description: homework.description || '',
        attachment_url: homework.attachment_url || '',
        attachment_name: homework.attachment_name || '',
        due_date: homework.due_date.slice(0, 16), // datetime-local 형식
        is_active: homework.is_active,
      });
    } else {
      setEditingHomework(null);
      setHomeworkForm({
        title: '',
        description: '',
        attachment_url: '',
        attachment_name: '',
        due_date: '',
        is_active: true,
      });
    }
    setShowHomeworkModal(true);
  };

  // 숙제 저장
  const handleSaveHomework = async () => {
    if (!homeworkForm.title.trim() || !homeworkForm.due_date) {
      alert('제목과 마감일은 필수입니다.');
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        title: homeworkForm.title,
        description: homeworkForm.description || undefined,
        attachment_url: homeworkForm.attachment_url || undefined,
        attachment_name: homeworkForm.attachment_name || undefined,
        due_date: new Date(homeworkForm.due_date).toISOString(),
        is_active: homeworkForm.is_active,
        created_by: authState?.user_email,
      };

      if (editingHomework) {
        await updateHomework(editingHomework.id, data);
      } else {
        await createHomework(data);
      }

      setShowHomeworkModal(false);
      setEditingHomework(null);
    } catch (error) {
      alert('저장에 실패했습니다: ' + error);
    } finally {
      setIsSaving(false);
    }
  };

  // 숙제 삭제
  const handleDeleteHomework = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? 관련 제출물도 모두 삭제됩니다.')) return;

    try {
      await deleteHomework(id);
    } catch (error) {
      alert('삭제에 실패했습니다: ' + error);
    }
  };

  // 제출 상세 보기
  const handleViewSubmission = (submission: HomeworkSubmission) => {
    setViewingSubmission(submission);
    setFeedbackText(submission.feedback || '');
  };

  // 피드백 저장
  const handleSaveFeedback = async () => {
    if (!viewingSubmission) return;

    setIsSaving(true);
    try {
      await reviewSubmission(viewingSubmission.id, feedbackText);
      await loadAllSubmissions();
      setViewingSubmission(null);
    } catch (error) {
      alert('피드백 저장에 실패했습니다: ' + error);
    } finally {
      setIsSaving(false);
    }
  };

  // 필터된 제출 목록
  const filteredSubmissions = selectedHomeworkId
    ? submissions.filter((s) => s.homework_id === selectedHomeworkId)
    : submissions;

  // 통계
  const stats = {
    totalHomeworks: homeworks.length,
    activeHomeworks: homeworks.filter((h) => h.is_active).length,
    totalSubmissions: submissions.length,
    reviewedSubmissions: submissions.filter((s) => s.status === 'reviewed').length,
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">숙제 관리</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            <span>숙제 {stats.activeHomeworks}개</span>
            <span>제출 {stats.totalSubmissions}건</span>
            <span>피드백 완료 {stats.reviewedSubmissions}건</span>
          </div>
        </div>
        <button
          onClick={() => handleOpenHomeworkModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          새 숙제
        </button>
      </div>

      {/* 탭 */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setActiveTab('homeworks')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors ${
            activeTab === 'homeworks'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            숙제 목록
          </div>
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors ${
            activeTab === 'submissions'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            제출 현황
            {stats.totalSubmissions - stats.reviewedSubmissions > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                {stats.totalSubmissions - stats.reviewedSubmissions}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* 숙제 목록 탭 */}
      {activeTab === 'homeworks' && (
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : homeworks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <BookOpen className="w-16 h-16 mb-4 text-gray-300" />
              <p>등록된 숙제가 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">제목</th>
                    <th className="px-4 py-3 font-medium text-gray-600">마감일</th>
                    <th className="px-4 py-3 font-medium text-gray-600">상태</th>
                    <th className="px-4 py-3 font-medium text-gray-600">제출</th>
                    <th className="px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {homeworks.map((homework) => {
                    const submissionCount = submissions.filter(
                      (s) => s.homework_id === homework.id
                    ).length;
                    const isOverdue = new Date(homework.due_date) < new Date();

                    return (
                      <tr key={homework.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-gray-900">{homework.title}</div>
                            {homework.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {homework.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                            <Clock className="w-4 h-4" />
                            {new Date(homework.due_date).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              homework.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {homework.is_active ? '활성' : '비활성'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-600">{submissionCount}건</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenHomeworkModal(homework)}
                              className="p-1 hover:bg-gray-100 rounded text-gray-500"
                              title="수정"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteHomework(homework.id)}
                              className="p-1 hover:bg-gray-100 rounded text-red-500"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 제출 현황 탭 */}
      {activeTab === 'submissions' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 필터 */}
          <div className="mb-4">
            <select
              value={selectedHomeworkId}
              onChange={(e) => setSelectedHomeworkId(e.target.value)}
              className="input-field w-64"
            >
              <option value="">전체 숙제</option>
              {homeworks.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
          </div>

          {/* 제출 목록 */}
          <div className="flex-1 overflow-auto bg-white rounded-lg border border-gray-200">
            {filteredSubmissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Users className="w-16 h-16 mb-4 text-gray-300" />
                <p>제출된 숙제가 없습니다</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">제출자</th>
                    <th className="px-4 py-3 font-medium text-gray-600">숙제</th>
                    <th className="px-4 py-3 font-medium text-gray-600">제출일</th>
                    <th className="px-4 py-3 font-medium text-gray-600">상태</th>
                    <th className="px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredSubmissions.map((submission) => (
                    <tr key={submission.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{submission.user_email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-600">{submission.homework_title}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-600">
                          {new Date(submission.submitted_at).toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 w-fit ${
                            submission.status === 'reviewed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {submission.status === 'reviewed' ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              피드백 완료
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              대기중
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewSubmission(submission)}
                          className="btn-secondary flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          {submission.status === 'reviewed' ? '보기' : '피드백'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 숙제 생성/수정 모달 */}
      {showHomeworkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingHomework ? '숙제 수정' : '새 숙제'}
              </h2>
              <button
                onClick={() => setShowHomeworkModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  제목 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={homeworkForm.title}
                  onChange={(e) =>
                    setHomeworkForm({ ...homeworkForm, title: e.target.value })
                  }
                  className="input-field"
                  placeholder="숙제 제목"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설명
                </label>
                <textarea
                  value={homeworkForm.description}
                  onChange={(e) =>
                    setHomeworkForm({ ...homeworkForm, description: e.target.value })
                  }
                  className="input-field min-h-[100px] resize-none"
                  placeholder="숙제 설명 및 요구사항"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    첨부파일 URL
                  </label>
                  <input
                    type="url"
                    value={homeworkForm.attachment_url}
                    onChange={(e) =>
                      setHomeworkForm({ ...homeworkForm, attachment_url: e.target.value })
                    }
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    파일명
                  </label>
                  <input
                    type="text"
                    value={homeworkForm.attachment_name}
                    onChange={(e) =>
                      setHomeworkForm({ ...homeworkForm, attachment_name: e.target.value })
                    }
                    className="input-field"
                    placeholder="파일명.pdf"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  마감일 <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={homeworkForm.due_date}
                  onChange={(e) =>
                    setHomeworkForm({ ...homeworkForm, due_date: e.target.value })
                  }
                  className="input-field"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={homeworkForm.is_active}
                  onChange={(e) =>
                    setHomeworkForm({ ...homeworkForm, is_active: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  활성화 (체크 해제 시 학생에게 표시되지 않음)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setShowHomeworkModal(false)}
                className="btn-secondary"
              >
                취소
              </button>
              <button
                onClick={handleSaveHomework}
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  '저장'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 제출 상세/피드백 모달 */}
      {viewingSubmission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">{viewingSubmission.homework_title}</h2>
                <p className="text-sm text-gray-500">{viewingSubmission.user_email}</p>
              </div>
              <button
                onClick={() => setViewingSubmission(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">제출 답변</h3>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{viewingSubmission.answer}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  피드백 작성
                </h3>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="input-field min-h-[150px] resize-none"
                  placeholder="피드백을 입력하세요..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setViewingSubmission(null)}
                className="btn-secondary"
              >
                취소
              </button>
              <button
                onClick={handleSaveFeedback}
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    피드백 저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
