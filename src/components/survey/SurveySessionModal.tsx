import { useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { useSurveyStore } from '../../store/surveyStore';
import { generateSurveyLink, generateQRCodeUrl } from '../../lib/surveyUtils';
import type { Patient, SurveySession } from '../../types';

interface SurveySessionModalProps {
  patient: Patient;
  onClose: () => void;
}

export function SurveySessionModal({ patient, onClose }: SurveySessionModalProps) {
  const { templates, loadTemplates, createSession } = useSurveyStore();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [createdSession, setCreatedSession] = useState<SurveySession | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const activeTemplates = templates.filter((t) => t.is_active);

  const handleCreate = async () => {
    if (!selectedTemplateId) {
      alert('설문 템플릿을 선택해주세요.');
      return;
    }

    setCreating(true);
    try {
      const session = await createSession(patient.id, selectedTemplateId);
      setCreatedSession(session);
    } catch (error) {
      console.error('Session creation failed:', error);
      alert('설문 링크 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdSession) return;
    const link = generateSurveyLink(createdSession.token);
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = () => {
    if (!createdSession) return;
    const link = generateSurveyLink(createdSession.token);
    window.open(link, '_blank');
  };

  const surveyLink = createdSession ? generateSurveyLink(createdSession.token) : '';
  const qrCodeUrl = createdSession ? generateQRCodeUrl(surveyLink, 200) : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">설문 보내기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!createdSession ? (
            <>
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  <strong>{patient.name}</strong>님에게 보낼 설문을 선택하세요.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설문 템플릿
                </label>
                {activeTemplates.length > 0 ? (
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">선택하세요</option>
                    {activeTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.questions.length}개 질문)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">
                    활성화된 설문 템플릿이 없습니다.
                    <br />
                    먼저 설문 템플릿을 만들어주세요.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button onClick={onClose} className="btn-secondary">
                  취소
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!selectedTemplateId || creating}
                  className="btn-primary"
                >
                  {creating ? '생성 중...' : '링크 생성'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="inline-block p-2 bg-gray-100 rounded-lg mb-4">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  QR 코드를 스캔하거나 링크를 복사하세요
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={surveyLink}
                    readOnly
                    className="input-field flex-1 text-sm bg-white"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`p-2 rounded-lg transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                    title="링크 복사"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={handleOpenLink}
                    className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300"
                    title="새 창에서 열기"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-500 space-y-1">
                <p>• 설문: {createdSession.template_name}</p>
                <p>• 유효기간: 24시간</p>
                <p>• 만료: {new Date(createdSession.expires_at).toLocaleString()}</p>
              </div>

              <div className="flex justify-end pt-4">
                <button onClick={onClose} className="btn-primary">
                  완료
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SurveySessionModal;
