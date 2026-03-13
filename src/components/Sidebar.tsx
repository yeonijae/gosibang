import { useState, useEffect, useRef, useCallback } from 'react';
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
  Package,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useClinicStore } from '../store/clinicStore';
import { useFeatureStore } from '../store/featureStore';
import { loadMenuOrder, saveMenuOrder, MENU_ITEMS, FIXED_MENU } from '../lib/menuConfig';
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
  Package,
  Settings,
  LayoutDashboard,
};

export function Sidebar() {
  const { authState, logout } = useAuthStore();
  const { settings } = useClinicStore();
  const { hasAccess, planName } = useFeatureStore();
  const [menuOrder, setMenuOrder] = useState<FeatureKey[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const originalOrderRef = useRef<FeatureKey[]>([]);
  const [draggedKey, setDraggedKey] = useState<FeatureKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<FeatureKey | null>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

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

  // 포인터 기반 드래그
  const handlePointerDown = useCallback((e: React.PointerEvent, key: FeatureKey) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    isDragging.current = false;
    setDraggedKey(key);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggedKey === null) return;
    const dy = Math.abs(e.clientY - dragStartY.current);
    if (dy > 5) isDragging.current = true;
    if (!isDragging.current) return;

    // 현재 포인터 아래의 메뉴 아이템 찾기
    const elements = document.querySelectorAll('[data-menu-key]');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const overKey = el.getAttribute('data-menu-key') as FeatureKey;
        if (overKey && overKey !== draggedKey) {
          setDragOverKey(overKey);
          // 실시간 순서 변경
          setMenuOrder(prev => {
            const newOrder = [...prev];
            const fromIdx = newOrder.indexOf(draggedKey);
            const toIdx = newOrder.indexOf(overKey);
            if (fromIdx === -1 || toIdx === -1) return prev;
            newOrder.splice(fromIdx, 1);
            newOrder.splice(toIdx, 0, draggedKey);
            return newOrder;
          });
        }
        break;
      }
    }
  }, [draggedKey]);

  const handlePointerUp = useCallback(() => {
    setDraggedKey(null);
    setDragOverKey(null);
    isDragging.current = false;
  }, []);

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
            // 편집 모드: 드래그로 순서 변경
            orderedMenuItems
              .filter((item) => hasAccess(item.key))
              .map((item) => {
                const Icon = getIcon(item.icon);
                const isActive = draggedKey === item.key;
                const isOver = dragOverKey === item.key;
                return (
                  <div
                    key={item.key}
                    data-menu-key={item.key}
                    onPointerDown={(e) => handlePointerDown(e, item.key)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab select-none transition-all ${
                      isActive
                        ? 'opacity-60 bg-primary-100 scale-[1.02] shadow-md'
                        : isOver
                        ? 'bg-primary-50 border-2 border-dashed border-primary-300'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    style={{ touchAction: 'none' }}
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

    </>
  );
}
