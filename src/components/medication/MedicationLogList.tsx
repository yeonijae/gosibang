import { useMemo } from 'react';
import { Calendar, ClipboardList } from 'lucide-react';
import { MedicationLogItem } from './MedicationLogItem';
import type { MedicationLog } from '../../types';

interface MedicationLogListProps {
  logs: MedicationLog[];
  onEdit?: (log: MedicationLog) => void;
  onDelete?: (log: MedicationLog) => void;
}

// 날짜별로 그룹화
interface GroupedLogs {
  date: string;
  dateLabel: string;
  logs: MedicationLog[];
}

export function MedicationLogList({
  logs,
  onEdit,
  onDelete,
}: MedicationLogListProps) {
  // 날짜별로 그룹화
  const groupedLogs = useMemo((): GroupedLogs[] => {
    const groups = new Map<string, MedicationLog[]>();

    // 날짜별로 분류
    logs.forEach((log) => {
      const date = log.taken_at.split('T')[0];
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(log);
    });

    // 날짜 순으로 정렬 (최신순)
    const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((date) => {
      const dateObj = new Date(date);
      const dateLabel = dateObj.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });

      // 시간순으로 정렬
      const sortedLogs = groups.get(date)!.sort((a, b) => {
        const timeA = a.taken_at.split('T')[1] || '00:00';
        const timeB = b.taken_at.split('T')[1] || '00:00';
        return timeA.localeCompare(timeB);
      });

      return {
        date,
        dateLabel,
        logs: sortedLogs,
      };
    });
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">복약 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedLogs.map((group) => (
        <div key={group.date} className="space-y-2">
          {/* 날짜 헤더 */}
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Calendar className="w-4 h-4 text-primary-600" />
            <span>{group.dateLabel}</span>
            <span className="text-xs text-gray-400">
              ({group.logs.length}건)
            </span>
          </div>

          {/* 기록 목록 */}
          <div className="space-y-2 pl-6">
            {group.logs.map((log) => (
              <MedicationLogItem
                key={log.id}
                log={log}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MedicationLogList;
