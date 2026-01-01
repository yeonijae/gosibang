import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { FeatureKey, PlanFeatures } from '../types';

// 기본 기능 (모든 플랜에서 사용 가능)
const DEFAULT_FEATURES: PlanFeatures = {
  dashboard: true,
  patients: true,
  prescriptions: true,
  prescription_definitions: true,
  prescription_definitions_edit: false,  // 무료 플랜은 처방정의 수정 불가
  charts: true,
  survey_templates: false,
  survey_responses: false,
  medication: false,
  survey_internal: false,   // 무료: 내부 설문 불가
  survey_external: false,   // 무료: 외부 설문 불가
  backup: false,
  export: false,
  multiUser: false,
};

interface FeatureStore {
  features: PlanFeatures;
  planType: string;
  planName: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadFeatures: (planType?: string) => Promise<void>;
  hasAccess: (featureKey: FeatureKey) => boolean;
  clearFeatures: () => void;
}

export const useFeatureStore = create<FeatureStore>((set, get) => ({
  features: DEFAULT_FEATURES,
  planType: 'free',
  planName: '무료',
  isLoading: false,
  error: null,

  loadFeatures: async (planType?: string) => {
    set({ isLoading: true, error: null });
    try {
      // planType이 없으면 free 사용
      const targetPlan = planType || 'free';

      const { data, error } = await supabase
        .from('gosibang_plan_policies')
        .select('plan_type, display_name, features')
        .eq('plan_type', targetPlan)
        .single();

      if (error) {
        console.error('Failed to load features:', error);
        set({ features: DEFAULT_FEATURES, isLoading: false });
        return;
      }

      if (data) {
        const features = data.features as PlanFeatures || DEFAULT_FEATURES;
        set({
          features,
          planType: data.plan_type,
          planName: data.display_name,
          isLoading: false,
        });
      } else {
        set({ features: DEFAULT_FEATURES, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load features:', error);
      set({ features: DEFAULT_FEATURES, isLoading: false, error: String(error) });
    }
  },

  hasAccess: (featureKey: FeatureKey) => {
    const { features } = get();
    return features[featureKey] ?? false;
  },

  clearFeatures: () => {
    set({ features: DEFAULT_FEATURES, planType: 'free', planName: '무료' });
  },
}));
