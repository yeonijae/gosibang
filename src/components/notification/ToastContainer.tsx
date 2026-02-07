import { useNotificationStore } from '../../store/notificationStore';
import { Toast } from './Toast';

export function ToastContainer() {
  const { toasts, hideToast } = useNotificationStore();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-label="알림 목록"
    >
      {toasts.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onClose={() => hideToast(notification.id)}
        />
      ))}
    </div>
  );
}

export default ToastContainer;
