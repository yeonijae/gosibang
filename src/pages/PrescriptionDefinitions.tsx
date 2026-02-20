import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Loader2, Settings, ChevronUp, ChevronDown, Lock, StickyNote, BookOpen, FileText } from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor';
import { RichContentDisplay } from '../components/RichContentDisplay';
import { uploadImageToStorage } from '../lib/contentUtils';
import { getDb, saveDb, queryToObjects } from '../lib/localDb';
import { SOURCES } from '../lib/prescriptionData';
import { useFeatureStore } from '../store/featureStore';
import { useAuthStore } from '../store/authStore';
import type { PrescriptionNote, PrescriptionCaseStudy, Prescription } from '../types';

interface PrescriptionDefinition {
  id: number;
  name: string;
  alias?: string;
  category?: string;
  source?: string;
  composition: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface PrescriptionCategory {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at?: string;
}

export function PrescriptionDefinitions() {
  const [definitions, setDefinitions] = useState<PrescriptionDefinition[]>([]);
  const [categories, setCategories] = useState<PrescriptionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDef, setSelectedDef] = useState<PrescriptionDefinition | null>(null);
  const [editingDef, setEditingDef] = useState<PrescriptionDefinition | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // 노트 관련 상태
  const [notes, setNotes] = useState<PrescriptionNote[]>([]);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PrescriptionNote | null>(null);

  // 치험례 관련 상태
  const [caseStudies, setCaseStudies] = useState<PrescriptionCaseStudy[]>([]);
  const [linkedPrescriptions, setLinkedPrescriptions] = useState<Prescription[]>([]);
  const [isCaseStudyModalOpen, setIsCaseStudyModalOpen] = useState(false);
  const [editingCaseStudy, setEditingCaseStudy] = useState<PrescriptionCaseStudy | null>(null);
  const [showLinkedPrescriptions, setShowLinkedPrescriptions] = useState(false);

  // 처방정의 수정 권한 체크
  const { hasAccess, planName } = useFeatureStore();
  const canEdit = hasAccess('prescription_definitions_edit');

  // 이미지 업로드 핸들러
  const { authState } = useAuthStore();
  const handleImageUpload = useCallback(async (file: File) => {
    return uploadImageToStorage(file, authState?.user?.id);
  }, [authState?.user?.id]);

  useEffect(() => {
    loadDefinitions();
    loadCategories();
  }, []);

  // 선택된 처방이 변경되면 노트와 치험례 로드
  useEffect(() => {
    if (selectedDef) {
      loadNotes(selectedDef.id);
      loadCaseStudies(selectedDef.id);
      loadLinkedPrescriptions(selectedDef.name);
    } else {
      setNotes([]);
      setCaseStudies([]);
      setLinkedPrescriptions([]);
    }
  }, [selectedDef]);

  const loadDefinitions = async () => {
    try {
      setLoading(true);
      const db = getDb();
      if (!db) return;

      const data = queryToObjects<PrescriptionDefinition>(
        db,
        'SELECT * FROM prescription_definitions ORDER BY name'
      );
      setDefinitions(data);
    } catch (error) {
      console.error('처방 정의 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const db = getDb();
      if (!db) return;

      const data = queryToObjects<PrescriptionCategory>(
        db,
        'SELECT * FROM prescription_categories ORDER BY sort_order, name'
      );
      setCategories(data);
    } catch (error) {
      console.error('카테고리 로드 실패:', error);
    }
  };

  // 노트 로드
  const loadNotes = (prescriptionDefId: number) => {
    try {
      const db = getDb();
      if (!db) return;

      const data = queryToObjects<PrescriptionNote>(
        db,
        'SELECT * FROM prescription_notes WHERE prescription_definition_id = ? ORDER BY created_at DESC',
        [prescriptionDefId]
      );
      setNotes(data);
    } catch (error) {
      console.error('노트 로드 실패:', error);
    }
  };

  // 치험례 로드
  const loadCaseStudies = (prescriptionDefId: number) => {
    try {
      const db = getDb();
      if (!db) return;

      const data = queryToObjects<PrescriptionCaseStudy>(
        db,
        'SELECT * FROM prescription_case_studies WHERE prescription_definition_id = ? ORDER BY created_at DESC',
        [prescriptionDefId]
      );
      setCaseStudies(data);
    } catch (error) {
      console.error('치험례 로드 실패:', error);
    }
  };

  // 연결된 처방 기록 로드
  const loadLinkedPrescriptions = (prescriptionName: string) => {
    try {
      const db = getDb();
      if (!db) return;

      const data = queryToObjects<Prescription>(
        db,
        'SELECT * FROM prescriptions WHERE prescription_name = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20',
        [prescriptionName]
      );
      setLinkedPrescriptions(data);
    } catch (error) {
      console.error('연결 처방 기록 로드 실패:', error);
    }
  };

  // 노트 저장
  const handleSaveNote = async (note: PrescriptionNote) => {
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();

      if (note.id) {
        // 수정
        db.run(
          'UPDATE prescription_notes SET content = ?, updated_at = ? WHERE id = ?',
          [note.content, now, note.id]
        );
      } else {
        // 새로 추가
        db.run(
          'INSERT INTO prescription_notes (prescription_definition_id, content, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [note.prescription_definition_id, note.content, now, now]
        );
      }
      saveDb();
      if (selectedDef) {
        loadNotes(selectedDef.id);
      }
      setIsNoteModalOpen(false);
      setEditingNote(null);
    } catch (error) {
      console.error('노트 저장 실패:', error);
      alert('저장에 실패했습니다.');
    }
  };

  // 노트 삭제
  const handleDeleteNote = async (noteId: number) => {
    if (!confirm('이 노트를 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM prescription_notes WHERE id = ?', [noteId]);
      saveDb();
      if (selectedDef) {
        loadNotes(selectedDef.id);
      }
    } catch (error) {
      console.error('노트 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  // 치험례 저장
  const handleSaveCaseStudy = async (caseStudy: PrescriptionCaseStudy) => {
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();

      if (caseStudy.id) {
        // 수정
        db.run(
          'UPDATE prescription_case_studies SET title = ?, content = ?, updated_at = ? WHERE id = ?',
          [caseStudy.title, caseStudy.content, now, caseStudy.id]
        );
      } else {
        // 새로 추가
        db.run(
          'INSERT INTO prescription_case_studies (prescription_definition_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [caseStudy.prescription_definition_id, caseStudy.title, caseStudy.content, now, now]
        );
      }
      saveDb();
      if (selectedDef) {
        loadCaseStudies(selectedDef.id);
      }
      setIsCaseStudyModalOpen(false);
      setEditingCaseStudy(null);
    } catch (error) {
      console.error('치험례 저장 실패:', error);
      alert('저장에 실패했습니다.');
    }
  };

  // 치험례 삭제
  const handleDeleteCaseStudy = async (caseStudyId: number) => {
    if (!confirm('이 치험례를 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM prescription_case_studies WHERE id = ?', [caseStudyId]);
      saveDb();
      if (selectedDef) {
        loadCaseStudies(selectedDef.id);
      }
    } catch (error) {
      console.error('치험례 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const handleDelete = async (def: PrescriptionDefinition) => {
    if (!confirm(`"${def.name}" 처방을 삭제하시겠습니까?`)) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM prescription_definitions WHERE id = ?', [def.id]);
      saveDb();
      setSelectedDef(null);
      loadDefinitions();
    } catch (error) {
      console.error('처방 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const handleSave = async (def: PrescriptionDefinition) => {
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();

      if (def.id) {
        // 수정
        db.run(
          `UPDATE prescription_definitions SET name = ?, alias = ?, category = ?, source = ?, composition = ?, description = ?, updated_at = ? WHERE id = ?`,
          [def.name, def.alias || null, def.category || null, def.source || null, def.composition, def.description || null, now, def.id]
        );
      } else {
        // 새로 추가
        db.run(
          `INSERT INTO prescription_definitions (name, alias, category, source, composition, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [def.name, def.alias || null, def.category || null, def.source || null, def.composition, def.description || null, now, now]
        );
      }
      saveDb();
      loadDefinitions();
      setIsModalOpen(false);
      setEditingDef(null);
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장에 실패했습니다.');
    }
  };

  // 검색 및 카테고리 필터링
  const filteredDefinitions = useMemo(() => {
    return definitions.filter(def => {
      // 카테고리 필터
      if (selectedCategory !== 'all') {
        const defCategory = def.category || def.source || '기타';
        if (defCategory !== selectedCategory) return false;
      }

      // 검색어 필터
      if (searchTerm) {
        // 공백 또는 쉼표로 분리하여 여러 약재 검색
        const searchTerms = searchTerm
          .split(/[\s,]+/)
          .map(term => term.trim().toLowerCase())
          .filter(term => term.length > 0);

        if (searchTerms.length === 0) return true;

        // 단일 키워드: 처방명, 별명, 구성 모두 검색
        if (searchTerms.length === 1) {
          const search = searchTerms[0];
          return (
            def.name.toLowerCase().includes(search) ||
            (def.alias?.toLowerCase().includes(search)) ||
            def.composition.toLowerCase().includes(search)
          );
        }

        // 여러 키워드: 모든 약재가 구성(composition)에 포함되어야 함
        const compositionLower = def.composition.toLowerCase();
        return searchTerms.every(term => compositionLower.includes(term));
      }
      return true;
    });
  }, [definitions, selectedCategory, searchTerm]);

  // 카테고리별 통계
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = { all: definitions.length };

    // 카테고리와 출전 모두 통계에 포함
    definitions.forEach(def => {
      const cat = def.category || def.source || '기타';
      stats[cat] = (stats[cat] || 0) + 1;
    });

    return stats;
  }, [definitions]);

  // 데이터에서 추출한 추가 카테고리 (DB 카테고리에 없는 것들)
  const extraCategories = useMemo(() => {
    const dbCategoryNames = new Set(categories.map(c => c.name));
    const extra = new Set<string>();
    definitions.forEach(def => {
      if (def.category && !dbCategoryNames.has(def.category)) {
        extra.add(def.category);
      }
      if (def.source && !dbCategoryNames.has(def.source)) {
        extra.add(def.source);
      }
    });
    return Array.from(extra).sort();
  }, [definitions, categories]);

  // 구성 파싱
  const parseComposition = (composition: string) => {
    if (!composition) return [];
    // 합방 처리 (소시호탕/오령산 형태)
    if (!composition.includes(':')) {
      return composition.split('/').map(name => ({ name: name.trim(), dosage: '' }));
    }
    return composition.split('/').map(item => {
      const [name, dosage] = item.split(':');
      return { name: name?.trim(), dosage: dosage?.trim() };
    }).filter(item => item.name);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">처방 공부</h1>
          <p className="text-sm text-gray-500 mt-1">등록된 처방 템플릿 {definitions.length}개</p>
        </div>
        {canEdit ? (
          <button
            onClick={() => {
              setEditingDef({ id: 0, name: '', composition: '' });
              setIsModalOpen(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            처방 추가
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Lock className="w-4 h-4" />
            <span>{planName} 플랜은 처방 추가/수정 불가</span>
          </div>
        )}
      </div>

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="처방명, 별명, 구성 약재로 검색..."
          className="input-field !pl-11"
        />
      </div>

      {/* 3-컬럼 레이아웃 */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* 왼쪽: 카테고리 사이드바 */}
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-700">카테고리</h3>
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="카테고리 관리"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              전체 ({categoryStats.all || 0})
            </button>

            {/* DB 카테고리 */}
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.name)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                  selectedCategory === cat.name
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-xs text-gray-400">
                  {categoryStats[cat.name] || 0}
                </span>
              </button>
            ))}

            {/* 추가 카테고리 (DB에 없는 것들) */}
            {extraCategories.length > 0 && (
              <>
                <div className="border-t border-gray-200 my-2" />
                <div className="px-3 py-1 text-xs text-gray-400">기타</div>
                {extraCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedCategory === cat
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {cat} ({categoryStats[cat] || 0})
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 중간: 처방 목록 */}
        <div className="col-span-4 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-sm text-gray-700">
              처방 목록 ({filteredDefinitions.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredDefinitions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchTerm ? '검색 결과가 없습니다.' : '등록된 처방이 없습니다.'}
              </div>
            ) : (
              filteredDefinitions.map((def) => (
                <div
                  key={def.id}
                  onClick={() => setSelectedDef(def)}
                  className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedDef?.id === def.id ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{def.name}</div>
                  {def.alias && (
                    <div className="text-xs text-gray-500 mt-0.5">별명: {def.alias}</div>
                  )}
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {def.category && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        {def.category}
                      </span>
                    )}
                    {def.source && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {def.source}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 오른쪽: 처방 상세 */}
        <div className="col-span-6 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-700">처방 상세</h3>
            {selectedDef && canEdit && (
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingDef(selectedDef);
                    setIsModalOpen(true);
                  }}
                  className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                  title="수정"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(selectedDef)}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selectedDef ? (
              <div className="space-y-4">
                {/* 기본 정보 */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedDef.name}</h2>
                  {selectedDef.alias && (
                    <p className="text-sm text-gray-500">별명: {selectedDef.alias}</p>
                  )}
                </div>

                {/* 카테고리/출전 */}
                <div className="flex gap-2 flex-wrap">
                  {selectedDef.category && (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">
                      {selectedDef.category}
                    </span>
                  )}
                  {selectedDef.source && (
                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm">
                      출전: {selectedDef.source}
                    </span>
                  )}
                </div>

                {/* 구성 */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">구성</h3>
                  <div className="flex flex-wrap gap-2">
                    {parseComposition(selectedDef.composition).map((herb, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm"
                      >
                        <span className="font-medium">{herb.name}</span>
                        {herb.dosage && (
                          <span className="ml-1 text-green-600">{herb.dosage}g</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 원본 구성 문자열 */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">구성 문자열</h3>
                  <code className="block bg-gray-100 p-3 rounded-lg text-sm font-mono text-gray-700 break-all">
                    {selectedDef.composition}
                  </code>
                </div>

                {/* 설명 */}
                {selectedDef.description && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">설명</h3>
                    <p className="text-gray-600 whitespace-pre-wrap">{selectedDef.description}</p>
                  </div>
                )}

                {/* 나의 노트 */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                      <StickyNote className="w-4 h-4" />
                      나의 노트
                    </h3>
                    <button
                      onClick={() => {
                        setEditingNote({
                          id: 0,
                          prescription_definition_id: selectedDef.id,
                          content: '',
                          created_at: '',
                          updated_at: '',
                        });
                        setIsNoteModalOpen(true);
                      }}
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      노트 추가
                    </button>
                  </div>

                  {notes.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg">
                      <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">아직 노트가 없습니다.</p>
                      <p className="text-xs mt-1">나만의 공부 메모를 추가해보세요!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <RichContentDisplay content={note.content} className="text-gray-700" userId={authState?.user?.id} />
                              <p className="text-xs text-gray-400 mt-2">
                                {new Date(note.created_at).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                                {note.updated_at !== note.created_at && ' (수정됨)'}
                              </p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingNote(note);
                                  setIsNoteModalOpen(true);
                                }}
                                className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                                title="수정"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 치험례 */}
                <div className="border-t border-gray-200 pt-4">
                  {/* 연결된 처방 기록 */}
                  {linkedPrescriptions.length > 0 && (
                    <div className="mb-4">
                      <button
                        onClick={() => setShowLinkedPrescriptions(!showLinkedPrescriptions)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary-600 mb-2"
                      >
                        <FileText className="w-4 h-4" />
                        연결된 처방 기록 ({linkedPrescriptions.length}건)
                        <ChevronDown className={`w-4 h-4 transition-transform ${showLinkedPrescriptions ? 'rotate-180' : ''}`} />
                      </button>
                      {showLinkedPrescriptions && (
                        <div className="space-y-2 pl-6">
                          {linkedPrescriptions.map((prescription) => (
                            <div
                              key={prescription.id}
                              className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-gray-900">
                                    {prescription.patient_name || '익명'}
                                  </span>
                                  {prescription.patient_age && (
                                    <span className="text-gray-500 ml-2">
                                      ({prescription.patient_gender === 'F' ? '여' : '남'}, {prescription.patient_age}세)
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                                    prescription.status === 'issued' ? 'bg-green-100 text-green-700' :
                                    prescription.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {prescription.status === 'issued' ? '발급' : prescription.status === 'completed' ? '완료' : '초안'}
                                  </span>
                                  <span className="text-gray-400">
                                    {new Date(prescription.created_at).toLocaleDateString('ko-KR')}
                                  </span>
                                </div>
                              </div>
                              {prescription.chief_complaint && (
                                <p className="text-gray-500 mt-1 text-xs truncate">
                                  주소증: {prescription.chief_complaint}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 나의 치험례 */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      나의 치험례
                    </h3>
                    <button
                      onClick={() => {
                        setEditingCaseStudy({
                          id: 0,
                          prescription_definition_id: selectedDef.id,
                          title: '',
                          content: '',
                          created_at: '',
                          updated_at: '',
                        });
                        setIsCaseStudyModalOpen(true);
                      }}
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      치험례 추가
                    </button>
                  </div>

                  {caseStudies.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">아직 치험례가 없습니다.</p>
                      <p className="text-xs mt-1">임상 경험을 마크다운으로 기록해보세요!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {caseStudies.map((caseStudy) => (
                        <div
                          key={caseStudy.id}
                          className="bg-blue-50 border border-blue-200 rounded-lg p-3 group"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="font-medium text-gray-900">{caseStudy.title}</h4>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingCaseStudy(caseStudy);
                                  setIsCaseStudyModalOpen(true);
                                }}
                                className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                                title="수정"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCaseStudy(caseStudy.id)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <RichContentDisplay content={caseStudy.content} className="text-gray-700" userId={authState?.user?.id} />
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(caseStudy.created_at).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                            {caseStudy.updated_at !== caseStudy.created_at && ' (수정됨)'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>처방을 선택하여 상세 내용을 확인하세요</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 수정/추가 모달 */}
      {isModalOpen && editingDef && (
        <DefinitionModal
          definition={editingDef}
          categories={categories}
          onSave={handleSave}
          onClose={() => {
            setIsModalOpen(false);
            setEditingDef(null);
          }}
        />
      )}

      {/* 카테고리 관리 모달 */}
      {isCategoryModalOpen && (
        <CategoryManagementModal
          categories={categories}
          onClose={() => setIsCategoryModalOpen(false)}
          onUpdate={loadCategories}
        />
      )}

      {/* 노트 추가/수정 모달 */}
      {isNoteModalOpen && editingNote && (
        <NoteModal
          note={editingNote}
          onSave={handleSaveNote}
          onImageUpload={handleImageUpload}
          userId={authState?.user?.id}
          onClose={() => {
            setIsNoteModalOpen(false);
            setEditingNote(null);
          }}
        />
      )}

      {/* 치험례 추가/수정 모달 */}
      {isCaseStudyModalOpen && editingCaseStudy && (
        <CaseStudyModal
          caseStudy={editingCaseStudy}
          onSave={handleSaveCaseStudy}
          onImageUpload={handleImageUpload}
          userId={authState?.user?.id}
          onClose={() => {
            setIsCaseStudyModalOpen(false);
            setEditingCaseStudy(null);
          }}
        />
      )}
    </div>
  );
}

// 노트 추가/수정 모달
interface NoteModalProps {
  note: PrescriptionNote;
  onSave: (note: PrescriptionNote) => void;
  onImageUpload: (file: File) => Promise<string | null>;
  userId?: string;
  onClose: () => void;
}

function NoteModal({ note, onSave, onImageUpload, userId, onClose }: NoteModalProps) {
  const [content, setContent] = useState(note.content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('내용을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    await onSave({
      ...note,
      content: content.trim(),
    });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-yellow-500" />
            {note.id ? '노트 수정' : '새 노트 추가'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              내용
            </label>
            <div className="flex-1 overflow-auto">
              <RichTextEditor
                content={content}
                onChange={setContent}
                onImageUpload={onImageUpload}
                userId={userId}
                placeholder="공부한 내용, 메모, 팁 등을 기록하세요..."
                minHeight="200px"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 치험례 추가/수정 모달
interface CaseStudyModalProps {
  caseStudy: PrescriptionCaseStudy;
  onSave: (caseStudy: PrescriptionCaseStudy) => void;
  onImageUpload: (file: File) => Promise<string | null>;
  userId?: string;
  onClose: () => void;
}

function CaseStudyModal({ caseStudy, onSave, onImageUpload, userId, onClose }: CaseStudyModalProps) {
  const [title, setTitle] = useState(caseStudy.title);
  const [content, setContent] = useState(caseStudy.content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (!content.trim()) {
      alert('내용을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    await onSave({
      ...caseStudy,
      title: title.trim(),
      content: content.trim(),
    });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            {caseStudy.id ? '치험례 수정' : '새 치험례 추가'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="예: 소시호탕으로 만성 피로 개선 사례"
              autoFocus
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              내용 <span className="text-red-500">*</span>
            </label>
            <div className="flex-1 overflow-auto">
              <RichTextEditor
                content={content}
                onChange={setContent}
                onImageUpload={onImageUpload}
                userId={userId}
                placeholder="환자 정보, 주소증, 치료 경과 등을 기록하세요..."
                minHeight="250px"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 처방 정의 수정/추가 모달
interface DefinitionModalProps {
  definition: PrescriptionDefinition;
  categories: PrescriptionCategory[];
  onSave: (def: PrescriptionDefinition) => void;
  onClose: () => void;
}

function DefinitionModal({ definition, categories, onSave, onClose }: DefinitionModalProps) {
  const [formData, setFormData] = useState<PrescriptionDefinition>(definition);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('처방명을 입력해주세요.');
      return;
    }
    if (!formData.composition.trim()) {
      alert('구성을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {definition.id ? '처방 수정' : '새 처방 추가'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                처방명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
                placeholder="예: 소시호탕"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                별명 (약칭)
              </label>
              <input
                type="text"
                value={formData.alias || ''}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                className="input-field"
                placeholder="예: 소시호"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                카테고리
              </label>
              <select
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input-field"
              >
                <option value="">선택 안함</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                출전
              </label>
              <select
                value={formData.source || ''}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="input-field"
              >
                <option value="">선택 안함</option>
                {SOURCES.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              구성 <span className="text-red-500">*</span>
            </label>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
              <p className="text-xs text-blue-700">
                형식: <code className="bg-blue-100 px-1 rounded">약재명:용량/약재명:용량/...</code>
                <br />
                예: 시호:8/반하:5/황금:4/인삼:4/감초:3/생강:4/대추:4
              </p>
            </div>
            <textarea
              value={formData.composition}
              onChange={(e) => setFormData({ ...formData, composition: e.target.value })}
              className="input-field font-mono"
              rows={3}
              placeholder="시호:8/반하:5/황금:4/인삼:4/감초:3/생강:4/대추:4"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              설명 (선택)
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="처방에 대한 설명..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 카테고리 관리 모달
interface CategoryManagementModalProps {
  categories: PrescriptionCategory[];
  onClose: () => void;
  onUpdate: () => void;
}

function CategoryManagementModal({ categories, onClose, onUpdate }: CategoryManagementModalProps) {
  const [editingCategory, setEditingCategory] = useState<PrescriptionCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
  const [isAdding, setIsAdding] = useState(false);

  const colorPresets = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4',
    '#64748b', '#a855f7', '#10b981', '#f59e0b', '#6366f1',
  ];

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      alert('카테고리명을 입력해주세요.');
      return;
    }

    const db = getDb();
    if (!db) return;

    try {
      const maxOrder = categories.length > 0
        ? Math.max(...categories.map(c => c.sort_order)) + 1
        : 0;

      db.run(
        'INSERT INTO prescription_categories (name, color, sort_order) VALUES (?, ?, ?)',
        [newCategoryName.trim(), newCategoryColor, maxOrder]
      );
      saveDb();
      setNewCategoryName('');
      setNewCategoryColor('#3b82f6');
      setIsAdding(false);
      onUpdate();
    } catch (error) {
      console.error('카테고리 추가 실패:', error);
      alert('카테고리 추가에 실패했습니다. 이미 존재하는 이름일 수 있습니다.');
    }
  };

  const handleUpdateCategory = () => {
    if (!editingCategory) return;
    if (!editingCategory.name.trim()) {
      alert('카테고리명을 입력해주세요.');
      return;
    }

    const db = getDb();
    if (!db) return;

    try {
      db.run(
        'UPDATE prescription_categories SET name = ?, color = ? WHERE id = ?',
        [editingCategory.name.trim(), editingCategory.color, editingCategory.id]
      );
      saveDb();
      setEditingCategory(null);
      onUpdate();
    } catch (error) {
      console.error('카테고리 수정 실패:', error);
      alert('카테고리 수정에 실패했습니다.');
    }
  };

  const handleDeleteCategory = (category: PrescriptionCategory) => {
    if (!confirm(`"${category.name}" 카테고리를 삭제하시겠습니까?\n(처방의 카테고리는 유지됩니다)`)) {
      return;
    }

    const db = getDb();
    if (!db) return;

    try {
      db.run('DELETE FROM prescription_categories WHERE id = ?', [category.id]);
      saveDb();
      onUpdate();
    } catch (error) {
      console.error('카테고리 삭제 실패:', error);
      alert('카테고리 삭제에 실패했습니다.');
    }
  };

  const handleMoveCategory = (category: PrescriptionCategory, direction: 'up' | 'down') => {
    const db = getDb();
    if (!db) return;

    const currentIndex = categories.findIndex(c => c.id === category.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const targetCategory = categories[targetIndex];

    try {
      // 두 카테고리의 sort_order를 교환
      db.run(
        'UPDATE prescription_categories SET sort_order = ? WHERE id = ?',
        [targetCategory.sort_order, category.id]
      );
      db.run(
        'UPDATE prescription_categories SET sort_order = ? WHERE id = ?',
        [category.sort_order, targetCategory.id]
      );
      saveDb();
      onUpdate();
    } catch (error) {
      console.error('순서 변경 실패:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">카테고리 관리</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 카테고리 목록 */}
          <div className="space-y-2">
            {categories.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group"
              >
                {editingCategory?.id === category.id ? (
                  <>
                    <input
                      type="color"
                      value={editingCategory.color}
                      onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      className="flex-1 input-field py-1"
                      autoFocus
                    />
                    <button
                      onClick={handleUpdateCategory}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveCategory(category, 'up')}
                        disabled={index === 0}
                        className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleMoveCategory(category, 'down')}
                        disabled={index === categories.length - 1}
                        className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="flex-1 text-sm font-medium text-gray-700">
                      {category.name}
                    </span>
                    <button
                      onClick={() => setEditingCategory(category)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* 새 카테고리 추가 */}
          {isAdding ? (
            <div className="mt-4 p-3 border border-dashed border-gray-300 rounded-lg space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  카테고리명
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="input-field"
                  placeholder="새 카테고리 이름"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  색상
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {colorPresets.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewCategoryColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        newCategoryColor === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewCategoryName('');
                  }}
                  className="flex-1 btn-secondary text-sm py-1.5"
                >
                  취소
                </button>
                <button
                  onClick={handleAddCategory}
                  className="flex-1 btn-primary text-sm py-1.5"
                >
                  추가
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="mt-4 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              새 카테고리 추가
            </button>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button onClick={onClose} className="w-full btn-secondary">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
