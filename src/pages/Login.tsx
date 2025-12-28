import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Clock, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function Login() {
  const navigate = useNavigate();
  const { login, signup, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  // 회원가입 추가 필드
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lectureId, setLectureId] = useState('');
  // 승인 대기 상태 표시
  const [showPendingMessage, setShowPendingMessage] = useState(false);
  const [pendingType, setPendingType] = useState<'signup' | 'login'>('signup');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setShowPendingMessage(false);

    if (isSignup && password !== confirmPassword) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      if (isSignup) {
        await signup(email, password, { name, phone, lectureId });
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage === 'SIGNUP_SUCCESS_PENDING_APPROVAL') {
        // 회원가입 성공, 승인 대기
        setPendingType('signup');
        setShowPendingMessage(true);
        clearError();
      } else if (errorMessage === 'PENDING_APPROVAL') {
        // 로그인 시도했으나 승인 대기 상태
        setPendingType('login');
        setShowPendingMessage(true);
        clearError();
      }
      // 그 외 에러는 store에서 처리
    }
  };

  const toggleMode = () => {
    setIsSignup(!isSignup);
    clearError();
    setShowPendingMessage(false);
    setPassword('');
    setConfirmPassword('');
    setName('');
    setPhone('');
    setLectureId('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-herb-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* 로고 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-primary-700">고시방</h1>
            <p className="text-gray-600 mt-2">한약처방관리시스템</p>
            <p className="text-sm text-primary-600 mt-1">
              {isSignup ? '회원가입' : '로그인'}
            </p>
          </div>

          {/* 승인 대기 안내 메시지 */}
          {showPendingMessage && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                {pendingType === 'signup' ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {pendingType === 'signup' ? '회원가입이 완료되었습니다!' : '승인 대기 중입니다'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {pendingType === 'signup'
                      ? '관리자 승인 후 로그인이 가능합니다. 승인까지 다소 시간이 걸릴 수 있습니다.'
                      : '아직 관리자 승인이 완료되지 않았습니다. 승인 완료 후 다시 로그인해 주세요.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && !showPendingMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* 로그인 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="example@clinic.com"
                required
                disabled={isLoading}
              />
            </div>

            {isSignup && (
              <>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    이름
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field"
                    placeholder="홍길동"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    연락처
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input-field"
                    placeholder="010-1234-5678"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="lectureId" className="block text-sm font-medium text-gray-700 mb-1">
                    강의 아이디
                  </label>
                  <input
                    id="lectureId"
                    type="text"
                    value={lectureId}
                    onChange={(e) => setLectureId(e.target.value)}
                    className="input-field"
                    placeholder="수강 중인 강의 아이디 입력"
                    required
                    disabled={isLoading}
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="비밀번호를 입력하세요"
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            {isSignup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field"
                  placeholder="비밀번호를 다시 입력하세요"
                  required
                  disabled={isLoading}
                  minLength={6}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isSignup ? '가입 중...' : '로그인 중...'}
                </>
              ) : (
                isSignup ? '회원가입' : '로그인'
              )}
            </button>
          </form>

          {/* 모드 전환 */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-primary-600 hover:text-primary-800"
            >
              {isSignup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
          </div>

          {/* 안내 문구 */}
          <div className="mt-4 text-center text-sm text-gray-500">
            <p>구독 문의: support@gosibang.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
