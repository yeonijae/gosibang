import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getDb, queryToObjects } from '../lib/localDb';
import type { PrescriptionTemplate, PrescriptionHerb } from '../types';

// 최종 약재 타입
export interface FinalHerb {
  herb_id: number;
  name: string;
  amount: number;
}

// 처방 데이터 타입
export interface PrescriptionData {
  formula: string;
  mergedHerbs: PrescriptionHerb[];
  finalHerbs: FinalHerb[];
  totalDoses: number;
  days: number;
  dosesPerDay: number;
  totalPacks: number;
  herbAdjustment: string;
  notes: string;
  patientName?: string;
  totalDosage: number;
  finalTotalAmount: number;
  packVolume: number;
  waterAmount: number;
}

// Props 타입
export interface PrescriptionInputProps {
  onSave?: (data: PrescriptionData) => void;
  onChange?: (data: PrescriptionData) => void;
  patientName?: string;
  onPatientNameChange?: (name: string) => void;
  showPatientInput?: boolean;
  showNotesInput?: boolean;
  showSaveButton?: boolean;
  saveButtonText?: string;
  initialFormula?: string;
  initialNotes?: string;
  initialTotalDoses?: number;
  initialDays?: number;
  initialDosesPerDay?: number;
  initialPackVolume?: number;
  compact?: boolean;
}

const PrescriptionInput: React.FC<PrescriptionInputProps> = ({
  onSave,
  onChange,
  patientName: externalPatientName,
  onPatientNameChange,
  showPatientInput = true,
  showNotesInput = true,
  showSaveButton = true,
  saveButtonText = '처방전 저장',
  initialFormula = '',
  initialNotes = '',
  initialTotalDoses = 15,
  initialDays = 15,
  initialDosesPerDay = 2,
  initialPackVolume = 100,
  compact = false,
}) => {
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [herbIdMap, setHerbIdMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [formula, setFormula] = useState(initialFormula);
  const [mergedHerbs, setMergedHerbs] = useState<PrescriptionHerb[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [totalDoses, setTotalDoses] = useState(initialTotalDoses);
  const [days, setDays] = useState(initialDays);
  const [dosesPerDay, setDosesPerDay] = useState(initialDosesPerDay);
  const [packVolume, setPackVolume] = useState(initialPackVolume);
  const [internalPatientName, setInternalPatientName] = useState('');
  const [notes, setNotes] = useState(initialNotes);
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [herbAdjustment, setHerbAdjustment] = useState('');

  const patientName = externalPatientName !== undefined ? externalPatientName : internalPatientName;
  const setPatientName = onPatientNameChange || setInternalPatientName;

  useEffect(() => {
    loadPrescriptionTemplates();
  }, []);

  const loadPrescriptionTemplates = async () => {
    try {
      setLoading(true);
      const db = getDb();
      if (!db) {
        setLoading(false);
        return;
      }

      // 약재 목록 로드
      const herbsData = queryToObjects<{ id: number; name: string }>(db, 'SELECT id, name FROM herbs ORDER BY id');
      const idMap = new Map<string, number>();
      herbsData.forEach((herb) => {
        idMap.set(herb.name, herb.id);
      });
      setHerbIdMap(idMap);

      // 처방 템플릿 로드
      const data = queryToObjects<{ id: number; name: string; alias: string; composition: string; description: string }>(
        db,
        'SELECT * FROM prescription_definitions ORDER BY name'
      );

      // 이름/별칭으로 raw 데이터 맵 생성 (합방 해석용)
      const rawDataMap = new Map<string, { id: number; name: string; alias: string; composition: string; description: string }>();
      data.forEach(item => {
        rawDataMap.set(item.name, item);
        if (item.alias) {
          rawDataMap.set(item.alias, item);
        }
      });

      // 합방 해석 함수 (재귀, 배수 지원)
      const resolveComposition = (
        composition: string,
        multiplier: number = 1.0,
        visited: Set<string> = new Set()
      ): PrescriptionHerb[] => {
        if (!composition) return [];

        // composition에 +가 있으면 합방 처리
        if (composition.includes('+')) {
          const parts = composition.split('+').map(s => s.trim()).filter(s => s);
          const herbMap = new Map<string, number>();

          parts.forEach(part => {
            let name = part;
            let partMultiplier = 1.0;

            // 배수 처리 (예: 소시호*0.5)
            const multiplierMatch = part.match(/^(.+)\*(\d*\.?\d+)$/);
            if (multiplierMatch) {
              name = multiplierMatch[1].trim();
              partMultiplier = parseFloat(multiplierMatch[2]) || 1.0;
            }

            // 순환 참조 방지
            if (visited.has(name)) return;
            visited.add(name);

            // 해당 처방 찾기 (이름 또는 별칭)
            const foundItem = rawDataMap.get(name);
            if (foundItem && foundItem.composition) {
              const herbs = resolveComposition(
                foundItem.composition,
                multiplier * partMultiplier,
                new Set(visited)
              );
              herbs.forEach(herb => {
                const existing = herbMap.get(herb.herb_name) || 0;
                // 동일 약재는 높은 용량 사용
                herbMap.set(herb.herb_name, Math.max(existing, herb.dosage));
              });
            }
          });

          return Array.from(herbMap.entries()).map(([name, dosage], index) => ({
            herb_id: index + 1,
            herb_name: name,
            dosage,
            unit: 'g'
          }));
        } else {
          // 일반 약재 구성 (약재:용량/약재:용량)
          const herbs: PrescriptionHerb[] = [];
          const herbParts = composition.split('/').filter((s: string) => s.trim());
          herbParts.forEach((part: string, index: number) => {
            const [herbName, dosageStr] = part.split(':');
            if (herbName && dosageStr) {
              herbs.push({
                herb_id: index + 1,
                herb_name: herbName.trim(),
                dosage: (parseFloat(dosageStr) || 0) * multiplier,
                unit: 'g'
              });
            }
          });
          return herbs;
        }
      };

      // 템플릿 생성 (합방 자동 해석)
      const loadedTemplates: PrescriptionTemplate[] = data.map((item) => {
        const herbs = resolveComposition(item.composition || '');
        return {
          id: item.id,
          name: item.name,
          alias: item.alias || '',
          herbs,
          description: item.description || ''
        };
      });

      setTemplates(loadedTemplates);
    } catch (error) {
      console.error('처방 템플릿 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseFormula = useCallback((formulaStr: string) => {
    setParseError(null);
    setMergedHerbs([]);

    let normalized = formulaStr.trim();
    if (!normalized) return;

    normalized = normalized.replace(/^</, '').replace(/>$/, '');
    normalized = normalized.replace(/\s+/g, '+');
    normalized = normalized.replace(/\++/g, '+');
    normalized = normalized.replace(/^\+|\+$/g, '');

    if (!normalized) return;

    const prescriptionParts = normalized.split('+').map(s => s.trim()).filter(s => s);
    const foundTemplates: { template: PrescriptionTemplate; multiplier: number }[] = [];
    const notFound: string[] = [];
    const multipleMatches: { name: string; matches: string[] }[] = [];
    const suffixes = ['', '탕', '산', '환', '음'];

    prescriptionParts.forEach(part => {
      let searchName = part;
      let multiplier = 1.0;

      const multiplierMatch = part.match(/^(.+)\*(\d*\.?\d+)$/);
      if (multiplierMatch) {
        searchName = multiplierMatch[1].trim();
        multiplier = parseFloat(multiplierMatch[2]) || 1.0;
      }

      let template = templates.find(
        t => t.name === searchName || t.alias === searchName
      );

      if (template) {
        foundTemplates.push({ template, multiplier });
        return;
      }

      const matchedTemplates: PrescriptionTemplate[] = [];
      for (const suffix of suffixes) {
        if (suffix === '') continue;
        const nameWithSuffix = searchName + suffix;
        const found = templates.find(
          t => t.name === nameWithSuffix || t.alias === nameWithSuffix
        );
        if (found && !matchedTemplates.includes(found)) {
          matchedTemplates.push(found);
        }
      }

      if (matchedTemplates.length === 0) {
        templates.forEach(t => {
          if (t.name.startsWith(searchName) || (t.alias && t.alias.startsWith(searchName))) {
            if (!matchedTemplates.includes(t)) {
              matchedTemplates.push(t);
            }
          }
        });
      }

      if (matchedTemplates.length === 1) {
        foundTemplates.push({ template: matchedTemplates[0], multiplier });
      } else if (matchedTemplates.length > 1) {
        multipleMatches.push({
          name: searchName,
          matches: matchedTemplates.map(t => t.name)
        });
      } else {
        notFound.push(searchName);
      }
    });

    if (multipleMatches.length > 0) {
      const messages = multipleMatches.map(m =>
        `"${m.name}": ${m.matches.join(', ')}`
      );
      setParseError(`여러 처방이 검색됨 - 정확한 이름을 입력해주세요:\n${messages.join('\n')}`);
      return;
    }

    if (notFound.length > 0) {
      setParseError(`없는 처방: ${notFound.join(', ')}`);
      return;
    }

    const herbMap = new Map<string, PrescriptionHerb>();

    foundTemplates.forEach(({ template, multiplier }) => {
      template.herbs.forEach(herb => {
        const adjustedDosage = herb.dosage * multiplier;
        const existing = herbMap.get(herb.herb_name);
        if (!existing || existing.dosage < adjustedDosage) {
          herbMap.set(herb.herb_name, {
            ...herb,
            dosage: adjustedDosage
          });
        }
      });
    });

    const merged = Array.from(herbMap.values()).sort((a, b) => b.dosage - a.dosage);
    setMergedHerbs(merged);
  }, [templates]);

  useEffect(() => {
    const timer = setTimeout(() => {
      parseFormula(formula);
    }, 300);
    return () => clearTimeout(timer);
  }, [formula, parseFormula]);

  const totalDosage = mergedHerbs.reduce((sum, h) => sum + h.dosage, 0);

  const TARGET_DOSAGE_PER_DOSE = 100;
  const recommendedDoses = totalDosage > TARGET_DOSAGE_PER_DOSE
    ? Math.round((days * TARGET_DOSAGE_PER_DOSE / totalDosage) * 10) / 10
    : null;

  const applyRecommendedDoses = () => {
    if (recommendedDoses !== null) {
      setTotalDoses(recommendedDoses);
    }
  };

  const parseHerbAdjustment = (adjustmentStr: string): { name: string; amount: number; isAdd: boolean }[] => {
    if (!adjustmentStr.trim()) return [];

    const adjustments: { name: string; amount: number; isAdd: boolean }[] = [];
    const regex = /([+-]?)([가-힣]+)(\d+(?:\.\d+)?)/g;
    let match;

    while ((match = regex.exec(adjustmentStr)) !== null) {
      const sign = match[1];
      const name = match[2];
      const amount = parseFloat(match[3]);

      adjustments.push({
        name,
        amount,
        isAdd: sign !== '-'
      });
    }

    return adjustments;
  };

  const finalHerbs = useMemo(() => {
    const herbMap = new Map<string, number>();
    mergedHerbs.forEach(herb => {
      herbMap.set(herb.herb_name, Math.round(herb.dosage * totalDoses));
    });

    const adjustments = parseHerbAdjustment(herbAdjustment);
    adjustments.forEach(adj => {
      const current = herbMap.get(adj.name) || 0;
      if (adj.isAdd) {
        herbMap.set(adj.name, current + adj.amount);
      } else {
        const newAmount = current - adj.amount;
        if (newAmount <= 0) {
          herbMap.delete(adj.name);
        } else {
          herbMap.set(adj.name, newAmount);
        }
      }
    });

    return Array.from(herbMap.entries())
      .map(([name, amount]) => ({
        herb_id: herbIdMap.get(name) || 99999,
        name,
        amount
      }))
      .sort((a, b) => a.herb_id - b.herb_id);
  }, [mergedHerbs, totalDoses, herbAdjustment, herbIdMap]);

  const finalTotalAmount = finalHerbs.reduce((sum, h) => sum + h.amount, 0);
  const totalPacks = days * dosesPerDay;
  const waterAmount = Math.round(finalTotalAmount * 1.2 + packVolume * (totalPacks + 1) + 300);

  const getPrescriptionData = useCallback((): PrescriptionData => ({
    formula,
    mergedHerbs,
    finalHerbs,
    totalDoses,
    days,
    dosesPerDay,
    totalPacks,
    herbAdjustment,
    notes,
    patientName,
    totalDosage,
    finalTotalAmount,
    packVolume,
    waterAmount,
  }), [formula, mergedHerbs, finalHerbs, totalDoses, days, dosesPerDay, totalPacks, herbAdjustment, notes, patientName, totalDosage, finalTotalAmount, packVolume, waterAmount]);

  useEffect(() => {
    if (onChange && mergedHerbs.length > 0) {
      onChange(getPrescriptionData());
    }
  }, [formula, mergedHerbs, finalHerbs, totalDoses, days, dosesPerDay, packVolume, herbAdjustment, notes, patientName]);

  const handleSave = () => {
    if (!formula.trim()) {
      alert('처방 공식을 입력해주세요.');
      return;
    }
    if (mergedHerbs.length === 0) {
      alert('유효한 처방 공식을 입력해주세요.');
      return;
    }

    if (onSave) {
      onSave(getPrescriptionData());
    }
  };

  const addTemplateToFormula = (template: PrescriptionTemplate) => {
    const name = template.alias || template.name;
    if (!formula.trim()) {
      setFormula(name);
    } else {
      setFormula(formula.trim() + ' ' + name);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center text-gray-500">
          <div className="border-4 border-gray-200 border-t-primary-600 rounded-full w-12 h-12 animate-spin mb-4 mx-auto"></div>
          <p>처방 템플릿을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 ${compact ? '' : 'h-full'}`}>
      {/* 왼쪽: 처방 입력 */}
      <div className={`${compact ? 'w-full' : 'w-1/2'} bg-white rounded-lg shadow-sm p-4 flex flex-col overflow-hidden`}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          처방 입력
          <span className="text-xs font-normal text-gray-500 ml-2">
            ({templates.length}개 처방)
          </span>
        </h2>

        {/* 환자명 */}
        {showPatientInput && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">환자명</label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="환자 이름 입력..."
              className="input-field"
            />
          </div>
        )}

        {/* 처방 공식 입력 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            처방 공식
            <span className="text-xs text-gray-500 ml-2">예: 백인 소시호 반하사심</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="처방명을 띄어쓰기로 구분하여 입력"
              className={`input-field font-mono text-lg pr-24 ${
                parseError ? 'border-red-500 focus:border-red-500' : ''
              }`}
            />
            <button
              onClick={() => {
                setShowTemplateList(!showTemplateList);
                if (!showTemplateList) setTemplateSearchTerm('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            >
              처방검색
            </button>
          </div>
          {parseError && (
            <p className="text-red-500 text-xs mt-1">{parseError}</p>
          )}
        </div>

        {/* 처방 검색 드롭다운 */}
        {showTemplateList && (
          <div className="mb-4 border border-gray-300 rounded-lg overflow-hidden">
            <div className="p-2 bg-gray-50 border-b">
              <input
                type="text"
                value={templateSearchTerm}
                onChange={(e) => setTemplateSearchTerm(e.target.value)}
                placeholder="처방명 검색 (2글자 이상)..."
                className="input-field"
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {templateSearchTerm.length < 2 ? (
                <p className="px-3 py-4 text-center text-gray-500 text-sm">
                  2글자 이상 입력하면 처방이 검색됩니다
                </p>
              ) : (
                (() => {
                  const filtered = templates.filter(t =>
                    t.name.includes(templateSearchTerm) ||
                    (t.alias && t.alias.includes(templateSearchTerm))
                  );
                  if (filtered.length === 0) {
                    return (
                      <p className="px-3 py-4 text-center text-gray-500 text-sm">
                        검색 결과가 없습니다
                      </p>
                    );
                  }
                  return filtered.map(template => (
                    <div
                      key={template.id}
                      onClick={() => {
                        addTemplateToFormula(template);
                        setTemplateSearchTerm('');
                      }}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0 flex justify-between items-center"
                    >
                      <span className="font-medium">{template.name}</span>
                      <span className="text-sm text-gray-500">
                        {template.alias && `(${template.alias})`}
                      </span>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        )}

        {/* 첩수 자동조정 알림 */}
        {recommendedDoses !== null && recommendedDoses !== totalDoses && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm text-amber-800">
                1첩 용량이 {totalDosage}g입니다. {days}일 x 100g 기준으로
                <span className="font-bold mx-1">{recommendedDoses}첩</span>을 권장합니다.
              </div>
              <button
                onClick={applyRecommendedDoses}
                className="px-3 py-1 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 transition-colors"
              >
                적용
              </button>
            </div>
          </div>
        )}

        {/* 복용 설정 */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">첩수</label>
            <div className="flex items-center">
              <input
                type="number"
                value={totalDoses}
                onChange={(e) => setTotalDoses(parseFloat(e.target.value) || 1)}
                min={1}
                step={0.1}
                className="w-14 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-600 text-sm"
              />
              <span className="ml-1 text-gray-600 text-sm">첩</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">복용일수</label>
            <div className="flex items-center">
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                min={1}
                className="w-14 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-600 text-sm"
              />
              <span className="ml-1 text-gray-600 text-sm">일</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">하루팩수</label>
            <div className="flex items-center">
              <input
                type="number"
                value={dosesPerDay}
                onChange={(e) => setDosesPerDay(parseInt(e.target.value) || 1)}
                min={1}
                max={5}
                className="w-14 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-600 text-sm"
              />
              <span className="ml-1 text-gray-600 text-sm">팩</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">팩용량</label>
            <div className="flex items-center">
              <input
                type="number"
                value={packVolume}
                onChange={(e) => setPackVolume(parseInt(e.target.value) || 100)}
                min={50}
                max={200}
                step={10}
                className="w-14 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-600 text-sm"
              />
              <span className="ml-1 text-gray-600 text-sm">ml</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">총팩수</label>
            <div className="flex items-center h-[42px]">
              <span className="text-lg font-semibold text-primary-600">
                {totalPacks}팩
              </span>
            </div>
          </div>
        </div>

        {/* 약재 조정 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            약재 조정
            <span className="text-xs text-gray-500 ml-2">예: 녹용37-인삼30+백출20</span>
          </label>
          <input
            type="text"
            value={herbAdjustment}
            onChange={(e) => setHerbAdjustment(e.target.value)}
            placeholder="추가: 약재명+용량, 제거: -약재명+용량"
            className="input-field font-mono"
          />
          {herbAdjustment && parseHerbAdjustment(herbAdjustment).length > 0 && (
            <div className="mt-1 text-xs text-gray-600">
              {parseHerbAdjustment(herbAdjustment).map((adj, i) => (
                <span key={i} className={`mr-2 ${adj.isAdd ? 'text-green-600' : 'text-red-600'}`}>
                  {adj.isAdd ? '+' : '-'}{adj.name} {adj.amount}g
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 특이사항 */}
        {showNotesInput && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">특이사항</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="특이사항 입력..."
              rows={3}
              className="input-field"
            />
          </div>
        )}

        {/* 저장 버튼 */}
        {showSaveButton && (
          <div className="mt-auto pt-4 border-t">
            <button
              onClick={handleSave}
              disabled={mergedHerbs.length === 0}
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                mergedHerbs.length > 0
                  ? 'btn-primary'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saveButtonText}
            </button>
          </div>
        )}
      </div>

      {/* 오른쪽: 처방 미리보기 */}
      {!compact && (
        <div className="w-1/2 bg-white rounded-lg shadow-sm p-4 flex flex-col overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            처방 미리보기
          </h2>

          {mergedHerbs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p>처방 공식을 입력하면<br/>합쳐진 약재가 표시됩니다</p>
              </div>
            </div>
          ) : (
            <>
              {/* 요약 정보 */}
              <div className="bg-gradient-to-r from-primary-600 to-purple-700 rounded-lg p-4 mb-4 text-white">
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <p className="text-xs opacity-80">약재 수</p>
                    <p className="text-xl font-bold">{finalHerbs.length}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-80">1첩 용량</p>
                    <p className="text-xl font-bold">{totalDosage}g</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-80">총 첩수</p>
                    <p className="text-xl font-bold">{totalDoses}첩</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-80">복용일수</p>
                    <p className="text-xl font-bold">{days}일</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-80">총 팩수</p>
                    <p className="text-xl font-bold">{totalPacks}팩</p>
                  </div>
                </div>
              </div>

              {/* 약재 목록 */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">약재명</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">1첩</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">최종 총량</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {finalHerbs.map((herb, index) => {
                      const originalHerb = mergedHerbs.find(h => h.herb_name === herb.name);
                      const originalTotal = originalHerb ? Math.round(originalHerb.dosage * totalDoses) : 0;
                      const isAdjusted = originalTotal !== herb.amount;
                      const isNew = !originalHerb;

                      return (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {herb.name}
                            {isNew && <span className="ml-1 text-xs text-green-600">(추가)</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-500">
                            {originalHerb ? `${originalHerb.dosage}g` : '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold ${isAdjusted ? 'text-amber-600' : 'text-primary-600'}`}>
                            {Math.round(herb.amount)}g
                            {isAdjusted && !isNew && (
                              <span className="text-xs ml-1">
                                ({herb.amount > originalTotal ? '+' : ''}{Math.round(herb.amount - originalTotal)})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">합계</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                        {totalDosage}g
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-primary-600">
                        {Math.round(finalTotalAmount)}g
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 공식 표시 */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500 mb-1">처방 공식</p>
                <p className="font-mono text-lg text-primary-600">{formula}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PrescriptionInput;
