import { Bell, AlertTriangle, Info, Pill, X, Check } from 'lucide-react';
import type { Notification, NotificationPriority, NotificationType } from '../../types';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClick?: (notification: Notification) => void;
}

// 우선순위별 표시 스타일
const priorityIndicator: Record<NotificationPriority, string> = {
  low: 'bg-gray-400',
  normal: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

// 알림 유형별 아이콘
const getNotificationIcon = (type: NotificationType) => {
  const iconClass = 'w-5 h-5 text-gray-500';

  switch (type) {
    case 'medication_reminder':
      return <Pill className={iconClass} />;
    case 'missed_medication':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case 'daily_summary':
      return <Info className={iconClass} />;
    default:
      return <Bell className={iconClass} />;
  }
};

// 상대 시간 포맷
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return '방금 전';
  } else if (diffMin < 60) {
    return `${diffMin}분 전`;
  } else if (diffHour < 24) {
    return `${diffHour}시간 전`;
  } else if (diffDay < 7) {
    return `${diffDay}일 전`;
  } else {
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
  onClick,
}: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
    onClick?.(notification);
  };

  return (
    <div
      className={`
        relative flex items-start gap-3 p-3 rounded-lg cursor-pointer
        transition-colors group
        ${notification.is_read
          ? 'bg-white hover:bg-gray-50'
          : 'bg-blue-50 hover:bg-blue-100'
        }
      `}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* 우선순위 표시 */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${priorityIndicator[notification.priority]}`}
      />

      {/* 아이콘 */}
      <div className="flex-shrink-0 ml-2">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          {getNotificationIcon(notification.notification_type)}
        </div>
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm ${
              notification.is_read ? 'text-gray-700' : 'font-medium text-gray-900'
            }`}
          >
            {notification.title}
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
          {notification.body}
        </p>
      </div>

      {/* 액션 버튼 (호버 시 표시) */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.is_read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.id);
            }}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
            title="읽음으로 표시"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="삭제"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 읽지 않음 표시 */}
      {!notification.is_read && (
        <div className="absolute right-3 top-3 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </div>
  );
}

export default NotificationItem;
