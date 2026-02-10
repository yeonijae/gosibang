import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Edit, Loader2, AlertCircle, Check, Cloud } from 'lucide-react';
import { getDb, saveDb, generateUUID, queryOne } from '../lib/localDb';
import { usePlanLimits } from '../hooks/usePlanLimits';
import type { InitialChart } from '../types';

type SaveStatus = 'idle' | 'changed' | 'saving' | 'saved' | 'error';

interface Props {
  patientId: string;
  patientName: string;
  onClose: () => void;
  forceNew?: boolean;
}

interface ChartSubsection {
  title: string;
  content: string;
}

interface ChartSection {
  title: string;
  subsections: ChartSubsection[];
  directContent: string;
}

export function InitialChartView({ patientId, patientName, onClose, forceNew = false }: Props) {
  const { canAddChart, refreshUsage, planInfo } = usePlanLimits();

  const [chart, setChart] = useState<InitialChart | null>(null);
  const [isEditing, setIsEditing] = useState(forceNew);
  const [loading, setLoading] = useState(!forceNew);
  const [formData, setFormData] = useState<Partial<InitialChart>>({});
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  // 자동 저장 관련
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [chartId, setChartId] = useState<string | null>(null); // 새로 생성된 차트 ID
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef = useRef(true);
  const AUTO_SAVE_DELAY = 3000; // 3초

  const extractDateFromText = (text: string): string | null => {
    if (!text) return null;

    const pattern1 = text.match(/(\d{2})\/(\d{1,2})\/(\d{1,2})/);
    if (pattern1) {
      const year = parseInt(pattern1[1]) + 2000;
      const month = pattern1[2].padStart(2, '0');
      const day = pattern1[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const pattern2 = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (pattern2) {
      const year = pattern2[1];
      const month = pattern2[2].padStart(2, '0');
      const day = pattern2[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const pattern3 = text.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (pattern3) {
      const year = pattern3[1];
      const month = pattern3[2].padStart(2, '0');
      const day = pattern3[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  };

  const parseChartSections = (text: string): ChartSection[] => {
    if (!text) return [];

    const sections: ChartSection[] = [];
    const lines = text.split('\n');
    let currentSection: ChartSection | null = null;
    let currentSubsection: ChartSubsection | null = null;

    for (const line of lines) {
      const sectionMatch = line.match(/^\[(.+?)\](.*)$/);
      const subsectionMatch = line.match(/^>\s*(.+?)$/);

      if (sectionMatch) {
        if (currentSection) {
          if (currentSubsection) {
            currentSection.subsections.push(currentSubsection);
            currentSubsection = null;
          }
          sections.push(currentSection);
        }
        currentSection = {
          title: sectionMatch[1].trim(),
          subsections: [],
          directContent: sectionMatch[2].trim()
        };
      } else if (subsectionMatch && currentSection) {
        if (currentSubsection) {
          currentSection.subsections.push(currentSubsection);
        }
        currentSubsection = {
          title: subsectionMatch[1].trim(),
          content: ''
        };
      } else {
        if (currentSubsection) {
          currentSubsection.content += (currentSubsection.content ? '\n' : '') + line;
        } else if (currentSection) {
          currentSection.directContent += (currentSection.directContent ? '\n' : '') + line;
        }
      }
    }

    if (currentSubsection && currentSection) {
      currentSection.subsections.push(currentSubsection);
    }
    if (currentSection) {
      sections.push(currentSection);
    }

    for (const section of sections) {
      section.directContent = section.directContent.trim();
      for (const subsection of section.subsections) {
        subsection.content = subsection.content.trim();
      }
    }

    return sections;
  };

  useEffect(() => {
    if (forceNew) {
      const today = new Date().toISOString().split('T')[0];
      setFormData({
        patient_id: patientId,
        chart_date: today
      });
      setIsEditing(true);
      setLoading(false);
    } else {
      loadChart();
    }
  }, [patientId, forceNew]);

  const loadChart = async () => {
    try {
      setLoading(true);
      const db = getDb();
      if (!db) {
        setLoading(false);
        return;
      }

      const data = queryOne<InitialChart>(
        db,
        'SELECT * FROM initial_charts WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1',
        [patientId]
      );

      if (data) {
        setChart(data);
        setFormData(data);
      } else {
        setIsEditing(true);
        setFormData({ patient_id: patientId });
      }
    } catch (error) {
      console.error('초진차트 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 자동 저장 함수
  const performAutoSave = useCallback(async () => {
    // 내용이 없으면 저장하지 않음
    if (!formData.notes || formData.notes.trim() === '') {
      return;
    }

    // 진료일자가 없으면 오늘 날짜 사용
    const chartDate = formData.chart_date || new Date().toISOString().split('T')[0];

    try {
      setSaveStatus('saving');
      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();
      const existingChartId = chart?.id || chartId;

      if (existingChartId) {
        // 기존 차트 업데이트
        db.run(
          `UPDATE initial_charts SET chart_date = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [chartDate, formData.notes.trim(), now, existingChartId]
        );
      } else {
        // 새 차트 생성 시 제한 확인
        const limitCheck = canAddChart();
        if (!limitCheck.allowed) {
          setLimitWarning(limitCheck.message || '차트 한도에 도달했습니다.');
          setSaveStatus('error');
          return;
        }

        const newId = generateUUID();
        db.run(
          `INSERT INTO initial_charts (id, patient_id, chart_date, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [newId, patientId, chartDate, formData.notes.trim(), now, now]
        );
        setChartId(newId);
        refreshUsage();
      }

      saveDb();
      setSaveStatus('saved');

      // 3초 후 상태를 idle로 변경
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error: any) {
      console.error('자동 저장 실패:', error);
      setSaveStatus('error');
    }
  }, [formData, chart, chartId, patientId, canAddChart, refreshUsage]);

  // formData 변경 시 자동 저장 타이머 설정
  useEffect(() => {
    // 첫 렌더링 시에는 무시
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    // 편집 모드가 아니면 무시
    if (!isEditing) return;

    // 내용이 없으면 무시
    if (!formData.notes || formData.notes.trim() === '') return;

    // 상태를 "변경됨"으로 설정
    setSaveStatus('changed');

    // 기존 타이머 취소
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 새 타이머 설정
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, AUTO_SAVE_DELAY);

    // 클린업
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData.notes, formData.chart_date, isEditing, performAutoSave]);

  // 컴포넌트 언마운트 시 저장
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    try {
      if (!formData.notes || formData.notes.trim() === '') {
        alert('차트 내용을 입력해주세요.');
        return;
      }

      if (!formData.chart_date) {
        alert('진료일자를 입력해주세요.');
        return;
      }

      const db = getDb();
      if (!db) throw new Error('DB가 초기화되지 않았습니다.');

      const now = new Date().toISOString();
      const existingChartId = chart?.id || chartId;

      if (existingChartId) {
        // 기존 차트 업데이트
        db.run(
          `UPDATE initial_charts SET chart_date = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [formData.chart_date, formData.notes.trim(), now, existingChartId]
        );
        saveDb();

        alert('초진차트가 저장되었습니다');
        setIsEditing(false);
        await loadChart();
      } else {
        // 새 차트 생성 시 제한 확인
        const limitCheck = canAddChart();
        if (!limitCheck.allowed) {
          setLimitWarning(limitCheck.message || '차트 한도에 도달했습니다.');
          return;
        }

        const id = generateUUID();
        db.run(
          `INSERT INTO initial_charts (id, patient_id, chart_date, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, patientId, formData.chart_date, formData.notes.trim(), now, now]
        );
        saveDb();
        refreshUsage();

        alert('새 진료차트가 생성되었습니다');
        onClose();
      }
    } catch (error: any) {
      console.error('저장 실패:', error);
      alert('저장에 실패했습니다: ' + error.message);
    }
  };

  // 저장 상태 표시 컴포넌트
  const SaveStatusIndicator = () => {
    switch (saveStatus) {
      case 'changed':
        return (
          <span className="flex items-center gap-1 text-amber-600 text-sm">
            <Cloud className="w-4 h-4" />
            변경됨
          </span>
        );
      case 'saving':
        return (
          <span className="flex items-center gap-1 text-blue-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            저장 중...
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <Check className="w-4 h-4" />
            자동 저장됨
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            저장 실패
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <p className="text-gray-500">로딩 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg w-full max-w-4xl shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">초진차트 - {patientName}</h2>
            {isEditing && (
              <div className="bg-gray-100 px-2 py-1 rounded">
                <SaveStatusIndicator />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {!isEditing && chart && (
              <button
                onClick={() => setIsEditing(true)}
                className="btn-secondary flex items-center gap-1"
              >
                <Edit className="w-4 h-4" />
                수정
              </button>
            )}
            <button
              onClick={onClose}
              className="btn-secondary flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              닫기
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {/* 플랜 제한 경고 */}
          {limitWarning && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-amber-700">{limitWarning}</p>
                <p className="text-sm text-amber-600 mt-1">
                  현재 플랜: <strong>{planInfo.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setLimitWarning(null)}
                className="text-amber-600 hover:text-amber-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block font-semibold mb-2 text-lg text-gray-900">
                  진료일자 <span className="text-sm font-normal text-gray-500">(실제 진료를 시행한 날짜)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={formData.chart_date ? new Date(formData.chart_date).toISOString().split('T')[0] : ''}
                    onChange={(e) => setFormData({ ...formData, chart_date: e.target.value })}
                    className="input-field w-auto"
                    required
                  />
                  <span className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded border border-slate-200">
                    차트 내용에서 날짜를 자동으로 추출합니다 (예: 25/11/15)
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-2 text-lg text-gray-900">초진차트 내용</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
                  <p className="text-sm text-slate-800 mb-2">
                    <strong>작성 방법:</strong>
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1 ml-5 list-disc">
                    <li>대분류(큰 섹션): <code className="bg-slate-100 px-1 rounded">[제목]</code> 형식</li>
                    <li>중분류(세부 항목): <code className="bg-slate-100 px-1 rounded">&gt; 제목</code> 형식</li>
                    <li>예: [주소증], [문진], [복진], [처방] / &gt; 식사패턴, &gt; 소화, &gt; 커피 등</li>
                  </ul>
                </div>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => {
                    const newNotes = e.target.value;
                    const extractedDate = extractDateFromText(newNotes);

                    if (extractedDate) {
                      const today = new Date().toISOString().split('T')[0];
                      if (!formData.chart_date || formData.chart_date === today) {
                        setFormData({ ...formData, notes: newNotes, chart_date: extractedDate });
                        return;
                      }
                    }

                    setFormData({ ...formData, notes: newNotes });
                  }}
                  className="input-field font-mono"
                  rows={20}
                  placeholder={`[주소증] 여/38세/165cm/74kg
1. 임신준비
- 딸이 3명인데, 남아를 낳고 싶다.

2. 비염
- 비염이 심하게 오면 두통이 온다.

[문진]
> 식사패턴 : 규칙적
- 아침식사 : 안먹는다.
- 점심식사 : 12시

> 소화
- 배고픔 : 때가 되면 느낀다.
- 소화상태 : 더부룩함

> 커피 : 하루1~2잔
- 커피 종류 : 아메리카노

[복진]
> 복직근 : 긴장+압통
> 심하부 : 압통 있음

[처방]
25/11/15 백인 소시호 귀비탕 15일분`}
                  style={{ fontSize: '0.9rem', lineHeight: '1.5' }}
                />
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <button
                  onClick={handleSave}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  저장
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    if (chart) setFormData(chart);
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  취소
                </button>
              </div>
            </div>
          ) : chart ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-4 text-gray-900 flex items-center">
                  초진차트
                </h3>

                {(() => {
                  const sections = parseChartSections(chart.notes || '');

                  if (sections.length === 0) {
                    return (
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p className="text-gray-500">내용이 없습니다.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {sections.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                          <div className="bg-primary-600 px-4 py-3">
                            <h4 className="font-bold text-white text-lg flex items-center">
                              {section.title}
                            </h4>
                          </div>

                          {section.directContent && (
                            <div className="px-4 py-3 bg-blue-50 border-b border-gray-200">
                              <p className="text-gray-900 whitespace-pre-wrap" style={{ lineHeight: '1.7', fontSize: '0.95rem' }}>
                                {section.directContent}
                              </p>
                            </div>
                          )}

                          {section.subsections.length > 0 && (
                            <div className="p-4 space-y-3">
                              {section.subsections.map((subsection, subIndex) => (
                                <div key={subIndex} className="border-l-4 border-primary-500 pl-4 py-2 bg-gray-50 rounded-r">
                                  <h5 className="font-semibold text-primary-600 mb-2 flex items-center text-base">
                                    {subsection.title}
                                  </h5>
                                  <div className="text-gray-900 whitespace-pre-wrap ml-4" style={{ lineHeight: '1.7', fontSize: '0.9rem' }}>
                                    {subsection.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="mt-4 text-sm text-gray-500 border-t pt-3">
                <div className="flex items-center mb-1">
                  <span className="font-semibold">진료일자:</span>
                  <span className="ml-2">{new Date(chart.chart_date).toLocaleDateString('ko-KR')}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-semibold">차트 생성일:</span>
                  <span className="ml-2">{new Date(chart.created_at).toLocaleString('ko-KR')}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-6 text-lg">초진차트가 없습니다</p>
              <button
                onClick={() => setIsEditing(true)}
                className="btn-primary"
              >
                초진차트 작성
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InitialChartView;
