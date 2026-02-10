import { useEffect, useState } from 'react';
import {
  Pill,
  Plus,
  Calendar,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  User,
  AlertCircle,
} from 'lucide-react';
import { getDb, saveDb, queryToObjects, generateUUID } from '../lib/localDb';
import type { MedicationManagement, Prescription } from '../types';

// 처방전 + 복약관리 여부
interface PrescriptionWithMedication extends Prescription {
  has_medication: boolean;
}

// 상태 라벨
const STATUS_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '예정', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  contacted: { label: '연락완료', color: 'text-green-700', bgColor: 'bg-green-100' },
  completed: { label: '완료', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  postponed: { label: '연기', color: 'text-amber-700', bgColor: 'bg-amber-100' },
};

export function Medications() {
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'all'>('list');
  const [prescriptions, setPrescriptions] = useState<PrescriptionWithMedication[]>([]);
  const [medications, setMedications] = useState<MedicationManagement[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);

  // 복약관리 생성 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionWithMedication | null>(null);
  const [deliveryDays, setDeliveryDays] = useState(3);
  const [isCreating, setIsCreating] = useState(false);

  // 복약관리 상세 모달
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<MedicationManagement | null>(null);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 연기 모달
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeDays, setPostponeDays] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIsLoading(true);
    try {
      const db = getDb();
      if (!db) return;

      // 처방전 목록 (복약관리 여부 포함)
      const prescriptionsData = queryToObjects<Prescription>(
        db,
        `SELECT p.*,
          CASE WHEN mm.id IS NOT NULL THEN 1 ELSE 0 END as has_medication
         FROM prescriptions p
         LEFT JOIN medication_management mm ON p.id = mm.prescription_id
         WHERE p.status = 'issued'
         ORDER BY p.issued_at DESC`
      ) as PrescriptionWithMedication[];
      setPrescriptions(prescriptionsData);

      // 복약관리 목록
      const medicationsData = queryToObjects<MedicationManagement>(
        db,
        `SELECT * FROM medication_management ORDER BY happy_call_date ASC`
      );
      setMedications(medicationsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setIsLoading(false);
  };

  // 복약관리 생성
  const handleCreateMedication = async () => {
    if (!selectedPrescription) return;

    // patient_id가 없으면 생성 불가
    if (!selectedPrescription.patient_id) {
      alert('환자가 지정되지 않은 처방전입니다. 처방전에 환자를 먼저 지정해주세요.');
      return;
    }

    setIsCreating(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB not initialized');

      const now = new Date();
      const prescriptionDate = selectedPrescription.issued_at
        ? new Date(selectedPrescription.issued_at)
        : now;

      // 시작일 = 처방일 + 배송일
      const startDate = new Date(prescriptionDate);
      startDate.setDate(startDate.getDate() + deliveryDays);

      // 종료일 = 시작일 + 처방일수
      const days = selectedPrescription.days || 15;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);

      // 해피콜 날짜 = 종료일 - 3일 (복용 마지막 3일 전)
      const happyCallDate = new Date(endDate);
      happyCallDate.setDate(happyCallDate.getDate() - 3);

      const id = generateUUID();

      db.run(
        `INSERT INTO medication_management (
          id, prescription_id, patient_id, patient_name, prescription_name,
          prescription_date, days, delivery_days, start_date, end_date,
          happy_call_date, status, postpone_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))`,
        [
          id,
          selectedPrescription.id,
          selectedPrescription.patient_id,
          selectedPrescription.patient_name || '미지정',
          selectedPrescription.formula || selectedPrescription.prescription_name || '처방',
          prescriptionDate.toISOString().split('T')[0],
          days,
          deliveryDays,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          happyCallDate.toISOString().split('T')[0],
        ]
      );

      saveDb();
      loadData();
      setShowCreateModal(false);
      setSelectedPrescription(null);
    } catch (error) {
      console.error('Failed to create medication:', error);
      alert('복약관리 생성에 실패했습니다.');
    }
    setIsCreating(false);
  };

  // 상태 업데이트
  const handleUpdateStatus = async (status: 'contacted' | 'completed') => {
    if (!selectedMedication) return;

    setIsSaving(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB not initialized');

      db.run(
        `UPDATE medication_management
         SET status = ?, notes = ?, contacted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [status, notes, selectedMedication.id]
      );

      saveDb();
      loadData();
      setShowDetailModal(false);
      setSelectedMedication(null);
      setNotes('');
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('상태 업데이트에 실패했습니다.');
    }
    setIsSaving(false);
  };

  // 연기
  const handlePostpone = async () => {
    if (!selectedMedication) return;

    setIsSaving(true);
    try {
      const db = getDb();
      if (!db) throw new Error('DB not initialized');

      const currentDate = new Date(selectedMedication.happy_call_date);
      currentDate.setDate(currentDate.getDate() + postponeDays);
      const newDate = currentDate.toISOString().split('T')[0];

      db.run(
        `UPDATE medication_management
         SET status = 'postponed', happy_call_date = ?, postponed_to = ?,
             postpone_count = postpone_count + 1, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [newDate, newDate, notes, selectedMedication.id]
      );

      saveDb();
      loadData();
      setShowPostponeModal(false);
      setShowDetailModal(false);
      setSelectedMedication(null);
      setNotes('');
      setPostponeDays(1);
    } catch (error) {
      console.error('Failed to postpone:', error);
      alert('연기에 실패했습니다.');
    }
    setIsSaving(false);
  };

  // 삭제
  const handleDelete = async () => {
    if (!selectedMedication) return;
    if (!confirm('복약관리를 삭제하시겠습니까?')) return;

    try {
      const db = getDb();
      if (!db) throw new Error('DB not initialized');

      db.run('DELETE FROM medication_management WHERE id = ?', [selectedMedication.id]);
      saveDb();
      loadData();
      setShowDetailModal(false);
      setSelectedMedication(null);
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  // 날짜 이동
  const navigateDate = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  // 선택된 날짜의 복약관리 목록
  const filteredMedications = medications.filter(m =>
    m.happy_call_date === selectedDate ||
    (m.status === 'postponed' && m.postponed_to === selectedDate)
  );

  // 복약관리가 없는 처방전 목록 (환자가 지정된 것만)
  const prescriptionsWithoutMedication = prescriptions.filter(p => !p.has_medication && p.patient_id);

  // 날짜 포맷
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">복약관리</h1>
          <p className="text-sm text-gray-500 mt-1">복약관리 {medications.length}건</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'list'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Phone className="w-4 h-4 inline-block mr-1" />
            해피콜 예정
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Pill className="w-4 h-4 inline-block mr-1" />
            전체 목록
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Plus className="w-4 h-4 inline-block mr-1" />
            복약관리 생성
          </button>
        </div>
      </div>

      {/* 해피콜 목록 탭 */}
      {activeTab === 'list' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-auto">
          {/* 날짜 선택 */}
          <div className="card">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-primary-600" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-lg font-medium text-gray-900 border-none focus:ring-0 cursor-pointer"
                />
              </div>
              <button
                onClick={() => navigateDate('next')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">
              {formatFullDate(selectedDate)}
            </p>
          </div>

          {/* 오늘 해피콜 예정 목록 */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary-600" />
              해피콜 예정
              {filteredMedications.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                  {filteredMedications.length}
                </span>
              )}
            </h2>

            {filteredMedications.length > 0 ? (
              <div className="space-y-3">
                {filteredMedications.map((medication) => (
                  <div
                    key={medication.id}
                    onClick={() => {
                      setSelectedMedication(medication);
                      setNotes(medication.notes || '');
                      setShowDetailModal(true);
                    }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{medication.patient_name}</p>
                        <p className="text-sm text-gray-500">{medication.prescription_name}</p>
                        <p className="text-xs text-gray-400">
                          복용기간: {formatDate(medication.start_date)} ~ {formatDate(medication.end_date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_LABELS[medication.status]?.bgColor} ${STATUS_LABELS[medication.status]?.color}`}>
                        {STATUS_LABELS[medication.status]?.label}
                      </span>
                      {medication.postpone_count > 0 && (
                        <span className="text-xs text-amber-600">
                          ({medication.postpone_count}회 연기)
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Phone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">이 날짜에 예정된 해피콜이 없습니다</p>
              </div>
            )}
          </div>

          {/* 전체 복약관리 현황 */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Pill className="w-5 h-5 text-primary-600" />
              전체 현황
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {medications.filter(m => m.status === 'pending').length}
                </p>
                <p className="text-sm text-blue-700">예정</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {medications.filter(m => m.status === 'contacted').length}
                </p>
                <p className="text-sm text-green-700">연락완료</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-2xl font-bold text-amber-600">
                  {medications.filter(m => m.status === 'postponed').length}
                </p>
                <p className="text-sm text-amber-700">연기</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-600">
                  {medications.filter(m => m.status === 'completed').length}
                </p>
                <p className="text-sm text-gray-700">완료</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 전체 목록 탭 */}
      {activeTab === 'all' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-auto">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Pill className="w-5 h-5 text-primary-600" />
              전체 복약관리 목록
              {medications.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                  {medications.length}
                </span>
              )}
            </h2>

            {medications.length > 0 ? (
              <div className="space-y-3">
                {medications.map((medication) => (
                  <div
                    key={medication.id}
                    onClick={() => {
                      setSelectedMedication(medication);
                      setNotes(medication.notes || '');
                      setShowDetailModal(true);
                    }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{medication.patient_name}</p>
                        <p className="text-sm text-gray-500">{medication.prescription_name}</p>
                        <p className="text-xs text-gray-400">
                          복용: {formatDate(medication.start_date)} ~ {formatDate(medication.end_date)} ·
                          해피콜: {formatDate(medication.happy_call_date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_LABELS[medication.status]?.bgColor} ${STATUS_LABELS[medication.status]?.color}`}>
                        {STATUS_LABELS[medication.status]?.label}
                      </span>
                      {medication.postpone_count > 0 && (
                        <span className="text-xs text-amber-600">
                          ({medication.postpone_count}회 연기)
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Pill className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">등록된 복약관리가 없습니다</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 복약관리 생성 탭 */}
      {activeTab === 'create' && (
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 p-4 overflow-auto">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            복약관리 미등록 처방전
            {prescriptionsWithoutMedication.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                {prescriptionsWithoutMedication.length}
              </span>
            )}
          </h2>

          {prescriptionsWithoutMedication.length > 0 ? (
            <div className="space-y-3">
              {prescriptionsWithoutMedication.map((prescription) => (
                <div
                  key={prescription.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <Pill className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {prescription.patient_name || '미지정'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {prescription.formula || prescription.prescription_name || '처방'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {prescription.days || 15}일분 · 발급: {formatDate(prescription.issued_at || prescription.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPrescription(prescription);
                      setDeliveryDays(3);
                      setShowCreateModal(true);
                    }}
                    className="btn-primary text-sm flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    복약관리 생성
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-gray-500">모든 처방전에 복약관리가 등록되어 있습니다</p>
            </div>
          )}
        </div>
      )}

      {/* 복약관리 생성 모달 */}
      {showCreateModal && selectedPrescription && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">복약관리 생성</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900">{selectedPrescription.patient_name || '미지정'}</p>
                <p className="text-sm text-gray-500">{selectedPrescription.formula}</p>
                <p className="text-xs text-gray-400">{selectedPrescription.days || 15}일분</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  배송 소요일 (처방일로부터)
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <button
                      key={day}
                      onClick={() => setDeliveryDays(day)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        deliveryDays === day
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}일
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p>복용 시작일: 처방일 + {deliveryDays}일</p>
                    <p>해피콜 날짜: 복용 종료 3일 전</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCreateMedication}
                  disabled={isCreating}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  생성
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 복약관리 상세 모달 */}
      {showDetailModal && selectedMedication && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">복약관리 상세</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-900">{selectedMedication.patient_name}</p>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_LABELS[selectedMedication.status]?.bgColor} ${STATUS_LABELS[selectedMedication.status]?.color}`}>
                    {STATUS_LABELS[selectedMedication.status]?.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{selectedMedication.prescription_name}</p>
                <div className="mt-2 text-xs text-gray-400 space-y-1">
                  <p>처방일: {formatDate(selectedMedication.prescription_date)}</p>
                  <p>복용기간: {formatDate(selectedMedication.start_date)} ~ {formatDate(selectedMedication.end_date)}</p>
                  <p>해피콜: {formatDate(selectedMedication.happy_call_date)}</p>
                  {selectedMedication.postpone_count > 0 && (
                    <p className="text-amber-600">연기 횟수: {selectedMedication.postpone_count}회</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  메모
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="통화 내용, 특이사항 등..."
                  className="input-field h-24 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdateStatus('contacted')}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-1 text-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  연락완료
                </button>
                <button
                  onClick={() => setShowPostponeModal(true)}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center justify-center gap-1 text-sm"
                >
                  <Clock className="w-4 h-4" />
                  연기
                </button>
                <button
                  onClick={() => handleUpdateStatus('completed')}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center gap-1 text-sm"
                >
                  <XCircle className="w-4 h-4" />
                  완료
                </button>
              </div>

              <div className="pt-2 border-t border-gray-200">
                <button
                  onClick={handleDelete}
                  className="w-full py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 연기 모달 */}
      {showPostponeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">해피콜 연기</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  며칠 후로 연기하시겠습니까?
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 7].map((day) => (
                    <button
                      key={day}
                      onClick={() => setPostponeDays(day)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        postponeDays === day
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}일
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handlePostpone}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  {isSaving ? '저장 중...' : '연기'}
                </button>
                <button
                  onClick={() => setShowPostponeModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
