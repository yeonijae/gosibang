import { useState, useEffect } from 'react';
import { Plus, FileText, ClipboardList, ChevronRight, Loader2 } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import { getDb, queryToObjects } from '../lib/localDb';
import { InitialChartView } from '../components/InitialChartView';
import { ProgressNoteView } from '../components/ProgressNoteView';
import type { InitialChart } from '../types';

interface MedicalRecord {
  id: string;
  patient_id: string;
  chief_complaint: string;
  chart_date: string;
  created_at: string;
}

export function Charts() {
  const { selectedPatient } = usePatientStore();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInitialChart, setShowInitialChart] = useState(false);
  const [showProgressNotes, setShowProgressNotes] = useState(false);
  const [forceNewChart, setForceNewChart] = useState(false);

  useEffect(() => {
    if (selectedPatient) {
      loadRecords();
    }
  }, [selectedPatient]);

  const loadRecords = async () => {
    if (!selectedPatient) return;

    try {
      setLoading(true);
      const db = getDb();
      if (!db) {
        setLoading(false);
        return;
      }

      const data = queryToObjects<InitialChart>(
        db,
        'SELECT * FROM initial_charts WHERE patient_id = ? ORDER BY chart_date DESC',
        [selectedPatient.id]
      );

      const recordsData: MedicalRecord[] = data.map(chart => ({
        id: chart.id,
        patient_id: chart.patient_id,
        chief_complaint: extractChiefComplaint(chart.notes || ''),
        chart_date: chart.chart_date,
        created_at: chart.created_at
      }));

      setRecords(recordsData);
    } catch (error) {
      console.error('진료기록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractChiefComplaint = (notes: string): string => {
    if (!notes) return '-';

    const sectionMatch = notes.match(/\[주소증\]\s*([^\[]+)/);
    if (!sectionMatch) return '-';

    const sectionText = sectionMatch[1].trim();
    const lines = sectionText.split('\n');

    const numberedItems: string[] = [];

    for (const line of lines) {
      const numberedMatch = line.match(/^\d+\.\s*(.+)/);
      if (numberedMatch) {
        numberedItems.push(numberedMatch[1].trim());
      }
    }

    if (numberedItems.length === 0) return '-';

    const result = numberedItems.join(', ');
    return result.length > 60 ? result.substring(0, 60) + '...' : result;
  };

  const handleCloseChart = () => {
    setShowInitialChart(false);
    setForceNewChart(false);
    loadRecords();
  };

  if (!selectedPatient) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">차팅 관리</h1>
        <div className="card text-center py-12">
          <p className="text-gray-500">환자 관리 메뉴에서 환자를 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">차팅 관리</h1>
          <p className="text-gray-600 mt-1">
            환자: <span className="font-medium">{selectedPatient.name}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setForceNewChart(true);
              setShowInitialChart(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            새 진료 시작
          </button>
        </div>
      </div>

      {/* 차트 액션 버튼들 */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => {
            setForceNewChart(false);
            setShowInitialChart(true);
          }}
          className="card hover:shadow-md transition-shadow p-6 text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">초진차트</h3>
              <p className="text-sm text-gray-500">환자의 초진 기록 확인 및 작성</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </button>

        <button
          onClick={() => setShowProgressNotes(true)}
          className="card hover:shadow-md transition-shadow p-6 text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">경과기록 (SOAP)</h3>
              <p className="text-sm text-gray-500">SOAP 형식의 경과기록 작성</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </button>
      </div>

      {/* 진료 기록 목록 */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">진료 기록</h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-500">로딩 중...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">등록된 진료기록이 없습니다</p>
            <button
              onClick={() => {
                setForceNewChart(true);
                setShowInitialChart(true);
              }}
              className="btn-primary mt-4"
            >
              첫 진료 시작하기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                onClick={() => {
                  setForceNewChart(false);
                  setShowInitialChart(true);
                }}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-primary-500 cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        {new Date(record.chart_date).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    <p className="text-gray-900 font-medium">
                      {record.chief_complaint}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 초진차트 모달 */}
      {showInitialChart && (
        <InitialChartView
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          onClose={handleCloseChart}
          forceNew={forceNewChart}
        />
      )}

      {/* 경과기록 모달 */}
      {showProgressNotes && (
        <ProgressNoteView
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          onClose={() => setShowProgressNotes(false)}
        />
      )}
    </div>
  );
}
