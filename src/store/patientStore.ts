import { create } from 'zustand';
import { getDb, saveDb, generateUUID, queryToObjects, softDelete } from '../lib/localDb';
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
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      let sql = 'SELECT * FROM patients WHERE deleted_at IS NULL';
      const params: string[] = [];

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      sql += ' ORDER BY created_at DESC';

      const patients = queryToObjects<Patient>(db, sql, params);
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
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const id = generateUUID();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO patients (id, name, birth_date, gender, phone, address, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, patient.name, patient.birth_date || null, patient.gender || null,
         patient.phone || null, patient.address || null, patient.notes || null, now, now]
      );
      saveDb();

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
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();

      db.run(
        `UPDATE patients SET name = ?, birth_date = ?, gender = ?, phone = ?, address = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [patient.name, patient.birth_date || null, patient.gender || null,
         patient.phone || null, patient.address || null, patient.notes || null, now, patient.id]
      );
      saveDb();

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
      const success = softDelete('patients', id);
      if (!success) throw new Error('삭제에 실패했습니다.');

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
      const db = getDb();
      if (!db) return;

      const prescriptions = queryToObjects<Prescription>(
        db,
        'SELECT * FROM prescriptions WHERE patient_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
        [patientId]
      ).map((p) => ({
        ...p,
        merged_herbs: typeof p.merged_herbs === 'string' ? JSON.parse(p.merged_herbs) : p.merged_herbs || [],
        final_herbs: typeof p.final_herbs === 'string' ? JSON.parse(p.final_herbs) : p.final_herbs || [],
      }));

      set({ prescriptions });
    } catch (error) {
      console.error('Failed to load prescriptions:', error);
    }
  },

  loadChartRecords: async (patientId: string) => {
    try {
      const db = getDb();
      if (!db) return;

      const chartRecords = queryToObjects<ChartRecord>(
        db,
        'SELECT * FROM chart_records WHERE patient_id = ? ORDER BY visit_date DESC',
        [patientId]
      );

      set({ chartRecords });
    } catch (error) {
      console.error('Failed to load chart records:', error);
    }
  },

  createChartRecord: async (record) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const id = generateUUID();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO chart_records (id, patient_id, visit_date, chief_complaint, symptoms, diagnosis, treatment, prescription_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, record.patient_id, record.visit_date, record.chief_complaint || null,
         record.symptoms || null, record.diagnosis || null, record.treatment || null,
         record.prescription_id || null, record.notes || null, now, now]
      );
      saveDb();

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
