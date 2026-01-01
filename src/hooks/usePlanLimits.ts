import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { getDb } from '../lib/localDb';

interface PlanPolicy {
  plan_type: 'free' | 'basic' | 'premium';
  display_name: string;
  max_patients: number;
  max_prescriptions_per_month: number;
  max_charts_per_month: number;
  features: {
    survey: boolean;
    survey_internal: boolean;  // 내부 설문 (태블릿/인트라넷)
    survey_external: boolean;  // 외부 설문 (온라인 링크)
    export: boolean;
    backup: boolean;
    multiUser: boolean;
  };
}

interface Subscription {
  plan_type: 'free' | 'basic' | 'premium';
  status: 'active' | 'expired' | 'cancelled';
  expires_at: string;
}

interface UsageStats {
  patients: number;
  prescriptionsThisMonth: number;
  chartsThisMonth: number;
}

interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  message?: string;
}

export function usePlanLimits() {
  const { authState } = useAuthStore();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [policy, setPolicy] = useState<PlanPolicy | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ patients: 0, prescriptionsThisMonth: 0, chartsThisMonth: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // 구독 및 정책 로드
  useEffect(() => {
    if (!authState?.user_email) {
      setIsLoading(false);
      return;
    }

    loadSubscriptionAndPolicy();
  }, [authState?.user_email]);

  const loadSubscriptionAndPolicy = async () => {
    setIsLoading(true);
    try {
      console.log('[usePlanLimits] Loading subscription for email:', authState?.user_email);

      // 구독 정보 가져오기
      const { data: subData, error: subError } = await supabase
        .from('gosibang_subscriptions')
        .select('plan_type, status, expires_at')
        .eq('user_email', authState?.user_email)
        .single();

      console.log('[usePlanLimits] Subscription data:', subData, 'error:', subError);

      // 구독이 없으면 무료 플랜 기본값
      const currentSubscription: Subscription = subData || {
        plan_type: 'free',
        status: 'active',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // 만료된 구독은 무료 플랜으로 처리 (expires_at이 null이면 만료 없음)
      const isExpired = currentSubscription.status === 'expired' ||
        (currentSubscription.expires_at && new Date(currentSubscription.expires_at) < new Date());
      if (isExpired) {
        currentSubscription.plan_type = 'free';
      }

      setSubscription(currentSubscription);
      console.log('[usePlanLimits] Using subscription plan_type:', currentSubscription.plan_type);

      // 플랜 정책 가져오기
      const { data: policyData, error: policyError } = await supabase
        .from('gosibang_plan_policies')
        .select('plan_type, display_name, max_patients, max_prescriptions_per_month, max_charts_per_month, features')
        .eq('plan_type', currentSubscription.plan_type)
        .single();

      console.log('[usePlanLimits] Policy data:', policyData, 'error:', policyError);

      // 정책이 없으면 기본값
      const defaultPolicy: PlanPolicy = {
        plan_type: 'free',
        display_name: '무료',
        max_patients: 10,
        max_prescriptions_per_month: 20,
        max_charts_per_month: 20,
        features: { survey: false, survey_internal: false, survey_external: false, export: false, backup: false, multiUser: false },
      };

      setPolicy(policyData || defaultPolicy);
    } catch (err) {
      console.error('Failed to load subscription/policy:', err);
      // 에러 시 무료 플랜 기본값
      setSubscription({ plan_type: 'free', status: 'active', expires_at: '' });
      setPolicy({
        plan_type: 'free',
        display_name: '무료',
        max_patients: 10,
        max_prescriptions_per_month: 20,
        max_charts_per_month: 20,
        features: { survey: false, survey_internal: false, survey_external: false, export: false, backup: false, multiUser: false },
      });
    }
    setIsLoading(false);
  };

  // 사용량 계산
  const refreshUsage = useCallback(async () => {
    const db = getDb();
    if (!db) return;

    try {
      // 환자 수
      const patientsResult = db.exec('SELECT COUNT(*) as count FROM patients');
      const patientCount = patientsResult[0]?.values[0]?.[0] as number || 0;

      // 이번 달 처방 수
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const prescriptionsResult = db.exec(
        `SELECT COUNT(*) as count FROM prescriptions WHERE created_at >= '${firstDayOfMonth}'`
      );
      const prescriptionCount = prescriptionsResult[0]?.values[0]?.[0] as number || 0;

      // 이번 달 차트 수 (initial_charts 테이블 사용)
      const chartsResult = db.exec(
        `SELECT COUNT(*) as count FROM initial_charts WHERE created_at >= '${firstDayOfMonth}'`
      );
      const chartCount = chartsResult[0]?.values[0]?.[0] as number || 0;

      setUsage({
        patients: patientCount,
        prescriptionsThisMonth: prescriptionCount,
        chartsThisMonth: chartCount,
      });
    } catch (err) {
      console.error('Failed to calculate usage:', err);
    }
  }, []);

  useEffect(() => {
    const db = getDb();
    if (db) {
      refreshUsage();
    }
  }, [refreshUsage]);

  // 환자 추가 가능 여부
  const canAddPatient = useCallback((): LimitCheckResult => {
    if (!policy) return { allowed: true, current: 0, limit: -1 };

    const limit = policy.max_patients;
    if (limit === -1) return { allowed: true, current: usage.patients, limit: -1 };

    const allowed = usage.patients < limit;
    return {
      allowed,
      current: usage.patients,
      limit,
      message: allowed ? undefined : `환자 등록 한도(${limit}명)에 도달했습니다. 플랜을 업그레이드해주세요.`,
    };
  }, [policy, usage.patients]);

  // 처방 추가 가능 여부
  const canAddPrescription = useCallback((): LimitCheckResult => {
    if (!policy) return { allowed: true, current: 0, limit: -1 };

    const limit = policy.max_prescriptions_per_month;
    if (limit === -1) return { allowed: true, current: usage.prescriptionsThisMonth, limit: -1 };

    const allowed = usage.prescriptionsThisMonth < limit;
    return {
      allowed,
      current: usage.prescriptionsThisMonth,
      limit,
      message: allowed ? undefined : `이번 달 처방전 한도(${limit}개)에 도달했습니다. 플랜을 업그레이드해주세요.`,
    };
  }, [policy, usage.prescriptionsThisMonth]);

  // 차트 추가 가능 여부
  const canAddChart = useCallback((): LimitCheckResult => {
    if (!policy) return { allowed: true, current: 0, limit: -1 };

    const limit = policy.max_charts_per_month;
    if (limit === -1) return { allowed: true, current: usage.chartsThisMonth, limit: -1 };

    const allowed = usage.chartsThisMonth < limit;
    return {
      allowed,
      current: usage.chartsThisMonth,
      limit,
      message: allowed ? undefined : `이번 달 차트 한도(${limit}개)에 도달했습니다. 플랜을 업그레이드해주세요.`,
    };
  }, [policy, usage.chartsThisMonth]);

  // 기능 사용 가능 여부
  const canUseFeature = useCallback((feature: keyof PlanPolicy['features']): boolean => {
    if (!policy) {
      console.log('[canUseFeature] policy is null, returning false for:', feature);
      return false;
    }
    const result = policy.features[feature] ?? false;
    console.log('[canUseFeature]', feature, '=', result, 'from policy:', policy.plan_type, 'features:', policy.features);
    return result;
  }, [policy]);

  // 플랜 정보
  const planInfo = {
    type: subscription?.plan_type || 'free',
    name: policy?.display_name || '무료',
    isExpired: subscription ? new Date(subscription.expires_at) < new Date() : false,
    expiresAt: subscription?.expires_at,
  };

  return {
    isLoading,
    subscription,
    policy,
    usage,
    planInfo,
    canAddPatient,
    canAddPrescription,
    canAddChart,
    canUseFeature,
    refreshUsage,
    reload: loadSubscriptionAndPolicy,
  };
}
