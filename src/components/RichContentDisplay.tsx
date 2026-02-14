import { useState, useEffect } from 'react';
import { ensureHtml } from '../lib/contentUtils';
import { resolveImageUrls } from '../lib/imageStorage';

interface RichContentDisplayProps {
  content: string;
  className?: string;
  userId?: string;
}

export function RichContentDisplay({ content, className, userId }: RichContentDisplayProps) {
  const [resolvedContent, setResolvedContent] = useState(ensureHtml(content));

  useEffect(() => {
    const html = ensureHtml(content);
    if (html.includes('gosibang-image://')) {
      resolveImageUrls(html, userId).then(setResolvedContent);
    } else {
      setResolvedContent(html);
    }
  }, [content, userId]);

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      e.preventDefault();
      const href = (target as HTMLAnchorElement).href;
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className={`prose prose-sm max-w-none rich-content ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: resolvedContent }}
      onClick={handleClick}
    />
  );
}
