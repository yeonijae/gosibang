import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function isMarkdown(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return !trimmed.startsWith('<');
}

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

export function ensureHtml(content: string): string {
  if (!content) return '';
  return isMarkdown(content) ? markdownToHtml(content) : content;
}

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<img[^>]*>/gi, '[이미지]')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fileToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
