import { useState, useEffect } from 'react';
import {
  Pill,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  ClipboardList,
  ArrowRight,
  User,
  Loader2,
} from 'lucide-react';
import { getDb, queryToObjects } from '../../lib/localDb';
import type { MedicationSchedule, Patient, Prescription } from '../../types';

interface MedicationScheduleListProps {
  schedules: MedicationSchedule[];
  onSelect?: (schedule: MedicationSchedule) => void;
  onEdit?: (schedule: MedicationSchedule) => void;
  onDelete?: (schedule: MedicationSchedule) => void;
}

// 환자 및 처방 정보를 포함한 확장 일정
interface ScheduleWithDetails extends MedicationSchedule {
  patient_name?: string;
  prescription_name?: string;
}

export function MedicationScheduleList({
  schedules,
  onSelect,
  onEdit,
  onDelete,
}: MedicationScheduleListProps) {
  const [schedulesWithDetails, setSchedulesWithDetails] = useState<ScheduleWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDetails();
  }, [schedules]);

  const loadDetails = async () => {
    try {
      setIsLoading(true);
      const db = getDb();
      if (!db) {
        setSchedulesWithDetails(schedules);
        return;
      }

      // 환자 및 처방 정보 조회
      const enriched = schedules.map((schedule) => {
        const patient = queryToObjects<Patient>(
          db,
          'SELECT name FROM patients WHERE id = ?',
          [schedule.patient_id]
        )[0];

        const prescription = queryToObjects<Prescription>(
          db,
          'SELECT formula, prescription_name FROM prescriptions WHERE id = ?',
          [schedule.prescription_id]
        )[0];

        return {
          ...schedule,
          patient_name: patient?.name || '알 수 없음',
          prescription_name: prescription?.formula || prescription?.prescription_name || '알 수 없음',
        };
      });

      setSchedulesWithDetails(enriched);
    } catch (error) {
      console.error('상세 정보 로드 실패:', error);
      setSchedulesWithDetails(schedules);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTimes = (times: string[]) => {
    const labels: Record<string, string> = {
      '08:00': '아침',
      '12:00': '점심',
      '18:00': '저녁',
      '22:00': '취침전',
    };
    return times.map((t) => labels[t] || t).join(', ');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="text-center py-12">
        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">등록된 복약 일정이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schedulesWithDetails.map((schedule) => (
        <div
          key={schedule.id}
          className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-colors cursor-pointer"
          onClick={() => onSelect?.(schedule)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* 환자 아이콘 */}
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-primary-600" />
              </div>

              {/* 정보 */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {schedule.patient_name}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded">
                    {schedule.times_per_day}회/일
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                  <Pill className="w-3 h-3" />
                  {schedule.prescription_name}
                </p>

                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(schedule.start_date)} ~ {formatDate(schedule.end_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimes(schedule.medication_times)}
                  </span>
                </div>

                {schedule.notes && (
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-[250px]">
                    {schedule.notes}
                  </p>
                )}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-1">
              {onSelect && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(schedule);
                  }}
                  className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                  title="기록 보기"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(schedule);
                  }}
                  className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                  title="수정"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(schedule);
                  }}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MedicationScheduleList;
