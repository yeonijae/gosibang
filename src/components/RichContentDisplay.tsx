import { ensureHtml } from '../lib/contentUtils';

interface RichContentDisplayProps {
  content: string;
  className?: string;
}

export function RichContentDisplay({ content, className }: RichContentDisplayProps) {
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
      dangerouslySetInnerHTML={{ __html: ensureHtml(content) }}
      onClick={handleClick}
    />
  );
}
