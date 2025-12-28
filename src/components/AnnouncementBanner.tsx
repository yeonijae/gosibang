import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, RefreshCw, Wrench, ChevronRight, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Announcement, AnnouncementType } from '../types';

const TYPE_CONFIG: Record<AnnouncementType, { icon: typeof Info; bg: string; border: string; text: string }> = {
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  warning: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  update: { icon: RefreshCw, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  maintenance: { icon: Wrench, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
};

// 닫은 공지 저장 키
const DISMISSED_KEY = 'gosibang_dismissed_announcements';

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    // 닫은 공지 목록 로드
    try {
      const saved = localStorage.getItem(DISMISSED_KEY);
      if (saved) {
        setDismissedIds(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load dismissed announcements:', e);
    }

    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('gosibang_announcements')
        .select('*')
        .eq('is_active', true)
        .lte('starts_at', now)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Failed to load announcements:', error);
    }
  };

  const handleDismiss = (id: string) => {
    const newDismissed = [...dismissedIds, id];
    setDismissedIds(newDismissed);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(newDismissed));

    // 다음 공지로 이동
    if (currentIndex >= visibleAnnouncements.length - 1) {
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : visibleAnnouncements.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < visibleAnnouncements.length - 1 ? prev + 1 : 0));
  };

  // 닫지 않은 공지만 표시
  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  const current = visibleAnnouncements[currentIndex];
  if (!current) return null;

  const config = TYPE_CONFIG[current.type];
  const Icon = config.icon;

  return (
    <div className={`${config.bg} ${config.border} border-b`}>
      <div className="px-4 py-2">
        <div className="flex items-center gap-3">
          {/* 아이콘 */}
          <Icon className={`w-4 h-4 ${config.text} flex-shrink-0`} />

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-left"
            >
              <div className="flex items-center gap-2">
                <span className={`font-medium ${config.text} text-sm`}>
                  {current.title}
                </span>
                {!isExpanded && current.content && (
                  <span className="text-xs text-gray-500 truncate hidden sm:inline">
                    - {current.content.slice(0, 50)}
                    {current.content.length > 50 ? '...' : ''}
                  </span>
                )}
              </div>
            </button>

            {/* 확장된 내용 */}
            {isExpanded && (
              <p className={`mt-1 text-sm ${config.text} opacity-80 whitespace-pre-wrap`}>
                {current.content}
              </p>
            )}
          </div>

          {/* 네비게이션 (여러 개일 때) */}
          {visibleAnnouncements.length > 1 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handlePrev}
                className={`p-1 rounded hover:bg-white/50 ${config.text}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-xs ${config.text}`}>
                {currentIndex + 1}/{visibleAnnouncements.length}
              </span>
              <button
                onClick={handleNext}
                className={`p-1 rounded hover:bg-white/50 ${config.text}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 닫기 버튼 */}
          <button
            onClick={() => handleDismiss(current.id)}
            className={`p-1 rounded hover:bg-white/50 ${config.text} flex-shrink-0`}
            title="이 공지 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
