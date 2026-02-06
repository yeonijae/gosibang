import { useState, useEffect } from 'react';
import { Pill, Clock, Check, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { getDb, queryToObjects } from '../../lib/localDb';
import type { MedicationSchedule } from '../../types';

interface MedicationDashboardWidgetProps {
  onScheduleClick?: (schedule: MedicationSchedule) => void;
}

interface TodaySchedule extends MedicationSchedule {
  patient_name: string;
  total_slots: number;
  completed_slots: number;
}

export function MedicationDashboardWidget({
  onScheduleClick,
}: MedicationDashboardWidgetProps) {
  const [schedules, setSchedules] = useState<TodaySchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState({
    total: 0,
    completed: 0,
    pending: 0,
  });

  useEffect(() => {
    loadTodaySchedules();
  }, []);

  const loadTodaySchedules = async () => {
    try {
      setIsLoading(true);
      const db = getDb();
      if (!db) return;

      const today = new Date().toISOString().split('T')[0];

      // 오늘 해당하는 복약 일정 조회
      const schedulesData = queryToObjects<MedicationSchedule>(
        db,
        `SELECT * FROM medication_schedules
         WHERE start_date <= ? AND end_date >= ?`,
        [today, today]
      );

      // 각 일정에 대한 상세 정보 조회
      const enriched: TodaySchedule[] = schedulesData.map((schedule) => {
        // 환자 이름 조회
        const patient = queryToObjects<{ name: string }>(
          db,
          'SELECT name FROM patients WHERE id = ?',
          [schedule.patient_id]
        )[0];

        // 오늘 복약 기록 조회
        const logs = queryToObjects<{ id: string }>(
          db,
          `SELECT id FROM medication_logs
           WHERE schedule_id = ? AND date(taken_at) = ?`,
          [schedule.id, today]
        );

        const totalSlots = schedule.times_per_day;
        const completedSlots = logs.length;

        return {
          ...schedule,
          patient_name: patient?.name || '알 수 없음',
          total_slots: totalSlots,
          completed_slots: completedSlots,
        };
      });

      setSchedules(enriched);

      // 요약 계산
      const totalSlots = enriched.reduce((sum, s) => sum + s.total_slots, 0);
      const completedSlots = enriched.reduce((sum, s) => sum + s.completed_slots, 0);
      setSummary({
        total: totalSlots,
        completed: completedSlots,
        pending: totalSlots - completedSlots,
      });
    } catch (error) {
      console.error('오늘 복약 일정 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Pill className="w-5 h-5 text-primary-600" />
        오늘의 복약
      </h3>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <p className="text-lg font-bold text-blue-600">{summary.total}</p>
          <p className="text-xs text-blue-700">전체</p>
        </div>
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <p className="text-lg font-bold text-green-600">{summary.completed}</p>
          <p className="text-xs text-green-700">완료</p>
        </div>
        <div className="text-center p-2 bg-amber-50 rounded-lg">
          <p className="text-lg font-bold text-amber-600">{summary.pending}</p>
          <p className="text-xs text-amber-700">대기</p>
        </div>
      </div>

      {/* 일정 목록 */}
      {schedules.length > 0 ? (
        <div className="space-y-2">
          {schedules.slice(0, 5).map((schedule) => (
            <div
              key={schedule.id}
              onClick={() => onScheduleClick?.(schedule)}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    schedule.completed_slots === schedule.total_slots
                      ? 'bg-green-100'
                      : 'bg-amber-100'
                  }`}
                >
                  {schedule.completed_slots === schedule.total_slots ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {schedule.patient_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {schedule.completed_slots}/{schedule.total_slots} 완료
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>
          ))}

          {schedules.length > 5 && (
            <p className="text-center text-sm text-gray-500 pt-2">
              외 {schedules.length - 5}건 더 있음
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-500">
          <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm">오늘 예정된 복약이 없습니다</p>
        </div>
      )}
    </div>
  );
}

export default MedicationDashboardWidget;
