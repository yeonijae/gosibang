import { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Pill } from 'lucide-react';
import { TimePickerGrid } from './TimePickerGrid';
import { getDb, queryToObjects } from '../../lib/localDb';
import type { Patient, Prescription, MedicationSchedule } from '../../types';

interface MedicationScheduleFormProps {
  schedule?: MedicationSchedule | null;
  onSave: (data: Omit<MedicationSchedule, 'id' | 'created_at'>) => void;
  onCancel: () => void;
}

export function MedicationScheduleForm({
  schedule,
  onSave,
  onCancel,
}: MedicationScheduleFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 폼 상태
  const [patientId, setPatientId] = useState(schedule?.patient_id || '');
  const [prescriptionId, setPrescriptionId] = useState(schedule?.prescription_id || '');
  const [startDate, setStartDate] = useState(schedule?.start_date || '');
  const [endDate, setEndDate] = useState(schedule?.end_date || '');
  const [timesPerDay, setTimesPerDay] = useState(schedule?.times_per_day || 2);
  const [medicationTimes, setMedicationTimes] = useState<string[]>(
    schedule?.medication_times || ['08:00', '18:00']
  );
  const [notes, setNotes] = useState(schedule?.notes || '');

  // 초기 데이터 로드
  useEffect(() => {
    loadData();
  }, []);

  // 환자 변경 시 처방 목록 업데이트
  useEffect(() => {
    if (patientId) {
      loadPrescriptions(patientId);
    } else {
      setPrescriptions([]);
    }
  }, [patientId]);

  // 처방 선택 시 날짜 자동 계산
  useEffect(() => {
    if (prescriptionId && startDate) {
      const prescription = prescriptions.find((p) => p.id === prescriptionId);
      if (prescription?.days) {
        const start = new Date(startDate);
        start.setDate(start.getDate() + prescription.days - 1);
        setEndDate(start.toISOString().split('T')[0]);
      }
    }
  }, [prescriptionId, startDate, prescriptions]);

  // 복용 횟수 변경 시 시간 조정
  useEffect(() => {
    // 기본 시간 설정
    const defaultTimes: Record<number, string[]> = {
      1: ['08:00'],
      2: ['08:00', '18:00'],
      3: ['08:00', '12:00', '18:00'],
      4: ['08:00', '12:00', '18:00', '22:00'],
    };
    setMedicationTimes(defaultTimes[timesPerDay] || defaultTimes[2]);
  }, [timesPerDay]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const db = getDb();
      if (!db) return;

      // 환자 목록 로드
      const patientsData = queryToObjects<Patient>(
        db,
        'SELECT * FROM patients WHERE deleted_at IS NULL ORDER BY name'
      );
      setPatients(patientsData);

      // 수정 모드인 경우 해당 환자의 처방 로드
      if (schedule?.patient_id) {
        loadPrescriptions(schedule.patient_id);
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrescriptions = async (pId: string) => {
    try {
      const db = getDb();
      if (!db) return;

      const prescriptionsData = queryToObjects<Prescription>(
        db,
        `SELECT * FROM prescriptions
         WHERE patient_id = ? AND status = 'issued' AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [pId]
      );
      setPrescriptions(prescriptionsData);
    } catch (error) {
      console.error('처방 로드 실패:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!patientId || !prescriptionId || !startDate || !endDate) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    if (medicationTimes.length === 0) {
      alert('복약 시간을 선택해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      onSave({
        patient_id: patientId,
        prescription_id: prescriptionId,
        start_date: startDate,
        end_date: endDate,
        times_per_day: timesPerDay,
        medication_times: medicationTimes,
        notes: notes || undefined,
      });
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 환자 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          환자 <span className="text-red-500">*</span>
        </label>
        <select
          value={patientId}
          onChange={(e) => {
            setPatientId(e.target.value);
            setPrescriptionId('');
          }}
          className="input-field"
          required
          disabled={!!schedule}
        >
          <option value="">환자 선택</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name}
              {patient.chart_number && ` (${patient.chart_number})`}
            </option>
          ))}
        </select>
      </div>

      {/* 처방 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          처방전 <span className="text-red-500">*</span>
        </label>
        <select
          value={prescriptionId}
          onChange={(e) => setPrescriptionId(e.target.value)}
          className="input-field"
          required
          disabled={!patientId || !!schedule}
        >
          <option value="">처방전 선택</option>
          {prescriptions.map((rx) => (
            <option key={rx.id} value={rx.id}>
              {rx.formula || rx.prescription_name} ({rx.days}일분)
            </option>
          ))}
        </select>
        {patientId && prescriptions.length === 0 && (
          <p className="text-sm text-amber-600 mt-1">
            해당 환자의 발급된 처방이 없습니다.
          </p>
        )}
      </div>

      {/* 날짜 선택 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline-block mr-1" />
            시작일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline-block mr-1" />
            종료일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-field"
            required
          />
          {prescriptionId && (
            <p className="text-xs text-gray-500 mt-1">
              처방일수에 따라 자동 계산됩니다
            </p>
          )}
        </div>
      </div>

      {/* 복용 횟수 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Pill className="w-4 h-4 inline-block mr-1" />
          하루 복용 횟수
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTimesPerDay(n)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                timesPerDay === n
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {n}회
            </button>
          ))}
        </div>
      </div>

      {/* 복약 시간 */}
      <TimePickerGrid
        selectedTimes={medicationTimes}
        onChange={setMedicationTimes}
        maxSelections={timesPerDay}
      />

      {/* 메모 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          메모
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input-field"
          rows={3}
          placeholder="복약 관련 특이사항..."
        />
      </div>

      {/* 버튼 */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 btn-secondary"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 btn-primary flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              저장 중...
            </>
          ) : (
            schedule ? '수정' : '생성'
          )}
        </button>
      </div>
    </form>
  );
}

export default MedicationScheduleForm;
