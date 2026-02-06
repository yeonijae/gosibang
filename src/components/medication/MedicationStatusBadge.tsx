import { Check, X, SkipForward, Clock } from 'lucide-react';
import type { MedicationStatus } from '../../types';

interface MedicationStatusBadgeProps {
  status: MedicationStatus | 'pending';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

// 상태별 설정
const STATUS_CONFIG: Record<
  MedicationStatus | 'pending',
  { label: string; color: string; bgColor: string; icon: typeof Check }
> = {
  taken: {
    label: '복용완료',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: Check,
  },
  missed: {
    label: '미복용',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: X,
  },
  skipped: {
    label: '건너뜀',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: SkipForward,
  },
  pending: {
    label: '대기',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: Clock,
  },
};

// 크기별 설정
const SIZE_CONFIG = {
  sm: {
    badge: 'px-1.5 py-0.5 text-xs',
    icon: 'w-3 h-3',
  },
  md: {
    badge: 'px-2 py-1 text-sm',
    icon: 'w-4 h-4',
  },
  lg: {
    badge: 'px-3 py-1.5 text-base',
    icon: 'w-5 h-5',
  },
};

export function MedicationStatusBadge({
  status,
  size = 'md',
  showLabel = true,
}: MedicationStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${config.bgColor} ${config.color} ${sizeConfig.badge}`}
    >
      <Icon className={sizeConfig.icon} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export default MedicationStatusBadge;
