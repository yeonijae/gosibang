import { useState, useEffect, useMemo } from 'react';
import { Plus, ArrowLeft, Printer, Trash2, Edit, Loader2, AlertCircle, X, Search } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import PrescriptionInput, { type PrescriptionData } from '../components/PrescriptionInput';
import { usePlanLimits } from '../hooks/usePlanLimits';
import type { Prescription } from '../types';
import { printPrescription, type PrintLayoutType } from '../lib/prescriptionPrint';

type ViewMode = 'list' | 'new' | 'edit';

interface PrescriptionDefForSearch {
  name: string;
  alias: string | null;
}

export function Prescriptions() {
  const { canAddPrescription, refreshUsage, planInfo } = usePlanLimits();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [printLayoutModal, setPrintLayoutModal] = useState<Prescription | null>(null);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [prescriptionDefs, setPrescriptionDefs] = useState<PrescriptionDefForSearch[]>([]);

  useEffect(() => {
    loadPrescriptions();
    loadPrescriptionDefs();
  }, []);

  // 처방 정의 로드 (alias 검색용)
  const loadPrescriptionDefs = async () => {
    try {
      const defs = await invoke<PrescriptionDefForSearch[]>('list_prescription_definitions');
      setPrescriptionDefs(defs.map(d => ({ name: d.name, alias: d.alias })));
    } catch (error) {
      console.error('처방 정의 로드 실패:', error);
    }
  };

  const loadPrescriptions = async () => {
    try {
      setLoading(true);
      const data = await invoke<Prescription[]>('list_all_prescriptions');

      // JSON 문자열 파싱
      const parsed = data.map((p: any) => ({
        ...p,
        merged_herbs: typeof p.merged_herbs === 'string' ? JSON.parse(p.merged_herbs) : p.merged_herbs,
        final_herbs: typeof p.final_herbs === 'string' ? JSON.parse(p.final_herbs) : p.final_herbs,
      }));

      setPrescriptions(parsed);
    } catch (error) {
      console.error('처방 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNew = async (data: PrescriptionData) => {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await invoke('create_prescription', {
        prescription: {
          id,
          patient_id: null,
          patient_name: data.patientName || '',
          prescription_name: data.formula,
          chart_number: null,
          patient_age: null,
          patient_gender: null,
          source_type: null,
          source_id: null,
          formula: data.formula,
          merged_herbs: JSON.stringify(data.mergedHerbs),
          final_herbs: JSON.stringify(data.finalHerbs),
          total_doses: data.totalDoses,
          days: data.days,
          doses_per_day: data.dosesPerDay,
          total_packs: data.totalPacks,
          pack_volume: data.packVolume,
          water_amount: data.waterAmount,
          herb_adjustment: data.herbAdjustment || null,
          total_dosage: data.totalDosage,
          final_total_amount: data.finalTotalAmount,
          notes: data.notes || null,
          status: 'issued',
          issued_at: now,
          created_by: null,
          deleted_at: null,
          created_at: now,
          updated_at: now,
        }
      });

      alert('처방전이 저장되었습니다.');
      setViewMode('list');
      loadPrescriptions();
      refreshUsage();
    } catch (error) {
      console.error('처방 저장 실패:', error);
      alert('처방 저장에 실패했습니다.');
    }
  };

  const handleCreatePrescription = () => {
    const limitCheck = canAddPrescription();
    if (!limitCheck.allowed) {
      setLimitWarning(limitCheck.message || '처방전 한도에 도달했습니다.');
      return;
    }
    setLimitWarning(null);
    setViewMode('new');
  };

  const handleSaveEdit = async (data: PrescriptionData) => {
    if (!editingPrescription) return;

    try {
      const now = new Date().toISOString();

      await invoke('update_prescription', {
        prescription: {
          ...editingPrescription,
          patient_name: data.patientName || '',
          prescription_name: data.formula,
          formula: data.formula,
          merged_herbs: JSON.stringify(data.mergedHerbs),
          final_herbs: JSON.stringify(data.finalHerbs),
          total_doses: data.totalDoses,
          days: data.days,
          doses_per_day: data.dosesPerDay,
          total_packs: data.totalPacks,
          pack_volume: data.packVolume,
          water_amount: data.waterAmount,
          herb_adjustment: data.herbAdjustment || null,
          total_dosage: data.totalDosage,
          final_total_amount: data.finalTotalAmount,
          notes: data.notes || null,
          updated_at: now,
        }
      });

      alert('처방전이 수정되었습니다.');
      setViewMode('list');
      setEditingPrescription(null);
      loadPrescriptions();
    } catch (error) {
      console.error('처방 수정 실패:', error);
      alert('처방 수정에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // 삭제할 처방전 정보 조회 (source_type, source_id 확인)
      const prescription = prescriptions.find(p => p.id === id);

      await invoke('soft_delete_prescription', { id });

      // 처방전의 source 차트가 있으면 prescription_issued 상태 초기화
      if (prescription?.source_type && prescription?.source_id) {
        try {
          if (prescription.source_type === 'initial_chart') {
            const chart = await invoke<any>('get_initial_chart', { id: prescription.source_id });
            if (chart) {
              await invoke('update_initial_chart', {
                chart: { ...chart, prescription_issued: false, prescription_issued_at: null }
              });
            }
          } else if (prescription.source_type === 'progress_note') {
            const note = await invoke<any>('get_progress_note', { id: prescription.source_id });
            if (note) {
              await invoke('update_progress_note', {
                note: { ...note, prescription_issued: false, prescription_issued_at: null }
              });
            }
          }
        } catch (e) {
          console.warn('처방상태 초기화 실패:', e);
        }
      }

      alert('처방전이 휴지통으로 이동되었습니다.');
      setDeleteConfirm(null);
      loadPrescriptions();
    } catch (error) {
      console.error('처방 삭제 실패:', error);
      alert('처방 삭제에 실패했습니다.');
    }
  };

  const handlePrint = (prescription: Prescription, layoutType: PrintLayoutType) => {
    printPrescription(prescription, layoutType);
    setPrintLayoutModal(null);
  };

  const startEdit = (prescription: Prescription) => {
    setEditingPrescription(prescription);
    setViewMode('edit');
  };

  const goToList = () => {
    setViewMode('list');
    setEditingPrescription(null);
  };

  // 검색 필터링
  const filteredPrescriptions = useMemo(() => {
    if (!searchTerm.trim()) return prescriptions;

    const searchTerms = searchTerm
      .split(/[\s,]+/)
      .map(term => term.trim().toLowerCase())
      .filter(term => term.length > 0);

    if (searchTerms.length === 0) return prescriptions;

    return prescriptions.filter(p => {
      // 단일 키워드: 환자이름도 검색
      if (searchTerms.length === 1) {
        const term = searchTerms[0];
        // 환자이름 매칭
        if (p.patient_name?.toLowerCase().includes(term)) return true;
      }

      // 처방 검색: 모든 키워드가 formula에 포함되어야 함 (AND)
      const formulaLower = p.formula.toLowerCase();

      // formula를 부분으로 분리 (공백, +, / 등으로)
      const formulaParts = formulaLower.split(/[\s+\/]+/).filter(p => p.length > 0);

      return searchTerms.every(term => {
        // 1. formula에 직접 포함
        if (formulaLower.includes(term)) return true;

        // 2. formula의 각 부분이 검색어에 포함되는지 확인 (역방향)
        // 예: formula="소시호", 검색어="소시호탕" → "소시호탕".includes("소시호") → true
        for (const part of formulaParts) {
          if (term.includes(part) && part.length >= 2) {
            return true;
          }
        }

        // 3. alias가 term을 포함하는 처방의 실제 이름이 formula에 포함
        const matchingByAlias = prescriptionDefs.find(d =>
          d.alias?.toLowerCase().includes(term)
        );
        if (matchingByAlias && formulaLower.includes(matchingByAlias.name.toLowerCase())) {
          return true;
        }

        // 4. name이 term을 포함하는 처방 찾기
        const matchingByName = prescriptionDefs.find(d =>
          d.name.toLowerCase().includes(term)
        );
        if (matchingByName) {
          // alias가 있으면 alias로 검색
          if (matchingByName.alias && formulaLower.includes(matchingByName.alias.toLowerCase())) {
            return true;
          }
          // formula의 부분이 처방명에 포함되는지 확인
          for (const part of formulaParts) {
            if (matchingByName.name.toLowerCase().includes(part) && part.length >= 2) {
              return true;
            }
          }
        }

        return false;
      });
    });
  }, [prescriptions, searchTerm, prescriptionDefs]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">처방 관리</h1>
          <p className="text-sm text-gray-500 mt-1">발급된 처방 {prescriptions.length}개</p>
        </div>
        {viewMode === 'list' ? (
          <button
            onClick={handleCreatePrescription}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            새 처방 작성
          </button>
        ) : (
          <button
            onClick={goToList}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            목록으로
          </button>
        )}
      </div>

      {/* 플랜 제한 경고 */}
      {limitWarning && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-amber-700">{limitWarning}</p>
            <p className="text-sm text-amber-600 mt-1">
              현재 플랜: <strong>{planInfo.name}</strong>
            </p>
          </div>
          <button
            onClick={() => setLimitWarning(null)}
            className="text-amber-600 hover:text-amber-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 검색창 */}
      {viewMode === 'list' && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="환자명 또는 처방으로 검색... (여러 처방: 백인 소시호 육미)"
            className="input-field !pl-11"
          />
        </div>
      )}

      {/* 컨텐츠 */}
      <div className="flex-1 min-h-0">
        {viewMode === 'list' ? (
          <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
                  <p>처방 목록을 불러오는 중...</p>
                </div>
              </div>
            ) : prescriptions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-lg mb-4">발급된 처방전이 없습니다</p>
                  <button
                    onClick={handleCreatePrescription}
                    className="btn-primary"
                  >
                    첫 처방 작성하기
                  </button>
                </div>
              </div>
            ) : filteredPrescriptions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-lg">검색 결과가 없습니다</p>
                  <p className="text-sm mt-2">다른 검색어로 시도해보세요</p>
                </div>
              </div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">발급일</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">환자명</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">처방공식</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">첩수</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">복용</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">총량</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredPrescriptions.map((prescription) => (
                      <tr key={prescription.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {prescription.issued_at ? formatDate(prescription.issued_at) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {prescription.patient_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                          {prescription.formula.length > 30
                            ? prescription.formula.substring(0, 30) + '...'
                            : prescription.formula}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">
                          {prescription.total_doses}첩
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">
                          {prescription.days}일 x {prescription.doses_per_day}팩
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-primary-600">
                          {Math.round(prescription.final_total_amount)}g
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => startEdit(prescription)}
                              className="p-2 text-slate-600 hover:bg-slate-50 rounded transition-colors"
                              title="수정"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPrintLayoutModal(prescription)}
                              className="p-2 text-slate-600 hover:bg-slate-50 rounded transition-colors"
                              title="인쇄"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(prescription.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : viewMode === 'new' ? (
          <PrescriptionInput
            onSave={handleSaveNew}
            showPatientInput={true}
            showNotesInput={true}
            showSaveButton={true}
            saveButtonText="처방전 발급"
          />
        ) : viewMode === 'edit' && editingPrescription ? (
          <PrescriptionInput
            onSave={handleSaveEdit}
            showPatientInput={true}
            showNotesInput={true}
            showSaveButton={true}
            saveButtonText="처방전 수정"
            patientName={editingPrescription.patient_name}
            initialFormula={editingPrescription.formula}
            initialNotes={editingPrescription.notes || ''}
            initialTotalDoses={editingPrescription.total_doses}
            initialDays={editingPrescription.days}
            initialDosesPerDay={editingPrescription.doses_per_day}
          />
        ) : null}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">처방전 삭제</h3>
            <p className="text-gray-600 mb-6">
              이 처방전을 삭제하시겠습니까?<br/>
              삭제된 처방전은 복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 btn-secondary"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인쇄 레이아웃 선택 모달 */}
      {printLayoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">인쇄 레이아웃 선택</h3>
            <p className="text-gray-500 mb-4 text-sm">
              {printLayoutModal.patient_name || '환자'} - {printLayoutModal.formula}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handlePrint(printLayoutModal, 'landscape')}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-600 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="font-semibold text-gray-900">A4 가로형</div>
                <div className="text-xs text-gray-500">6열 그리드, 넓은 레이아웃</div>
              </button>
              <button
                onClick={() => handlePrint(printLayoutModal, 'portrait1')}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-600 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="font-semibold text-gray-900">A4 세로형 1</div>
                <div className="text-xs text-gray-500">4열 그리드, 정리된 레이아웃</div>
              </button>
              <button
                onClick={() => handlePrint(printLayoutModal, 'portrait2')}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-600 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="font-semibold text-gray-900">A4 세로형 2</div>
                <div className="text-xs text-gray-500">심플 테이블, 처방공식 포함</div>
              </button>
            </div>
            <button
              onClick={() => setPrintLayoutModal(null)}
              className="w-full mt-4 btn-secondary"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
