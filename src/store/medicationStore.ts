import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  MedicationSchedule,
  MedicationLog,
  MedicationSlot,
  MedicationStats,
  MedicationStatus,
} from '../types';

interface MedicationStore {
  // 상태
  schedules: MedicationSchedule[];
  selectedSchedule: MedicationSchedule | null;
  logs: MedicationLog[];
  slots: MedicationSlot[];
  stats: MedicationStats | null;
  isLoading: boolean;
  error: string | null;

  // 일정 관련 액션
  loadSchedules: (patientId?: string) => Promise<void>;
  selectSchedule: (schedule: MedicationSchedule | null) => void;
  addSchedule: (schedule: Omit<MedicationSchedule, 'id' | 'created_at'>) => Promise<MedicationSchedule | null>;
  editSchedule: (id: string, updates: Partial<Omit<MedicationSchedule, 'id' | 'created_at'>>) => Promise<boolean>;
  removeSchedule: (id: string) => Promise<boolean>;

  // 기록 관련 액션
  loadLogs: (scheduleId: string) => Promise<void>;
  addLog: (log: Omit<MedicationLog, 'id'>) => Promise<MedicationLog | null>;
  editLog: (id: string, updates: Partial<Omit<MedicationLog, 'id' | 'schedule_id'>>) => Promise<boolean>;
  removeLog: (id: string) => Promise<boolean>;

  // 슬롯 관련 액션 (UI용)
  generateSlots: (scheduleId: string) => Promise<void>;
  updateSlotStatus: (date: string, time: string, status: MedicationStatus, notes?: string) => Promise<boolean>;

  // 통계 관련 액션
  loadStats: (scheduleId: string) => void;

  // 유틸리티
  clearError: () => void;
  reset: () => void;
}

// 슬롯 생성 헬퍼 함수
function generateMedicationSlots(
  schedule: MedicationSchedule,
  logs: MedicationLog[]
): MedicationSlot[] {
  const slots: MedicationSlot[] = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().slice(0, 5);

  // 날짜 범위 계산
  const startDate = new Date(schedule.start_date);
  const endDate = new Date(schedule.end_date);

  // 기록을 날짜+시간 키로 매핑
  const logMap = new Map<string, MedicationLog>();
  for (const log of logs) {
    const logDate = log.taken_at.split('T')[0];
    const logTime = log.taken_at.split('T')[1]?.slice(0, 5) || '00:00';
    logMap.set(`${logDate}_${logTime}`, log);
  }

  // 각 날짜별로 슬롯 생성
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    for (const time of schedule.medication_times) {
      const key = `${dateStr}_${time}`;
      const log = logMap.get(key);

      const isPast = dateStr < today || (dateStr === today && time < currentTime);
      const isActive = dateStr === today;

      let status: MedicationStatus | 'pending' = 'pending';
      if (log) {
        status = log.status;
      } else if (isPast) {
        status = 'missed';
      }

      slots.push({
        date: dateStr,
        time,
        schedule_id: schedule.id,
        log_id: log?.id,
        status,
        is_past: isPast,
        is_active: isActive,
      });
    }
  }

  return slots;
}

export const useMedicationStore = create<MedicationStore>((set, get) => ({
  schedules: [],
  selectedSchedule: null,
  logs: [],
  slots: [],
  stats: null,
  isLoading: false,
  error: null,

  // ===== 일정 관련 =====

  loadSchedules: async (patientId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const schedules = await invoke<MedicationSchedule[]>('list_medication_schedules', {
        patientId: patientId || null,
      });
      set({ schedules, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectSchedule: (schedule: MedicationSchedule | null) => {
    set({ selectedSchedule: schedule, logs: [], slots: [], stats: null });
    if (schedule) {
      get().loadLogs(schedule.id);
      get().generateSlots(schedule.id);
      get().loadStats(schedule.id);
    }
  },

  addSchedule: async (schedule) => {
    try {
      set({ isLoading: true, error: null });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const newSchedule: MedicationSchedule = {
        id,
        ...schedule,
        created_at: now,
      } as MedicationSchedule;

      await invoke('create_medication_schedule', { schedule: newSchedule });
      set((state) => ({
        schedules: [newSchedule, ...state.schedules],
        isLoading: false,
      }));
      return newSchedule;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return null;
    }
  },

  editSchedule: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      const existing = get().schedules.find((s) => s.id === id);
      if (!existing) {
        set({ error: '일정을 찾을 수 없습니다', isLoading: false });
        return false;
      }

      const updatedSchedule = { ...existing, ...updates };
      await invoke('update_medication_schedule', { schedule: updatedSchedule });

      set((state) => ({
        schedules: state.schedules.map((s) => (s.id === id ? updatedSchedule : s)),
        selectedSchedule: state.selectedSchedule?.id === id ? updatedSchedule : state.selectedSchedule,
        isLoading: false,
      }));

      if (get().selectedSchedule?.id === id) {
        get().generateSlots(id);
      }
      return true;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return false;
    }
  },

  removeSchedule: async (id) => {
    try {
      set({ isLoading: true, error: null });
      await invoke('delete_medication_schedule', { id });
      set((state) => ({
        schedules: state.schedules.filter((s) => s.id !== id),
        selectedSchedule: state.selectedSchedule?.id === id ? null : state.selectedSchedule,
        logs: state.selectedSchedule?.id === id ? [] : state.logs,
        slots: state.selectedSchedule?.id === id ? [] : state.slots,
        stats: state.selectedSchedule?.id === id ? null : state.stats,
        isLoading: false,
      }));
      return true;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return false;
    }
  },

  // ===== 기록 관련 =====

  loadLogs: async (scheduleId) => {
    try {
      const logs = await invoke<MedicationLog[]>('list_medication_logs', { scheduleId });
      set({ logs });
    } catch (error) {
      console.error('[loadLogs] 기록 로드 실패:', error);
    }
  },

  addLog: async (log) => {
    try {
      const id = crypto.randomUUID();
      const newLog: MedicationLog = { id, ...log } as MedicationLog;
      await invoke('create_medication_log', { log: newLog });
      set((state) => ({ logs: [newLog, ...state.logs] }));
      get().generateSlots(log.schedule_id);
      get().loadStats(log.schedule_id);
      return newLog;
    } catch (error) {
      console.error('[addLog] 기록 추가 실패:', error);
      return null;
    }
  },

  editLog: async (id, updates) => {
    try {
      const log = get().logs.find((l) => l.id === id);
      if (!log) return false;

      await invoke('update_medication_log', {
        id,
        status: updates.status || log.status,
        notes: updates.notes ?? log.notes,
      });

      set((state) => ({
        logs: state.logs.map((l) => (l.id === id ? { ...l, ...updates } : l)),
      }));

      get().generateSlots(log.schedule_id);
      get().loadStats(log.schedule_id);
      return true;
    } catch (error) {
      console.error('[editLog] 기록 수정 실패:', error);
      return false;
    }
  },

  removeLog: async (id) => {
    try {
      const log = get().logs.find((l) => l.id === id);
      await invoke('delete_medication_log', { id });
      set((state) => ({
        logs: state.logs.filter((l) => l.id !== id),
      }));
      if (log) {
        get().generateSlots(log.schedule_id);
        get().loadStats(log.schedule_id);
      }
      return true;
    } catch (error) {
      console.error('[removeLog] 기록 삭제 실패:', error);
      return false;
    }
  },

  // ===== 슬롯 관련 =====

  generateSlots: async (scheduleId) => {
    try {
      const schedule = await invoke<MedicationSchedule | null>('get_medication_schedule', { id: scheduleId });
      if (!schedule) {
        set({ slots: [] });
        return;
      }

      const logs = await invoke<MedicationLog[]>('list_medication_logs', { scheduleId });
      const slots = generateMedicationSlots(schedule, logs);
      set({ slots });
    } catch (error) {
      console.error('[generateSlots] 슬롯 생성 실패:', error);
      set({ slots: [] });
    }
  },

  updateSlotStatus: async (date, time, status, notes) => {
    try {
      const { selectedSchedule, slots } = get();
      if (!selectedSchedule) return false;

      const slot = slots.find((s) => s.date === date && s.time === time);
      if (!slot) return false;

      const taken_at = `${date}T${time}:00`;

      if (slot.log_id) {
        await invoke('update_medication_log', { id: slot.log_id, status, notes });
        set((state) => ({
          logs: state.logs.map((l) =>
            l.id === slot.log_id ? { ...l, status, notes } : l
          ),
          slots: state.slots.map((s) =>
            s.date === date && s.time === time ? { ...s, status } : s
          ),
        }));
        get().loadStats(selectedSchedule.id);
        return true;
      } else {
        const id = crypto.randomUUID();
        const newLog: MedicationLog = {
          id,
          schedule_id: selectedSchedule.id,
          taken_at,
          status,
          notes,
        } as MedicationLog;

        await invoke('create_medication_log', { log: newLog });
        set((state) => ({
          logs: [newLog, ...state.logs],
          slots: state.slots.map((s) =>
            s.date === date && s.time === time
              ? { ...s, status, log_id: id }
              : s
          ),
        }));
        get().loadStats(selectedSchedule.id);
        return true;
      }
    } catch (error) {
      console.error('[updateSlotStatus] 상태 업데이트 실패:', error);
      return false;
    }
  },

  // ===== 통계 관련 =====

  loadStats: (_scheduleId) => {
    // Stats will be calculated from logs on the frontend side
    // or we can add a dedicated command later
    set({ stats: null });
  },

  // ===== 유틸리티 =====

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      schedules: [],
      selectedSchedule: null,
      logs: [],
      slots: [],
      stats: null,
      isLoading: false,
      error: null,
    }),
}));
