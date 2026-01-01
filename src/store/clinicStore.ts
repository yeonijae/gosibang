import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { getDb, saveDb, generateUUID, queryOne } from '../lib/localDb';
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
      const db = getDb();
      if (!db) {
        set({ settings: null, isLoading: false });
        return;
      }

      const settings = queryOne<ClinicSettings>(
        db,
        'SELECT * FROM clinic_settings LIMIT 1'
      );

      set({ settings, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  saveSettings: async (settings: ClinicSettings) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();
      const existing = queryOne<ClinicSettings>(db, 'SELECT * FROM clinic_settings LIMIT 1');

      if (existing) {
        db.run(
          `UPDATE clinic_settings SET clinic_name = ?, clinic_address = ?, clinic_phone = ?, doctor_name = ?, license_number = ?, updated_at = ?
           WHERE id = ?`,
          [settings.clinic_name, settings.clinic_address || null, settings.clinic_phone || null,
           settings.doctor_name || null, settings.license_number || null, now, existing.id]
        );
      } else {
        const id = settings.id || generateUUID();
        db.run(
          `INSERT INTO clinic_settings (id, clinic_name, clinic_address, clinic_phone, doctor_name, license_number, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, settings.clinic_name, settings.clinic_address || null, settings.clinic_phone || null,
           settings.doctor_name || null, settings.license_number || null, now, now]
        );
      }
      saveDb();

      // 백엔드 rusqlite에도 저장 (HTTP 서버용)
      try {
        await invoke('save_clinic_settings', { settings });
      } catch (e) {
        console.warn('백엔드 설정 저장 실패:', e);
      }

      set({ settings: { ...settings, updated_at: now }, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
