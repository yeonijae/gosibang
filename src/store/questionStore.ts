import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Question, QuestionCategory } from '../types';

interface QuestionStore {
  // 상태
  questions: Question[];
  myQuestions: Question[];
  isLoading: boolean;
  error: string | null;

  // 사용자 기능
  loadMyQuestions: () => Promise<void>;
  createQuestion: (data: {
    title: string;
    content: string;
    category?: QuestionCategory;
  }) => Promise<Question>;
  updateQuestion: (id: string, data: {
    title?: string;
    content?: string;
    category?: QuestionCategory;
  }) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;

  // 관리자 기능
  loadAllQuestions: (status?: QuestionStatus) => Promise<void>;
  answerQuestion: (id: string, answer: string) => Promise<void>;

  // 실시간 구독
  subscribeToQuestions: () => () => void;
}

type QuestionStatus = 'pending' | 'answered';

export const useQuestionStore = create<QuestionStore>((set, get) => ({
  questions: [],
  myQuestions: [],
  isLoading: false,
  error: null,

  // ===== 사용자 기능 =====

  loadMyQuestions: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다');

      const { data, error } = await supabase
        .from('gosibang_questions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ myQuestions: data || [], isLoading: false });
    } catch (error) {
      console.error('[Question] 내 질문 로드 실패:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  createQuestion: async (data) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다');

      const { data: newQuestion, error } = await supabase
        .from('gosibang_questions')
        .insert({
          user_id: user.id,
          user_email: user.email,
          user_name: user.user_metadata?.name || null,
          title: data.title,
          content: data.content,
          category: data.category || 'general',
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        myQuestions: [newQuestion, ...state.myQuestions],
        isLoading: false,
      }));

      return newQuestion;
    } catch (error) {
      console.error('[Question] 질문 생성 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateQuestion: async (id, data) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('gosibang_questions')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        myQuestions: state.myQuestions.map((q) =>
          q.id === id ? { ...q, ...data } : q
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Question] 질문 수정 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  deleteQuestion: async (id) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('gosibang_questions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        myQuestions: state.myQuestions.filter((q) => q.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Question] 질문 삭제 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // ===== 관리자 기능 =====

  loadAllQuestions: async (status) => {
    try {
      set({ isLoading: true, error: null });

      let query = supabase
        .from('gosibang_questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ questions: data || [], isLoading: false });
    } catch (error) {
      console.error('[Question] 전체 질문 로드 실패:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  answerQuestion: async (id, answer) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('gosibang_questions')
        .update({
          answer,
          status: 'answered',
          answered_at: new Date().toISOString(),
          answered_by: user?.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        questions: state.questions.map((q) =>
          q.id === id
            ? {
                ...q,
                answer,
                status: 'answered' as const,
                answered_at: new Date().toISOString(),
                answered_by: user?.email,
              }
            : q
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('[Question] 답변 작성 실패:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // ===== 실시간 구독 =====

  subscribeToQuestions: () => {
    const channel = supabase
      .channel('question-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gosibang_questions',
        },
        () => {
          // 변경 시 내 질문 목록 새로고침
          get().loadMyQuestions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
