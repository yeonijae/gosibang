// 이미지 파일 저장/읽기/URL 변환 모듈
// Tauri: appdata/images/{userId}/{uuid}.ext 로컬 파일 저장 + base64 표시
// 브라우저: base64 fallback

import { isTauri } from './tauri';

const IMAGE_DIR = 'images';
const CUSTOM_SCHEME = 'gosibang-image://';

// 모듈 레벨 캐시: gosibang-image://filename → data:mime;base64,...
// 에디터에서 표시용 base64와 저장용 URI 간 변환에 사용
const resolvedImageCache = new Map<string, string>();

/**
 * 해석된 이미지 매핑 등록 (에디터에서 base64 → gosibang-image:// 역변환용)
 */
export function registerResolvedImage(storageUri: string, displayUrl: string) {
  resolvedImageCache.set(storageUri, displayUrl);
}

/**
 * gosibang-image:// URI에 대응하는 표시용 URL(base64) 조회
 */
export function getDisplayUrl(storageUri: string): string | undefined {
  return resolvedImageCache.get(storageUri);
}

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

function getMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
  };
  return map[ext] || 'image/png';
}

function getImageDir(userId?: string): string {
  return userId ? `${IMAGE_DIR}/${userId}` : IMAGE_DIR;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 이미지 파일을 로컬에 저장하고 base64 data URL 반환
 * Tauri: appdata/images/{userId}/{uuid}.ext 저장 → base64 data URL 반환
 * 브라우저: base64 data URL 반환
 */
export async function saveImageToFile(file: File, userId?: string): Promise<string | null> {
  // base64 변환 (표시용)
  const toBase64 = (buf: ArrayBuffer, mime: string): string => {
    const bytes = new Uint8Array(buf);
    return `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
  };

  if (!isTauri()) {
    const arrayBuffer = await file.arrayBuffer();
    return toBase64(arrayBuffer, file.type);
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

    // 파일 저장 (export/backup용)
    await writeFile(`${dir}/${filename}`, data, { baseDir: BaseDirectory.AppData });

    // gosibang-image:// URI 반환 (저장용) + 캐시에 표시용 URL 등록
    const storageUri = `${CUSTOM_SCHEME}${filename}`;
    const displayUrl = toBase64(arrayBuffer, file.type);
    resolvedImageCache.set(storageUri, displayUrl);
    return storageUri;
  } catch (e) {
    console.error('이미지 파일 저장 실패:', e);
    return null;
  }
}

/**
 * HTML content에서 gosibang-image:// URI를 base64 data URL로 변환
 * 파일을 읽어서 base64로 변환하여 표시
 */
export async function resolveImageUrls(html: string, userId?: string): Promise<string> {
  if (!html || !html.includes(CUSTOM_SCHEME)) return html;

  if (!isTauri()) return html;

  try {
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const dir = getImageDir(userId);

    const matches = [...html.matchAll(/gosibang-image:\/\/([^"'\s)]+)/g)];
    let result = html;

    for (const match of matches) {
      const filename = match[1];
      try {
        const data = await readFile(`${dir}/${filename}`, { baseDir: BaseDirectory.AppData });
        const ext = filename.split('.').pop() || 'png';
        const mime = getMimeFromExt(ext);
        const base64 = uint8ArrayToBase64(data);
        const dataUrl = `data:${mime};base64,${base64}`;
        resolvedImageCache.set(match[0], dataUrl);
        result = result.replaceAll(match[0], dataUrl);
      } catch (e) {
        console.error(`이미지 파일 읽기 실패: ${filename}`, e);
      }
    }

    return result;
  } catch (e) {
    console.error('이미지 URL 변환 실패:', e);
    return html;
  }
}

/**
 * 에디터 저장 시: asset.localhost URL 또는 base64 data URL을 gosibang-image:// URI로 역변환
 * 주의: base64는 파일명 정보가 없으므로 그대로 유지 (DB에 저장됨)
 */
export function unresolveImageUrls(html: string): string {
  if (!html) return html;

  // https://asset.localhost/... 패턴을 gosibang-image:// 로 역변환 (기존 데이터 호환)
  let result = html.replace(
    /https:\/\/asset\.localhost\/[^"'\s)]*\/images\/(?:[^/]+\/)?([^"'\s/)]+)/g,
    (_match, filename) => `${CUSTOM_SCHEME}${filename}`
  );

  // 캐시된 base64 data URL을 gosibang-image:// 로 역변환
  for (const [uri, dataUrl] of resolvedImageCache.entries()) {
    // 성능 최적화: data URL 접두사로 빠른 존재 여부 확인
    const prefix = dataUrl.substring(0, 60);
    if (result.includes(prefix)) {
      result = result.replaceAll(dataUrl, uri);
    }
  }

  return result;
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
