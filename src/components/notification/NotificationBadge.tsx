import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';

interface NotificationBadgeProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBadge({ onClick, className = '' }: NotificationBadgeProps) {
  const { unreadCount, toggleCenter } = useNotificationStore();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      toggleCenter();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`relative p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-colors ${className}`}
      aria-label={`알림 ${unreadCount > 0 ? `(${unreadCount}개 읽지 않음)` : ''}`}
    >
      <Bell className="w-5 h-5" />

      {/* 배지 */}
      {unreadCount > 0 && (
        <span
          className={`
            absolute -top-0.5 -right-0.5 flex items-center justify-center
            min-w-[18px] h-[18px] px-1 text-xs font-medium
            bg-red-500 text-white rounded-full
            animate-bounce-subtle
          `}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default NotificationBadge;
