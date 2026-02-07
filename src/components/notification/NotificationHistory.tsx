/**
 * 알림 히스토리 컴포넌트
 * 모든 알림의 페이지네이션 목록, 필터링, 검색 기능 제공
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Bell,
  Search,
  Filter,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import type { Notification, NotificationType } from '../../types';

// 날짜 필터 옵션
type DateFilter = 'today' | 'week' | 'month' | 'all';

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '이번 주' },
  { value: 'month', label: '이번 달' },
  { value: 'all', label: '전체' },
];

// 알림 유형 옵션
const TYPE_FILTERS: { value: NotificationType | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'medication_reminder', label: '복약 알림' },
  { value: 'missed_medication', label: '미복용 알림' },
  { value: 'daily_summary', label: '일일 요약' },
];

// 페이지당 항목 수
const ITEMS_PER_PAGE = 10;

interface NotificationHistoryProps {
  className?: string;
}

export function NotificationHistory({ className = '' }: NotificationHistoryProps) {
  const { notifications, loadNotifications, markAsRead, dismiss, isLoading } = useNotificationStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // 알림 로드
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // 필터링된 알림
  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];

    // 검색 필터
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.body.toLowerCase().includes(query)
      );
    }

    // 날짜 필터
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter((n) => new Date(n.created_at) >= startDate);
    }

    // 유형 필터
    if (typeFilter !== 'all') {
      filtered = filtered.filter((n) => n.notification_type === typeFilter);
    }

    return filtered;
  }, [notifications, searchQuery, dateFilter, typeFilter]);

  // 페이지네이션
  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNotifications.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredNotifications, currentPage]);

  // 페이지 변경 시 상단으로 스크롤
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // 알림 유형 아이콘
  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'medication_reminder':
        return <Bell className="w-4 h-4 text-blue-500" />;
      case 'missed_medication':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'daily_summary':
        return <Calendar className="w-4 h-4 text-green-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  // 날짜 포맷
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;

    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // 알림 항목 렌더링
  const renderNotificationItem = (notification: Notification) => (
    <div
      key={notification.id}
      className={`p-4 border-b border-gray-100 last:border-b-0 ${
        notification.is_read ? 'bg-white' : 'bg-blue-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getTypeIcon(notification.notification_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className={`text-sm ${notification.is_read ? 'font-normal' : 'font-medium'} text-gray-900 truncate`}>
              {notification.title}
            </p>
            {!notification.is_read && (
              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{notification.body}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDate(notification.created_at)}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!notification.is_read && (
            <button
              onClick={() => markAsRead(notification.id)}
              className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded"
              title="읽음 처리"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => dismiss(notification.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            title="삭제"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">알림 기록</h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg ${
              showFilters ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:bg-gray-100'
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="제목 또는 내용 검색..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* 필터 패널 */}
        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-3">
            {/* 날짜 필터 */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">기간</p>
              <div className="flex flex-wrap gap-2">
                {DATE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => {
                      setDateFilter(filter.value);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs rounded-full ${
                      dateFilter === filter.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 유형 필터 */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">유형</p>
              <div className="flex flex-wrap gap-2">
                {TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => {
                      setTypeFilter(filter.value);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs rounded-full ${
                      typeFilter === filter.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 알림 목록 */}
      <div className="max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : paginatedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Bell className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">알림이 없습니다</p>
          </div>
        ) : (
          paginatedNotifications.map(renderNotificationItem)
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            총 {filteredNotifications.length}개 중 {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)}개
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationHistory;
