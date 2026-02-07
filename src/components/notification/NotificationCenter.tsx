import { useEffect, useState } from 'react';
import { X, Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import { NotificationItem } from './NotificationItem';

type FilterTab = 'all' | 'unread';

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isCenterOpen,
    closeCenter,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    dismiss,
  } = useNotificationStore();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // 센터 열릴 때 알림 로드
  useEffect(() => {
    if (isCenterOpen) {
      loadNotifications();
    }
  }, [isCenterOpen, loadNotifications]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCenterOpen) {
        closeCenter();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isCenterOpen, closeCenter]);

  if (!isCenterOpen) {
    return null;
  }

  const filteredNotifications =
    activeTab === 'unread'
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={closeCenter}
        aria-hidden="true"
      />

      {/* 패널 */}
      <div
        className="fixed right-0 top-0 h-full w-96 max-w-full bg-white shadow-xl z-50 flex flex-col animate-slide-in-right"
        role="dialog"
        aria-label="알림 센터"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">알림</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-600 hover:text-primary-600 hover:bg-gray-50 rounded transition-colors"
                title="모두 읽음으로 표시"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">모두 읽음</span>
              </button>
            )}
            <button
              onClick={closeCenter}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 필터 탭 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            전체 ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('unread')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'unread'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            읽지 않음 ({unreadCount})
          </button>
        </div>

        {/* 알림 목록 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Bell className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm">
                {activeTab === 'unread' ? '읽지 않은 알림이 없습니다' : '알림이 없습니다'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onDismiss={dismiss}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default NotificationCenter;
