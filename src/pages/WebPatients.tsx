/**
 * 웹 클라이언트 환자 관리 페이지
 */

import { useEffect, useState } from 'react';
import { Users, Search, Plus, Loader2, User, Phone, Calendar, X } from 'lucide-react';
import { listPatients, createPatient, updatePatient, deletePatient } from '../lib/webApiClient';
import { useWebAuthStore, hasPermission } from '../store/webAuthStore';
import type { Patient } from '../types';

export function WebPatients() {
  const { user } = useWebAuthStore();
  const canWrite = hasPermission(user, 'patients_write');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    gender: '' as '' | 'M' | 'F',
    birth_date: '',
    phone: '',
    address: '',
    notes: '',
  });

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

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.phone?.includes(searchQuery)
  );

  const openCreateModal = () => {
    setEditingPatient(null);
    setFormData({
      name: '',
      gender: '',
      birth_date: '',
      phone: '',
      address: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (patient: Patient) => {
    setEditingPatient(patient);
    setFormData({
      name: patient.name,
      gender: (patient.gender as '' | 'M' | 'F') || '',
      birth_date: patient.birth_date || '',
      phone: patient.phone || '',
      address: patient.address || '',
      notes: patient.notes || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSaving(true);
    try {
      if (editingPatient) {
        await updatePatient(editingPatient.id, {
          name: formData.name,
          gender: formData.gender || undefined,
          birth_date: formData.birth_date || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          notes: formData.notes || undefined,
        });
      } else {
        await createPatient({
          name: formData.name,
          gender: formData.gender || undefined,
          birth_date: formData.birth_date || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          notes: formData.notes || undefined,
        } as Omit<Patient, 'id' | 'created_at' | 'updated_at'>);
      }
      setShowModal(false);
      loadPatients();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (patient: Patient) => {
    if (!confirm(`"${patient.name}" 환자를 삭제하시겠습니까?`)) return;

    try {
      await deletePatient(patient.id);
      loadPatients();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">환자 관리</h1>
            <p className="text-sm text-gray-500">총 {patients.length}명</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 연락처 검색..."
              className="input w-full pl-9"
            />
          </div>
          {canWrite && (
            <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">환자 등록</span>
            </button>
          )}
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* 환자 목록 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {filteredPatients.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">
              {searchQuery ? '검색 결과가 없습니다.' : '등록된 환자가 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">이름</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">성별</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">생년월일</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">연락처</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">등록일</th>
                  {canWrite && (
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">관리</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-primary-600" />
                        </div>
                        <span className="font-medium text-gray-900">{patient.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {patient.gender === 'M' ? '남' : patient.gender === 'F' ? '여' : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {patient.birth_date || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {patient.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {patient.created_at
                        ? new Date(patient.created_at).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEditModal(patient)}
                          className="text-blue-600 hover:underline text-sm mr-3"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(patient)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          삭제
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingPatient ? '환자 정보 수정' : '새 환자 등록'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full pl-9"
                    placeholder="환자 이름"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">성별</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as '' | 'M' | 'F' })}
                    className="input w-full"
                  >
                    <option value="">선택</option>
                    <option value="M">남</option>
                    <option value="F">여</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">생년월일</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className="input w-full pl-9"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input w-full pl-9"
                    placeholder="010-0000-0000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input w-full"
                  placeholder="주소"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input w-full h-20 resize-none"
                  placeholder="특이사항 등..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  취소
                </button>
                <button type="submit" disabled={isSaving} className="btn-primary flex items-center gap-2">
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPatient ? '수정' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
