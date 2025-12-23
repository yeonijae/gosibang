import { useEffect, useState } from 'react';
import { Search, Plus, Edit2, Trash2, X } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import type { Patient } from '../types';

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

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPatients(searchTerm || undefined);
  };

  const handleCreate = () => {
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
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">환자 관리</h1>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          환자 등록
        </button>
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="환자 이름으로 검색..."
            className="input-field pl-10"
          />
        </div>
        <button type="submit" className="btn-secondary">
          검색
        </button>
      </form>

      {/* 환자 목록 */}
      <div className="card">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">로딩 중...</div>
        ) : patients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(patient);
                          }}
                          className="p-1 text-gray-400 hover:text-primary-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(patient);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
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
          <div className="text-center py-8 text-gray-500">
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
