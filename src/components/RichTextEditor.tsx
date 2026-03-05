import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
// lucide-react icons removed (unused after toolbar simplification)
import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { ensureHtml, fileToBase64 } from '../lib/contentUtils';
import { resolveImageUrls, unresolveImageUrls, getDisplayUrl, registerResolvedImage } from '../lib/imageStorage';

// 커스텀 Size attributor: 인라인 style로 font-size 적용 (tiptap 데이터 호환)
const SizeStyle = Quill.import('attributors/style/size') as any;
SizeStyle.whitelist = ['12px', '18px', '24px'];
Quill.register(SizeStyle, true);

const TEXT_COLORS = [
  '', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea', '#6b7280',
];

const HIGHLIGHT_COLORS = [
  false, '#fef08a', '#bbf7d0', '#bfdbfe', '#fecdd3', '#e9d5ff', '#fed7aa',
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
  const quillRef = useRef<ReactQuill>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isResolvingRef = useRef(false);
  const [resolvedContent, setResolvedContent] = useState('');
  const [isReady, setIsReady] = useState(false);

  // 에디터 로드 시 gosibang-image:// URL 변환
  useEffect(() => {
    const html = ensureHtml(content);
    if (html.includes('gosibang-image://')) {
      isResolvingRef.current = true;
      resolveImageUrls(html, userId).then(resolved => {
        setResolvedContent(resolved);
        isResolvingRef.current = false;
        setIsReady(true);
      });
    } else {
      setResolvedContent(html);
      setIsReady(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 이미지 삽입 헬퍼
  const insertImage = useCallback(async (file: File) => {
    if (!onImageUpload || !quillRef.current) return;
    const editor = quillRef.current.getEditor();

    try {
      const url = await onImageUpload(file);
      if (url) {
        let displayUrl: string | undefined;
        if (url.startsWith('gosibang-image://')) {
          displayUrl = getDisplayUrl(url);
          if (!displayUrl) {
            displayUrl = await fileToBase64(file) ?? undefined;
            if (displayUrl) registerResolvedImage(url, displayUrl);
          }
        } else {
          displayUrl = url;
        }
        if (displayUrl) {
          const range = editor.getSelection(true);
          editor.insertEmbed(range.index, 'image', displayUrl);
          editor.setSelection(range.index + 1, 0);
          return;
        }
      }
    } catch (e) {
      console.error('이미지 업로드 실패, base64 fallback:', e);
    }
    // fallback: base64로 직접 삽입
    try {
      const base64 = await fileToBase64(file);
      if (base64) {
        const range = editor.getSelection(true);
        editor.insertEmbed(range.index, 'image', base64);
        editor.setSelection(range.index + 1, 0);
      }
    } catch (e2) {
      console.error('base64 변환도 실패:', e2);
      alert('이미지 업로드에 실패했습니다.');
    }
  }, [onImageUpload]);

  // DOM 이벤트 리스너로 이미지 붙여넣기/드롭 처리
  useEffect(() => {
    if (!isReady || !quillRef.current || !onImageUpload) return;
    const editorRoot = quillRef.current.getEditor().root;

    const findImageFile = (dataTransfer: DataTransfer | null): File | null => {
      if (!dataTransfer) return null;
      if (dataTransfer.items) {
        for (const item of Array.from(dataTransfer.items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) return file;
          }
        }
      }
      if (dataTransfer.files) {
        for (const file of Array.from(dataTransfer.files)) {
          if (file.type.startsWith('image/')) return file;
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

    editorRoot.addEventListener('paste', handlePaste, { capture: true });
    editorRoot.addEventListener('drop', handleDrop, { capture: true });
    return () => {
      editorRoot.removeEventListener('paste', handlePaste, { capture: true });
      editorRoot.removeEventListener('drop', handleDrop, { capture: true });
    };
  }, [isReady, onImageUpload, insertImage]);

  // 파일 선택 버튼 핸들러
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await insertImage(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [insertImage]);

  // 툴바 이미지 핸들러
  const imageHandler = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Quill 모듈 설정 (재생성 방지)
  const modules = useMemo(() => ({
    toolbar: {
      container: [
        ['bold', 'italic'],
        [{ color: TEXT_COLORS }, { background: HIGHLIGHT_COLORS }],
        [{ size: ['12px', false, '18px', '24px'] }],
        [{ header: [1, 2, 3, false] }],
        ['blockquote', { list: 'bullet' }, { list: 'ordered' }],
        ['link', ...(onImageUpload ? ['image'] : [])],
        ['undo', 'redo'],
      ],
      handlers: {
        image: imageHandler,
        undo: function (this: any) {
          this.quill.history.undo();
        },
        redo: function (this: any) {
          this.quill.history.redo();
        },
      },
    },
    history: { delay: 1000, maxStack: 100, userOnly: true },
  }), [imageHandler, onImageUpload]);

  const formats = [
    'bold', 'italic',
    'header', 'size',
    'color', 'background',
    'blockquote', 'list',
    'link', 'image',
  ];

  const handleChange = useCallback((value: string) => {
    if (isResolvingRef.current) return;
    // Quill이 빈 에디터에 넣는 <p><br></p> 처리
    const isEmpty = value === '<p><br></p>' || value === '<p></p>';
    onChange(unresolveImageUrls(isEmpty ? '' : value));
  }, [onChange]);

  if (!isReady) return null;

  return (
    <div className="quill-editor-wrapper" style={minHeight ? { minHeight } : undefined}>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={resolvedContent}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || ''}
        style={minHeight ? { minHeight } : undefined}
      />
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
