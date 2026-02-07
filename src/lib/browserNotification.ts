/**
 * 브라우저 알림 서비스
 * 표준 Notification API를 사용하여 브라우저 알림을 표시합니다.
 */

class BrowserNotificationService {
  private permission: NotificationPermission = 'default';

  constructor() {
    // 초기 권한 상태 확인
    if (this.isSupported()) {
      this.permission = Notification.permission;
    }
  }

  /**
   * 알림 지원 여부 확인
   */
  isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * 권한 요청
   * @returns 권한이 부여되면 true
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('[BrowserNotification] 이 브라우저는 알림을 지원하지 않습니다');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result;
      return result === 'granted';
    } catch (error) {
      console.error('[BrowserNotification] 권한 요청 실패:', error);
      return false;
    }
  }

  /**
   * 현재 권한 상태 가져오기
   */
  getPermission(): NotificationPermission {
    if (!this.isSupported()) {
      return 'denied';
    }
    this.permission = Notification.permission;
    return this.permission;
  }

  /**
   * 권한이 부여되었는지 확인
   */
  isGranted(): boolean {
    return this.getPermission() === 'granted';
  }

  /**
   * 권한이 거부되었는지 확인
   */
  isDenied(): boolean {
    return this.getPermission() === 'denied';
  }

  /**
   * 권한 요청이 필요한지 확인
   */
  needsPermission(): boolean {
    return this.getPermission() === 'default';
  }

  /**
   * 알림 표시
   */
  async show(
    title: string,
    options?: NotificationOptions & {
      onClick?: () => void;
      onClose?: () => void;
      autoClose?: number; // ms
    }
  ): Promise<Notification | null> {
    if (!this.isSupported()) {
      console.warn('[BrowserNotification] 이 브라우저는 알림을 지원하지 않습니다');
      return null;
    }

    if (!this.isGranted()) {
      console.warn('[BrowserNotification] 알림 권한이 없습니다');
      return null;
    }

    try {
      const { onClick, onClose, autoClose, ...notificationOptions } = options || {};

      const notification = new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        ...notificationOptions,
      });

      // 클릭 이벤트
      if (onClick) {
        notification.onclick = () => {
          onClick();
          notification.close();
        };
      }

      // 닫힘 이벤트
      if (onClose) {
        notification.onclose = onClose;
      }

      // 자동 닫기
      if (autoClose && autoClose > 0) {
        setTimeout(() => {
          notification.close();
        }, autoClose);
      }

      return notification;
    } catch (error) {
      console.error('[BrowserNotification] 알림 표시 실패:', error);
      return null;
    }
  }

  /**
   * 복약 알림 표시
   */
  async showMedicationReminder(
    patientName: string,
    medicationTime: string,
    onClick?: () => void
  ): Promise<Notification | null> {
    return this.show('복약 시간입니다', {
      body: `${patientName}님, ${medicationTime} 복약 시간입니다.`,
      tag: `medication-${Date.now()}`,
      requireInteraction: true,
      onClick,
      autoClose: 30000, // 30초
    });
  }

  /**
   * 미복용 알림 표시
   */
  async showMissedMedication(
    patientName: string,
    missedTime: string,
    onClick?: () => void
  ): Promise<Notification | null> {
    return this.show('복약 확인 필요', {
      body: `${patientName}님, ${missedTime} 복약이 확인되지 않았습니다.`,
      tag: `missed-${Date.now()}`,
      requireInteraction: true,
      onClick,
      autoClose: 60000, // 1분
    });
  }

  /**
   * 일일 요약 알림 표시
   */
  async showDailySummary(
    takenCount: number,
    totalCount: number,
    onClick?: () => void
  ): Promise<Notification | null> {
    const rate = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
    return this.show('오늘의 복약 현황', {
      body: `오늘 복약률: ${rate}% (${takenCount}/${totalCount})`,
      tag: `summary-${Date.now()}`,
      onClick,
      autoClose: 10000, // 10초
    });
  }
}

export const browserNotification = new BrowserNotificationService();
