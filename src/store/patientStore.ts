import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Patient, Prescription, ChartRecord } from '../types';

interface PatientStore {
  patients: Patient[];
  selectedPatient: Patient | null;
  prescriptions: Prescription[];
  chartRecords: ChartRecord[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPatients: (search?: string) => Promise<void>;
  selectPatient: (patient: Patient | null) => void;
  createPatient: (patient: Omit<Patient, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updatePatient: (patient: Patient) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
  loadPrescriptions: (patientId: string) => Promise<void>;
  loadChartRecords: (patientId: string) => Promise<void>;
  createChartRecord: (record: Omit<ChartRecord, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  clearError: () => void;
}

export const usePatientStore = create<PatientStore>((set, get) => ({
  patients: [],
  selectedPatient: null,
  prescriptions: [],
  chartRecords: [],
  isLoading: false,
  error: null,

  loadPatients: async (search?: string) => {
    set({ isLoading: true, error: null });
    try {
      const patients = await invoke<Patient[]>('list_patients', { search: search || null });
      set({ patients, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectPatient: (patient: Patient | null) => {
    set({ selectedPatient: patient, prescriptions: [], chartRecords: [] });
    if (patient) {
      get().loadPrescriptions(patient.id);
      get().loadChartRecords(patient.id);
    }
  },

  createPatient: async (patient) => {
    set({ isLoading: true, error: null });
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const newPatient: Patient = {
        id,
        name: patient.name,
        chart_number: patient.chart_number || undefined,
        birth_date: patient.birth_date || undefined,
        gender: patient.gender || undefined,
        phone: patient.phone || undefined,
        address: patient.address || undefined,
        notes: patient.notes || undefined,
        created_at: now,
        updated_at: now,
      };

      await invoke('create_patient', { patient: newPatient });
      await get().loadPatients();
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updatePatient: async (patient: Patient) => {
    set({ isLoading: true, error: null });
    try {
      const now = new Date().toISOString();
      const updatedPatient = { ...patient, updated_at: now };

      await invoke('update_patient', { patient: updatedPatient });
      await get().loadPatients();
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  deletePatient: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('delete_patient', { id });

      await get().loadPatients();
      if (get().selectedPatient?.id === id) {
        set({ selectedPatient: null });
      }
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  loadPrescriptions: async (patientId: string) => {
    try {
      const prescriptions = await invoke<Prescription[]>('get_prescriptions_by_patient', { patientId });
      // JSON 문자열을 객체로 파싱
      const parsed = prescriptions.map((p) => ({
        ...p,
        merged_herbs: typeof p.merged_herbs === 'string' ? JSON.parse(p.merged_herbs) : p.merged_herbs || [],
        final_herbs: typeof p.final_herbs === 'string' ? JSON.parse(p.final_herbs) : p.final_herbs || [],
      }));
      set({ prescriptions: parsed });
    } catch (error) {
      console.error('Failed to load prescriptions:', error);
    }
  },

  loadChartRecords: async (patientId: string) => {
    try {
      const chartRecords = await invoke<ChartRecord[]>('get_chart_records_by_patient', { patientId });
      set({ chartRecords });
    } catch (error) {
      console.error('Failed to load chart records:', error);
    }
  },

  createChartRecord: async (record) => {
    set({ isLoading: true, error: null });
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const newRecord: ChartRecord = {
        id,
        patient_id: record.patient_id,
        visit_date: record.visit_date,
        chief_complaint: record.chief_complaint || undefined,
        symptoms: record.symptoms || undefined,
        diagnosis: record.diagnosis || undefined,
        treatment: record.treatment || undefined,
        prescription_id: record.prescription_id || undefined,
        notes: record.notes || undefined,
        created_at: now,
        updated_at: now,
      };

      await invoke('create_chart_record', { record: newRecord });

      if (get().selectedPatient) {
        await get().loadChartRecords(get().selectedPatient!.id);
      }
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
