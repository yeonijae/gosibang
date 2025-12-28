import type { FeatureKey, MenuItemMeta } from '../types';

// 메뉴 아이템 정의
export const MENU_ITEMS: MenuItemMeta[] = [
  { key: 'dashboard', label: '대시보드', icon: 'LayoutDashboard', path: '/' },
  { key: 'patients', label: '환자관리', icon: 'Users', path: '/patients' },
  { key: 'prescriptions', label: '처방관리', icon: 'FileText', path: '/prescriptions' },
  { key: 'prescription_definitions', label: '처방정의', icon: 'Book', path: '/prescription-definitions' },
  { key: 'charts', label: '차팅관리', icon: 'ClipboardList', path: '/charts' },
  { key: 'survey_templates', label: '설문관리', icon: 'FileQuestion', path: '/survey-templates' },
  { key: 'survey_responses', label: '설문응답', icon: 'MessageSquare', path: '/survey-responses' },
  { key: 'medication', label: '복약관리', icon: 'Pill', path: '/medication' },
];

// 고정 메뉴 (순서 변경 불가)
export const FIXED_MENU = {
  key: 'settings',
  label: '설정',
  icon: 'Settings',
  path: '/settings',
};

// 기본 메뉴 순서
export const DEFAULT_MENU_ORDER: FeatureKey[] = [
  'dashboard',
  'patients',
  'prescriptions',
  'prescription_definitions',
  'charts',
  'survey_templates',
  'survey_responses',
  'medication',
];

// localStorage 키
const MENU_ORDER_KEY = 'gosibang_menu_order';

// 메뉴 순서 로드
export function loadMenuOrder(): FeatureKey[] {
  try {
    const saved = localStorage.getItem(MENU_ORDER_KEY);
    if (saved) {
      const order = JSON.parse(saved) as FeatureKey[];
      // 유효성 검사: 모든 메뉴가 포함되어 있는지 확인
      const allKeys = new Set(DEFAULT_MENU_ORDER);
      const savedKeys = new Set(order);

      if (allKeys.size === savedKeys.size &&
          [...allKeys].every(key => savedKeys.has(key))) {
        return order;
      }
    }
  } catch (e) {
    console.error('Failed to load menu order:', e);
  }
  return DEFAULT_MENU_ORDER;
}

// 메뉴 순서 저장
export function saveMenuOrder(order: FeatureKey[]): void {
  try {
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(order));
  } catch (e) {
    console.error('Failed to save menu order:', e);
  }
}

// 메뉴 순서 초기화
export function resetMenuOrder(): FeatureKey[] {
  localStorage.removeItem(MENU_ORDER_KEY);
  return DEFAULT_MENU_ORDER;
}

// 순서에 따라 정렬된 메뉴 아이템 반환
export function getOrderedMenuItems(order?: FeatureKey[]): MenuItemMeta[] {
  const menuOrder = order || loadMenuOrder();

  return menuOrder
    .map(key => MENU_ITEMS.find(item => item.key === key))
    .filter((item): item is MenuItemMeta => item !== undefined);
}

// 메뉴 아이템 위로 이동
export function moveMenuUp(order: FeatureKey[], key: FeatureKey): FeatureKey[] {
  const index = order.indexOf(key);
  if (index <= 0) return order;

  const newOrder = [...order];
  [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
  return newOrder;
}

// 메뉴 아이템 아래로 이동
export function moveMenuDown(order: FeatureKey[], key: FeatureKey): FeatureKey[] {
  const index = order.indexOf(key);
  if (index < 0 || index >= order.length - 1) return order;

  const newOrder = [...order];
  [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
  return newOrder;
}
