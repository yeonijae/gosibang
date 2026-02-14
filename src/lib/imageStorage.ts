// 이미지 파일 저장/읽기/URL 변환 모듈
// Tauri: appdata/images/{userId}/{uuid}.ext 로컬 파일 저장
// 브라우저: base64 fallback

import { isTauri } from './tauri';

const IMAGE_DIR = 'images';
const CUSTOM_SCHEME = 'gosibang-image://';

function getExtFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
  };
  return map[mimeType] || 'png';
}

function getImageDir(userId?: string): string {
  return userId ? `${IMAGE_DIR}/${userId}` : IMAGE_DIR;
}

/**
 * 이미지 파일을 로컬에 저장하고 커스텀 URI 반환
 * Tauri: appdata/images/{userId}/{uuid}.ext 저장 → gosibang-image://{uuid}.ext
 * 브라우저: base64 data URL 반환 (fallback)
 */
export async function saveImageToFile(file: File, userId?: string): Promise<string | null> {
  if (!isTauri()) {
    // 브라우저 fallback: base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  try {
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const ext = getExtFromMime(file.type);
    const uuid = crypto.randomUUID();
    const filename = `${uuid}.${ext}`;
    const dir = getImageDir(userId);

    // 디렉토리 생성 (존재하면 무시)
    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });

    // File → Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // 파일 저장
    await writeFile(`${dir}/${filename}`, data, { baseDir: BaseDirectory.AppData });

    return `${CUSTOM_SCHEME}${filename}`;
  } catch (e) {
    console.error('이미지 파일 저장 실패:', e);
    return null;
  }
}

/**
 * HTML content에서 gosibang-image:// URI를 실제 표시 가능한 URL로 변환
 * Tauri: convertFileSrc()로 https://asset.localhost/... 변환
 * 브라우저: 변환 없이 그대로 반환 (gosibang-image:// 는 브라우저에서 사용 안됨)
 */
export async function resolveImageUrls(html: string, userId?: string): Promise<string> {
  if (!html || !html.includes(CUSTOM_SCHEME)) return html;

  if (!isTauri()) return html;

  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const { appDataDir } = await import('@tauri-apps/api/path');
    const appData = await appDataDir();
    const dir = getImageDir(userId);

    return html.replace(
      /gosibang-image:\/\/([^"'\s)]+)/g,
      (_match, filename) => {
        const filePath = `${appData}${dir}/${filename}`;
        return convertFileSrc(filePath);
      }
    );
  } catch (e) {
    console.error('이미지 URL 변환 실패:', e);
    return html;
  }
}

/**
 * 에디터 저장 시: asset.localhost URL을 gosibang-image:// URI로 역변환
 */
export function unresolveImageUrls(html: string): string {
  if (!html) return html;

  // https://asset.localhost/... 패턴을 gosibang-image:// 로 역변환
  // Tauri asset 프로토콜 URL 패턴: https://asset.localhost/.../{IMAGE_DIR}/{userId?}/{uuid}.ext
  return html.replace(
    /https:\/\/asset\.localhost\/[^"'\s)]*\/images\/(?:[^/]+\/)?([^"'\s/)]+)/g,
    (_match, filename) => `${CUSTOM_SCHEME}${filename}`
  );
}

/**
 * 이미지 파일 목록 (ZIP 내보내기용)
 */
export async function listImageFiles(userId?: string): Promise<string[]> {
  if (!isTauri()) return [];

  try {
    const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const dir = getImageDir(userId);

    const entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
    return entries
      .filter(entry => entry.name && !entry.isDirectory)
      .map(entry => entry.name!);
  } catch (e) {
    // 디렉토리가 없으면 빈 배열
    return [];
  }
}

/**
 * 이미지 파일 읽기 (ZIP 내보내기용)
 */
export async function readImageFile(filename: string, userId?: string): Promise<Uint8Array | null> {
  if (!isTauri()) return null;

  try {
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const dir = getImageDir(userId);
    return await readFile(`${dir}/${filename}`, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error(`이미지 파일 읽기 실패 (${filename}):`, e);
    return null;
  }
}

/**
 * 이미지 파일 쓰기 (ZIP 복원용)
 */
export async function writeImageFile(filename: string, data: Uint8Array, userId?: string): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const dir = getImageDir(userId);

    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
    await writeFile(`${dir}/${filename}`, data, { baseDir: BaseDirectory.AppData });
    return true;
  } catch (e) {
    console.error(`이미지 파일 쓰기 실패 (${filename}):`, e);
    return false;
  }
}
