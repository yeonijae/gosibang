import { useEffect, useState } from 'react';

/**
 * Windows DPI 스케일링을 강제 적용하는 훅
 *
 * 고해상도 모니터에서 Windows 화면 배율(125%, 150% 등)이
 * WebView에 적용되지 않을 때 수동으로 zoom을 적용합니다.
 */
export function useDpiScaling() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const applyDpiScaling = () => {
      // devicePixelRatio는 Windows DPI 스케일링을 반영
      // 예: 125% = 1.25, 150% = 1.5, 175% = 1.75
      const dpr = window.devicePixelRatio || 1;
      setScale(dpr);

      // 항상 DPI에 맞춰 zoom 적용
      if (dpr > 1) {
        document.documentElement.style.zoom = `${dpr}`;
        console.log(`DPI Scaling applied: ${Math.round(dpr * 100)}%`);
      } else {
        document.documentElement.style.zoom = '';
      }
    };

    // 초기 적용
    applyDpiScaling();

    // DPI 변경 감지 (모니터 이동 시)
    const handleResize = () => {
      // devicePixelRatio가 변경되었을 때만 재적용
      const currentDpr = window.devicePixelRatio || 1;
      if (currentDpr !== scale) {
        applyDpiScaling();
      }
    };

    window.addEventListener('resize', handleResize);

    // matchMedia로 DPI 변경 더 정확히 감지
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const handleMediaChange = () => applyDpiScaling();
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      mediaQuery.removeEventListener('change', handleMediaChange);
      document.documentElement.style.zoom = '';
    };
  }, [scale]);

  return scale;
}

/**
 * 현재 DPI 스케일링 비율을 반환
 */
export function getDpiScale(): number {
  return window.devicePixelRatio || 1;
}
