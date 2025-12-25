import { useEffect, useState } from 'react';
import {
  Users,
  Crown,
  Search,
  Edit2,
  Save,
  X,
  Loader2,
  Plus,
  AlertCircle,
  CheckCircle,
  Calendar,
  Settings,
  FileText,
  ClipboardList
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

// 관리자 이메일 목록
const ADMIN_EMAILS = ['crimmy@naver.com'];

// 플랜 정의
const PLANS = [
  { id: 'free', name: '무료', color: 'gray' },
  { id: 'basic', name: '베이직', color: 'blue' },
  { id: 'premium', name: '프리미엄', color: 'purple' },
];

// 상태 정의
const STATUSES = [
  { id: 'active', name: '활성', color: 'green' },
  { id: 'expired', name: '만료', color: 'red' },
  { id: 'cancelled', name: '취소', color: 'gray' },
];

interface Subscription {
  id: string;
  user_id: string;
  user_email: string;
  plan_type: 'free' | 'basic' | 'premium';
  status: 'active' | 'expired' | 'cancelled';
  started_at: string;
  expires_at: string;
  payment_id?: string;
  payment_amount?: number;
  created_at: string;
  updated_at: string;
}

interface PlanPolicy {
  id: number;
  plan_type: 'free' | 'basic' | 'premium';
  display_name: string;
  max_patients: number;
  max_prescriptions_per_month: number;
  max_charts_per_month: number;
  features: {
    survey: boolean;
    export: boolean;
    backup: boolean;
    multiUser: boolean;
  };
  description: string;
  price_monthly: number;
  price_yearly: number;
  is_active: boolean;
}

export function SubscriptionAdmin() {
  const { authState } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'policies'>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [policies, setPolicies] = useState<PlanPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Subscription>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 플랜 정책 편집
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [policyForm, setPolicyForm] = useState<Partial<PlanPolicy>>({});

  // 새 구독 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSubscription, setNewSubscription] = useState({
    user_email: '',
    plan_type: 'free' as const,
    expires_days: 30,
  });

  // 관리자 권한 확인
  const isAdmin = ADMIN_EMAILS.includes(authState?.user_email || '');

  useEffect(() => {
    if (isAdmin) {
      loadSubscriptions();
      loadPolicies();
    }
  }, [isAdmin]);

  const loadPolicies = async () => {
    try {
      const { data, error } = await supabase
        .from('gosibang_plan_policies')
        .select('*')
        .order('id');

      if (error) throw error;
      setPolicies(data || []);
    } catch (err) {
      console.error('Failed to load policies:', err);
    }
  };

  const loadSubscriptions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('gosibang_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError('구독 정보를 불러오는데 실패했습니다.');
    }
    setIsLoading(false);
  };

  const handleEdit = (subscription: Subscription) => {
    setEditingId(subscription.id);
    setEditForm({
      plan_type: subscription.plan_type,
      status: subscription.status,
      expires_at: subscription.expires_at.split('T')[0],
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (id: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('gosibang_subscriptions')
        .update({
          plan_type: editForm.plan_type,
          status: editForm.status,
          expires_at: new Date(editForm.expires_at + 'T23:59:59').toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: '구독 정보가 업데이트되었습니다.' });
      setEditingId(null);
      setEditForm({});
      loadSubscriptions();
    } catch (err) {
      console.error('Failed to save subscription:', err);
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    }
    setIsSaving(false);
  };

  const handleAddSubscription = async () => {
    if (!newSubscription.user_email.trim()) {
      setMessage({ type: 'error', text: '이메일을 입력해주세요.' });
      return;
    }

    setIsSaving(true);
    try {
      // 이미 존재하는지 확인
      const { data: existing } = await supabase
        .from('gosibang_subscriptions')
        .select('id')
        .eq('user_email', newSubscription.user_email)
        .single();

      if (existing) {
        setMessage({ type: 'error', text: '이미 등록된 이메일입니다.' });
        setIsSaving(false);
        return;
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + newSubscription.expires_days);

      const { error } = await supabase
        .from('gosibang_subscriptions')
        .insert({
          user_email: newSubscription.user_email,
          plan_type: newSubscription.plan_type,
          status: 'active',
          expires_at: expiresAt.toISOString(),
        });

      if (error) throw error;

      setMessage({ type: 'success', text: '구독이 추가되었습니다.' });
      setShowAddModal(false);
      setNewSubscription({ user_email: '', plan_type: 'free', expires_days: 30 });
      loadSubscriptions();
    } catch (err) {
      console.error('Failed to add subscription:', err);
      setMessage({ type: 'error', text: '추가에 실패했습니다.' });
    }
    setIsSaving(false);
  };

  // 플랜 정책 편집
  const handleEditPolicy = (policy: PlanPolicy) => {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      display_name: policy.display_name,
      max_patients: policy.max_patients,
      max_prescriptions_per_month: policy.max_prescriptions_per_month,
      max_charts_per_month: policy.max_charts_per_month,
      features: { ...policy.features },
      description: policy.description,
      price_monthly: policy.price_monthly,
      price_yearly: policy.price_yearly,
    });
  };

  const handleCancelPolicyEdit = () => {
    setEditingPolicyId(null);
    setPolicyForm({});
  };

  const handleSavePolicy = async (id: number) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('gosibang_plan_policies')
        .update({
          display_name: policyForm.display_name,
          max_patients: policyForm.max_patients,
          max_prescriptions_per_month: policyForm.max_prescriptions_per_month,
          max_charts_per_month: policyForm.max_charts_per_month,
          features: policyForm.features,
          description: policyForm.description,
          price_monthly: policyForm.price_monthly,
          price_yearly: policyForm.price_yearly,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: '플랜 정책이 업데이트되었습니다.' });
      setEditingPolicyId(null);
      setPolicyForm({});
      loadPolicies();
    } catch (err) {
      console.error('Failed to save policy:', err);
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    }
    setIsSaving(false);
  };

  // 필터링된 구독 목록
  const filteredSubscriptions = subscriptions.filter(sub =>
    sub.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 통계
  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active').length,
    free: subscriptions.filter(s => s.plan_type === 'free').length,
    basic: subscriptions.filter(s => s.plan_type === 'basic').length,
    premium: subscriptions.filter(s => s.plan_type === 'premium').length,
  };

  // 관리자가 아닌 경우
  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
          <p className="text-gray-600">관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">구독 관리</h1>
          <p className="text-sm text-gray-500 mt-1">구독자 및 플랜 정책을 관리합니다</p>
        </div>
        {activeTab === 'subscriptions' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            구독 추가
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'subscriptions'
              ? 'text-primary-600 border-primary-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            구독자 관리
          </div>
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'policies'
              ? 'text-primary-600 border-primary-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            플랜 정책
          </div>
        </button>
      </div>

      {/* 알림 메시지 */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="ml-auto"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 구독자 관리 탭 */}
      {activeTab === 'subscriptions' && (
        <>
      {/* 통계 카드 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-sm">전체</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">활성</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Crown className="w-4 h-4" />
            <span className="text-sm">무료</span>
          </div>
          <p className="text-2xl font-bold text-gray-600">{stats.free}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Crown className="w-4 h-4" />
            <span className="text-sm">베이직</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.basic}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Crown className="w-4 h-4" />
            <span className="text-sm">프리미엄</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{stats.premium}</p>
        </div>
      </div>

      {/* 검색 */}
      <div className="card mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="이메일로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* 구독 목록 */}
      {error ? (
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <button onClick={loadSubscriptions} className="btn-secondary mt-4">
            다시 시도
          </button>
        </div>
      ) : filteredSubscriptions.length === 0 ? (
        <div className="card p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {searchTerm ? '검색 결과가 없습니다.' : '등록된 구독이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">이메일</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">플랜</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">상태</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">만료일</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">가입일</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSubscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{sub.user_email || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === sub.id ? (
                      <select
                        value={editForm.plan_type}
                        onChange={(e) => setEditForm({ ...editForm, plan_type: e.target.value as any })}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        {PLANS.map(plan => (
                          <option key={plan.id} value={plan.id}>{plan.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        sub.plan_type === 'premium' ? 'bg-purple-100 text-purple-700' :
                        sub.plan_type === 'basic' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        <Crown className="w-3 h-3" />
                        {PLANS.find(p => p.id === sub.plan_type)?.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === sub.id ? (
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        {STATUSES.map(status => (
                          <option key={status.id} value={status.id}>{status.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        sub.status === 'active' ? 'bg-green-100 text-green-700' :
                        sub.status === 'expired' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {sub.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {STATUSES.find(s => s.id === sub.status)?.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === sub.id ? (
                      <input
                        type="date"
                        value={editForm.expires_at}
                        onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })}
                        className="px-2 py-1 border rounded text-sm"
                      />
                    ) : (
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(sub.expires_at).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500">
                      {new Date(sub.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === sub.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSave(sub.id)}
                          disabled={isSaving}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(sub)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* 플랜 정책 탭 */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          <div className="card p-4 bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-700">
              <strong>💡 안내:</strong> 플랜 정책을 변경하면 즉시 모든 사용자에게 적용됩니다.
              제한값 -1은 "무제한"을 의미합니다.
            </p>
          </div>

          <div className="grid gap-6">
            {policies.map((policy) => (
              <div key={policy.id} className="card">
                <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Crown className={`w-6 h-6 ${
                      policy.plan_type === 'premium' ? 'text-purple-600' :
                      policy.plan_type === 'basic' ? 'text-blue-600' :
                      'text-gray-600'
                    }`} />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {editingPolicyId === policy.id ? (
                          <input
                            type="text"
                            value={policyForm.display_name || ''}
                            onChange={(e) => setPolicyForm({ ...policyForm, display_name: e.target.value })}
                            className="px-2 py-1 border rounded text-sm"
                          />
                        ) : (
                          policy.display_name
                        )}
                      </h3>
                      <p className="text-sm text-gray-500">{policy.plan_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingPolicyId === policy.id ? (
                      <>
                        <button
                          onClick={() => handleSavePolicy(policy.id)}
                          disabled={isSaving}
                          className="p-2 text-green-600 hover:bg-green-50 rounded"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={handleCancelPolicyEdit}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleEditPolicy(policy)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  {editingPolicyId === policy.id ? (
                    <div className="space-y-4">
                      {/* 제한 설정 */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Users className="w-4 h-4 inline mr-1" />
                            최대 환자 수
                          </label>
                          <input
                            type="number"
                            value={policyForm.max_patients ?? 0}
                            onChange={(e) => setPolicyForm({ ...policyForm, max_patients: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="-1 = 무제한"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <FileText className="w-4 h-4 inline mr-1" />
                            월 처방전 수
                          </label>
                          <input
                            type="number"
                            value={policyForm.max_prescriptions_per_month ?? 0}
                            onChange={(e) => setPolicyForm({ ...policyForm, max_prescriptions_per_month: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="-1 = 무제한"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <ClipboardList className="w-4 h-4 inline mr-1" />
                            월 차트 수
                          </label>
                          <input
                            type="number"
                            value={policyForm.max_charts_per_month ?? 0}
                            onChange={(e) => setPolicyForm({ ...policyForm, max_charts_per_month: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="-1 = 무제한"
                          />
                        </div>
                      </div>

                      {/* 기능 설정 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">기능 활성화</label>
                        <div className="flex flex-wrap gap-4">
                          {Object.entries(policyForm.features || {}).map(([key, value]) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={value}
                                onChange={(e) => setPolicyForm({
                                  ...policyForm,
                                  features: { ...policyForm.features!, [key]: e.target.checked }
                                })}
                                className="w-4 h-4 text-primary-600 rounded"
                              />
                              <span className="text-sm text-gray-700">
                                {key === 'survey' ? '설문' :
                                 key === 'export' ? '내보내기' :
                                 key === 'backup' ? '백업' :
                                 key === 'multiUser' ? '다중사용자' : key}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* 가격 설정 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">월 가격 (원)</label>
                          <input
                            type="number"
                            value={policyForm.price_monthly ?? 0}
                            onChange={(e) => setPolicyForm({ ...policyForm, price_monthly: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">연 가격 (원)</label>
                          <input
                            type="number"
                            value={policyForm.price_yearly ?? 0}
                            onChange={(e) => setPolicyForm({ ...policyForm, price_yearly: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      {/* 설명 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                        <input
                          type="text"
                          value={policyForm.description || ''}
                          onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 제한 표시 */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <Users className="w-5 h-5 mx-auto mb-1 text-gray-500" />
                          <p className="text-xs text-gray-500">최대 환자</p>
                          <p className="font-semibold text-gray-900">
                            {policy.max_patients === -1 ? '무제한' : `${policy.max_patients}명`}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <FileText className="w-5 h-5 mx-auto mb-1 text-gray-500" />
                          <p className="text-xs text-gray-500">월 처방전</p>
                          <p className="font-semibold text-gray-900">
                            {policy.max_prescriptions_per_month === -1 ? '무제한' : `${policy.max_prescriptions_per_month}개`}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <ClipboardList className="w-5 h-5 mx-auto mb-1 text-gray-500" />
                          <p className="text-xs text-gray-500">월 차트</p>
                          <p className="font-semibold text-gray-900">
                            {policy.max_charts_per_month === -1 ? '무제한' : `${policy.max_charts_per_month}개`}
                          </p>
                        </div>
                      </div>

                      {/* 기능 표시 */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2">기능</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(policy.features || {}).map(([key, value]) => (
                            <span
                              key={key}
                              className={`px-2 py-1 rounded-full text-xs ${
                                value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                              }`}
                            >
                              {value ? '✓' : '✗'}{' '}
                              {key === 'survey' ? '설문' :
                               key === 'export' ? '내보내기' :
                               key === 'backup' ? '백업' :
                               key === 'multiUser' ? '다중사용자' : key}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 가격 표시 */}
                      <div className="flex items-center gap-4 pt-2 border-t">
                        <div>
                          <span className="text-xs text-gray-500">월</span>
                          <span className="ml-1 font-semibold text-gray-900">
                            {policy.price_monthly === 0 ? '무료' : `${policy.price_monthly.toLocaleString()}원`}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">연</span>
                          <span className="ml-1 font-semibold text-gray-900">
                            {policy.price_yearly === 0 ? '무료' : `${policy.price_yearly.toLocaleString()}원`}
                          </span>
                        </div>
                        {policy.description && (
                          <p className="text-sm text-gray-500 ml-auto">{policy.description}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 구독 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">구독 추가</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  value={newSubscription.user_email}
                  onChange={(e) => setNewSubscription({ ...newSubscription, user_email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  플랜
                </label>
                <select
                  value={newSubscription.plan_type}
                  onChange={(e) => setNewSubscription({ ...newSubscription, plan_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {PLANS.map(plan => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  유효 기간 (일)
                </label>
                <input
                  type="number"
                  value={newSubscription.expires_days}
                  onChange={(e) => setNewSubscription({ ...newSubscription, expires_days: parseInt(e.target.value) || 30 })}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 btn-secondary"
              >
                취소
              </button>
              <button
                onClick={handleAddSubscription}
                disabled={isSaving}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
