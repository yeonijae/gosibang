import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import type { ChartRecord } from '../types';

export function Charts() {
  const { selectedPatient, chartRecords, createChartRecord } = usePatientStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!selectedPatient) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">차팅 관리</h1>
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
          <h1 className="text-2xl font-bold text-gray-900">차팅 관리</h1>
          <p className="text-gray-600 mt-1">
            환자: <span className="font-medium">{selectedPatient.name}</span>
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          새 차트
        </button>
      </div>

      {/* 차트 기록 */}
      <div className="space-y-4">
        {chartRecords.length > 0 ? (
          chartRecords.map((record) => (
            <div key={record.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {new Date(record.visit_date).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                {record.chief_complaint && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">주소증: </span>
                    <span className="text-sm text-gray-600">{record.chief_complaint}</span>
                  </div>
                )}
                {record.symptoms && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">증상: </span>
                    <span className="text-sm text-gray-600">{record.symptoms}</span>
                  </div>
                )}
                {record.diagnosis && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">진단: </span>
                    <span className="text-sm text-gray-600">{record.diagnosis}</span>
                  </div>
                )}
                {record.treatment && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">치료: </span>
                    <span className="text-sm text-gray-600">{record.treatment}</span>
                  </div>
                )}
                {record.notes && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">메모: </span>
                    <span className="text-sm text-gray-500">{record.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-500">등록된 차트 기록이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 차트 등록 모달 */}
      {isModalOpen && (
        <ChartModal
          patientId={selectedPatient.id}
          onSave={async (record) => {
            await createChartRecord(record);
            setIsModalOpen(false);
          }}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

interface ChartModalProps {
  patientId: string;
  onSave: (record: ChartRecord) => Promise<void>;
  onClose: () => void;
}

function ChartModal({ patientId, onSave, onClose }: ChartModalProps) {
  const [formData, setFormData] = useState({
    visit_date: new Date().toISOString().split('T')[0],
    chief_complaint: '',
    symptoms: '',
    diagnosis: '',
    treatment: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const now = new Date().toISOString();
    const record: ChartRecord = {
      id: crypto.randomUUID(),
      patient_id: patientId,
      visit_date: new Date(formData.visit_date).toISOString(),
      chief_complaint: formData.chief_complaint || undefined,
      symptoms: formData.symptoms || undefined,
      diagnosis: formData.diagnosis || undefined,
      treatment: formData.treatment || undefined,
      notes: formData.notes || undefined,
      created_at: now,
      updated_at: now,
    };

    await onSave(record);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">새 차트 기록</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              내원일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.visit_date}
              onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              주소증
            </label>
            <input
              type="text"
              value={formData.chief_complaint}
              onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
              className="input-field"
              placeholder="환자의 주요 호소"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              증상
            </label>
            <textarea
              value={formData.symptoms}
              onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="관찰된 증상들"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              진단
            </label>
            <input
              type="text"
              value={formData.diagnosis}
              onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
              className="input-field"
              placeholder="진단명"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치료
            </label>
            <textarea
              value={formData.treatment}
              onChange={(e) => setFormData({ ...formData, treatment: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="시행한 치료 내용"
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
