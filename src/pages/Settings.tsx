import { useEffect, useState } from 'react';
import { Save, Download, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useClinicStore } from '../store/clinicStore';
import type { ClinicSettings } from '../types';

export function Settings() {
  const { settings, isLoading, loadSettings, saveSettings } = useClinicStore();
  const [formData, setFormData] = useState<Partial<ClinicSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const now = new Date().toISOString();
      const settingsData: ClinicSettings = {
        id: settings?.id || crypto.randomUUID(),
        clinic_name: formData.clinic_name || '',
        clinic_address: formData.clinic_address || undefined,
        clinic_phone: formData.clinic_phone || undefined,
        doctor_name: formData.doctor_name || undefined,
        license_number: formData.license_number || undefined,
        created_at: settings?.created_at || now,
        updated_at: now,
      };

      await saveSettings(settingsData);
      setMessage({ type: 'success', text: '설정이 저장되었습니다.' });
    } catch (error) {
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    }
    setIsSaving(false);
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      // Supabase에서 직접 데이터 가져오기
      const [patientsRes, prescriptionsRes, chartRecordsRes, settingsRes] = await Promise.all([
        supabase.from('patients').select('*'),
        supabase.from('prescriptions').select('*'),
        supabase.from('chart_records').select('*'),
        supabase.from('clinic_settings').select('*'),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        patients: patientsRes.data || [],
        prescriptions: prescriptionsRes.data || [],
        chart_records: chartRecordsRes.data || [],
        clinic_settings: settingsRes.data || [],
      };

      // 파일 다운로드 (Blob 사용)
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gosibang-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: '데이터가 내보내기되었습니다.' });
    } catch (error) {
      setMessage({ type: 'error', text: '내보내기에 실패했습니다.' });
    }
    setIsExporting(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      {/* 알림 메시지 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 한의원 정보 */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">한의원 정보</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              한의원 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.clinic_name || ''}
              onChange={(e) => setFormData({ ...formData, clinic_name: e.target.value })}
              className="input-field"
              placeholder="예: 시방한의원"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              원장님 성함
            </label>
            <input
              type="text"
              value={formData.doctor_name || ''}
              onChange={(e) => setFormData({ ...formData, doctor_name: e.target.value })}
              className="input-field"
              placeholder="예: 홍길동"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              면허번호
            </label>
            <input
              type="text"
              value={formData.license_number || ''}
              onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
              className="input-field"
              placeholder="한의사 면허번호"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              주소
            </label>
            <input
              type="text"
              value={formData.clinic_address || ''}
              onChange={(e) => setFormData({ ...formData, clinic_address: e.target.value })}
              className="input-field"
              placeholder="한의원 주소"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              전화번호
            </label>
            <input
              type="tel"
              value={formData.clinic_phone || ''}
              onChange={(e) => setFormData({ ...formData, clinic_phone: e.target.value })}
              className="input-field"
              placeholder="02-0000-0000"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </button>
          </div>
        </form>
      </div>

      {/* 데이터 관리 */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">데이터 관리</h2>
        <p className="text-sm text-gray-600 mb-4">
          모든 환자 데이터와 처방 기록을 JSON 파일로 내보낼 수 있습니다.
        </p>
        <button
          onClick={handleExportAll}
          disabled={isExporting}
          className="btn-secondary flex items-center gap-2"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          전체 데이터 내보내기
        </button>
      </div>

      {/* 구독 정보 */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">구독 정보</h2>
        <p className="text-sm text-gray-600">
          구독 관련 문의는 support@gosibang.com으로 연락해주세요.
        </p>
      </div>
    </div>
  );
}
