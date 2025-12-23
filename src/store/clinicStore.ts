import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { ClinicSettings } from '../types';

interface ClinicStore {
  settings: ClinicSettings | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: (settings: ClinicSettings) => Promise<void>;
  clearError: () => void;
}

export const useClinicStore = create<ClinicStore>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        set({ settings: null, isLoading: false });
        return;
      }

      const { data, error } = await supabase
        .from('clinic_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      set({ settings: data, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  saveSettings: async (settings: ClinicSettings) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증되지 않은 사용자입니다.');

      const { error } = await supabase
        .from('clinic_settings')
        .upsert({
          ...settings,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      set({ settings, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
