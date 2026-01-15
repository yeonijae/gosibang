import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { FeatureKey, PlanFeatures } from '../types';

// 기본 기능 (비기너 플랜 기준)
const DEFAULT_FEATURES: PlanFeatures = {
  dashboard: true,
  patients: true,
  prescriptions: true,
  prescription_definitions: true,
  prescription_definitions_edit: false,  // 비기너 플랜은 처방정의 수정 불가
  charts: true,
  survey_templates: false,
  survey_responses: false,
  medication: false,
  survey_internal: false,   // 비기너: 내부 설문 불가
  survey_external: false,   // 비기너: 외부 설문 불가
  homework: false,          // 비기너: 숙제 기능 불가 (챌린저/마스터 플랜 전용)
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
  planType: 'beginner',
  planName: '비기너',
  isLoading: false,
  error: null,

  loadFeatures: async (planType?: string) => {
    set({ isLoading: true, error: null });
    try {
      // planType이 없으면 beginner 사용
      const targetPlan = planType || 'beginner';

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
    set({ features: DEFAULT_FEATURES, planType: 'beginner', planName: '비기너' });
  },
}));
