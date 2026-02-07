import { create } from 'zustand';
import {
  getNotifications,
  getUnreadNotificationCount,
  getNotificationSettings,
  createNotification,
  updateNotification,
  updateNotificationSettings,
} from '../lib/localDb';
import type { Notification, NotificationSettings } from '../types';

interface NotificationStore {
  // 상태
  notifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings | null;
  isLoading: boolean;
  isCenterOpen: boolean;
  toasts: Notification[];

  // 알림 액션
  loadNotifications: () => void;
  loadSettings: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismiss: (id: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'created_at' | 'is_read' | 'is_dismissed'>) => Notification | null;
  updateSettings: (updates: Partial<NotificationSettings>) => void;

  // UI 액션
  showToast: (notification: Notification) => void;
  hideToast: (id: string) => void;
  openCenter: () => void;
  closeCenter: () => void;
  toggleCenter: () => void;

  // 유틸리티
  clearAll: () => void;
}

// 토스트 자동 숨김 타이머 맵
const toastTimers = new Map<string, NodeJS.Timeout>();

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  settings: null,
  isLoading: false,
  isCenterOpen: false,
  toasts: [],

  // ===== 알림 관련 =====

  loadNotifications: () => {
    try {
      set({ isLoading: true });
      const notifications = getNotifications();
      const unreadCount = getUnreadNotificationCount();
      set({ notifications, unreadCount, isLoading: false });
    } catch (error) {
      console.error('[loadNotifications] 알림 로드 실패:', error);
      set({ isLoading: false });
    }
  },

  loadSettings: () => {
    try {
      const settings = getNotificationSettings();
      set({ settings });
    } catch (error) {
      console.error('[loadSettings] 설정 로드 실패:', error);
    }
  },

  markAsRead: (id: string) => {
    try {
      const success = updateNotification(id, {
        is_read: true,
        read_at: new Date().toISOString(),
      });

      if (success) {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      }
    } catch (error) {
      console.error('[markAsRead] 읽음 처리 실패:', error);
    }
  },

  markAllAsRead: () => {
    try {
      const { notifications } = get();
      const now = new Date().toISOString();

      for (const n of notifications) {
        if (!n.is_read) {
          updateNotification(n.id, { is_read: true, read_at: now });
        }
      }

      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          is_read: true,
          read_at: n.read_at || now,
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error('[markAllAsRead] 전체 읽음 처리 실패:', error);
    }
  },

  dismiss: (id: string) => {
    try {
      const notification = get().notifications.find((n) => n.id === id);
      const success = updateNotification(id, { is_dismissed: true });

      if (success) {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: notification && !notification.is_read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        }));
      }
    } catch (error) {
      console.error('[dismiss] 알림 삭제 실패:', error);
    }
  },

  addNotification: (notification) => {
    try {
      const newNotification = createNotification(notification);

      if (newNotification) {
        set((state) => ({
          notifications: [newNotification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }));

        // 토스트 표시
        get().showToast(newNotification);
      }

      return newNotification;
    } catch (error) {
      console.error('[addNotification] 알림 생성 실패:', error);
      return null;
    }
  },

  updateSettings: (updates) => {
    try {
      const { settings } = get();
      if (!settings) return;

      const success = updateNotificationSettings(settings.id, updates);

      if (success) {
        set((state) => ({
          settings: state.settings
            ? { ...state.settings, ...updates, updated_at: new Date().toISOString() }
            : null,
        }));
      }
    } catch (error) {
      console.error('[updateSettings] 설정 업데이트 실패:', error);
    }
  },

  // ===== UI 관련 =====

  showToast: (notification: Notification) => {
    set((state) => {
      // 최대 3개까지만 표시
      const newToasts = [notification, ...state.toasts].slice(0, 3);
      return { toasts: newToasts };
    });

    // 기존 타이머 제거
    if (toastTimers.has(notification.id)) {
      clearTimeout(toastTimers.get(notification.id));
    }

    // 5초 후 자동 숨김 (critical 제외)
    if (notification.priority !== 'critical') {
      const timer = setTimeout(() => {
        get().hideToast(notification.id);
      }, 5000);
      toastTimers.set(notification.id, timer);
    }
  },

  hideToast: (id: string) => {
    // 타이머 정리
    if (toastTimers.has(id)) {
      clearTimeout(toastTimers.get(id));
      toastTimers.delete(id);
    }

    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  openCenter: () => set({ isCenterOpen: true }),
  closeCenter: () => set({ isCenterOpen: false }),
  toggleCenter: () => set((state) => ({ isCenterOpen: !state.isCenterOpen })),

  // ===== 유틸리티 =====

  clearAll: () => {
    // 모든 토스트 타이머 정리
    for (const timer of toastTimers.values()) {
      clearTimeout(timer);
    }
    toastTimers.clear();

    set({
      notifications: [],
      unreadCount: 0,
      toasts: [],
    });
  },
}));
