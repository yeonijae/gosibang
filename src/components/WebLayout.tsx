/**
 * 웹 클라이언트 레이아웃
 */

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  Pill,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';
import { useWebAuthStore, hasPermission } from '../store/webAuthStore';

const navItems = [
  {
    to: '/dashboard',
    icon: LayoutDashboard,
    label: '대시보드',
    permission: null
  },
  {
    to: '/patients',
    icon: Users,
    label: '환자관리',
    permission: 'patients_read' as const
  },
  {
    to: '/charts',
    icon: FileText,
    label: '차트',
    permission: 'charts_read' as const
  },
  {
    to: '/surveys',
    icon: ClipboardList,
    label: '설문',
    permission: 'survey_read' as const
  },
  {
    to: '/medications',
    icon: Pill,
    label: '복약관리',
    permission: 'prescriptions_read' as const
  },
];

export function WebLayout() {
  const navigate = useNavigate();
  const { user, logout } = useWebAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // 권한에 따라 필터링된 네비게이션
  const filteredNavItems = navItems.filter(item =>
    item.permission === null || hasPermission(user, item.permission)
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* 로고 */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏥</span>
              <span className="font-bold text-gray-900">고시방</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">웹</span>
            </div>

            {/* 데스크톱 네비게이션 */}
            <nav className="hidden md:flex items-center gap-1">
              {filteredNavItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* 사용자 정보 및 로그아웃 */}
            <div className="hidden md:flex items-center gap-4">
              <div className="text-sm">
                <span className="text-gray-500">안녕하세요, </span>
                <span className="font-medium text-gray-900">{user?.display_name}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  user?.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                  user?.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {user?.role === 'admin' ? '관리자' : user?.role === 'staff' ? '직원' : '열람자'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                로그아웃
              </button>
            </div>

            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* 모바일 메뉴 */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t bg-white">
            <div className="px-4 py-3 border-b">
              <div className="text-sm">
                <span className="text-gray-500">안녕하세요, </span>
                <span className="font-medium text-gray-900">{user?.display_name}</span>
              </div>
            </div>
            <nav className="px-4 py-2">
              {filteredNavItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm text-red-600 rounded-lg mt-2"
              >
                <LogOut className="w-5 h-5" />
                로그아웃
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
