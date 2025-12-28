import { useEffect, useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, FileText, ClipboardList, Printer, ArrowLeft, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import { getDb, saveDb, generateUUID, queryToObjects } from '../lib/localDb';
import PrescriptionInput, { type PrescriptionData } from '../components/PrescriptionInput';
import InitialChartView from '../components/InitialChartView';
import ProgressNoteView from '../components/ProgressNoteView';
import { SurveySessionModal } from '../components/survey/SurveySessionModal';
import { usePlanLimits } from '../hooks/usePlanLimits';
import type { Patient, Prescription, InitialChart, ProgressNote } from '../types';

export function Patients() {
  const {
    patients,
    selectedPatient,
    isLoading,
    loadPatients,
    selectPatient,
    createPatient,
    updatePatient,
    deletePatient,
  } = usePatientStore();

  const { canAddPatient, refreshUsage, planInfo } = usePlanLimits();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  // 처방 관리 모달
  const [prescriptionPatient, setPrescriptionPatient] = useState<Patient | null>(null);
  // 차트 관리 모달
  const [chartPatient, setChartPatient] = useState<Patient | null>(null);
  // 설문 보내기 모달
  const [surveyPatient, setSurveyPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPatients(searchTerm || undefined);
  };

  const handleCreate = () => {
    const limitCheck = canAddPatient();
    if (!limitCheck.allowed) {
      setLimitWarning(limitCheck.message || '환자 등록 한도에 도달했습니다.');
      return;
    }
    setLimitWarning(null);
    setEditingPatient(null);
    setIsModalOpen(true);
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setIsModalOpen(true);
  };

  const handleDelete = async (patient: Patient) => {
    if (confirm(`${patient.name} 환자를 삭제하시겠습니까?`)) {
      await deletePatient(patient.id);
    }
  };

  const handleSave = async (patient: Patient) => {
    if (editingPatient) {
      await updatePatient(patient);
    } else {
      await createPatient(patient);
      refreshUsage(); // 사용량 갱신
    }
    setIsModalOpen(false);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">환자 관리</h1>
          <p className="text-sm text-gray-500 mt-1">등록된 환자 {patients.length}명</p>
        </div>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          환자 등록
        </button>
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

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="환자 이름으로 검색..."
            className="input-field !pl-11"
          />
        </div>
        <button type="submit" className="btn-secondary">
          검색
        </button>
      </form>

      {/* 환자 목록 */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">로딩 중...</div>
        ) : patients.length > 0 ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">이름</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">생년월일</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">성별</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">연락처</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">특이사항</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr
                    key={patient.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      selectedPatient?.id === patient.id ? 'bg-primary-50' : ''
                    }`}
                    onClick={() => selectPatient(patient)}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {patient.name}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.birth_date || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.gender === 'M' ? '남' : patient.gender === 'F' ? '여' : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.phone || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 max-w-xs truncate">
                      {patient.notes || '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrescriptionPatient(patient);
                          }}
                          className="px-2 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded flex items-center gap-1"
                          title="처방 관리"
                        >
                          <FileText className="w-3 h-3" />
                          처방
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChartPatient(patient);
                          }}
                          className="px-2 py-1 text-xs font-medium text-white bg-slate-600 hover:bg-slate-700 rounded flex items-center gap-1"
                          title="차트 관리"
                        >
                          <ClipboardList className="w-3 h-3" />
                          차트
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSurveyPatient(patient);
                          }}
                          className="px-2 py-1 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded flex items-center gap-1"
                          title="설문 보내기"
                        >
                          <MessageSquare className="w-3 h-3" />
                          설문
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(patient);
                          }}
                          className="p-1 text-gray-400 hover:text-primary-600"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(patient);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
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
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            등록된 환자가 없습니다.
          </div>
        )}
      </div>

      {/* 환자 등록/수정 모달 */}
      {isModalOpen && (
        <PatientModal
          patient={editingPatient}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {/* 환자별 처방 관리 모달 */}
      {prescriptionPatient && (
        <PatientPrescriptionModal
          patient={prescriptionPatient}
          onClose={() => setPrescriptionPatient(null)}
        />
      )}

      {/* 환자별 차트 관리 모달 */}
      {chartPatient && (
        <PatientChartModal
          patient={chartPatient}
          onClose={() => setChartPatient(null)}
        />
      )}

      {/* 설문 보내기 모달 */}
      {surveyPatient && (
        <SurveySessionModal
          patient={surveyPatient}
          onClose={() => setSurveyPatient(null)}
        />
      )}
    </div>
  );
}

interface PatientModalProps {
  patient: Patient | null;
  onSave: (patient: Patient) => Promise<void>;
  onClose: () => void;
}

function PatientModal({ patient, onSave, onClose }: PatientModalProps) {
  const [formData, setFormData] = useState<Partial<Patient>>({
    name: patient?.name || '',
    birth_date: patient?.birth_date || '',
    gender: patient?.gender || undefined,
    phone: patient?.phone || '',
    address: patient?.address || '',
    notes: patient?.notes || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const now = new Date().toISOString();
    const patientData: Patient = {
      id: patient?.id || crypto.randomUUID(),
      name: formData.name || '',
      birth_date: formData.birth_date || undefined,
      gender: formData.gender || undefined,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
      notes: formData.notes || undefined,
      created_at: patient?.created_at || now,
      updated_at: now,
    };

    await onSave(patientData);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {patient ? '환자 정보 수정' : '신규 환자 등록'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                생년월일
              </label>
              <input
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                성별
              </label>
              <select
                value={formData.gender || ''}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | undefined })}
                className="input-field"
              >
                <option value="">선택</option>
                <option value="M">남</option>
                <option value="F">여</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              연락처
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input-field"
              placeholder="010-0000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              주소
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              특이사항
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input-field"
              rows={3}
              placeholder="알레르기, 기저질환 등"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              취소
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 btn-primary">
              {isSubmitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== 환자별 처방 관리 모달 =====
interface PatientPrescriptionModalProps {
  patient: Patient;
  onClose: () => void;
}

function PatientPrescriptionModal({ patient, onClose }: PatientPrescriptionModalProps) {
  const [viewMode, setViewMode] = useState<'list' | 'new' | 'edit'>('list');
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [printTarget, setPrintTarget] = useState<Prescription | null>(null);

  useEffect(() => {
    loadPrescriptions();
  }, [patient.id]);

  const loadPrescriptions = async () => {
    try {
      setLoading(true);
      const db = getDb();
      if (!db) return;

      const data = queryToObjects<Prescription>(
        db,
        'SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY created_at DESC',
        [patient.id]
      );

      const parsed = data.map((p) => ({
        ...p,
        merged_herbs: typeof p.merged_herbs === 'string' ? JSON.parse(p.merged_herbs) : p.merged_herbs || [],
        final_herbs: typeof p.final_herbs === 'string' ? JSON.parse(p.final_herbs) : p.final_herbs || [],
      }));

      setPrescriptions(parsed);
    } catch (error) {
      console.error('처방 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNew = async (data: PrescriptionData) => {
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const id = generateUUID();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO prescriptions (id, patient_id, patient_name, prescription_name, formula, merged_herbs, final_herbs, total_doses, days, doses_per_day, total_packs, pack_volume, water_amount, herb_adjustment, total_dosage, final_total_amount, notes, status, issued_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          patient.id,
          patient.name,
          data.formula, // prescription_name - 처방 수식을 이름으로 사용
          data.formula,
          JSON.stringify(data.mergedHerbs),
          JSON.stringify(data.finalHerbs),
          data.totalDoses,
          data.days,
          data.dosesPerDay,
          data.totalPacks,
          data.packVolume,
          data.waterAmount,
          data.herbAdjustment || null,
          data.totalDosage,
          data.finalTotalAmount,
          data.notes || null,
          'issued',
          now,
          now,
          now,
        ]
      );
      saveDb();

      alert('처방전이 저장되었습니다.');
      setViewMode('list');
      loadPrescriptions();
    } catch (error) {
      console.error('처방 저장 실패:', error);
      alert('처방 저장에 실패했습니다.');
    }
  };

  const handleSaveEdit = async (data: PrescriptionData) => {
    if (!editingPrescription) return;

    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();

      db.run(
        `UPDATE prescriptions SET formula = ?, merged_herbs = ?, final_herbs = ?, total_doses = ?, days = ?, doses_per_day = ?, total_packs = ?, pack_volume = ?, water_amount = ?, herb_adjustment = ?, total_dosage = ?, final_total_amount = ?, notes = ?, updated_at = ? WHERE id = ?`,
        [
          data.formula,
          JSON.stringify(data.mergedHerbs),
          JSON.stringify(data.finalHerbs),
          data.totalDoses,
          data.days,
          data.dosesPerDay,
          data.totalPacks,
          data.packVolume,
          data.waterAmount,
          data.herbAdjustment || null,
          data.totalDosage,
          data.finalTotalAmount,
          data.notes || null,
          now,
          editingPrescription.id,
        ]
      );
      saveDb();

      alert('처방전이 수정되었습니다.');
      setViewMode('list');
      setEditingPrescription(null);
      loadPrescriptions();
    } catch (error) {
      console.error('처방 수정 실패:', error);
      alert('처방 수정에 실패했습니다.');
    }
  };

  const handleDelete = async (prescription: Prescription) => {
    if (!confirm('이 처방전을 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      db.run('DELETE FROM prescriptions WHERE id = ?', [prescription.id]);
      saveDb();

      loadPrescriptions();
    } catch (error) {
      console.error('처방 삭제 실패:', error);
      alert('처방 삭제에 실패했습니다.');
    }
  };

  const handlePrint = (prescription: Prescription) => {
    setPrintTarget(prescription);
    setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 100);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
          <div className="flex items-center gap-3">
            {viewMode !== 'list' && (
              <button
                onClick={() => {
                  setViewMode('list');
                  setEditingPrescription(null);
                }}
                className="p-1 hover:bg-white/20 rounded"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold">
              {patient.name}님의 처방 관리
              {viewMode === 'new' && ' - 새 처방'}
              {viewMode === 'edit' && ' - 처방 수정'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewMode === 'list' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">총 {prescriptions.length}건의 처방</p>
                <button
                  onClick={() => setViewMode('new')}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  새 처방
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : prescriptions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  등록된 처방이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-gray-900">{rx.formula}</span>
                            <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded">
                              {rx.days}일분
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                              {rx.total_packs}팩
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>
                              총 {rx.final_total_amount?.toFixed(1) || 0}g ·
                              1첩 {rx.total_dosage?.toFixed(1) || 0}g ·
                              물 {rx.water_amount || 0}cc
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(rx.created_at).toLocaleDateString('ko-KR')} 처방
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePrint(rx)}
                            className="p-2 text-gray-400 hover:text-slate-600 hover:bg-slate-50 rounded"
                            title="인쇄"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingPrescription(rx);
                              setViewMode('edit');
                            }}
                            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                            title="수정"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rx)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {viewMode === 'new' && (
            <div className="space-y-4">
              <PrescriptionInput
                patientName={patient.name}
                showPatientInput={false}
                onSave={handleSaveNew}
              />
              <button
                onClick={() => setViewMode('list')}
                className="btn-secondary w-full"
              >
                취소
              </button>
            </div>
          )}

          {viewMode === 'edit' && editingPrescription && (
            <div className="space-y-4">
              <PrescriptionInput
                patientName={patient.name}
                showPatientInput={false}
                initialFormula={editingPrescription.formula}
                initialDays={editingPrescription.days}
                initialDosesPerDay={editingPrescription.doses_per_day}
                initialPackVolume={editingPrescription.pack_volume || 100}
                initialNotes={editingPrescription.notes || ''}
                onSave={handleSaveEdit}
              />
              <button
                onClick={() => {
                  setViewMode('list');
                  setEditingPrescription(null);
                }}
                className="btn-secondary w-full"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 인쇄용 영역 */}
      {printTarget && (
        <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8">
          <h1 className="text-2xl font-bold mb-4">처방전</h1>
          <p><strong>환자명:</strong> {patient.name}</p>
          <p><strong>처방:</strong> {printTarget.formula}</p>
          <p><strong>일수:</strong> {printTarget.days}일분</p>
          <p><strong>팩수:</strong> {printTarget.total_packs}팩</p>
          <p><strong>발행일:</strong> {new Date(printTarget.created_at).toLocaleDateString('ko-KR')}</p>
        </div>
      )}
    </div>
  );
}

// ===== 환자별 차트 관리 모달 =====
interface PatientChartModalProps {
  patient: Patient;
  onClose: () => void;
}

function PatientChartModal({ patient, onClose }: PatientChartModalProps) {
  const [activeTab, setActiveTab] = useState<'initial' | 'progress'>('initial');
  const [initialCharts, setInitialCharts] = useState<InitialChart[]>([]);
  const [progressNotes, setProgressNotes] = useState<ProgressNote[]>([]);
  const [loading, setLoading] = useState(true);

  // 초진차트 뷰어
  const [viewingInitialChart, setViewingInitialChart] = useState<InitialChart | null>(null);
  const [creatingInitialChart, setCreatingInitialChart] = useState(false);

  // 경과기록 뷰어
  const [viewingProgressNote, setViewingProgressNote] = useState<ProgressNote | null>(null);
  const [creatingProgressNote, setCreatingProgressNote] = useState(false);

  useEffect(() => {
    loadCharts();
  }, [patient.id]);

  const loadCharts = async () => {
    try {
      setLoading(true);
      const db = getDb();
      if (!db) return;

      const initialData = queryToObjects<InitialChart>(
        db,
        'SELECT * FROM initial_charts WHERE patient_id = ? ORDER BY chart_date DESC',
        [patient.id]
      );
      setInitialCharts(initialData);

      const progressData = queryToObjects<ProgressNote>(
        db,
        'SELECT * FROM progress_notes WHERE patient_id = ? ORDER BY note_date DESC',
        [patient.id]
      );
      setProgressNotes(progressData);
    } catch (error) {
      console.error('차트 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInitialChart = async (chart: InitialChart) => {
    if (!confirm('이 초진차트를 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM initial_charts WHERE id = ?', [chart.id]);
      saveDb();
      loadCharts();
    } catch (error) {
      console.error('초진차트 삭제 실패:', error);
    }
  };

  const handleDeleteProgressNote = async (note: ProgressNote) => {
    if (!confirm('이 경과기록을 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM progress_notes WHERE id = ?', [note.id]);
      saveDb();
      loadCharts();
    } catch (error) {
      console.error('경과기록 삭제 실패:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-slate-600 to-slate-700 text-white">
          <h2 className="text-lg font-semibold">
            {patient.name}님의 차트 관리
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('initial')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'initial'
                ? 'text-slate-600 border-b-2 border-slate-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            초진차트 ({initialCharts.length})
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'progress'
                ? 'text-slate-600 border-b-2 border-slate-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            경과기록 ({progressNotes.length})
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
            </div>
          ) : activeTab === 'initial' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">총 {initialCharts.length}건</p>
                <button
                  onClick={() => setCreatingInitialChart(true)}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  초진차트 작성
                </button>
              </div>

              {initialCharts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  등록된 초진차트가 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {initialCharts.map((chart) => (
                    <div
                      key={chart.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors cursor-pointer"
                      onClick={() => setViewingInitialChart(chart)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(chart.chart_date).toLocaleDateString('ko-KR')} 초진
                          </p>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {chart.notes?.substring(0, 100) || '내용 없음'}
                            {(chart.notes?.length || 0) > 100 && '...'}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInitialChart(chart);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">총 {progressNotes.length}건</p>
                <button
                  onClick={() => setCreatingProgressNote(true)}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  경과기록 작성
                </button>
              </div>

              {progressNotes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  등록된 경과기록이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {progressNotes.map((note) => (
                    <div
                      key={note.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors cursor-pointer"
                      onClick={() => setViewingProgressNote(note)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(note.note_date).toLocaleDateString('ko-KR')} 경과기록
                          </p>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {note.subjective?.substring(0, 100) || note.notes?.substring(0, 100) || '내용 없음'}
                            {((note.subjective?.length || 0) > 100 || (note.notes?.length || 0) > 100) && '...'}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProgressNote(note);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 초진차트 뷰어/작성 */}
      {(viewingInitialChart || creatingInitialChart) && (
        <InitialChartView
          patientId={patient.id}
          patientName={patient.name}
          onClose={() => {
            setViewingInitialChart(null);
            setCreatingInitialChart(false);
            loadCharts();
          }}
          forceNew={creatingInitialChart}
        />
      )}

      {/* 경과기록 뷰어/작성 */}
      {(viewingProgressNote || creatingProgressNote) && (
        <ProgressNoteView
          patientId={patient.id}
          patientName={patient.name}
          onClose={() => {
            setViewingProgressNote(null);
            setCreatingProgressNote(false);
            loadCharts();
          }}
          forceNew={creatingProgressNote}
        />
      )}
    </div>
  );
}
