/**
 * 알림 권한 배너 컴포넌트
 * 웹 클라이언트에서 알림 권한이 부여되지 않았을 때 표시
 */

import { useState, useEffect } from 'react';
import { Bell, X, AlertCircle } from 'lucide-react';
import { browserNotification } from '../../lib/browserNotification';

interface NotificationPermissionBannerProps {
  className?: string;
  onDismiss?: () => void;
}

export function NotificationPermissionBanner({
  className = '',
  onDismiss,
}: NotificationPermissionBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // 권한 상태 확인
  useEffect(() => {
    // localStorage에서 사용자가 "다시 묻지 않음"을 선택했는지 확인
    const dismissed = localStorage.getItem('notification_permission_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // 브라우저 지원 및 권한 확인
    if (browserNotification.isSupported() && browserNotification.needsPermission()) {
      setIsVisible(true);
    }
  }, []);

  // 권한 요청
  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await browserNotification.requestPermission();
      if (granted) {
        setIsVisible(false);
        // 테스트 알림
        await browserNotification.show('알림이 활성화되었습니다', {
          body: '이제 복약 알림을 받으실 수 있습니다.',
          autoClose: 5000,
        });
      } else if (browserNotification.isDenied()) {
        // 권한이 거부된 경우 배너 숨김
        setIsVisible(false);
      }
    } finally {
      setIsRequesting(false);
    }
  };

  // 배너 닫기
  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  // "다시 묻지 않음" 처리
  const handleNeverAsk = () => {
    localStorage.setItem('notification_permission_dismissed', 'true');
    setIsDismissed(true);
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible || isDismissed) {
    return null;
  }

  return (
    <div
      className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-blue-900 mb-1">
            알림을 허용하시겠습니까?
          </h3>
          <p className="text-sm text-blue-700 mb-3">
            브라우저 알림을 허용하면 복약 시간에 알림을 받을 수 있습니다.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRequestPermission}
              disabled={isRequesting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRequesting ? '요청 중...' : '알림 허용'}
            </button>
            <button
              onClick={handleNeverAsk}
              className="px-4 py-2 text-blue-600 text-sm hover:bg-blue-100 rounded-lg"
            >
              다시 묻지 않음
            </button>
          </div>

          {browserNotification.isDenied() && (
            <div className="flex items-center gap-2 mt-3 text-amber-700 text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>
                알림이 차단되었습니다. 브라우저 설정에서 알림을 허용해주세요.
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-blue-400 hover:text-blue-600 rounded"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default NotificationPermissionBanner;
