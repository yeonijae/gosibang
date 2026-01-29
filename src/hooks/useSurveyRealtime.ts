import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getDb, saveDb, generateUUID, queryOne } from '../lib/localDb';
import { useSurveyStore } from '../store/surveyStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface SurveyResponseTemp {
  id: string;
  session_id: string;
  user_id: string;
  template_id: string;
  patient_id: string | null;
  respondent_name: string | null;
  // 환자 정보
  patient_name: string | null;
  chart_number: string | null;
  doctor_name: string | null;
  gender: string | null;
  age: string | null;
  answers: any[];
  synced: boolean;
  created_at: string;
}

export function useSurveyRealtime(userId: string | null) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef(false);
  const { loadResponses, loadSessions } = useSurveyStore();

  // 응답을 로컬 DB에 저장
  const saveResponseToLocal = useCallback(async (response: SurveyResponseTemp) => {
    const db = getDb();
    if (!db) {
      console.error('Local DB not initialized');
      return false;
    }

    try {
      // 이미 저장된 응답인지 확인
      const existing = queryOne(db, 'SELECT id FROM survey_responses WHERE session_id = ?', [response.session_id]);
      if (existing) {
        console.log('Response already exists for session:', response.session_id);
        return true;
      }

      const id = generateUUID();
      const now = new Date().toISOString();

      // 응답 저장 (환자 정보 포함)
      db.run(
        `INSERT INTO survey_responses (id, session_id, patient_id, template_id, answers, respondent_name, patient_name, chart_number, doctor_name, gender, age, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          response.session_id,
          response.patient_id,
          response.template_id,
          JSON.stringify(response.answers),
          response.respondent_name,
          response.patient_name,
          response.chart_number,
          response.doctor_name,
          response.gender,
          response.age,
          response.created_at,
        ]
      );

      // 세션 상태를 completed로 업데이트
      db.run(
        'UPDATE survey_sessions SET status = ?, completed_at = ? WHERE id = ?',
        ['completed', now, response.session_id]
      );

      saveDb();
      console.log('[Survey Realtime] 응답 저장 완료:', id);

      // Supabase에서 해당 응답 삭제 (로컬에 저장 완료되었으므로)
      const { error: deleteError } = await supabase
        .from('survey_responses_temp')
        .delete()
        .eq('id', response.id);

      if (deleteError) {
        console.error('[Survey Realtime] Supabase 삭제 실패:', deleteError);
      } else {
        console.log('[Survey Realtime] Supabase에서 삭제 완료:', response.id);
      }

      // UI 리프레시
      loadResponses();
      loadSessions();

      return true;
    } catch (error) {
      console.error('[Survey Realtime] 응답 저장 실패:', error);
      return false;
    }
  }, [loadResponses, loadSessions]);

  // 미동기화된 응답 가져오기 (앱 시작 시)
  const syncPendingResponses = useCallback(async () => {
    if (!userId) return;

    try {
      console.log('[Survey Realtime] 미동기화 응답 확인 중...');

      const { data, error } = await supabase
        .from('survey_responses_temp')
        .select('*')
        .eq('user_id', userId)
        .eq('synced', false)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Survey Realtime] 미동기화 응답 조회 실패:', error);
        return;
      }

      if (data && data.length > 0) {
        console.log(`[Survey Realtime] ${data.length}개의 미동기화 응답 발견`);
        for (const response of data) {
          await saveResponseToLocal(response);
        }
        console.log('[Survey Realtime] 미동기화 응답 동기화 완료');
      } else {
        console.log('[Survey Realtime] 미동기화 응답 없음');
      }
    } catch (error) {
      console.error('[Survey Realtime] 동기화 오류:', error);
    }
  }, [userId, saveResponseToLocal]);

  useEffect(() => {
    if (!userId || isSubscribedRef.current) return;

    console.log('[Survey Realtime] 구독 시작:', userId);

    // 먼저 미동기화된 응답 동기화
    syncPendingResponses();

    // Realtime 구독 설정
    const channel = supabase
      .channel(`survey_responses_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'survey_responses_temp',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          console.log('[Survey Realtime] 새 응답 수신:', payload.new);
          const response = payload.new as SurveyResponseTemp;
          await saveResponseToLocal(response);
        }
      )
      .subscribe((status) => {
        console.log('[Survey Realtime] 구독 상태:', status);
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          console.log('[Survey Realtime] 구독 완료 - 응답 대기 중');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log('[Survey Realtime] 구독 해제');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        isSubscribedRef.current = false;
      }
    };
  }, [userId, saveResponseToLocal, syncPendingResponses]);

  return {
    syncPendingResponses,
  };
}
