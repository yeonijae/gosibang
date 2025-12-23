import { usePatientStore } from '../store/patientStore';

export function Medications() {
  const { selectedPatient } = usePatientStore();

  if (!selectedPatient) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">복약 관리</h1>
        <div className="card text-center py-12">
          <p className="text-gray-500">환자 관리 메뉴에서 환자를 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">복약 관리</h1>
        <p className="text-gray-600 mt-1">
          환자: <span className="font-medium">{selectedPatient.name}</span>
        </p>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">복약 관리 기능은 준비 중입니다.</p>
          <p className="text-sm text-gray-400">
            환자별 복약 일정 설정, 복용 기록 관리 등의 기능이 추가될 예정입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
