/**
 * 알림 사운드 서비스
 * Web Audio API를 사용하여 프로그래밍 방식으로 알림음을 생성합니다.
 */

export type SoundPreset = 'default' | 'gentle' | 'urgent' | 'silent';

class NotificationSoundService {
  private audioContext: AudioContext | null = null;
  private volume: number = 0.5;
  private isMuted: boolean = false;

  /**
   * AudioContext 초기화 (사용자 상호작용 후 호출 필요)
   */
  private getAudioContext(): AudioContext | null {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch (e) {
        console.error('[NotificationSound] AudioContext 생성 실패:', e);
        return null;
      }
    }
    return this.audioContext;
  }

  /**
   * 오실레이터로 톤 생성
   */
  private playTone(
    frequency: number,
    duration: number,
    startTime: number,
    type: OscillatorType = 'sine'
  ): void {
    const ctx = this.getAudioContext();
    if (!ctx || this.isMuted) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    // 볼륨 엔벨로프 (부드러운 시작과 끝)
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(this.volume, startTime + 0.01);
    gainNode.gain.setValueAtTime(this.volume, startTime + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  /**
   * 기본 알림음: 두 음의 차임 (440Hz, 880Hz)
   */
  private playDefault(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(440, 0.15, now, 'sine');
    this.playTone(880, 0.2, now + 0.15, 'sine');
  }

  /**
   * 부드러운 알림음: 단일 톤 (330Hz, 긴 감쇠)
   */
  private playGentle(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 330;

    // 부드러운 감쇠
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(this.volume * 0.6, now + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.8);
  }

  /**
   * 긴급 알림음: 3회 비프 (880Hz, 짧은 간격)
   */
  private playUrgent(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const beepDuration = 0.08;
    const interval = 0.12;

    for (let i = 0; i < 3; i++) {
      this.playTone(880, beepDuration, now + i * interval, 'square');
    }
  }

  /**
   * 무음
   */
  private playSilent(): void {
    // 아무것도 재생하지 않음
  }

  /**
   * 프리셋에 따라 알림음 재생
   */
  async play(preset: SoundPreset): Promise<void> {
    if (this.isMuted) return;

    // AudioContext resume (사용자 상호작용 필요)
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    switch (preset) {
      case 'default':
        this.playDefault();
        break;
      case 'gentle':
        this.playGentle();
        break;
      case 'urgent':
        this.playUrgent();
        break;
      case 'silent':
        this.playSilent();
        break;
    }
  }

  /**
   * 볼륨 설정 (0.0 - 1.0)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 현재 볼륨 가져오기
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * 음소거 설정
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  /**
   * 음소거 상태 가져오기
   */
  isMutedState(): boolean {
    return this.isMuted;
  }

  /**
   * 테스트용 사운드 재생
   */
  async test(preset: SoundPreset): Promise<void> {
    // 테스트 시에는 음소거 무시
    const wasMuted = this.isMuted;
    this.isMuted = false;
    await this.play(preset);
    this.isMuted = wasMuted;
  }

  /**
   * AudioContext 정리
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const notificationSound = new NotificationSoundService();
