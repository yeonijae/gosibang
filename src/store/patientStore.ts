import { create } from 'zustand';
import { supabase } from '../lib/supabase';
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
  createPrescription: (prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
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
      let query = supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ patients: data || [], isLoading: false });
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
      const { error } = await supabase
        .from('patients')
        .insert(patient);

      if (error) throw error;
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
      const { error } = await supabase
        .from('patients')
        .update({
          ...patient,
          updated_at: new Date().toISOString(),
        })
        .eq('id', patient.id);

      if (error) throw error;
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
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ prescriptions: data || [] });
    } catch (error) {
      console.error('Failed to load prescriptions:', error);
    }
  },

  createPrescription: async (prescription) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('prescriptions')
        .insert(prescription);

      if (error) throw error;
      if (get().selectedPatient) {
        await get().loadPrescriptions(get().selectedPatient!.id);
      }
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  loadChartRecords: async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('chart_records')
        .select('*')
        .eq('patient_id', patientId)
        .order('visit_date', { ascending: false });

      if (error) throw error;
      set({ chartRecords: data || [] });
    } catch (error) {
      console.error('Failed to load chart records:', error);
    }
  },

  createChartRecord: async (record) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('chart_records')
        .insert(record);

      if (error) throw error;
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
