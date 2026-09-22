import { Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';

/**
 * Editor de texto enriquecido del panel (TipTap).
 *
 * Escribes en WYSIWYG pero **se guarda Markdown**, que es lo que espera el resto del sitio:
 * el loader se lo pasa al renderMarkdown() de Astro y sale con el mismo tratamiento que
 * tenían los .md. Por eso la extensión Markdown oficial: hace de traductor en los dos sentidos.
 *
 * Las imágenes se pegan, se arrastran o se eligen con el botón. En los tres casos aparecen
 * al instante con una URL local (blob:) y la subida ocurre por detrás; cuando termina, se
 * cambia el src por el de Storage. Así no te quedas mirando una barra de progreso.
 */

export interface RichEditor {
  getMarkdown(): string;
  destroy(): void;
}

interface Options {
  /** Dónde montarlo. Se vacía antes de empezar. */
  mount: HTMLElement;
  /** Markdown de partida. */
  initial: string;
  /** Sube el archivo y devuelve su URL pública. */
  upload: (file: File) => Promise<string>;
  /** Se llama en cada tecla con el Markdown actual (para el contador y el autoguardado). */
  onUpdate: (markdown: string) => void;
  /** Mensajes para la barra de estado del panel. */
  onStatus: (message: string, kind?: 'info' | 'error' | 'ok') => void;
}

interface Tool {
  label: string;
  title: string;
  /** Separador visual antes de este botón. */
  divider?: boolean;
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

const TOOLS: Tool[] = [
  {
    label: 'H2',
    title: 'Título de sección',
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    label: 'H3',
    title: 'Subtítulo',
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (e) => e.isActive('heading', { level: 3 }),
  },
  {
    label: 'B',
    title: 'Negrita (Ctrl+B)',
    divider: true,
    run: (e) => e.chain().focus().toggleBold().run(),
    isActive: (e) => e.isActive('bold'),
  },
  {
    label: 'I',
    title: 'Cursiva (Ctrl+I)',
    run: (e) => e.chain().focus().toggleItalic().run(),
    isActive: (e) => e.isActive('italic'),
  },
  {
    label: '</>',
    title: 'Código',
    run: (e) => e.chain().focus().toggleCode().run(),
    isActive: (e) => e.isActive('code'),
  },
  {
    label: '🔗',
    title: 'Enlace',
    divider: true,
    run: (e) => {
      const previous = e.getAttributes('link').href ?? '';
      const url = window.prompt('URL del enlace (vacío para quitarlo)', previous);
      if (url === null) return;
      if (!url) return e.chain().focus().unsetLink().run();
      e.chain().focus().setLink({ href: url }).run();
    },
    isActive: (e) => e.isActive('link'),
  },
  {
    label: '❝',
    title: 'Cita',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    isActive: (e) => e.isActive('blockquote'),
  },
  {
    label: '•',
    title: 'Lista',
    run: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive('bulletList'),
  },
  {
    label: '1.',
    title: 'Lista numerada',
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive('orderedList'),
  },
  {
    label: '―',
    title: 'Separador',
    divider: true,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

/** Cambia el src de la imagen que está usando `from` por `to`, sin tocar el resto del documento. */
function swapImageSrc(editor: Editor, from: string, to: string) {
  const { state, view } = editor;
  const transaction = state.tr;
  let found = false;

  state.doc.descendants((node, position) => {
    if (node.type.name === 'image' && node.attrs.src === from) {
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, src: to });
      found = true;
    }
  });

  if (found) view.dispatch(transaction);
  return found;
}

/** Quita la imagen de vista previa cuando la subida falla, para no dejar un roto en el texto. */
function removeImage(editor: Editor, src: string) {
  const { state, view } = editor;
  const transaction = state.tr;
  let offset = 0;

  state.doc.descendants((node, position) => {
    if (node.type.name === 'image' && node.attrs.src === src) {
      transaction.delete(position - offset, position - offset + node.nodeSize);
      offset += node.nodeSize;
    }
  });

  view.dispatch(transaction);
}

export function createRichEditor({ mount, initial, upload, onUpdate, onStatus }: Options): RichEditor {
  mount.replaceChildren();

  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';

  const surface = document.createElement('div');
  surface.className = 'editor-surface';

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/webp,image/png,image/jpeg,image/avif,image/gif';
  picker.hidden = true;

  mount.append(toolbar, surface, picker);

  const editor = new Editor({
    element: surface,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image.configure({ inline: false }),
      Markdown,
    ],
    editorProps: {
      attributes: { class: 'editor-content' },
      handlePaste: (_view, event) => {
        const file = imageFrom(event.clipboardData);
        if (!file) return false;
        event.preventDefault();
        void insert(file);
        return true;
      },
      handleDrop: (_view, event) => {
        const file = imageFrom((event as DragEvent).dataTransfer);
        if (!file) return false;
        event.preventDefault();
        void insert(file);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onUpdate(instance.getMarkdown());
      paint();
    },
    onSelectionUpdate: paint,
  });

  editor.commands.setContent(initial ?? '', { contentType: 'markdown' });

  function imageFrom(source: DataTransfer | null) {
    const files = Array.from(source?.files ?? []);
    return files.find((file) => file.type.startsWith('image/')) ?? null;
  }

  /** Inserta ya, sube después: la vista previa es inmediata. */
  async function insert(file: File) {
    const preview = URL.createObjectURL(file);
    editor.chain().focus().setImage({ src: preview, alt: '' }).run();
    onStatus('Subiendo la imagen…');

    try {
      const url = await upload(file);
      swapImageSrc(editor, preview, url);
      onStatus('Imagen lista.', 'ok');
      onUpdate(editor.getMarkdown());
    } catch (error) {
      removeImage(editor, preview);
      onStatus(error instanceof Error ? error.message : 'No se pudo subir la imagen.', 'error');
    } finally {
      URL.revokeObjectURL(preview);
    }
  }

  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (file) void insert(file);
  });

  function addDivider() {
    const divider = document.createElement('span');
    divider.className = 'divider';
    toolbar.append(divider);
  }

  const buttons = TOOLS.map((tool) => {
    if (tool.divider) addDivider();

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tool.label;
    button.title = tool.title;
    button.addEventListener('click', () => tool.run(editor));
    toolbar.append(button);
    return { button, tool };
  });

  // La imagen va al final y abre el selector de archivos.
  addDivider();
  const imageButton = document.createElement('button');
  imageButton.type = 'button';
  imageButton.textContent = '🖼';
  imageButton.title = 'Insertar imagen (o arrástrala / pégala)';
  imageButton.addEventListener('click', () => picker.click());
  toolbar.append(imageButton);

  /** Marca en la barra lo que está activo donde tienes el cursor. */
  function paint() {
    for (const { button, tool } of buttons) {
      button.classList.toggle('is-active', Boolean(tool.isActive?.(editor)));
    }
  }

  paint();

  return {
    getMarkdown: () => editor.getMarkdown(),
    destroy: () => editor.destroy(),
  };
}
