import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
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
      const settings = await invoke<ClinicSettings | null>('get_clinic_settings');
      set({ settings, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  saveSettings: async (settings: ClinicSettings) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('save_clinic_settings', { settings });
      const now = new Date().toISOString();
      set({ settings: { ...settings, updated_at: now }, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
