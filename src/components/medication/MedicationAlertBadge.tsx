import { AlertTriangle } from 'lucide-react';

interface MedicationAlertBadgeProps {
  consecutiveMissed: number;
  threshold?: number;
}

export function MedicationAlertBadge({
  consecutiveMissed,
  threshold = 3,
}: MedicationAlertBadgeProps) {
  // 임계값 미만이면 표시하지 않음
  if (consecutiveMissed < threshold) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
      <AlertTriangle className="w-3 h-3" />
      <span>{consecutiveMissed}일 연속 미복용</span>
    </span>
  );
}

export default MedicationAlertBadge;
