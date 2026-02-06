import { Edit2, Trash2, MessageSquare } from 'lucide-react';
import { MedicationStatusBadge } from './MedicationStatusBadge';
import type { MedicationLog } from '../../types';

interface MedicationLogItemProps {
  log: MedicationLog;
  onEdit?: (log: MedicationLog) => void;
  onDelete?: (log: MedicationLog) => void;
}

export function MedicationLogItem({
  log,
  onEdit,
  onDelete,
}: MedicationLogItemProps) {
  // taken_at에서 날짜와 시간 파싱
  const dateTime = new Date(log.taken_at);
  const date = dateTime.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
  const time = dateTime.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{date}</span>
            <span className="text-sm text-gray-500">{time}</span>
          </div>
          {log.notes && (
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <MessageSquare className="w-3 h-3" />
              <span className="truncate max-w-[200px]">{log.notes}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <MedicationStatusBadge status={log.status} size="sm" />

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 ml-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(log)}
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                title="수정"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(log)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MedicationLogItem;
