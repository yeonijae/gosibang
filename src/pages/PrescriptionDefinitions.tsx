import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Loader2 } from 'lucide-react';
import { getDb, saveDb, queryToObjects } from '../lib/localDb';
import { CATEGORIES, SOURCES } from '../lib/prescriptionData';

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

export function PrescriptionDefinitions() {
  const [definitions, setDefinitions] = useState<PrescriptionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDef, setSelectedDef] = useState<PrescriptionDefinition | null>(null);
  const [editingDef, setEditingDef] = useState<PrescriptionDefinition | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadDefinitions();
  }, []);

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
        const search = searchTerm.toLowerCase();
        return (
          def.name.toLowerCase().includes(search) ||
          (def.alias?.toLowerCase().includes(search)) ||
          def.composition.toLowerCase().includes(search)
        );
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

  // 모든 카테고리 목록 (카테고리 + 출전 통합)
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    definitions.forEach(def => {
      if (def.category) cats.add(def.category);
      if (def.source) cats.add(def.source);
    });
    return Array.from(cats).sort();
  }, [definitions]);

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
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">처방 정의</h1>
          <p className="text-sm text-gray-500 mt-1">등록된 처방 템플릿 {definitions.length}개</p>
        </div>
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
      </div>

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="처방명, 별명, 구성 약재로 검색..."
          className="input-field pl-10"
        />
      </div>

      {/* 3-컬럼 레이아웃 */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* 왼쪽: 카테고리 사이드바 */}
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 overflow-y-auto">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-sm text-gray-700">카테고리</h3>
          </div>
          <div className="p-2">
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

            {allCategories.map(cat => (
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
            {selectedDef && (
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
          onSave={handleSave}
          onClose={() => {
            setIsModalOpen(false);
            setEditingDef(null);
          }}
        />
      )}
    </div>
  );
}

// 처방 정의 수정/추가 모달
interface DefinitionModalProps {
  definition: PrescriptionDefinition;
  onSave: (def: PrescriptionDefinition) => void;
  onClose: () => void;
}

function DefinitionModal({ definition, onSave, onClose }: DefinitionModalProps) {
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
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
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
