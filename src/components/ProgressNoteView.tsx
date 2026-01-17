import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Save, Edit, Trash2, Loader2, Check, Cloud, AlertCircle } from 'lucide-react';
import { getDb, saveDb, generateUUID, queryToObjects, softDelete } from '../lib/localDb';
import type { ProgressNote } from '../types';

type SaveStatus = 'idle' | 'changed' | 'saving' | 'saved' | 'error';

interface Props {
  patientId: string;
  patientName: string;
  onClose: () => void;
  forceNew?: boolean;
}

export function ProgressNoteView({ patientId, patientName, onClose, forceNew = false }: Props) {
  const [notes, setNotes] = useState<ProgressNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<ProgressNote | null>(null);
  const [showForm, setShowForm] = useState(forceNew);
  const [editingNote, setEditingNote] = useState<ProgressNote | null>(null);
  const [loading, setLoading] = useState(!forceNew);
  const [formData, setFormData] = useState<Partial<ProgressNote>>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    follow_up_plan: '',
    notes: ''
  });

  // 자동 저장 관련
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef = useRef(true);
  const AUTO_SAVE_DELAY = 3000; // 3초

  useEffect(() => {
    if (forceNew) {
      const today = new Date().toISOString().split('T')[0];
      setFormData(prev => ({
        ...prev,
        patient_id: patientId,
        note_date: today
      }));
      setShowForm(true);
      setLoading(false);
    } else {
      loadNotes();
    }
  }, [patientId, forceNew]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const db = getDb();
      if (!db) {
        setLoading(false);
        return;
      }

      const data = queryToObjects<ProgressNote>(
        db,
        'SELECT * FROM progress_notes WHERE patient_id = ? AND deleted_at IS NULL ORDER BY note_date DESC',
        [patientId]
      );

      setNotes(data);
    } catch (error) {
      console.error('경과기록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 내용이 있는지 확인
  const hasContent = () => {
    return (
      (formData.subjective && formData.subjective.trim() !== '') ||
      (formData.objective && formData.objective.trim() !== '') ||
      (formData.assessment && formData.assessment.trim() !== '') ||
      (formData.plan && formData.plan.trim() !== '') ||
      (formData.follow_up_plan && formData.follow_up_plan.trim() !== '') ||
      (formData.notes && formData.notes.trim() !== '')
    );
  };

  // 자동 저장 함수
  const performAutoSave = useCallback(async () => {
    if (!hasContent()) return;

    try {
      setSaveStatus('saving');
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();
      const noteDate = formData.note_date || now.split('T')[0];
      const existingId = editingNote?.id || currentNoteId;

      if (existingId) {
        // 기존 기록 업데이트
        db.run(
          `UPDATE progress_notes SET note_date = ?, subjective = ?, objective = ?, assessment = ?, plan = ?, follow_up_plan = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [
            noteDate,
            formData.subjective || null,
            formData.objective || null,
            formData.assessment || null,
            formData.plan || null,
            formData.follow_up_plan || null,
            formData.notes || null,
            now,
            existingId
          ]
        );
      } else {
        // 새 기록 생성
        const newId = generateUUID();
        db.run(
          `INSERT INTO progress_notes (id, patient_id, note_date, subjective, objective, assessment, plan, follow_up_plan, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId,
            patientId,
            noteDate,
            formData.subjective || null,
            formData.objective || null,
            formData.assessment || null,
            formData.plan || null,
            formData.follow_up_plan || null,
            formData.notes || null,
            now,
            now
          ]
        );
        setCurrentNoteId(newId);
      }

      saveDb();
      setSaveStatus('saved');

      // 3초 후 상태를 idle로 변경
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error: any) {
      console.error('자동 저장 실패:', error);
      setSaveStatus('error');
    }
  }, [formData, editingNote, currentNoteId, patientId]);

  // formData 변경 시 자동 저장 타이머 설정
  useEffect(() => {
    // 첫 렌더링 시에는 무시
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    // 폼이 표시되지 않으면 무시
    if (!showForm) return;

    // 내용이 없으면 무시
    if (!hasContent()) return;

    // 상태를 "변경됨"으로 설정
    setSaveStatus('changed');

    // 기존 타이머 취소
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 새 타이머 설정
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, AUTO_SAVE_DELAY);

    // 클린업
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, showForm, performAutoSave]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // 저장 상태 표시 컴포넌트
  const SaveStatusIndicator = () => {
    switch (saveStatus) {
      case 'changed':
        return (
          <span className="flex items-center gap-1 text-amber-600 text-sm">
            <Cloud className="w-4 h-4" />
            변경됨
          </span>
        );
      case 'saving':
        return (
          <span className="flex items-center gap-1 text-blue-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            저장 중...
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <Check className="w-4 h-4" />
            자동 저장됨
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            저장 실패
          </span>
        );
      default:
        return null;
    }
  };

  const handleSave = async () => {
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();
      const noteDate = formData.note_date || now.split('T')[0];
      const existingId = editingNote?.id || currentNoteId;

      if (existingId) {
        // 기존 기록 업데이트
        db.run(
          `UPDATE progress_notes SET note_date = ?, subjective = ?, objective = ?, assessment = ?, plan = ?, follow_up_plan = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [
            noteDate,
            formData.subjective || null,
            formData.objective || null,
            formData.assessment || null,
            formData.plan || null,
            formData.follow_up_plan || null,
            formData.notes || null,
            now,
            existingId
          ]
        );
        saveDb();
        alert('경과기록이 저장되었습니다');
      } else {
        // 새 기록 생성
        const id = generateUUID();
        db.run(
          `INSERT INTO progress_notes (id, patient_id, note_date, subjective, objective, assessment, plan, follow_up_plan, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            patientId,
            noteDate,
            formData.subjective || null,
            formData.objective || null,
            formData.assessment || null,
            formData.plan || null,
            formData.follow_up_plan || null,
            formData.notes || null,
            now,
            now
          ]
        );
        saveDb();
        alert('경과기록이 추가되었습니다');
      }

      setShowForm(false);
      setEditingNote(null);
      setCurrentNoteId(null);
      setSaveStatus('idle');
      resetForm();
      loadNotes();
    } catch (error: any) {
      console.error('저장 실패:', error);
      alert('저장에 실패했습니다: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 경과기록을 삭제하시겠습니까?')) return;

    try {
      const success = softDelete('progress_notes', id);
      if (!success) throw new Error('삭제에 실패했습니다.');

      alert('경과기록이 휴지통으로 이동되었습니다');
      setSelectedNote(null);
      loadNotes();
    } catch (error: any) {
      console.error('삭제 실패:', error);
      alert('삭제에 실패했습니다: ' + error.message);
    }
  };

  const handleEdit = (note: ProgressNote) => {
    setEditingNote(note);
    setFormData(note);
    setShowForm(true);
    setSelectedNote(null);
  };

  const resetForm = () => {
    setFormData({
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      follow_up_plan: '',
      notes: ''
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-white border-b p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">경과기록 (SOAP Notes) - {patientName}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                resetForm();
                setEditingNote(null);
                setCurrentNoteId(null);
                setSaveStatus('idle');
                setShowForm(!showForm);
              }}
              className="btn-primary flex items-center gap-2"
            >
              {showForm ? (
                <>
                  <X className="w-4 h-4" />
                  취소
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  경과기록 추가
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="btn-secondary flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              닫기
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {showForm && (
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">{editingNote ? '경과기록 수정' : '경과기록 추가'}</h3>
                <div className="bg-white px-3 py-1 rounded border">
                  <SaveStatusIndicator />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">진료일자</label>
                  <input
                    type="date"
                    value={formData.note_date ? formData.note_date.split('T')[0] : new Date().toISOString().split('T')[0]}
                    onChange={(e) => setFormData({ ...formData, note_date: e.target.value })}
                    className="input-field w-auto"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-semibold text-slate-600">S (Subjective) - 주관적 증상</label>
                  <textarea
                    value={formData.subjective || ''}
                    onChange={(e) => setFormData({ ...formData, subjective: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="환자가 호소하는 증상, 느낌 등"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-semibold text-slate-600">O (Objective) - 객관적 소견</label>
                  <textarea
                    value={formData.objective || ''}
                    onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="바이탈 사인, 검사 결과, 신체 검진 소견 등"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-semibold text-slate-600">A (Assessment) - 평가</label>
                  <textarea
                    value={formData.assessment || ''}
                    onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="진단, 상태 평가, 문제 목록 등"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-semibold text-slate-600">P (Plan) - 계획</label>
                  <textarea
                    value={formData.plan || ''}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="치료 계획, 처방, 추가 검사 등"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-semibold text-gray-700">추적 계획</label>
                  <textarea
                    value={formData.follow_up_plan || ''}
                    onChange={(e) => setFormData({ ...formData, follow_up_plan: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="다음 방문 일정, 모니터링 사항 등"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleSave} className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  저장
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingNote(null);
                    setCurrentNoteId(null);
                    setSaveStatus('idle');
                    resetForm();
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  취소
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {/* 왼쪽: 경과기록 목록 */}
            <div className="col-span-1">
              <h3 className="font-bold mb-2">경과기록 목록 ({notes.length}건)</h3>
              <div className="space-y-2">
                {loading ? (
                  <div className="flex items-center gap-2 p-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                    <p>로딩 중...</p>
                  </div>
                ) : notes.length === 0 ? (
                  <p className="text-gray-500 p-4">경과기록이 없습니다.</p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      onClick={() => setSelectedNote(note)}
                      className={`p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors ${
                        selectedNote?.id === note.id ? 'bg-blue-100 border-blue-500' : 'border-gray-200'
                      }`}
                    >
                      <div className="font-semibold text-gray-900">
                        {new Date(note.note_date).toLocaleDateString('ko-KR')}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {note.doctor_name || '담당의 미지정'}
                      </div>
                      {note.assessment && (
                        <div className="text-xs mt-1 text-gray-700 truncate">
                          {note.assessment.substring(0, 40)}...
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 오른쪽: 선택된 경과기록 상세 */}
            <div className="col-span-2">
              {selectedNote ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">경과기록 상세</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(selectedNote)}
                        className="px-3 py-1 bg-slate-500 text-white text-sm rounded-lg hover:bg-slate-600 flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(selectedNote.id)}
                        className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        삭제
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <strong>작성일:</strong> {new Date(selectedNote.note_date).toLocaleString('ko-KR')}
                    </div>
                    {selectedNote.doctor_name && (
                      <div>
                        <strong>담당의:</strong> {selectedNote.doctor_name}
                      </div>
                    )}

                    <hr />

                    <div>
                      <h4 className="font-semibold text-slate-600 mb-2">S (Subjective) - 주관적 증상</h4>
                      <p className="whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{selectedNote.subjective || '-'}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-600 mb-2">O (Objective) - 객관적 소견</h4>
                      <p className="whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{selectedNote.objective || '-'}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-600 mb-2">A (Assessment) - 평가</h4>
                      <p className="whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{selectedNote.assessment || '-'}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-600 mb-2">P (Plan) - 계획</h4>
                      <p className="whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{selectedNote.plan || '-'}</p>
                    </div>

                    {selectedNote.follow_up_plan && (
                      <div>
                        <h4 className="font-semibold mb-2">추적 계획</h4>
                        <p className="whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{selectedNote.follow_up_plan}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>경과기록을 선택하여 상세 내용을 확인하세요</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressNoteView;
