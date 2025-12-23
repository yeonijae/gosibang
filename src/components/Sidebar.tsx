import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  Pill,
  Settings,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useClinicStore } from '../store/clinicStore';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/patients', icon: Users, label: '환자 관리' },
  { to: '/prescriptions', icon: FileText, label: '처방 관리' },
  { to: '/charts', icon: ClipboardList, label: '차팅 관리' },
  { to: '/medications', icon: Pill, label: '복약 관리' },
  { to: '/settings', icon: Settings, label: '설정' },
];

export function Sidebar() {
  const { authState, logout } = useAuthStore();
  const { settings } = useClinicStore();

  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await logout();
    }
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
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 사용자 정보 및 로그아웃 */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-sm text-gray-600 mb-2">
          {authState?.user_email}
        </div>
        {authState?.subscription && (
          <div className="text-xs text-gray-500 mb-3">
            구독: {authState.subscription.plan}
          </div>
        )}
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
