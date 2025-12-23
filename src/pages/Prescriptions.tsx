import { useState } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import type { Prescription, HerbItem } from '../types';

export function Prescriptions() {
  const { selectedPatient, prescriptions, createPrescription } = usePatientStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!selectedPatient) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">처방 관리</h1>
        <div className="card text-center py-12">
          <p className="text-gray-500">환자 관리 메뉴에서 환자를 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">처방 관리</h1>
          <p className="text-gray-600 mt-1">
            환자: <span className="font-medium">{selectedPatient.name}</span>
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          새 처방
        </button>
      </div>

      {/* 처방 목록 */}
      <div className="space-y-4">
        {prescriptions.length > 0 ? (
          prescriptions.map((prescription) => (
            <div key={prescription.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {prescription.prescription_name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(prescription.created_at).toLocaleDateString('ko-KR')} | {prescription.total_days}일분
                  </p>
                </div>
              </div>

              {/* 약재 목록 */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">처방 구성</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {prescription.herbs.map((herb, index) => (
                    <div key={index} className="text-sm">
                      <span className="text-gray-900">{herb.herb_name}</span>
                      <span className="text-gray-500 ml-1">
                        {herb.amount}{herb.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 복용 방법 */}
              {prescription.dosage_instructions && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">복용법:</span> {prescription.dosage_instructions}
                </p>
              )}

              {/* 메모 */}
              {prescription.notes && (
                <p className="text-sm text-gray-500 mt-2">
                  <span className="font-medium">메모:</span> {prescription.notes}
                </p>
              )}
            </div>
          ))
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-500">등록된 처방이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 처방 등록 모달 */}
      {isModalOpen && (
        <PrescriptionModal
          patientId={selectedPatient.id}
          onSave={async (prescription) => {
            await createPrescription(prescription);
            setIsModalOpen(false);
          }}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

interface PrescriptionModalProps {
  patientId: string;
  onSave: (prescription: Prescription) => Promise<void>;
  onClose: () => void;
}

function PrescriptionModal({ patientId, onSave, onClose }: PrescriptionModalProps) {
  const [formData, setFormData] = useState({
    prescription_name: '',
    total_days: 7,
    dosage_instructions: '',
    notes: '',
  });
  const [herbs, setHerbs] = useState<HerbItem[]>([
    { herb_name: '', amount: 0, unit: 'g' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addHerb = () => {
    setHerbs([...herbs, { herb_name: '', amount: 0, unit: 'g' }]);
  };

  const removeHerb = (index: number) => {
    setHerbs(herbs.filter((_, i) => i !== index));
  };

  const updateHerb = (index: number, field: keyof HerbItem, value: string | number) => {
    const newHerbs = [...herbs];
    newHerbs[index] = { ...newHerbs[index], [field]: value };
    setHerbs(newHerbs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const validHerbs = herbs.filter((h) => h.herb_name.trim() !== '');
    const now = new Date().toISOString();

    const prescription: Prescription = {
      id: crypto.randomUUID(),
      patient_id: patientId,
      prescription_name: formData.prescription_name,
      herbs: validHerbs,
      dosage_instructions: formData.dosage_instructions || undefined,
      total_days: formData.total_days,
      notes: formData.notes || undefined,
      created_at: now,
      updated_at: now,
    };

    await onSave(prescription);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 my-8">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">새 처방 등록</h2>
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
                value={formData.prescription_name}
                onChange={(e) => setFormData({ ...formData, prescription_name: e.target.value })}
                className="input-field"
                placeholder="예: 보중익기탕"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                복용 일수 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.total_days}
                onChange={(e) => setFormData({ ...formData, total_days: parseInt(e.target.value) })}
                className="input-field"
                min={1}
                required
              />
            </div>
          </div>

          {/* 약재 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                약재 구성
              </label>
              <button type="button" onClick={addHerb} className="text-sm text-primary-600 hover:text-primary-700">
                + 약재 추가
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {herbs.map((herb, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={herb.herb_name}
                    onChange={(e) => updateHerb(index, 'herb_name', e.target.value)}
                    className="input-field flex-1"
                    placeholder="약재명"
                  />
                  <input
                    type="number"
                    value={herb.amount}
                    onChange={(e) => updateHerb(index, 'amount', parseFloat(e.target.value))}
                    className="input-field w-20"
                    placeholder="용량"
                    step="0.1"
                  />
                  <select
                    value={herb.unit}
                    onChange={(e) => updateHerb(index, 'unit', e.target.value)}
                    className="input-field w-20"
                  >
                    <option value="g">g</option>
                    <option value="돈">돈</option>
                    <option value="냥">냥</option>
                  </select>
                  {herbs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeHerb(index)}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              복용 방법
            </label>
            <input
              type="text"
              value={formData.dosage_instructions}
              onChange={(e) => setFormData({ ...formData, dosage_instructions: e.target.value })}
              className="input-field"
              placeholder="예: 하루 3회, 식후 30분"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              메모
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input-field"
              rows={2}
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
