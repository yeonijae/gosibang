import { useState, useEffect } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useClinicStore } from '../store/clinicStore';
import { useFeatureStore } from '../store/featureStore';
import { loadMenuOrder, MENU_ITEMS, FIXED_MENU } from '../lib/menuConfig';
import type { FeatureKey, MenuItemMeta } from '../types';

// 아이콘 매핑
const iconMap: Record<string, LucideIcon> = {
  Users,
  FileText,
  Book: BookOpen,
  ClipboardList,
  FileQuestion: ClipboardCheck,
  MessageSquare,
  Pill,
  Settings,
  LayoutDashboard,
};

export function Sidebar() {
  const { authState, logout } = useAuthStore();
  const { settings } = useClinicStore();
  const { hasAccess, planName } = useFeatureStore();

  const [menuOrder, setMenuOrder] = useState<FeatureKey[]>([]);

  // 메뉴 순서 로드
  useEffect(() => {
    setMenuOrder(loadMenuOrder());
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
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* 헤더 */}
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary-700">고시방</h1>
          {settings?.clinic_name && (
            <p className="text-sm text-gray-600 mt-1">{settings.clinic_name}</p>
          )}
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* 동적 메뉴 (순서 변경 가능, 권한 없는 메뉴는 숨김) */}
          {orderedMenuItems
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
            })}

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
  );
}
