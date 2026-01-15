import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Homework, HomeworkSubmission } from '../types';

interface HomeworkStore {
  // 상태
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  mySubmissions: HomeworkSubmission[];
  isLoading: boolean;
  error: string | null;

  // 숙제 관련 (관리자용)
  loadHomeworks: () => Promise<void>;
  createHomework: (data: Omit<Homework, 'id' | 'created_at' | 'updated_at'>) => Promise<Homework>;
  updateHomework: (id: string, data: Partial<Homework>) => Promise<void>;
  deleteHomework: (id: string) => Promise<void>;

  // 제출 관련 (사용자용)
  loadMySubmissions: () => Promise<void>;
  submitHomework: (homeworkId: string, answer: string) => Promise<void>;
  updateSubmission: (id: string, answer: string) => Promise<void>;

  // 제출 관리 (관리자용)
  loadAllSubmissions: (homeworkId?: string) => Promise<void>;
  reviewSubmission: (id: string, feedback: string) => Promise<void>;

  // 실시간 구독
  subscribeToHomeworks: () => () => void;
}

export const useHomeworkStore = create<HomeworkStore>((set, get) => ({
  homeworks: [],
  submissions: [],
  mySubmissions: [],
  isLoading: false,
  error: null,

  // ===== 숙제 관련 (관리자용) =====

  loadHomeworks: async () => {
    try {
      set({ isLoading: true, error: null });
      console.log('[DEBUG] loadHomeworks 시작');

      const { data, error } = await supabase
        .from('gosibang_homework')
        .select('*')
        .order('due_date', { ascending: true });

      console.log('[DEBUG] loadHomeworks 결과:', { data, error });

      if (error) throw error;

      set({ homeworks: data || [], isLoading: false });
      console.log('[DEBUG] homeworks 상태 설정 완료, 개수:', data?.length || 0);
    } catch (error) {
      console.error('[Homework] 숙제 로드 실패:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  createHomework: async (data) => {
    try {
      set({ isLoading: true, error: null });

      const { data: newHomework, error } = await supabase
        .from('gosibang_homework')
        .insert({
          title: data.title,
          description: data.description,
          attachment_url: data.attachment_url,
          attachment_name: data.attachment_name,
          due_date: data.due_date,
          is_active: data.is_active ?? true,
          created_by: data.created_by,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        homeworks: [...state.homeworks, newHomework],
        isLoading: false,
      }));

      return newHomework;
    } catch (error) {
      console.error('[Homework] 숙제 생성 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateHomework: async (id, data) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('gosibang_homework')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        homeworks: state.homeworks.map((h) =>
          h.id === id ? { ...h, ...data } : h
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Homework] 숙제 수정 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  deleteHomework: async (id) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('gosibang_homework')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        homeworks: state.homeworks.filter((h) => h.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Homework] 숙제 삭제 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // ===== 제출 관련 (사용자용) =====

  loadMySubmissions: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다');

      const { data, error } = await supabase
        .from('gosibang_homework_submissions')
        .select(`
          *,
          gosibang_homework (title)
        `)
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const submissions: HomeworkSubmission[] = (data || []).map((s) => ({
        ...s,
        homework_title: s.gosibang_homework?.title,
      }));

      set({ mySubmissions: submissions, isLoading: false });
    } catch (error) {
      console.error('[Homework] 내 제출 로드 실패:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  submitHomework: async (homeworkId, answer) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다');

      const { data, error } = await supabase
        .from('gosibang_homework_submissions')
        .insert({
          homework_id: homeworkId,
          user_id: user.id,
          user_email: user.email,
          answer,
          status: 'submitted',
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        mySubmissions: [data, ...state.mySubmissions],
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Homework] 숙제 제출 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateSubmission: async (id, answer) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('gosibang_homework_submissions')
        .update({
          answer,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        mySubmissions: state.mySubmissions.map((s) =>
          s.id === id ? { ...s, answer } : s
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Homework] 제출 수정 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // ===== 제출 관리 (관리자용) =====

  loadAllSubmissions: async (homeworkId) => {
    try {
      set({ isLoading: true, error: null });

      let query = supabase
        .from('gosibang_homework_submissions')
        .select(`
          *,
          gosibang_homework (title)
        `)
        .order('submitted_at', { ascending: false });

      if (homeworkId) {
        query = query.eq('homework_id', homeworkId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const submissions: HomeworkSubmission[] = (data || []).map((s) => ({
        ...s,
        homework_title: s.gosibang_homework?.title,
      }));

      set({ submissions, isLoading: false });
    } catch (error) {
      console.error('[Homework] 전체 제출 로드 실패:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  reviewSubmission: async (id, feedback) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('gosibang_homework_submissions')
        .update({
          feedback,
          status: 'reviewed',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.email,
        })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        submissions: state.submissions.map((s) =>
          s.id === id
            ? {
                ...s,
                feedback,
                status: 'reviewed' as const,
                reviewed_at: new Date().toISOString(),
                reviewed_by: user?.email,
              }
            : s
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Homework] 피드백 작성 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // ===== 실시간 구독 =====

  subscribeToHomeworks: () => {
    const channel = supabase
      .channel('homework-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gosibang_homework',
        },
        () => {
          // 변경 시 숙제 목록 새로고침
          get().loadHomeworks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
