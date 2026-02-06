import { AlertTriangle, Check, X, SkipForward, TrendingUp } from 'lucide-react';
import type { MedicationStats as MedicationStatsType } from '../../types';

interface MedicationStatsProps {
  stats: MedicationStatsType | null;
}

export function MedicationStats({ stats }: MedicationStatsProps) {
  if (!stats) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
        통계 데이터가 없습니다
      </div>
    );
  }

  const { adherence_rate, taken_count, missed_count, skipped_count, consecutive_missed } = stats;

  // 순응률에 따른 색상
  const getAdherenceColor = (rate: number) => {
    if (rate >= 80) return { stroke: 'text-green-500', bg: 'bg-green-500' };
    if (rate >= 60) return { stroke: 'text-yellow-500', bg: 'bg-yellow-500' };
    return { stroke: 'text-red-500', bg: 'bg-red-500' };
  };

  const colors = getAdherenceColor(adherence_rate);

  // 원형 진행률 계산
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (adherence_rate / 100) * circumference;

  return (
    <div className="space-y-4">
      {/* 연속 미복용 경고 */}
      {consecutive_missed >= 3 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">연속 미복용 경고</p>
            <p className="text-sm text-red-600">
              {consecutive_missed}일 연속 복약을 하지 않았습니다. 환자에게 연락이 필요합니다.
            </p>
          </div>
        </div>
      )}

      {/* 순응률 원형 차트 */}
      <div className="flex items-center justify-center py-4">
        <div className="relative">
          <svg width="120" height="120" viewBox="0 0 100 100">
            {/* 배경 원 */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            {/* 진행률 원 */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              className={colors.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 50 50)"
            />
          </svg>
          {/* 중앙 텍스트 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-900">
              {Math.round(adherence_rate)}%
            </span>
            <span className="text-xs text-gray-500">순응률</span>
          </div>
        </div>
      </div>

      {/* 상세 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Check className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-xl font-bold text-green-600">{taken_count}</p>
          <p className="text-xs text-green-700">복용완료</p>
        </div>

        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <X className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-xl font-bold text-red-600">{missed_count}</p>
          <p className="text-xs text-red-700">미복용</p>
        </div>

        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <SkipForward className="w-4 h-4 text-yellow-600" />
          </div>
          <p className="text-xl font-bold text-yellow-600">{skipped_count}</p>
          <p className="text-xs text-yellow-700">건너뜀</p>
        </div>
      </div>

      {/* 추가 정보 */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <TrendingUp className="w-4 h-4" />
          <span>총 복약 횟수</span>
        </div>
        <span className="font-medium text-gray-900">
          {taken_count + missed_count + skipped_count}회
        </span>
      </div>
    </div>
  );
}

export default MedicationStats;
