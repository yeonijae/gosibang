import { useEffect, useState, useCallback } from 'react';

const ZOOM_KEY = 'app-zoom-level';
const MIN_ZOOM = 0.5;   // 50%
const MAX_ZOOM = 2.0;   // 200%
const ZOOM_STEP = 0.1;  // 10% 단위
const DEFAULT_ZOOM = 1.0;

/**
 * 화면 배율 조정 훅
 *
 * - Ctrl + (+/=): 확대
 * - Ctrl + (-/_): 축소
 * - Ctrl + 0: 기본 배율로 리셋
 * - 마우스 휠 + Ctrl: 확대/축소
 *
 * 배율은 localStorage에 저장되어 앱 재시작 시에도 유지됩니다.
 */
export function useZoom() {
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem(ZOOM_KEY);
    return saved ? parseFloat(saved) : DEFAULT_ZOOM;
  });

  // 줌 적용
  const applyZoom = useCallback((newZoom: number) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    const roundedZoom = Math.round(clampedZoom * 10) / 10; // 소수점 1자리

    document.documentElement.style.zoom = `${roundedZoom}`;
    localStorage.setItem(ZOOM_KEY, String(roundedZoom));
    setZoom(roundedZoom);

    console.log(`Zoom level: ${Math.round(roundedZoom * 100)}%`);
  }, []);

  // 확대
  const zoomIn = useCallback(() => {
    applyZoom(zoom + ZOOM_STEP);
  }, [zoom, applyZoom]);

  // 축소
  const zoomOut = useCallback(() => {
    applyZoom(zoom - ZOOM_STEP);
  }, [zoom, applyZoom]);

  // 리셋
  const zoomReset = useCallback(() => {
    applyZoom(DEFAULT_ZOOM);
  }, [applyZoom]);

  // 특정 값으로 설정
  const setZoomLevel = useCallback((level: number) => {
    applyZoom(level);
  }, [applyZoom]);

  // 초기 줌 적용 및 키보드 이벤트 등록
  useEffect(() => {
    // 저장된 줌 레벨 적용
    applyZoom(zoom);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl 키가 눌린 상태에서만 처리
      if (!e.ctrlKey && !e.metaKey) return;

      switch (e.key) {
        case '+':
        case '=': // Shift 없이 + 키
          e.preventDefault();
          zoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          zoomReset();
          break;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Ctrl + 마우스 휠로 줌
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, applyZoom, zoomIn, zoomOut, zoomReset]);

  return {
    zoom,
    zoomPercent: Math.round(zoom * 100),
    zoomIn,
    zoomOut,
    zoomReset,
    setZoomLevel,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };
}
