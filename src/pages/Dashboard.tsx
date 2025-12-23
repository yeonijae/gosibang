import { useEffect } from 'react';
import { Users, FileText, ClipboardList, Calendar } from 'lucide-react';
import { usePatientStore } from '../store/patientStore';
import { useClinicStore } from '../store/clinicStore';

export function Dashboard() {
  const { patients, loadPatients } = usePatientStore();
  const { settings } = useClinicStore();

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const stats = [
    {
      label: '전체 환자',
      value: patients.length,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: '이번 달 처방',
      value: 0, // TODO: 실제 데이터로 교체
      icon: FileText,
      color: 'bg-green-500',
    },
    {
      label: '오늘 내원',
      value: 0, // TODO: 실제 데이터로 교체
      icon: Calendar,
      color: 'bg-purple-500',
    },
    {
      label: '차트 기록',
      value: 0, // TODO: 실제 데이터로 교체
      icon: ClipboardList,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {settings?.clinic_name || '고시방'} 대시보드
        </h1>
        <p className="text-gray-600 mt-1">
          {settings?.doctor_name ? `${settings.doctor_name} 원장님` : ''}
          {settings?.doctor_name ? ', 오늘도 좋은 하루 되세요!' : '환영합니다!'}
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`p-3 rounded-lg ${stat.color}`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-600">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 최근 환자 목록 */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 등록 환자</h2>
        {patients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">이름</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">생년월일</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">연락처</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">등록일</th>
                </tr>
              </thead>
              <tbody>
                {patients.slice(0, 5).map((patient) => (
                  <tr key={patient.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{patient.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{patient.birth_date || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{patient.phone || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(patient.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">등록된 환자가 없습니다.</p>
        )}
      </div>

      {/* 빠른 시작 가이드 */}
      {patients.length === 0 && (
        <div className="card bg-primary-50 border-primary-200">
          <h2 className="text-lg font-semibold text-primary-900 mb-2">시작하기</h2>
          <p className="text-primary-700 mb-4">
            아직 등록된 환자가 없습니다. 환자 관리 메뉴에서 첫 환자를 등록해보세요.
          </p>
          <ol className="list-decimal list-inside text-primary-700 space-y-1">
            <li>설정에서 한의원 정보를 입력하세요</li>
            <li>환자 관리에서 환자를 등록하세요</li>
            <li>처방 및 차트를 기록하세요</li>
          </ol>
        </div>
      )}
    </div>
  );
}
