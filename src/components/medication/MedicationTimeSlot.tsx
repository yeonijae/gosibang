import { useState } from 'react';
import { Clock, Check, X, SkipForward } from 'lucide-react';
import { MedicationStatusBadge } from './MedicationStatusBadge';
import type { MedicationSlot, MedicationStatus } from '../../types';

interface MedicationTimeSlotProps {
  slot: MedicationSlot;
  onStatusChange?: (status: MedicationStatus) => void;
  disabled?: boolean;
}

export function MedicationTimeSlot({
  slot,
  onStatusChange,
  disabled = false,
}: MedicationTimeSlotProps) {
  const [showSelector, setShowSelector] = useState(false);

  const isDisabled = disabled || !slot.is_active;

  const handleClick = () => {
    if (isDisabled || !onStatusChange) return;
    setShowSelector(!showSelector);
  };

  const handleStatusSelect = (status: MedicationStatus) => {
    if (onStatusChange) {
      onStatusChange(status);
    }
    setShowSelector(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={`
          flex items-center gap-2 p-3 rounded-lg border w-full
          transition-all duration-200
          ${isDisabled
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
            : 'bg-white border-gray-200 hover:border-primary-300 hover:shadow-sm cursor-pointer'
          }
          ${slot.is_active ? 'ring-2 ring-primary-500 ring-opacity-50' : ''}
        `}
      >
        <div className="flex items-center gap-2 text-gray-500">
          <Clock className="w-4 h-4" />
          <span className="font-medium text-gray-900">{slot.time}</span>
        </div>
        <div className="flex-1" />
        <MedicationStatusBadge status={slot.status} size="sm" />
      </button>

      {/* 상태 선택 팝업 */}
      {showSelector && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={() => handleStatusSelect('taken')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md hover:bg-green-50 text-green-700"
            >
              <Check className="w-4 h-4" />
              복용완료
            </button>
            <button
              type="button"
              onClick={() => handleStatusSelect('skipped')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md hover:bg-yellow-50 text-yellow-700"
            >
              <SkipForward className="w-4 h-4" />
              건너뜀
            </button>
            <button
              type="button"
              onClick={() => handleStatusSelect('missed')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md hover:bg-red-50 text-red-700"
            >
              <X className="w-4 h-4" />
              미복용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MedicationTimeSlot;
