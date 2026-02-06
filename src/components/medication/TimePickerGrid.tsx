import { Clock } from 'lucide-react';

interface TimePickerGridProps {
  selectedTimes: string[];
  onChange: (times: string[]) => void;
  maxSelections?: number;
}

// 시간대 프리셋
const TIME_PRESETS = [
  { label: '아침', time: '08:00' },
  { label: '점심', time: '12:00' },
  { label: '저녁', time: '18:00' },
  { label: '취침전', time: '22:00' },
];

export function TimePickerGrid({
  selectedTimes,
  onChange,
  maxSelections = 4,
}: TimePickerGridProps) {
  const handleToggle = (time: string) => {
    if (selectedTimes.includes(time)) {
      // 이미 선택된 시간 제거
      onChange(selectedTimes.filter((t) => t !== time));
    } else {
      // 최대 선택 수 제한
      if (selectedTimes.length >= maxSelections) {
        return;
      }
      // 새 시간 추가 (정렬)
      const newTimes = [...selectedTimes, time].sort();
      onChange(newTimes);
    }
  };

  const isSelected = (time: string) => selectedTimes.includes(time);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Clock className="w-4 h-4" />
        <span>
          복약 시간 선택 ({selectedTimes.length}/{maxSelections})
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset.time}
            type="button"
            onClick={() => handleToggle(preset.time)}
            className={`
              flex flex-col items-center justify-center p-3 rounded-lg border-2
              transition-all duration-200
              ${
                isSelected(preset.time)
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }
              ${
                !isSelected(preset.time) && selectedTimes.length >= maxSelections
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              }
            `}
            disabled={!isSelected(preset.time) && selectedTimes.length >= maxSelections}
          >
            <span className="text-sm font-medium">{preset.label}</span>
            <span className="text-xs mt-1">{preset.time}</span>
          </button>
        ))}
      </div>

      {/* 선택된 시간 표시 */}
      {selectedTimes.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedTimes.sort().map((time) => {
            const preset = TIME_PRESETS.find((p) => p.time === time);
            return (
              <span
                key={time}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full"
              >
                {preset ? preset.label : time} ({time})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TimePickerGrid;
