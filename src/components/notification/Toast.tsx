import { useEffect, useState } from 'react';
import { X, Bell, AlertTriangle, Info, Pill } from 'lucide-react';
import type { Notification, NotificationPriority, NotificationType } from '../../types';

interface ToastProps {
  notification: Notification;
  onClose: () => void;
  autoDismiss?: number; // 자동 닫힘 시간 (ms), 0이면 자동 닫힘 비활성화
}

// 우선순위별 스타일
const priorityStyles: Record<NotificationPriority, { bg: string; border: string; icon: string }> = {
  low: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: 'text-gray-500',
  },
  normal: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500',
  },
  high: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
  },
};

// 알림 유형별 아이콘
const getNotificationIcon = (type: NotificationType, priority: NotificationPriority) => {
  const iconClass = `w-5 h-5 ${priorityStyles[priority].icon}`;

  switch (type) {
    case 'medication_reminder':
      return <Pill className={iconClass} />;
    case 'missed_medication':
      return <AlertTriangle className={iconClass} />;
    case 'daily_summary':
      return <Info className={iconClass} />;
    default:
      return <Bell className={iconClass} />;
  }
};

export function Toast({ notification, onClose, autoDismiss = 5000 }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const styles = priorityStyles[notification.priority];

  useEffect(() => {
    if (autoDismiss > 0 && notification.priority !== 'critical') {
      const timer = setTimeout(() => {
        handleClose();
      }, autoDismiss);

      return () => clearTimeout(timer);
    }
  }, [autoDismiss, notification.priority]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg shadow-lg border
        ${styles.bg} ${styles.border}
        ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}
        max-w-sm w-full
      `}
      role="alert"
    >
      {/* 아이콘 */}
      <div className="flex-shrink-0 mt-0.5">
        {getNotificationIcon(notification.notification_type, notification.priority)}
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {notification.title}
        </p>
        <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
          {notification.body}
        </p>
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
        aria-label="알림 닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default Toast;
