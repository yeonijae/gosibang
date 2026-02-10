import { create } from 'zustand';
import {
  getMedicationSchedules,
  getMedicationSchedule,
  createMedicationSchedule,
  updateMedicationSchedule,
  deleteMedicationSchedule,
  getMedicationLogs,
  getMedicationLogsByDateRange,
  createMedicationLog,
  updateMedicationLog,
  deleteMedicationLog,
  getMedicationStats,
} from '../lib/localDb';
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
  loadSchedules: (patientId?: string) => void;
  selectSchedule: (schedule: MedicationSchedule | null) => void;
  addSchedule: (schedule: Omit<MedicationSchedule, 'id' | 'created_at'>) => MedicationSchedule | null;
  editSchedule: (id: string, updates: Partial<Omit<MedicationSchedule, 'id' | 'created_at'>>) => boolean;
  removeSchedule: (id: string) => boolean;

  // 기록 관련 액션
  loadLogs: (scheduleId: string) => void;
  loadLogsByDateRange: (scheduleId: string, startDate: string, endDate: string) => void;
  addLog: (log: Omit<MedicationLog, 'id'>) => MedicationLog | null;
  editLog: (id: string, updates: Partial<Omit<MedicationLog, 'id' | 'schedule_id'>>) => boolean;
  removeLog: (id: string) => boolean;

  // 슬롯 관련 액션 (UI용)
  generateSlots: (scheduleId: string) => void;
  updateSlotStatus: (date: string, time: string, status: MedicationStatus, notes?: string) => boolean;

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
        // 과거인데 기록이 없으면 미복용으로 처리
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

  loadSchedules: (patientId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const schedules = getMedicationSchedules(patientId);
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

  addSchedule: (schedule) => {
    try {
      set({ isLoading: true, error: null });
      const newSchedule = createMedicationSchedule(schedule);
      if (newSchedule) {
        set((state) => ({
          schedules: [newSchedule, ...state.schedules],
          isLoading: false,
        }));
      } else {
        set({ error: '복약 일정 생성 실패', isLoading: false });
      }
      return newSchedule;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return null;
    }
  },

  editSchedule: (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      const success = updateMedicationSchedule(id, updates);
      if (success) {
        const updatedSchedule = getMedicationSchedule(id);
        set((state) => ({
          schedules: state.schedules.map((s) =>
            s.id === id && updatedSchedule ? updatedSchedule : s
          ),
          selectedSchedule:
            state.selectedSchedule?.id === id
              ? updatedSchedule
              : state.selectedSchedule,
          isLoading: false,
        }));

        // 슬롯 재생성
        if (get().selectedSchedule?.id === id) {
          get().generateSlots(id);
        }
      } else {
        set({ error: '복약 일정 수정 실패', isLoading: false });
      }
      return success;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return false;
    }
  },

  removeSchedule: (id) => {
    try {
      set({ isLoading: true, error: null });
      const success = deleteMedicationSchedule(id);
      if (success) {
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
          selectedSchedule:
            state.selectedSchedule?.id === id ? null : state.selectedSchedule,
          logs: state.selectedSchedule?.id === id ? [] : state.logs,
          slots: state.selectedSchedule?.id === id ? [] : state.slots,
          stats: state.selectedSchedule?.id === id ? null : state.stats,
          isLoading: false,
        }));
      } else {
        set({ error: '복약 일정 삭제 실패', isLoading: false });
      }
      return success;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return false;
    }
  },

  // ===== 기록 관련 =====

  loadLogs: (scheduleId) => {
    try {
      const logs = getMedicationLogs(scheduleId);
      set({ logs });
    } catch (error) {
      console.error('[loadLogs] 기록 로드 실패:', error);
    }
  },

  loadLogsByDateRange: (scheduleId, startDate, endDate) => {
    try {
      const logs = getMedicationLogsByDateRange(scheduleId, startDate, endDate);
      set({ logs });
    } catch (error) {
      console.error('[loadLogsByDateRange] 기록 로드 실패:', error);
    }
  },

  addLog: (log) => {
    try {
      const newLog = createMedicationLog(log);
      if (newLog) {
        set((state) => ({
          logs: [newLog, ...state.logs],
        }));

        // 슬롯 및 통계 업데이트
        get().generateSlots(log.schedule_id);
        get().loadStats(log.schedule_id);
      }
      return newLog;
    } catch (error) {
      console.error('[addLog] 기록 추가 실패:', error);
      return null;
    }
  },

  editLog: (id, updates) => {
    try {
      const success = updateMedicationLog(id, updates);
      if (success) {
        const log = get().logs.find((l) => l.id === id);
        if (log) {
          set((state) => ({
            logs: state.logs.map((l) =>
              l.id === id ? { ...l, ...updates } : l
            ),
          }));

          // 슬롯 및 통계 업데이트
          get().generateSlots(log.schedule_id);
          get().loadStats(log.schedule_id);
        }
      }
      return success;
    } catch (error) {
      console.error('[editLog] 기록 수정 실패:', error);
      return false;
    }
  },

  removeLog: (id) => {
    try {
      const log = get().logs.find((l) => l.id === id);
      const success = deleteMedicationLog(id);
      if (success) {
        set((state) => ({
          logs: state.logs.filter((l) => l.id !== id),
        }));

        // 슬롯 및 통계 업데이트
        if (log) {
          get().generateSlots(log.schedule_id);
          get().loadStats(log.schedule_id);
        }
      }
      return success;
    } catch (error) {
      console.error('[removeLog] 기록 삭제 실패:', error);
      return false;
    }
  },

  // ===== 슬롯 관련 =====

  generateSlots: (scheduleId) => {
    try {
      const schedule = getMedicationSchedule(scheduleId);
      if (!schedule) {
        set({ slots: [] });
        return;
      }

      const logs = getMedicationLogs(scheduleId);
      const slots = generateMedicationSlots(schedule, logs);
      set({ slots });
    } catch (error) {
      console.error('[generateSlots] 슬롯 생성 실패:', error);
      set({ slots: [] });
    }
  },

  updateSlotStatus: (date, time, status, notes) => {
    try {
      const { selectedSchedule, slots } = get();
      if (!selectedSchedule) return false;

      // 기존 슬롯 찾기
      const slot = slots.find((s) => s.date === date && s.time === time);
      if (!slot) return false;

      // taken_at 생성 (날짜 + 시간)
      const taken_at = `${date}T${time}:00`;

      if (slot.log_id) {
        // 기존 기록 수정
        const success = updateMedicationLog(slot.log_id, { status, notes });
        if (success) {
          set((state) => ({
            logs: state.logs.map((l) =>
              l.id === slot.log_id ? { ...l, status, notes } : l
            ),
            slots: state.slots.map((s) =>
              s.date === date && s.time === time ? { ...s, status } : s
            ),
          }));
          get().loadStats(selectedSchedule.id);
        }
        return success;
      } else {
        // 새 기록 생성
        const newLog = createMedicationLog({
          schedule_id: selectedSchedule.id,
          taken_at,
          status,
          notes,
        });

        if (newLog) {
          set((state) => ({
            logs: [newLog, ...state.logs],
            slots: state.slots.map((s) =>
              s.date === date && s.time === time
                ? { ...s, status, log_id: newLog.id }
                : s
            ),
          }));
          get().loadStats(selectedSchedule.id);
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error('[updateSlotStatus] 상태 업데이트 실패:', error);
      return false;
    }
  },

  // ===== 통계 관련 =====

  loadStats: (scheduleId) => {
    try {
      const stats = getMedicationStats(scheduleId);
      set({ stats });
    } catch (error) {
      console.error('[loadStats] 통계 로드 실패:', error);
      set({ stats: null });
    }
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
