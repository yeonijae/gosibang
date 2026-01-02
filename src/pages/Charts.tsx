import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Save, Edit, Trash2, Loader2, FileText, ClipboardList, X, Calendar, Eye, Stethoscope, Pill, ChevronRight, CheckCircle, ExternalLink, Send } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import { getDb, saveDb, generateUUID, queryToObjects, queryOne } from '../lib/localDb';
import PrescriptionInput from '../components/PrescriptionInput';
import type { PrescriptionData } from '../components/PrescriptionInput';
import type { InitialChart, ProgressNote, Patient, ProgressEntry } from '../types';

// 차트 섹션 파싱용 타입
interface ChartSubsection {
  title: string;
  content: string;
}

interface ChartSection {
  title: string;
  subsections: ChartSubsection[];
  directContent: string;
}

export function Charts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedPatient, selectPatient } = usePatientStore();

  // 환자관리에서 전달받은 차트 ID
  const selectedChartId = (location.state as { selectedChartId?: string })?.selectedChartId;
  const hasOpenedSelectedChart = useRef(false);

  // 목록 상태
  const [chartRecords, setChartRecords] = useState<(InitialChart & { patient_name: string })[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // 상세 모달 상태
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [initialChart, setInitialChart] = useState<InitialChart | null>(null);
  const [initialChartPrescriptionIssued, setInitialChartPrescriptionIssued] = useState(false);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 초진차트 편집 상태
  const [isEditingChart, setIsEditingChart] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');

  // 경과 입력 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressDate, setProgressDate] = useState('');
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 모아보기 모달 상태
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  // 처방입력기 모달 상태
  const [showPrescriptionInputModal, setShowPrescriptionInputModal] = useState(false);
  const [prescriptionFormula, setPrescriptionFormula] = useState('');
  const [prescriptionSourceType, setPrescriptionSourceType] = useState<'initial_chart' | 'progress_note'>('initial_chart');
  const [prescriptionSourceId, setPrescriptionSourceId] = useState<string | null>(null);

  useEffect(() => {
    loadChartRecords();
  }, []);

  // 환자관리에서 선택된 차트 자동 열기 (한 번만 실행)
  useEffect(() => {
    if (selectedChartId && chartRecords.length > 0 && !listLoading && !hasOpenedSelectedChart.current) {
      const selectedChart = chartRecords.find(c => c.id === selectedChartId);
      if (selectedChart) {
        hasOpenedSelectedChart.current = true;
        handleRecordClick(selectedChart);
      }
    }
  }, [selectedChartId, chartRecords, listLoading]);

  // 자동 저장 (5초 디바운스)
  useEffect(() => {
    if (!showAddForm || !progressText.trim() || !progressDate) {
      return;
    }

    setAutoSaveStatus('idle');

    const timer = setTimeout(async () => {
      await autoSaveProgress();
    }, 5000);

    return () => clearTimeout(timer);
  }, [progressText, progressDate, showAddForm]);

  // 목록 로드 (초진차트만)
  const loadChartRecords = async () => {
    try {
      setListLoading(true);
      const db = getDb();
      if (!db) return;

      const initialCharts = queryToObjects<InitialChart & { patient_name: string }>(
        db,
        `SELECT ic.*, p.name as patient_name
         FROM initial_charts ic
         LEFT JOIN patients p ON ic.patient_id = p.id
         ORDER BY ic.chart_date DESC`
      );

      setChartRecords(initialCharts);
    } catch (error) {
      console.error('차팅 목록 로드 실패:', error);
    } finally {
      setListLoading(false);
    }
  };

  // 주소증 추출
  const extractChiefComplaint = (notes: string): string => {
    if (!notes) return '-';

    const sectionMatch = notes.match(/\[주소증\]\s*([^\[]+)/);
    if (!sectionMatch) {
      const firstLine = notes.split('\n')[0];
      return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
    }

    const sectionText = sectionMatch[1].trim();
    const lines = sectionText.split('\n');
    const numberedItems: string[] = [];

    for (const line of lines) {
      const numberedMatch = line.match(/^\d+\.\s*(.+)/);
      if (numberedMatch) {
        numberedItems.push(numberedMatch[1].trim());
      }
    }

    if (numberedItems.length === 0) {
      return sectionText.length > 50 ? sectionText.substring(0, 50) + '...' : sectionText;
    }

    const result = numberedItems.join(', ');
    return result.length > 50 ? result.substring(0, 50) + '...' : result;
  };

  // 상세 모달 열기
  const handleRecordClick = async (record: InitialChart & { patient_name: string }) => {
    setShowDetailModal(true);
    await loadDetailData(record.id, record.patient_id);
  };

  // 상세 데이터 로드
  const loadDetailData = async (chartId: string, patientId: string) => {
    try {
      setDetailLoading(true);
      const db = getDb();
      if (!db) return;

      // 초진차트 로드
      const chartData = queryOne<InitialChart>(
        db,
        'SELECT * FROM initial_charts WHERE id = ?',
        [chartId]
      );

      if (chartData) {
        setInitialChart(chartData);
        setInitialChartPrescriptionIssued(Boolean(chartData.prescription_issued));
      }

      // 경과기록 로드
      const notesData = queryToObjects<ProgressNote>(
        db,
        'SELECT * FROM progress_notes WHERE patient_id = ? ORDER BY note_date DESC',
        [patientId]
      );

      // ProgressNote → ProgressEntry 변환
      const entries: ProgressEntry[] = notesData.map(note => ({
        id: note.id,
        entry_date: note.note_date,
        treatment: note.objective || '',
        diagnosis: note.assessment || '',
        prescription: note.plan || '',
        prescription_issued: Boolean(note.prescription_issued),
        prescription_issued_at: note.prescription_issued_at,
        created_at: note.created_at
      }));

      setProgressEntries(entries);

      // 환자 선택
      const patient = queryOne<Patient>(db, 'SELECT * FROM patients WHERE id = ?', [patientId]);
      if (patient) {
        selectPatient(patient);
      }
    } catch (error) {
      console.error('상세 데이터 로드 실패:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // 상세 모달 닫기
  const closeDetailModal = () => {
    setShowDetailModal(false);
    setInitialChart(null);
    setProgressEntries([]);
    setIsEditingChart(false);
    setShowAddForm(false);
    setProgressText('');
    setProgressDate('');
    setEditingProgressId(null);
    setLastSavedId(null);
    setAutoSaveStatus('idle');
    selectPatient(null);
    loadChartRecords();
  };

  // 차트 섹션 파싱
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

  // 경과 텍스트 파싱 ([경과], [복진], [설진], [맥진], [혈색], [처방])
  const parseProgressText = (text: string) => {
    const sections = {
      treatment: '',
      diagnosis: '',
      prescription: ''
    };

    if (!text) return sections;

    const gyeongwaMatch = text.match(/\[경과\]\s*([^\[]*)/i);
    const bokjinMatch = text.match(/\[복진\]\s*([^\[]*)/i);
    const seoljinMatch = text.match(/\[설진\]\s*([^\[]*)/i);
    const maekjinMatch = text.match(/\[맥진\]\s*([^\[]*)/i);
    const hyeolsaekMatch = text.match(/\[혈색\]\s*([^\[]*)/i);
    const prescriptionMatch = text.match(/\[처방\]\s*([^\[]*)/i);

    // 경과 → treatment
    if (gyeongwaMatch) {
      sections.treatment = gyeongwaMatch[1].trim();
    }

    // 복진, 설진, 맥진, 혈색 → diagnosis (통합)
    const diagnosisParts: string[] = [];
    if (bokjinMatch && bokjinMatch[1].trim()) {
      diagnosisParts.push(`[복진]\n${bokjinMatch[1].trim()}`);
    }
    if (seoljinMatch && seoljinMatch[1].trim()) {
      diagnosisParts.push(`[설진]\n${seoljinMatch[1].trim()}`);
    }
    if (maekjinMatch && maekjinMatch[1].trim()) {
      diagnosisParts.push(`[맥진]\n${maekjinMatch[1].trim()}`);
    }
    if (hyeolsaekMatch && hyeolsaekMatch[1].trim()) {
      diagnosisParts.push(`[혈색]\n${hyeolsaekMatch[1].trim()}`);
    }

    if (diagnosisParts.length > 0) {
      sections.diagnosis = diagnosisParts.join('\n\n');
    }

    // 처방 → prescription
    if (prescriptionMatch) {
      sections.prescription = prescriptionMatch[1].trim();
    }

    // 구분자가 없는 경우: 전체 텍스트를 경과로 저장
    if (!sections.treatment && !sections.diagnosis && !sections.prescription) {
      sections.treatment = text.trim();
    }

    return sections;
  };

  // 자동저장
  const autoSaveProgress = async () => {
    try {
      setAutoSaveStatus('saving');

      if (!initialChart || !progressText.trim() || !progressDate) {
        setAutoSaveStatus('idle');
        return;
      }

      const parsed = parseProgressText(progressText);
      const now = new Date().toISOString();
      const noteDate = progressDate;

      const db = getDb();
      if (!db) return;

      if (editingProgressId) {
        // 수정 모드
        db.run(
          `UPDATE progress_notes SET
            note_date = ?, objective = ?, assessment = ?, plan = ?, updated_at = ?
          WHERE id = ?`,
          [noteDate, parsed.treatment || null, parsed.diagnosis || null, parsed.prescription || null, now, editingProgressId]
        );
        saveDb();
      } else if (lastSavedId) {
        // 기존 경과 업데이트
        db.run(
          `UPDATE progress_notes SET
            note_date = ?, objective = ?, assessment = ?, plan = ?, updated_at = ?
          WHERE id = ?`,
          [noteDate, parsed.treatment || null, parsed.diagnosis || null, parsed.prescription || null, now, lastSavedId]
        );
        saveDb();
      } else {
        // 새 경과 생성
        const newId = generateUUID();
        db.run(
          `INSERT INTO progress_notes (id, patient_id, note_date, objective, assessment, plan, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, initialChart.patient_id, noteDate, parsed.treatment || null, parsed.diagnosis || null, parsed.prescription || null, now, now]
        );
        saveDb();
        setLastSavedId(newId);
      }

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);

      // 경과 목록 새로고침
      await loadDetailData(initialChart.id, initialChart.patient_id);
    } catch (error) {
      console.error('자동저장 오류:', error);
      setAutoSaveStatus('idle');
    }
  };

  // 경과 추가
  const handleAddProgress = async () => {
    try {
      if (!initialChart) return;

      if (!progressText.trim()) {
        alert('경과 내용을 입력해주세요.');
        return;
      }

      if (!progressDate) {
        alert('경과 날짜를 선택해주세요.');
        return;
      }

      const parsed = parseProgressText(progressText);
      const now = new Date().toISOString();

      const db = getDb();
      if (!db) return;

      const id = generateUUID();
      db.run(
        `INSERT INTO progress_notes (id, patient_id, note_date, objective, assessment, plan, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, initialChart.patient_id, progressDate, parsed.treatment || null, parsed.diagnosis || null, parsed.prescription || null, now, now]
      );
      saveDb();

      alert('경과가 추가되었습니다');
      setShowAddForm(false);
      setProgressText('');
      setProgressDate('');
      setLastSavedId(null);
      setAutoSaveStatus('idle');
      await loadDetailData(initialChart.id, initialChart.patient_id);
    } catch (error: any) {
      console.error('경과 추가 실패:', error);
      alert('경과 추가에 실패했습니다: ' + error.message);
    }
  };

  // 경과 수정 모드 진입
  const handleEditProgress = (entry: ProgressEntry) => {
    const entryDate = new Date(entry.entry_date).toISOString().split('T')[0];
    setProgressDate(entryDate);

    // 텍스트 재구성
    let text = '';
    if (entry.treatment) {
      text += `[경과]\n${entry.treatment}\n\n`;
    }
    if (entry.diagnosis) {
      if (entry.diagnosis.includes('[복진]') || entry.diagnosis.includes('[설진]') ||
          entry.diagnosis.includes('[맥진]') || entry.diagnosis.includes('[혈색]')) {
        text += `${entry.diagnosis}\n\n`;
      } else {
        text += `${entry.diagnosis}\n\n`;
      }
    }
    if (entry.prescription) {
      text += `[처방]\n${entry.prescription}`;
    }

    setProgressText(text.trim());
    setEditingProgressId(entry.id);
    setShowAddForm(true);
  };

  // 경과 수정 저장
  const handleUpdateProgress = async () => {
    try {
      if (!editingProgressId) return;

      if (!progressText.trim()) {
        alert('경과 내용을 입력해주세요.');
        return;
      }

      if (!progressDate) {
        alert('경과 날짜를 선택해주세요.');
        return;
      }

      const parsed = parseProgressText(progressText);
      const now = new Date().toISOString();

      const db = getDb();
      if (!db) return;

      db.run(
        `UPDATE progress_notes SET
          note_date = ?, objective = ?, assessment = ?, plan = ?, updated_at = ?
        WHERE id = ?`,
        [progressDate, parsed.treatment || null, parsed.diagnosis || null, parsed.prescription || null, now, editingProgressId]
      );
      saveDb();

      alert('경과가 수정되었습니다');
      setShowAddForm(false);
      setProgressText('');
      setProgressDate('');
      setEditingProgressId(null);
      setLastSavedId(null);
      setAutoSaveStatus('idle');
      await loadDetailData(initialChart!.id, initialChart!.patient_id);
    } catch (error: any) {
      console.error('경과 수정 실패:', error);
      alert('경과 수정에 실패했습니다: ' + error.message);
    }
  };

  // 경과 삭제
  const handleDeleteProgress = async (progressId: string) => {
    if (!confirm('이 경과를 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM progress_notes WHERE id = ?', [progressId]);
      saveDb();

      alert('경과가 삭제되었습니다');
      await loadDetailData(initialChart!.id, initialChart!.patient_id);
    } catch (error: any) {
      console.error('경과 삭제 실패:', error);
      alert('경과 삭제에 실패했습니다: ' + error.message);
    }
  };

  // 초진차트 수정 모드
  const handleEditChart = () => {
    if (initialChart) {
      setEditedNotes(initialChart.notes || '');
      setIsEditingChart(true);
    }
  };

  // 초진차트 저장
  const handleSaveChart = async () => {
    try {
      if (!initialChart) return;

      const now = new Date().toISOString();
      const db = getDb();
      if (!db) return;

      db.run(
        `UPDATE initial_charts SET notes = ?, updated_at = ? WHERE id = ?`,
        [editedNotes, now, initialChart.id]
      );
      saveDb();

      alert('초진차트가 수정되었습니다');
      setIsEditingChart(false);
      await loadDetailData(initialChart.id, initialChart.patient_id);
    } catch (error: any) {
      console.error('수정 실패:', error);
      alert('수정에 실패했습니다: ' + error.message);
    }
  };

  // 초진차트 삭제
  const handleDeleteChart = async () => {
    if (!initialChart) return;

    if (!confirm('이 진료기록을 삭제하시겠습니까?\n\n삭제된 데이터는 복구할 수 없습니다.')) return;

    try {
      const db = getDb();
      if (!db) return;

      db.run('DELETE FROM initial_charts WHERE id = ?', [initialChart.id]);
      saveDb();

      alert('진료기록이 삭제되었습니다');
      closeDetailModal();
    } catch (error: any) {
      console.error('삭제 실패:', error);
      alert('삭제에 실패했습니다: ' + error.message);
    }
  };

  // 처방공식 추출 (<...> 패턴)
  const extractFormulaFromPrescription = (prescriptionText: string): string => {
    if (!prescriptionText) return '';
    const match = prescriptionText.match(/<([^>]+)>/);
    if (match) {
      return match[1].trim();
    }
    return '';
  };

  // 초진차트에서 섹션 추출
  const extractSectionFromNotes = (notes: string, sectionName: string): string => {
    if (!notes) return '';
    const regex = new RegExp(`\\[${sectionName}\\]\\s*([^\\[]*)`, 'i');
    const match = notes.match(regex);
    return match ? match[1].trim() : '';
  };

  // 초진차트 처방전 발급
  const handleIssuePrescriptionInitial = () => {
    if (!initialChart) return;

    const prescriptionSection = extractSectionFromNotes(initialChart.notes || '', '처방');
    const formula = extractFormulaFromPrescription(prescriptionSection);

    setPrescriptionFormula(formula);
    setPrescriptionSourceType('initial_chart');
    setPrescriptionSourceId(initialChart.id);
    setShowPrescriptionInputModal(true);
  };

  // 경과 처방전 발급
  const handleIssuePrescriptionProgress = (progressId: string) => {
    const progressEntry = progressEntries.find(entry => entry.id === progressId);
    if (!progressEntry) return;

    const formula = extractFormulaFromPrescription(progressEntry.prescription || '');

    setPrescriptionFormula(formula);
    setPrescriptionSourceType('progress_note');
    setPrescriptionSourceId(progressId);
    setShowPrescriptionInputModal(true);
  };

  // 처방 저장
  const handleSavePrescription = async (data: PrescriptionData) => {
    try {
      const db = getDb();
      if (!db) return;

      const now = new Date().toISOString();
      const prescriptionId = generateUUID();

      // prescriptions 테이블에 저장
      db.run(
        `INSERT INTO prescriptions (
          id, patient_id, patient_name, prescription_name, chart_number,
          source_type, source_id, formula,
          merged_herbs, final_herbs, total_doses, days, doses_per_day,
          total_packs, pack_volume, water_amount, herb_adjustment, total_dosage,
          final_total_amount, notes, status, issued_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId,
          selectedPatient?.id || null,
          selectedPatient?.name || null,
          data.formula, // prescription_name
          selectedPatient?.chart_number || null,
          prescriptionSourceType,
          prescriptionSourceId,
          data.formula,
          JSON.stringify(data.mergedHerbs),
          JSON.stringify(data.finalHerbs),
          data.totalDoses,
          data.days,
          data.dosesPerDay,
          data.totalPacks,
          data.packVolume,
          data.waterAmount,
          data.herbAdjustment || null,
          data.totalDosage,
          data.finalTotalAmount,
          data.notes || null,
          'issued',
          now,
          now,
          now
        ]
      );

      // 처방발급 상태 업데이트
      if (prescriptionSourceType === 'initial_chart' && prescriptionSourceId) {
        db.run(
          `UPDATE initial_charts SET prescription_issued = 1, prescription_issued_at = ? WHERE id = ?`,
          [now, prescriptionSourceId]
        );
        setInitialChartPrescriptionIssued(true);
      } else if (prescriptionSourceType === 'progress_note' && prescriptionSourceId) {
        db.run(
          `UPDATE progress_notes SET prescription_issued = 1, prescription_issued_at = ? WHERE id = ?`,
          [now, prescriptionSourceId]
        );

        setProgressEntries(prev =>
          prev.map(entry =>
            entry.id === prescriptionSourceId
              ? { ...entry, prescription_issued: true, prescription_issued_at: now }
              : entry
          )
        );
      }

      saveDb();

      alert('처방전이 발급되었습니다');
      setShowPrescriptionInputModal(false);
      setPrescriptionSourceId(null);
      closeDetailModal();
      navigate('/prescriptions');
    } catch (error: any) {
      console.error('처방전 발급 실패:', error);
      alert('처방전 발급에 실패했습니다: ' + error.message);
    }
  };

  // 진단 내용 정리 (마크업 제거)
  const cleanDiagnosisContent = (text: string): string => {
    if (!text) return '';

    const lines = text.split('\n');
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('[') && trimmed.includes(']')) {
        continue;
      }

      if (trimmed.startsWith('>')) {
        const content = trimmed.substring(1).trim();
        if (content) {
          cleanedLines.push(`- ${content}`);
        }
        continue;
      }

      if (trimmed) {
        cleanedLines.push(trimmed);
      }
    }

    return cleanedLines.join('\n').trim();
  };

  // 진단 테이블 데이터
  const getDiagnosisTableData = () => {
    interface DiagnosisData {
      [date: string]: {
        복진?: string;
        설진?: string;
        맥진?: string;
        혈색?: string;
        메모?: string;
      };
    }

    const data: DiagnosisData = {};
    const dates: string[] = [];

    // 초진차트 데이터
    if (initialChart) {
      const chartDate = new Date(initialChart.chart_date).toLocaleDateString('ko-KR');
      if (!dates.includes(chartDate)) {
        dates.push(chartDate);
      }

      if (!data[chartDate]) {
        data[chartDate] = {};
      }

      const bokjin = cleanDiagnosisContent(extractSectionFromNotes(initialChart.notes || '', '복진'));
      if (bokjin) data[chartDate].복진 = bokjin;

      const seoljin = cleanDiagnosisContent(extractSectionFromNotes(initialChart.notes || '', '설진'));
      if (seoljin) data[chartDate].설진 = seoljin;

      const maekjin = cleanDiagnosisContent(extractSectionFromNotes(initialChart.notes || '', '맥진'));
      if (maekjin) data[chartDate].맥진 = maekjin;

      const hyeolsaek = cleanDiagnosisContent(extractSectionFromNotes(initialChart.notes || '', '혈색'));
      if (hyeolsaek) data[chartDate].혈색 = hyeolsaek;
    }

    // 경과에서 진단 정보 추가
    progressEntries.forEach(entry => {
      if (entry.diagnosis) {
        const entryDate = new Date(entry.entry_date).toLocaleDateString('ko-KR');
        if (!dates.includes(entryDate)) {
          dates.push(entryDate);
        }

        if (!data[entryDate]) {
          data[entryDate] = {};
        }

        const diagnosisText = entry.diagnosis;
        const hasSections = /\[(복진|설진|맥진|혈색)\]/.test(diagnosisText);

        if (hasSections) {
          const bokjinMatch = diagnosisText.match(/\[복진\]\s*([^\[]*)/i);
          if (bokjinMatch && bokjinMatch[1].trim()) {
            data[entryDate].복진 = cleanDiagnosisContent(bokjinMatch[1]);
          }

          const seoljinMatch = diagnosisText.match(/\[설진\]\s*([^\[]*)/i);
          if (seoljinMatch && seoljinMatch[1].trim()) {
            data[entryDate].설진 = cleanDiagnosisContent(seoljinMatch[1]);
          }

          const maekjinMatch = diagnosisText.match(/\[맥진\]\s*([^\[]*)/i);
          if (maekjinMatch && maekjinMatch[1].trim()) {
            data[entryDate].맥진 = cleanDiagnosisContent(maekjinMatch[1]);
          }

          const hyeolsaekMatch = diagnosisText.match(/\[혈색\]\s*([^\[]*)/i);
          if (hyeolsaekMatch && hyeolsaekMatch[1].trim()) {
            data[entryDate].혈색 = cleanDiagnosisContent(hyeolsaekMatch[1]);
          }
        } else {
          const cleaned = cleanDiagnosisContent(diagnosisText);
          if (cleaned) {
            data[entryDate].메모 = cleaned;
          }
        }
      }
    });

    // 날짜 정렬
    dates.sort((a, b) => {
      const parseKoreanDate = (dateStr: string) => {
        const parts = dateStr.split('.').map(s => s.trim()).filter(s => s);
        if (parts.length >= 3) {
          return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date(dateStr);
      };

      const dateA = parseKoreanDate(a);
      const dateB = parseKoreanDate(b);
      return dateA.getTime() - dateB.getTime();
    });

    return { data, dates };
  };

  // 처방 데이터
  const getPrescriptionData = () => {
    const data: Array<{ date: string; content: string }> = [];

    if (initialChart) {
      const prescription = cleanDiagnosisContent(extractSectionFromNotes(initialChart.notes || '', '처방'));
      if (prescription) {
        const chartDate = new Date(initialChart.chart_date).toLocaleDateString('ko-KR');
        data.push({ date: chartDate, content: prescription });
      }
    }

    progressEntries.forEach(entry => {
      if (entry.prescription) {
        const entryDate = new Date(entry.entry_date).toLocaleDateString('ko-KR');
        const cleaned = cleanDiagnosisContent(entry.prescription);
        if (cleaned) {
          data.push({ date: entryDate, content: cleaned });
        }
      }
    });

    return data;
  };

  // 경과 데이터
  const getProgressData = () => {
    const data: Array<{ date: string; content: string }> = [];

    if (initialChart) {
      const progress = cleanDiagnosisContent(extractSectionFromNotes(initialChart.notes || '', '경과'));
      if (progress) {
        const chartDate = new Date(initialChart.chart_date).toLocaleDateString('ko-KR');
        data.push({ date: chartDate, content: progress });
      }
    }

    progressEntries.forEach(entry => {
      if (entry.treatment) {
        const entryDate = new Date(entry.entry_date).toLocaleDateString('ko-KR');
        const cleaned = cleanDiagnosisContent(entry.treatment);
        if (cleaned) {
          data.push({ date: entryDate, content: cleaned });
        }
      }
    });

    return data;
  };

  // ===== 렌더링 =====

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">차팅 관리</h1>
          <p className="text-sm text-gray-500 mt-1">초진차트 {chartRecords.length}건</p>
        </div>
        <p className="text-sm text-gray-500">초진차트를 클릭하여 상세보기</p>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        {listLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-500">로딩 중...</span>
          </div>
        ) : chartRecords.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500">등록된 초진차트가 없습니다</p>
            <p className="text-sm text-gray-400 mt-2">환자 관리에서 환자를 선택 후 차팅을 시작하세요</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {chartRecords.map((record) => (
              <div
                key={record.id}
                onClick={() => handleRecordClick(record)}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-md hover:border-primary-300 cursor-pointer transition-all"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary-100 text-primary-600">
                  <FileText className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{record.patient_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-primary-100 text-primary-700">
                      초진
                    </span>
                    {record.prescription_issued && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                        처방완료
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">{extractChiefComplaint(record.notes || '')}</p>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(record.chart_date).toLocaleDateString('ko-KR')}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg w-full h-[98vh] flex flex-col shadow-2xl">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-gray-700 to-gray-800 p-3 flex justify-between items-center text-white border-b-2 border-gray-900">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h2 className="text-lg font-bold">
                  진료기록 상세 - {selectedPatient?.name}
                  {selectedPatient?.chart_number && ` (${selectedPatient.chart_number})`}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowProgressModal(true)}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded transition-colors font-medium text-sm flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" />
                  경과 모아보기
                </button>
                <button
                  onClick={() => setShowDiagnosisModal(true)}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded transition-colors font-medium text-sm flex items-center gap-1"
                >
                  <Stethoscope className="w-4 h-4" />
                  진단 모아보기
                </button>
                <button
                  onClick={() => setShowPrescriptionModal(true)}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded transition-colors font-medium text-sm flex items-center gap-1"
                >
                  <Pill className="w-4 h-4" />
                  처방 모아보기
                </button>
                <button
                  onClick={handleDeleteChart}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded transition-colors font-medium text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  삭제
                </button>
                <button
                  onClick={closeDetailModal}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 rounded transition-colors font-medium text-sm flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  닫기
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* 왼쪽: 초진차트 */}
                <div className="w-1/2 border-r border-gray-200 overflow-y-auto p-6">
                  <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary-600" />
                      초진차트
                    </h3>
                    {!isEditingChart && initialChart && (
                      <button
                        onClick={handleEditChart}
                        className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors text-sm flex items-center gap-1"
                      >
                        <Edit className="w-4 h-4" />
                        수정
                      </button>
                    )}
                  </div>

                  {isEditingChart ? (
                    <div className="space-y-3">
                      <textarea
                        value={editedNotes}
                        onChange={(e) => setEditedNotes(e.target.value)}
                        className="w-full border-2 border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20 font-mono text-sm"
                        rows={25}
                        style={{ lineHeight: '1.5' }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveChart}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-semibold flex items-center gap-1"
                        >
                          <Save className="w-4 h-4" />
                          저장
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingChart(false);
                            setEditedNotes('');
                          }}
                          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-1"
                        >
                          <X className="w-4 h-4" />
                          취소
                        </button>
                      </div>
                    </div>
                  ) : initialChart && initialChart.notes ? (
                    <>
                      <div className="space-y-4 mb-4">
                        {parseChartSections(initialChart.notes).map((section, sectionIndex) => (
                          <div key={sectionIndex} className="bg-white border border-gray-300 rounded overflow-hidden shadow-sm">
                            <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                                  <ChevronRight className="w-4 h-4" />
                                  {section.title}
                                </h4>
                                {section.title === '처방' && (section.directContent || section.subsections.length > 0) && (
                                  initialChartPrescriptionIssued ? (
                                    <button
                                      onClick={() => navigate('/prescriptions')}
                                      className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold hover:bg-green-200 transition-colors flex items-center gap-1"
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                      처방완료
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={handleIssuePrescriptionInitial}
                                      className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition-colors font-semibold flex items-center gap-1"
                                    >
                                      <Send className="w-3 h-3" />
                                      처방전 발급
                                    </button>
                                  )
                                )}
                              </div>
                            </div>

                            {section.directContent && (
                              <div className="px-4 py-3 bg-gray-50">
                                <p className="text-gray-900 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.7' }}>
                                  {section.directContent}
                                </p>
                              </div>
                            )}

                            {section.subsections.length > 0 && (
                              <div className="p-4 space-y-3">
                                {section.subsections.map((subsection, subIndex) => (
                                  <div key={subIndex} className="border-l-3 border-gray-400 pl-4 py-2 bg-gray-50">
                                    <h5 className="font-semibold text-gray-700 mb-2 text-sm">
                                      - {subsection.title}
                                    </h5>
                                    <div className="text-gray-900 whitespace-pre-wrap text-sm ml-3" style={{ lineHeight: '1.7' }}>
                                      {subsection.content}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="bg-gray-50 border border-gray-300 rounded p-3 text-sm text-gray-600">
                        <div className="flex items-center mb-1">
                          <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                          <span className="font-semibold">진료일자:</span>
                          <span className="ml-2">{new Date(initialChart.chart_date).toLocaleDateString('ko-KR')}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="font-semibold ml-6">차트 생성일:</span>
                          <span className="ml-2">{new Date(initialChart.created_at).toLocaleString('ko-KR')}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500">초진차트 내용이 없습니다.</p>
                  )}
                </div>

                {/* 오른쪽: 경과 목록 */}
                <div className="w-1/2 overflow-y-auto p-6">
                  <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary-600" />
                      진료 경과
                    </h3>
                    <button
                      onClick={() => {
                        if (showAddForm) {
                          setShowAddForm(false);
                          setProgressText('');
                          setProgressDate('');
                          setEditingProgressId(null);
                          setLastSavedId(null);
                          setAutoSaveStatus('idle');
                        } else {
                          const today = new Date().toISOString().split('T')[0];
                          setProgressDate(today);
                          setProgressText('');
                          setEditingProgressId(null);
                          setShowAddForm(true);
                        }
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-md flex items-center gap-1"
                    >
                      {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {showAddForm ? '닫기' : '경과 추가'}
                    </button>
                  </div>

                  {/* 경과 추가 폼 */}
                  {showAddForm && (
                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-gray-800">
                          {editingProgressId ? '경과 수정' : '새 경과 추가'}
                        </h4>
                        {autoSaveStatus === 'saving' && (
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            저장 중...
                          </span>
                        )}
                        {autoSaveStatus === 'saved' && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            자동저장 완료
                          </span>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1 flex items-center gap-1">
                            <Calendar className="w-4 h-4 text-gray-600" />
                            경과 날짜
                          </label>
                          <input
                            type="date"
                            value={progressDate}
                            onChange={(e) => setProgressDate(e.target.value)}
                            className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1">
                            경과 내용
                          </label>
                          <div className="bg-white border border-gray-300 rounded p-2 mb-2 text-xs text-gray-700">
                            <strong>작성 방법:</strong> [경과], [복진], [설진], [맥진], [혈색], [처방] 구분자를 사용하세요
                            <span className="ml-2 text-gray-500">
                              (입력 후 5초마다 자동저장)
                            </span>
                          </div>
                          <textarea
                            value={progressText}
                            onChange={(e) => setProgressText(e.target.value)}
                            className="w-full border border-gray-300 rounded p-3 text-sm font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20"
                            rows={12}
                            placeholder={`[경과]
환자 상태 호전됨
두통 증상 감소

[복진]
복부 압통 감소

[설진]
설태 박백

[맥진]
맥 평이

[혈색]
안색 양호

[처방]
<소시호탕> 7일분`}
                            style={{ lineHeight: '1.6' }}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={editingProgressId ? handleUpdateProgress : handleAddProgress}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-semibold flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" />
                            {editingProgressId ? '수정 완료' : '저장'}
                          </button>
                          <button
                            onClick={() => {
                              setShowAddForm(false);
                              setProgressText('');
                              setProgressDate('');
                              setEditingProgressId(null);
                              setLastSavedId(null);
                              setAutoSaveStatus('idle');
                            }}
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-1"
                          >
                            <X className="w-4 h-4" />
                            취소
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 경과 목록 */}
                  <div className="space-y-4">
                    {progressEntries.length === 0 ? (
                      <div className="text-center py-12">
                        <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">등록된 경과가 없습니다</p>
                      </div>
                    ) : (
                      progressEntries.map((entry) => (
                        <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3 pb-2 border-b">
                            <span className="text-sm font-semibold text-primary-600 flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(entry.entry_date).toLocaleDateString('ko-KR')}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditProgress(entry)}
                                className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-500 transition-colors flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" />
                                수정
                              </button>
                              <button
                                onClick={() => handleDeleteProgress(entry.id)}
                                className="px-2 py-1 bg-red-700 text-white rounded text-xs hover:bg-red-600 transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                삭제
                              </button>
                            </div>
                          </div>

                          {entry.treatment && (
                            <div className="mb-3">
                              <h5 className="font-semibold text-gray-700 mb-2 text-sm">진료</h5>
                              <p className="text-gray-600 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.7' }}>{entry.treatment}</p>
                            </div>
                          )}

                          {entry.diagnosis && (
                            <div className="mb-3">
                              <h5 className="font-semibold text-gray-700 mb-2 text-sm">진단</h5>
                              <p className="text-gray-600 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.7' }}>{entry.diagnosis}</p>
                            </div>
                          )}

                          {entry.prescription && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-semibold text-gray-700 text-sm">처방</h5>
                                {entry.prescription_issued ? (
                                  <button
                                    onClick={() => navigate('/prescriptions')}
                                    className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold hover:bg-green-200 transition-colors flex items-center gap-1"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    처방완료
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleIssuePrescriptionProgress(entry.id)}
                                    className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition-colors font-semibold flex items-center gap-1"
                                  >
                                    <Send className="w-3 h-3" />
                                    처방전 발급
                                  </button>
                                )}
                              </div>
                              <p className="text-gray-600 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.7' }}>{entry.prescription}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 진단 모아보기 모달 */}
      {showDiagnosisModal && (() => {
        const { data, dates } = getDiagnosisTableData();
        const diagnosisTypes = ['복진', '설진', '맥진', '혈색', '메모'];

        return (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="bg-gray-700 p-5 flex justify-between items-center text-white border-b-4 border-gray-800">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <Stethoscope className="w-6 h-6" />
                  진단 모아보기
                </h3>
                <button
                  onClick={() => setShowDiagnosisModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  닫기
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {dates.length === 0 ? (
                  <div className="text-center py-12">
                    <Stethoscope className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">등록된 진단 정보가 없습니다</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border-2 border-gray-400 bg-gray-600 text-white p-3 font-bold sticky left-0 z-10">
                            구분
                          </th>
                          {dates.map((date, index) => (
                            <th key={index} className="border-2 border-gray-400 bg-gray-600 text-white p-3 font-bold min-w-[200px]">
                              <Calendar className="w-4 h-4 inline mr-2" />
                              {date}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {diagnosisTypes.map((type) => (
                          <tr key={type}>
                            <td className="border-2 border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800 sticky left-0 z-10">
                              {type}
                            </td>
                            {dates.map((date, index) => (
                              <td key={index} className="border-2 border-gray-300 p-3 bg-white align-top">
                                {data[date]?.[type as keyof typeof data[typeof date]] ? (
                                  <div className="text-gray-900 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.6' }}>
                                    {data[date][type as keyof typeof data[typeof date]]}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">-</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 처방 모아보기 모달 */}
      {showPrescriptionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="bg-gray-700 p-5 flex justify-between items-center text-white sticky top-0 border-b-4 border-gray-800">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <Pill className="w-6 h-6" />
                처방 모아보기
              </h3>
              <button
                onClick={() => setShowPrescriptionModal(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                닫기
              </button>
            </div>
            <div className="p-6 space-y-4">
              {getPrescriptionData().length === 0 ? (
                <div className="text-center py-12">
                  <Pill className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">등록된 처방 정보가 없습니다</p>
                </div>
              ) : (
                getPrescriptionData().map((item, index) => (
                  <div key={index} className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center mb-2 pb-2 border-b border-gray-300">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {item.date}
                      </span>
                    </div>
                    <p className="text-gray-900 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.7' }}>
                      {item.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 경과 모아보기 모달 */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="bg-gray-700 p-5 flex justify-between items-center text-white sticky top-0 border-b-4 border-gray-800">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <Eye className="w-6 h-6" />
                경과 모아보기
              </h3>
              <button
                onClick={() => setShowProgressModal(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                닫기
              </button>
            </div>
            <div className="p-6 space-y-4">
              {getProgressData().length === 0 ? (
                <div className="text-center py-12">
                  <Eye className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">등록된 경과 정보가 없습니다</p>
                </div>
              ) : (
                getProgressData().map((item, index) => (
                  <div key={index} className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center mb-2 pb-2 border-b border-gray-300">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {item.date}
                      </span>
                    </div>
                    <p className="text-gray-900 whitespace-pre-wrap text-sm" style={{ lineHeight: '1.7' }}>
                      {item.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 처방입력기 모달 */}
      {showPrescriptionInputModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] p-4">
          <div className="bg-gray-100 rounded-lg w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-gray-700 p-4 flex justify-between items-center text-white border-b-2 border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Pill className="w-5 h-5" />
                <div>
                  <h3 className="text-xl font-bold">처방전 발급</h3>
                  <p className="text-sm text-gray-300">
                    {selectedPatient?.name}
                    {selectedPatient?.chart_number && ` (${selectedPatient.chart_number})`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPrescriptionInputModal(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                닫기
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              <PrescriptionInput
                onSave={handleSavePrescription}
                patientName={selectedPatient?.name}
                showPatientInput={false}
                showNotesInput={true}
                showSaveButton={true}
                saveButtonText="처방전 발급"
                initialFormula={prescriptionFormula}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Charts;
