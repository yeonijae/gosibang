import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  Quote, List, ListOrdered, Link as LinkIcon, Unlink,
  ImagePlus, Undo2, Redo2, Highlighter, Palette, Type,
} from 'lucide-react';
import { useRef, useCallback, useState, useEffect } from 'react';
import { ensureHtml, fileToBase64 } from '../lib/contentUtils';
import { resolveImageUrls, unresolveImageUrls, getDisplayUrl, registerResolvedImage } from '../lib/imageStorage';
import { FontSize } from '../lib/tiptapFontSize';
import type { Editor } from '@tiptap/react';

const TEXT_COLORS = [
  { label: '기본', value: '' },
  { label: '빨강', value: '#dc2626' },
  { label: '주황', value: '#ea580c' },
  { label: '노랑', value: '#ca8a04' },
  { label: '초록', value: '#16a34a' },
  { label: '파랑', value: '#2563eb' },
  { label: '보라', value: '#9333ea' },
  { label: '회색', value: '#6b7280' },
];

const HIGHLIGHT_COLORS = [
  { label: '없음', value: '' },
  { label: '노랑', value: '#fef08a' },
  { label: '초록', value: '#bbf7d0' },
  { label: '파랑', value: '#bfdbfe' },
  { label: '분홍', value: '#fecdd3' },
  { label: '보라', value: '#e9d5ff' },
  { label: '주황', value: '#fed7aa' },
];

const FONT_SIZES = [
  { label: '작게', value: '12px' },
  { label: '보통', value: '' },
  { label: '크게', value: '18px' },
  { label: '아주 크게', value: '24px' },
];

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<string | null>;
  placeholder?: string;
  minHeight?: string;
  userId?: string;
}

export function RichTextEditor({ content, onChange, onImageUpload, placeholder, minHeight, userId }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isResolvingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ allowBase64: true, inline: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder || '' }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    content: ensureHtml(content),
    onUpdate: ({ editor: ed }) => {
      if (isResolvingRef.current) return;
      const html = ed.getHTML();
      onChange(unresolveImageUrls(html));
    },
  });

  // DOM 이벤트 리스너로 이미지 붙여넣기/드롭 처리 (stale closure 방지)
  useEffect(() => {
    if (!editor || !onImageUpload) return;

    const insertImage = async (file: File) => {
      try {
        const url = await onImageUpload(file);
        if (url) {
          if (url.startsWith('gosibang-image://')) {
            // gosibang-image:// URI → 캐시에서 표시용 base64 URL 조회
            let displayUrl = getDisplayUrl(url);
            if (!displayUrl) {
              // 캐시 미스: 파일에서 직접 base64 변환
              displayUrl = await fileToBase64(file) ?? undefined;
              if (displayUrl) {
                registerResolvedImage(url, displayUrl);
              }
            }
            if (displayUrl) {
              editor.chain().focus().setImage({ src: displayUrl }).run();
              return;
            }
          } else {
            editor.chain().focus().setImage({ src: url }).run();
            return;
          }
        }
      } catch (e) {
        console.error('이미지 업로드 실패, base64 fallback:', e);
      }
      // fallback: base64로 직접 삽입
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          if (base64) {
            editor.chain().focus().setImage({ src: base64 }).run();
          }
        };
        reader.readAsDataURL(file);
      } catch (e2) {
        console.error('base64 변환도 실패:', e2);
        alert('이미지 업로드에 실패했습니다.');
      }
    };

    const findImageFile = (dataTransfer: DataTransfer | null): File | null => {
      if (!dataTransfer) return null;
      // clipboardData.items 확인
      if (dataTransfer.items) {
        for (const item of Array.from(dataTransfer.items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) return file;
          }
        }
      }
      // clipboardData.files fallback (WebView2 호환)
      if (dataTransfer.files) {
        for (const file of Array.from(dataTransfer.files)) {
          if (file.type.startsWith('image/')) {
            return file;
          }
        }
      }
      return null;
    };

    const handlePaste = (e: Event) => {
      const event = e as ClipboardEvent;
      const file = findImageFile(event.clipboardData);
      if (file) {
        event.preventDefault();
        event.stopPropagation();
        insertImage(file);
      }
    };

    const handleDrop = (e: Event) => {
      const event = e as DragEvent;
      const file = findImageFile(event.dataTransfer);
      if (file) {
        event.preventDefault();
        event.stopPropagation();
        insertImage(file);
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('paste', handlePaste, { capture: true });
    dom.addEventListener('drop', handleDrop, { capture: true });
    return () => {
      dom.removeEventListener('paste', handlePaste, { capture: true });
      dom.removeEventListener('drop', handleDrop, { capture: true });
    };
  }, [editor, onImageUpload]);

  // 에디터 로드 시 gosibang-image:// URL 변환
  useEffect(() => {
    if (!editor) return;
    const html = ensureHtml(content);
    if (html.includes('gosibang-image://')) {
      isResolvingRef.current = true;
      resolveImageUrls(html, userId).then(resolved => {
        editor.commands.setContent(resolved, { emitUpdate: false });
        isResolvingRef.current = false;
      });
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor && onImageUpload) {
      try {
        const url = await onImageUpload(file);
        if (url) {
          if (url.startsWith('gosibang-image://')) {
            let displayUrl = getDisplayUrl(url);
            if (!displayUrl) {
              displayUrl = await fileToBase64(file) ?? undefined;
              if (displayUrl) {
                registerResolvedImage(url, displayUrl);
              }
            }
            if (displayUrl) {
              editor.chain().focus().setImage({ src: displayUrl }).run();
            } else {
              alert('이미지 업로드에 실패했습니다.');
            }
          } else {
            editor.chain().focus().setImage({ src: url }).run();
          }
        } else {
          alert('이미지 업로드에 실패했습니다.');
        }
      } catch (err) {
        console.error('이미지 업로드 실패:', err);
        alert('이미지 업로드에 실패했습니다.');
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!editor) return null;

  return (
    <div className="tiptap-editor" style={minHeight ? { minHeight } : undefined}>
      <EditorToolbar editor={editor} onImageClick={handleImageButtonClick} showImage={!!onImageUpload} />
      <EditorContent editor={editor} className="tiptap" style={minHeight ? { minHeight } : undefined} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

interface ToolbarProps {
  editor: Editor;
  onImageClick: () => void;
  showImage: boolean;
}

function EditorToolbar({ editor, onImageClick, showImage }: ToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);

  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href || '';
    const url = window.prompt('URL을 입력하세요', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const currentColor = editor.getAttributes('textStyle').color || '';

  return (
    <div className="tiptap-toolbar">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="굵게"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="기울임"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>

      <div className="separator" />

      {/* 글자 색상 */}
      <div className="toolbar-dropdown-wrap">
        <ToolbarButton
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowHighlightPicker(false);
            setShowFontSize(false);
          }}
          active={!!currentColor}
          title="글자 색상"
        >
          <Palette className="w-4 h-4" style={currentColor ? { color: currentColor } : undefined} />
        </ToolbarButton>
        {showColorPicker && (
          <div className="toolbar-dropdown">
            {TEXT_COLORS.map(c => (
              <button
                key={c.value}
                className={`color-swatch ${currentColor === c.value ? 'active' : ''}`}
                style={c.value ? { backgroundColor: c.value } : { backgroundColor: '#1f2937' }}
                title={c.label}
                onClick={() => {
                  if (c.value) {
                    editor.chain().focus().setColor(c.value).run();
                  } else {
                    editor.chain().focus().unsetColor().run();
                  }
                  setShowColorPicker(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 하이라이트 */}
      <div className="toolbar-dropdown-wrap">
        <ToolbarButton
          onClick={() => {
            setShowHighlightPicker(!showHighlightPicker);
            setShowColorPicker(false);
            setShowFontSize(false);
          }}
          active={editor.isActive('highlight')}
          title="형광펜"
        >
          <Highlighter className="w-4 h-4" />
        </ToolbarButton>
        {showHighlightPicker && (
          <div className="toolbar-dropdown">
            {HIGHLIGHT_COLORS.map(c => (
              <button
                key={c.value || 'none'}
                className={`color-swatch ${!c.value ? 'none' : ''}`}
                style={c.value ? { backgroundColor: c.value } : undefined}
                title={c.label}
                onClick={() => {
                  if (c.value) {
                    editor.chain().focus().setHighlight({ color: c.value }).run();
                  } else {
                    editor.chain().focus().unsetHighlight().run();
                  }
                  setShowHighlightPicker(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 글자 크기 */}
      <div className="toolbar-dropdown-wrap">
        <ToolbarButton
          onClick={() => {
            setShowFontSize(!showFontSize);
            setShowColorPicker(false);
            setShowHighlightPicker(false);
          }}
          title="글자 크기"
        >
          <Type className="w-4 h-4" />
        </ToolbarButton>
        {showFontSize && (
          <div className="toolbar-dropdown font-size-dropdown">
            {FONT_SIZES.map(s => (
              <button
                key={s.value || 'default'}
                className="font-size-option"
                onClick={() => {
                  if (s.value) {
                    editor.chain().focus().setFontSize(s.value).run();
                  } else {
                    editor.chain().focus().unsetFontSize().run();
                  }
                  setShowFontSize(false);
                }}
              >
                <span style={s.value ? { fontSize: s.value } : undefined}>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="separator" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="제목 1"
      >
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="제목 2"
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="제목 3"
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>

      <div className="separator" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="인용"
      >
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="목록"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="번호 목록"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <div className="separator" />

      <ToolbarButton
        onClick={addLink}
        active={editor.isActive('link')}
        title="링크"
      >
        {editor.isActive('link') ? <Unlink className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
      </ToolbarButton>

      {showImage && (
        <ToolbarButton onClick={onImageClick} title="이미지 삽입">
          <ImagePlus className="w-4 h-4" />
        </ToolbarButton>
      )}

      <div className="separator" />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="실행 취소"
      >
        <Undo2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="다시 실행"
      >
        <Redo2 className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={active ? 'is-active' : ''}
    >
      {children}
    </button>
  );
}
