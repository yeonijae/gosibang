/**
 * 웹 클라이언트 환자 관리 페이지
 * 메인 gosibang 앱과 동일한 UI/UX
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Edit2, Trash2, X, ClipboardList, Loader2, ExternalLink
} from 'lucide-react';
import {
  listPatients, createPatient, updatePatient, deletePatient,
  getInitialChartsByPatient, createInitialChart, deleteInitialChart
} from '../lib/webApiClient';
import { useWebAuthStore, hasPermission } from '../store/webAuthStore';
import type { Patient, InitialChart } from '../types';

// UUID 생성 함수 (브라우저 호환성)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function WebPatients() {
  const navigate = useNavigate();
  const { user } = useWebAuthStore();
  const canWrite = hasPermission(user, 'patients_write');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // 환자 등록/수정 모달
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  // 차트 관리 모달
  const [chartPatient, setChartPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listPatients();
      setPatients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '환자 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const filteredPatients = patients.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.phone?.includes(term) ||
      p.chart_number?.toLowerCase().includes(term)
    );
  });

  const handleCreate = () => {
    setEditingPatient(null);
    setIsModalOpen(true);
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setIsModalOpen(true);
  };

  const handleDelete = async (patient: Patient) => {
    if (!confirm(`${patient.name} 환자를 삭제하시겠습니까?`)) return;

    try {
      await deletePatient(patient.id);
      loadPatients();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const handleSave = async (patient: Patient) => {
    try {
      if (editingPatient) {
        await updatePatient(patient.id, patient);
      } else {
        await createPatient(patient as Omit<Patient, 'id' | 'created_at' | 'updated_at'>);
      }
      setIsModalOpen(false);
      loadPatients();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">환자 관리</h1>
          <p className="text-sm text-gray-500 mt-1">등록된 환자 {patients.length}명</p>
        </div>
        {canWrite && (
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            환자 등록
          </button>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <div className="flex-1">
            <p className="text-red-700">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
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
            placeholder="환자 이름, 차트번호, 연락처로 검색..."
            className="input w-full pl-11"
          />
        </div>
        <button type="submit" className="btn-secondary">
          검색
        </button>
      </form>

      {/* 환자 목록 */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : patients.length > 0 ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">차트번호</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">이름</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">생년월일</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">성별</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">연락처</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">특이사항</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      selectedPatient?.id === patient.id ? 'bg-primary-50' : ''
                    }`}
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.chart_number || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {patient.name}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {patient.birth_date ? patient.birth_date.replace(/-/g, '/') : '-'}
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
                            setChartPatient(patient);
                          }}
                          className="px-2 py-1 text-xs font-medium text-white bg-slate-600 hover:bg-slate-700 rounded flex items-center gap-1"
                          title="차트 관리"
                        >
                          <ClipboardList className="w-3 h-3" />
                          차트
                        </button>
                        {canWrite && (
                          <>
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
                          </>
                        )}
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

      {/* 환자별 차트 관리 모달 */}
      {chartPatient && (
        <PatientChartModal
          patient={chartPatient}
          onClose={() => setChartPatient(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ===== 환자 등록/수정 모달 =====
interface PatientModalProps {
  patient: Patient | null;
  onSave: (patient: Patient) => Promise<void>;
  onClose: () => void;
}

function PatientModal({ patient, onSave, onClose }: PatientModalProps) {
  const [formData, setFormData] = useState<Partial<Patient>>({
    name: patient?.name || '',
    chart_number: patient?.chart_number || '',
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
      id: patient?.id || generateUUID(),
      name: formData.name || '',
      chart_number: formData.chart_number || undefined,
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                차트번호
              </label>
              <input
                type="text"
                value={formData.chart_number}
                onChange={(e) => setFormData({ ...formData, chart_number: e.target.value })}
                className="input w-full"
                placeholder="예: 00001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                생년월일
              </label>
              <input
                type="text"
                placeholder="YYYY/MM/DD"
                value={formData.birth_date?.replace(/-/g, '/') || ''}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^0-9/]/g, '');
                  // 자동으로 / 삽입
                  if (value.length === 4 && !value.includes('/')) {
                    value = value + '/';
                  } else if (value.length === 7 && value.split('/').length === 2) {
                    value = value + '/';
                  }
                  // 최대 10자 (YYYY/MM/DD)
                  if (value.length <= 10) {
                    // 저장 시 YYYY-MM-DD 형식으로 변환
                    setFormData({ ...formData, birth_date: value.replace(/\//g, '-') });
                  }
                }}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                성별
              </label>
              <select
                value={formData.gender || ''}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | undefined })}
                className="input w-full"
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
              className="input w-full"
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
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              특이사항
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input w-full"
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

// ===== 환자별 차트 관리 모달 =====
interface PatientChartModalProps {
  patient: Patient;
  onClose: () => void;
  navigate: (path: string, options?: { state?: object }) => void;
}

function PatientChartModal({ patient, onClose, navigate }: PatientChartModalProps) {
  const { user } = useWebAuthStore();
  const canWrite = hasPermission(user, 'charts_write');

  const [initialCharts, setInitialCharts] = useState<InitialChart[]>([]);
  const [loading, setLoading] = useState(true);

  // 초진차트 작성 모달
  const [creatingInitialChart, setCreatingInitialChart] = useState(false);
  const [newChartDate, setNewChartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newChartNotes, setNewChartNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadCharts();
  }, [patient.id]);

  const loadCharts = async () => {
    try {
      setLoading(true);
      const data = await getInitialChartsByPatient(patient.id);
      setInitialCharts(data);
    } catch (error) {
      console.error('차트 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInitialChart = async (chart: InitialChart) => {
    if (!confirm('이 초진차트를 삭제하시겠습니까?')) return;

    try {
      await deleteInitialChart(chart.id);
      alert('초진차트가 삭제되었습니다.');
      loadCharts();
    } catch (error) {
      console.error('초진차트 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const handleChartClick = (chart: InitialChart) => {
    // 모달 닫고 차트관리 페이지로 이동
    onClose();
    navigate('/app/charts', { state: { selectedChartId: chart.id } });
  };

  const handleCreateChart = async () => {
    if (!newChartDate) {
      alert('진료일자를 선택해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const newId = generateUUID();
      const now = new Date().toISOString();

      await createInitialChart({
        id: newId,
        patient_id: patient.id,
        chart_date: newChartDate,
        notes: newChartNotes || `[주소증]\n\n[복진]\n\n[설진]\n\n[맥진]\n\n[혈색]\n\n[처방]\n`,
        prescription_issued: false,
        created_at: now,
        updated_at: now,
      });

      alert('초진차트가 생성되었습니다.');
      setCreatingInitialChart(false);
      setNewChartDate(new Date().toISOString().split('T')[0]);
      setNewChartNotes('');
      loadCharts();
    } catch (error) {
      console.error('초진차트 생성 실패:', error);
      alert('생성에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {patient.name}님의 초진차트
          </h2>
          <button onClick={onClose} className="btn-secondary flex items-center gap-1">
            <X className="w-4 h-4" />
            닫기
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">총 {initialCharts.length}건</p>
                {canWrite && (
                  <button
                    onClick={() => setCreatingInitialChart(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    초진차트 작성
                  </button>
                )}
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
                      className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-colors cursor-pointer"
                      onClick={() => handleChartClick(chart)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {new Date(chart.chart_date).toLocaleDateString('ko-KR')} 초진
                            </p>
                            <ExternalLink className="w-4 h-4 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {chart.notes?.substring(0, 100) || '내용 없음'}
                            {(chart.notes?.length || 0) > 100 && '...'}
                          </p>
                        </div>
                        {canWrite && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInitialChart(chart);
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 초진차트 작성 모달 */}
      {creatingInitialChart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">초진차트 작성</h2>
              <button onClick={() => setCreatingInitialChart(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">진료일자 *</label>
                <input
                  type="date"
                  value={newChartDate}
                  onChange={(e) => setNewChartDate(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">초진차트 내용</label>
                <div className="bg-gray-50 border border-gray-300 rounded p-2 mb-2 text-xs text-gray-700">
                  <strong>작성 방법:</strong> [주소증], [복진], [설진], [맥진], [혈색], [처방] 구분자를 사용하세요
                </div>
                <textarea
                  value={newChartNotes}
                  onChange={(e) => setNewChartNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded p-3 text-sm font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20"
                  rows={15}
                  placeholder={`[주소증]
1. 주요 증상
2. 부수 증상

[복진]
복부 소견

[설진]
설태 및 설질

[맥진]
맥상

[혈색]
안색

[처방]
<처방명> 일수`}
                  style={{ lineHeight: '1.6' }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreatingInitialChart(false)} className="btn-secondary">
                  취소
                </button>
                <button
                  onClick={handleCreateChart}
                  disabled={isSaving}
                  className="btn-primary flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
