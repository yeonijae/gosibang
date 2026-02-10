import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  Pill,
  Settings,
  LogOut,
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  HelpCircle,
  GripVertical,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useClinicStore } from '../store/clinicStore';
import { useFeatureStore } from '../store/featureStore';
import { useNotificationStore } from '../store/notificationStore';
import { loadMenuOrder, saveMenuOrder, MENU_ITEMS, FIXED_MENU } from '../lib/menuConfig';
import { NotificationBadge, NotificationCenter, ToastContainer } from './notification';
import type { FeatureKey, MenuItemMeta } from '../types';

// 아이콘 매핑
const iconMap: Record<string, LucideIcon> = {
  Users,
  FileText,
  Book: BookOpen,
  BookOpen,
  ClipboardList,
  FileQuestion: ClipboardCheck,
  MessageSquare,
  HelpCircle,
  Pill,
  Settings,
  LayoutDashboard,
};

export function Sidebar() {
  const { authState, logout } = useAuthStore();
  const { settings } = useClinicStore();
  const { hasAccess, planName } = useFeatureStore();
  const { loadNotifications, loadSettings } = useNotificationStore();

  // 알림 초기화
  useEffect(() => {
    loadNotifications();
    loadSettings();
  }, [loadNotifications, loadSettings]);

  const [menuOrder, setMenuOrder] = useState<FeatureKey[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedKey, setDraggedKey] = useState<FeatureKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<FeatureKey | null>(null);
  const originalOrderRef = useRef<FeatureKey[]>([]);

  // 메뉴 순서 로드
  useEffect(() => {
    setMenuOrder(loadMenuOrder());
  }, []);

  // 편집 모드 시작
  const startEditMode = () => {
    originalOrderRef.current = [...menuOrder];
    setIsEditMode(true);
  };

  // 편집 완료 (저장)
  const confirmEdit = () => {
    saveMenuOrder(menuOrder);
    setIsEditMode(false);
  };

  // 편집 취소
  const cancelEdit = () => {
    setMenuOrder(originalOrderRef.current);
    setIsEditMode(false);
  };

  // 드래그 시작
  const handleDragStart = (key: FeatureKey) => {
    setDraggedKey(key);
  };

  // 드래그 오버
  const handleDragOver = (e: React.DragEvent, key: FeatureKey) => {
    e.preventDefault();
    if (draggedKey === null || draggedKey === key) return;
    setDragOverKey(key);
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggedKey(null);
    setDragOverKey(null);
  };

  // 드롭
  const handleDrop = (e: React.DragEvent, dropKey: FeatureKey) => {
    e.preventDefault();
    if (draggedKey === null || draggedKey === dropKey) return;

    const newOrder = [...menuOrder];
    const draggedIndex = newOrder.indexOf(draggedKey);
    const dropIndex = newOrder.indexOf(dropKey);

    if (draggedIndex === -1 || dropIndex === -1) return;

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedKey);
    setMenuOrder(newOrder);
    setDraggedKey(null);
    setDragOverKey(null);
  };

  // 메뉴 순서에 따라 정렬된 메뉴 아이템
  const orderedMenuItems = menuOrder
    .map(key => MENU_ITEMS.find(item => item.key === key))
    .filter((item): item is MenuItemMeta => item !== undefined);

  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await logout();
    }
  };

  const getIcon = (iconName: string): LucideIcon => {
    return iconMap[iconName] || LayoutDashboard;
  };

  return (
    <>
      <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
        {/* 헤더 */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-primary-700">고시방</h1>
            <NotificationBadge />
          </div>
          {settings?.clinic_name && (
            <p className="text-sm text-gray-600 mt-1">{settings.clinic_name}</p>
          )}
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* 편집 모드 헤더 */}
          {isEditMode && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
              <span className="text-xs text-gray-500">드래그하여 순서 변경</span>
              <div className="flex gap-1">
                <button
                  onClick={cancelEdit}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="취소"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={confirmEdit}
                  className="p-1 text-gray-400 hover:text-green-500 transition-colors"
                  title="저장"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 동적 메뉴 (순서 변경 가능, 권한 없는 메뉴는 숨김) */}
          {isEditMode ? (
            // 편집 모드: 드래그앤드롭 가능 (권한 있는 메뉴만)
            orderedMenuItems
              .filter((item) => hasAccess(item.key))
              .map((item) => {
                const Icon = getIcon(item.icon);
                const isDragging = draggedKey === item.key;
                const isDragOver = dragOverKey === item.key;

                return (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={() => handleDragStart(item.key)}
                    onDragOver={(e) => handleDragOver(e, item.key)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, item.key)}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-move transition-all ${
                      isDragging
                        ? 'opacity-50 bg-gray-100'
                        : isDragOver
                        ? 'bg-primary-50 border-2 border-dashed border-primary-300'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <Icon className="w-5 h-5 text-gray-500" />
                    <span className="flex-1 text-sm text-gray-700">{item.label}</span>
                  </div>
                );
              })
          ) : (
            // 일반 모드: 네비게이션 링크
            orderedMenuItems
              .filter((item) => hasAccess(item.key))
              .map((item) => {
                const Icon = getIcon(item.icon);

                return (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`
                    }
                  >
                    <Icon className="w-5 h-5" />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                );
              })
          )}

          {/* 설정 (항상 마지막) */}
          <div className="border-t border-gray-200 my-2 pt-2">
            <NavLink
              to={FIXED_MENU.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <Settings className="w-5 h-5" />
              <span>{FIXED_MENU.label}</span>
            </NavLink>
          </div>

          {/* 순서변경 버튼 (편집 모드가 아닐 때만 표시) */}
          {!isEditMode && (
            <button
              onClick={startEditMode}
              className="w-full mt-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
            >
              메뉴 순서변경
            </button>
          )}

        </nav>

        {/* 사용자 정보 및 로그아웃 */}
        <div className="p-4 border-t border-gray-200">
          <div className="text-sm text-gray-600 mb-1 truncate">
            {authState?.user_email}
          </div>
          <div className="text-xs text-primary-600 mb-2">
            {planName} 플랜
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* 알림 센터 및 토스트 */}
      <NotificationCenter />
      <ToastContainer />
    </>
  );
}
