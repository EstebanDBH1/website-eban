import { countWords, readingTime } from '@/lib/reading-time';
import { IMAGE_BUCKET, supabase, type Row } from '@/lib/supabase';
import { createRichEditor, type RichEditor } from '@/scripts/editor';

/**
 * Panel de administración (/admin): entrar, crear, editar, ordenar y borrar
 * proyectos y posts, con editor de texto enriquecido y subida de imágenes.
 *
 * Esta página no monta el <ClientRouter />, así que aquí sí arrancamos al cargar el módulo
 * y no dentro de 'astro:page-load': no hay navegación de cliente que reemplace el DOM.
 *
 * La seguridad no está aquí sino en RLS: aunque alguien abra este panel, sin estar en
 * admin_emails la base rechaza toda escritura. La comprobación is_admin() del inicio solo
 * sirve para dar un mensaje claro en vez de fallos silenciosos.
 */

type FieldType = 'text' | 'number' | 'textarea' | 'checkbox' | 'image' | 'richtext' | 'publish';

interface Field {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  required?: boolean;
  rows?: number;
}

interface Resource {
  table: 'projects' | 'posts';
  singular: string;
  /** Columna con el título visible en la lista; de ella se genera el slug. */
  titleField: string;
  /** Segunda línea de cada fila de la lista. */
  subtitleField: string;
  /** Mostrar el tiempo de lectura bajo el editor (solo tiene sentido en posts). */
  showReadingTime: boolean;
  fields: Field[];
}

const SLUG_HINT = 'Solo minúsculas, números y guiones.';

const RESOURCES: Record<'projects' | 'posts', Resource> = {
  projects: {
    table: 'projects',
    singular: 'proyecto',
    titleField: 'name',
    subtitleField: 'description',
    showReadingTime: false,
    fields: [
      {
        name: 'draft',
        label: 'Estado',
        type: 'publish',
        hint: 'Un borrador se guarda pero no aparece en el sitio.',
      },
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'text', required: true, hint: SLUG_HINT },
      {
        name: 'description',
        label: 'Descripción',
        type: 'textarea',
        rows: 2,
        required: true,
        hint: 'La línea que se lee debajo del nombre en la portada.',
      },
      { name: 'year', label: 'Año', type: 'number', required: true },
      {
        name: 'stack',
        label: 'Stack',
        type: 'text',
        required: true,
        hint: 'Ej. Next.js · Ollama · SQLite',
      },
      { name: 'status', label: 'Estado', type: 'text', required: true, hint: 'Ej. En uso diario' },
      { name: 'role', label: 'Rol', type: 'text', required: true },
      {
        name: 'href',
        label: 'Enlace',
        type: 'text',
        hint: 'El botón «Ver el proyecto». Déjalo en # si todavía no hay.',
      },
      { name: 'image_url', label: 'Captura', type: 'image', hint: 'Máx. 5 MB.' },
      { name: 'body', label: 'Texto del modal', type: 'richtext' },
      { name: 'sort_order', label: 'Orden', type: 'number', hint: 'Menor = más arriba.' },
    ],
  },
  posts: {
    table: 'posts',
    singular: 'post',
    titleField: 'title',
    subtitleField: 'excerpt',
    showReadingTime: true,
    fields: [
      {
        name: 'draft',
        label: 'Estado',
        type: 'publish',
        hint: 'Un borrador se guarda pero no aparece en el sitio.',
      },
      { name: 'title', label: 'Título', type: 'text', required: true },
      {
        name: 'slug',
        label: 'Slug',
        type: 'text',
        required: true,
        hint: `La URL: /posts/<slug>/ · ${SLUG_HINT}`,
      },
      {
        name: 'excerpt',
        label: 'Resumen',
        type: 'textarea',
        rows: 2,
        required: true,
        hint: 'Se usa en la portada y como meta description.',
      },
      { name: 'year', label: 'Año', type: 'number', required: true },
      {
        name: 'image_url',
        label: 'Portada',
        type: 'image',
        hint: 'Se ve bajo el título, antes del texto. Máx. 5 MB. Opcional.',
      },
      { name: 'body', label: 'Post', type: 'richtext' },
      { name: 'sort_order', label: 'Orden', type: 'number', hint: 'Menor = más arriba.' },
    ],
  },
};

/* ── Utilidades ─────────────────────────────────────────────────────────── */

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const auth = $('#auth');
const app = $('#app');
const list = $<HTMLUListElement>('#list');
const editor = $<HTMLDialogElement>('#editor');
const editorForm = $<HTMLFormElement>('#editor-form');
const editorFields = $('#editor-fields');
const status = $('#status');

let current: Resource = RESOURCES.projects;
let rows: Row[] = [];
/** Fila en edición; null cuando estamos creando una nueva. */
let editing: Row | null = null;
/** El editor rico del formulario abierto. Hay que destruirlo al cerrar. */
let body: RichEditor | null = null;

function setStatus(message: string, kind: 'info' | 'error' | 'ok' = 'info') {
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = !message;
}

/** Los errores de Postgres llegan con jerga; traducimos los que se ven a diario. */
function explain(error: { message: string; code?: string }) {
  const { message, code } = error;
  if (code === '23505') return 'Ya existe otro con ese slug. Cámbialo.';
  if (message.includes('slug_format')) return `Slug inválido. ${SLUG_HINT}`;
  if (message.includes('year_range')) return 'El año tiene que estar entre 2000 y 2100.';
  if (message.includes('not_blank')) return 'Falta rellenar un campo obligatorio.';
  if (message.includes('image_url_format')) return 'La URL de la imagen debe empezar por https://';
  if (message.includes('row-level security')) return 'Tu cuenta no tiene permiso de edición.';
  if (message.includes('exceeded the maximum allowed size')) return 'La imagen pesa más de 5 MB.';
  return message;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita las tildes: "Añoración" → "anoracion"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Lee una columna cualquiera de una fila sin pelear con la unión Post | Project. */
const field = (row: Row, name: string) => (row as unknown as Record<string, unknown>)[name];

/** Sube a Storage y devuelve la URL pública. Lo usan el dropzone y el editor. */
async function uploadImage(file: File) {
  const slug = slugify($<HTMLInputElement>('#f-slug')?.value ?? '') || 'sin-slug';
  const extension = file.name.split('.').pop()?.toLowerCase() || 'webp';
  const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { cacheControl: '31536000' });

  if (error) throw new Error(explain(error));
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ── Sesión ─────────────────────────────────────────────────────────────── */

async function showApp(email: string) {
  $('#who').textContent = email;
  auth.hidden = true;
  app.hidden = false;

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    setStatus(
      `La cuenta ${email} no está en la lista de administradores: la base va a rechazar los cambios.`,
      'error',
    );
    return;
  }
  await load();
}

function showLogin() {
  app.hidden = true;
  auth.hidden = false;
}

/* ── Lista ──────────────────────────────────────────────────────────────── */

async function load() {
  setStatus('Cargando…');
  const { data, error } = await supabase
    .from(current.table)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('year', { ascending: false });

  if (error) return setStatus(explain(error), 'error');

  rows = (data ?? []) as Row[];
  setStatus('');
  render();
}

function render() {
  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = `Todavía no hay ningún ${current.singular}. Crea el primero con el botón de arriba.`;
    list.append(empty);
    return;
  }

  rows.forEach((row, index) => {
    const item = document.createElement('li');
    item.innerHTML = [
      '<div class="order">',
      `<button type="button" data-move="-1" aria-label="Subir"${index === 0 ? ' disabled' : ''}>↑</button>`,
      `<button type="button" data-move="1" aria-label="Bajar"${index === rows.length - 1 ? ' disabled' : ''}>↓</button>`,
      '</div>',
      '<div class="info"><span class="name"></span><span class="sub"></span></div>',
      `<span class="badge" data-draft="${row.draft}">${row.draft ? 'Borrador' : 'Publicado'}</span>`,
      '<div class="actions">',
      '<button type="button" data-edit>Editar</button>',
      '<button type="button" data-delete class="danger" aria-label="Borrar">✕</button>',
      '</div>',
    ].join('');

    // textContent y no innerHTML: título y resumen son texto que escribe el usuario.
    item.querySelector('.name')!.textContent = String(field(row, current.titleField) ?? '');
    item.querySelector('.sub')!.textContent = String(field(row, current.subtitleField) ?? '');

    item.querySelector('[data-edit]')!.addEventListener('click', () => openEditorSafely(row));
    item.querySelector('[data-delete]')!.addEventListener('click', () => remove(row));
    item.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      button.addEventListener('click', () => move(index, Number(button.dataset.move)));
    });

    list.append(item);
  });
}

/** Intercambia el sort_order con el vecino: dos updates, sin renumerar toda la lista. */
async function move(index: number, direction: number) {
  const a = rows[index];
  const b = rows[index + direction];
  if (!a || !b) return;

  setStatus('Reordenando…');
  const results = await Promise.all([
    supabase.from(current.table).update({ sort_order: b.sort_order }).eq('id', a.id),
    supabase.from(current.table).update({ sort_order: a.sort_order }).eq('id', b.id),
  ]);

  const failed = results.find((result) => result.error);
  if (failed?.error) return setStatus(explain(failed.error), 'error');
  await load();
}

async function remove(row: Row) {
  const label = String(field(row, current.titleField) ?? '');
  if (!confirm(`¿Borrar «${label}»? Esto no se puede deshacer.`)) return;

  setStatus('Borrando…');
  const { error } = await supabase.from(current.table).delete().eq('id', row.id);
  if (error) return setStatus(explain(error), 'error');

  // Si la captura vivía en nuestro bucket, se va con la fila.
  const url = field(row, 'image_url');
  const path = typeof url === 'string' ? url.split(`/${IMAGE_BUCKET}/`)[1] : undefined;
  if (path) await supabase.storage.from(IMAGE_BUCKET).remove([decodeURIComponent(path)]);

  setStatus(`«${label}» borrado.`, 'ok');
  await load();
}

/* ── Campos ─────────────────────────────────────────────────────────────── */

function buildField(spec: Field, value: unknown) {
  const wrapper = document.createElement('div');
  wrapper.className = `field field-${spec.type}`;

  const id = `f-${spec.name}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = spec.label;

  // Publicado / Borrador: dos radios de verdad (accesibles) pintados como un selector.
  // Va arriba del formulario a propósito — es la decisión que más se olvida.
  if (spec.type === 'publish') {
    const group = document.createElement('div');
    group.className = 'segmented';

    for (const option of [
      { id: 'f-draft-live', value: 'false', text: 'Publicado' },
      { id: 'f-draft-draft', value: 'true', text: 'Borrador' },
    ]) {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'publish-state';
      radio.id = option.id;
      radio.value = option.value;
      radio.checked = String(Boolean(value)) === option.value;

      const caption = document.createElement('label');
      caption.htmlFor = option.id;
      caption.textContent = option.text;

      group.append(radio, caption);
    }

    wrapper.append(label, group);

    if (spec.hint) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = spec.hint;
      wrapper.append(hint);
    }
    return wrapper;
  }

  // El editor rico no es un control de formulario: guarda su Markdown en un campo oculto
  // y se monta encima (ver openEditor).
  if (spec.type === 'richtext') {
    const store = document.createElement('input');
    store.type = 'hidden';
    store.id = id;
    store.name = spec.name;
    store.value = String(value ?? '');

    const mount = document.createElement('div');
    mount.className = 'editor-shell';
    mount.id = `${id}-mount`;

    const meter = document.createElement('p');
    meter.className = 'meter';
    meter.id = `${id}-meter`;

    wrapper.append(label, store, mount, meter);
    return wrapper;
  }

  let input: HTMLInputElement | HTMLTextAreaElement;

  if (spec.type === 'textarea') {
    const area = document.createElement('textarea');
    area.rows = spec.rows ?? 4;
    area.value = String(value ?? '');
    input = area;
  } else {
    const control = document.createElement('input');
    if (spec.type === 'image') {
      control.type = 'hidden';
      control.value = String(value ?? '');
    } else if (spec.type === 'checkbox') {
      control.type = 'checkbox';
      control.checked = Boolean(value);
    } else {
      control.type = spec.type === 'number' ? 'number' : 'text';
      control.value = value == null ? '' : String(value);
    }
    input = control;
  }

  input.id = id;
  input.name = spec.name;
  if (spec.required && spec.type !== 'checkbox') input.required = true;

  if (spec.type === 'checkbox') {
    wrapper.classList.add('inline');
    wrapper.append(input, label);
  } else {
    wrapper.append(label, input);
  }

  if (spec.type === 'image') wrapper.append(buildDropzone(input as HTMLInputElement));

  if (spec.hint) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = spec.hint;
    wrapper.append(hint);
  }

  return wrapper;
}

/**
 * Zona de arrastre para la captura del proyecto.
 *
 * La vista previa sale al instante desde el archivo local (blob:) y la subida va por detrás;
 * cuando termina se cambia por la URL de Storage. Nunca ves un hueco esperando a la red.
 */
function buildDropzone(store: HTMLInputElement) {
  const zone = document.createElement('div');
  zone.className = 'dropzone';
  zone.tabIndex = 0;
  zone.setAttribute('role', 'button');
  zone.setAttribute('aria-label', 'Subir una captura');

  const preview = document.createElement('img');
  preview.className = 'dropzone-preview';
  preview.alt = '';

  const placeholder = document.createElement('div');
  placeholder.className = 'dropzone-empty';
  placeholder.innerHTML = '<strong>Arrastra una imagen</strong><span>o haz clic para elegirla</span>';

  const busy = document.createElement('div');
  busy.className = 'dropzone-busy';
  busy.textContent = 'Subiendo…';
  busy.hidden = true;

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/webp,image/png,image/jpeg,image/avif,image/gif';
  picker.hidden = true;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'link';
  clear.textContent = 'Quitar imagen';

  const paint = () => {
    const has = Boolean(preview.getAttribute('src'));
    preview.hidden = !has;
    placeholder.hidden = has;
    clear.hidden = !has;
    zone.classList.toggle('has-image', has);
  };

  if (store.value) preview.src = store.value;
  paint();

  async function take(file: File | undefined) {
    if (!file?.type.startsWith('image/')) return;

    const local = URL.createObjectURL(file);
    preview.src = local;
    busy.hidden = false;
    paint();

    try {
      const url = await uploadImage(file);
      store.value = url;
      preview.src = url;
      setStatus('Captura subida. Acuérdate de guardar.', 'ok');
    } catch (error) {
      preview.removeAttribute('src');
      store.value = '';
      setStatus(error instanceof Error ? error.message : 'No se pudo subir la imagen.', 'error');
    } finally {
      URL.revokeObjectURL(local);
      busy.hidden = true;
      paint();
    }
  }

  zone.addEventListener('click', () => picker.click());
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      picker.click();
    }
  });

  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-over');
    void take(event.dataTransfer?.files[0]);
  });

  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    void take(file);
  });

  clear.addEventListener('click', () => {
    store.value = '';
    preview.removeAttribute('src');
    paint();
  });

  zone.append(preview, placeholder, busy);

  const box = document.createElement('div');
  box.className = 'dropzone-box';
  box.append(zone, picker, clear);
  return box;
}

/* ── Editor ─────────────────────────────────────────────────────────────── */

/** Valores de partida de una fila nueva. */
function initialValue(name: string) {
  if (name === 'year') return new Date().getFullYear();
  if (name === 'sort_order') return rows.length + 1;
  if (name === 'href') return '#';
  if (name === 'draft') return false; // escribir es publicar; el borrador se marca aparte
  return '';
}

function openEditor(row: Row | null) {
  editing = row;
  $('#editor-title').textContent = row
    ? `Editar ${current.singular}`
    : `Nuevo ${current.singular}`;

  body?.destroy();
  body = null;

  editorFields.replaceChildren(
    ...current.fields.map((spec) =>
      buildField(spec, row ? field(row, spec.name) : initialValue(spec.name)),
    ),
  );

  // El editor se monta cuando sus nodos ya están en el documento.
  const mount = document.querySelector<HTMLElement>('#f-body-mount');
  const meter = document.querySelector<HTMLElement>('#f-body-meter');
  if (mount) {
    const paintMeter = (markdown: string) => {
      if (!meter) return;
      const words = countWords(markdown);
      meter.textContent = current.showReadingTime
        ? `${words} palabras · ${readingTime(markdown)} de lectura`
        : `${words} palabras`;
    };

    const initial = $<HTMLInputElement>('#f-body').value;
    body = createRichEditor({
      mount,
      initial,
      upload: uploadImage,
      onUpdate: paintMeter,
      onStatus: setStatus,
    });
    paintMeter(initial);
  }

  // El slug se genera solo desde el título, mientras no lo toques a mano y sea nuevo.
  const title = $<HTMLInputElement>(`#f-${current.titleField}`);
  const slug = $<HTMLInputElement>('#f-slug');
  let slugTouched = Boolean(row);
  slug.addEventListener('input', () => (slugTouched = true));
  title.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(title.value);
  });

  editor.showModal();
  title.focus();
}

/** Cerrar siempre por aquí: el listener de 'close' es el único que suelta el editor rico. */
function closeEditor() {
  editor.close();
}

async function save(event: SubmitEvent) {
  event.preventDefault();

  const payload: Record<string, unknown> = {};
  for (const spec of current.fields) {
    if (spec.type === 'publish') {
      payload[spec.name] =
        document.querySelector<HTMLInputElement>('input[name="publish-state"]:checked')?.value === 'true';
      continue;
    }
    const input = $<HTMLInputElement>(`#f-${spec.name}`);
    if (spec.type === 'richtext') payload[spec.name] = body?.getMarkdown() ?? input.value;
    else if (spec.type === 'checkbox') payload[spec.name] = input.checked;
    else if (spec.type === 'number') payload[spec.name] = Number(input.value);
    else if (spec.type === 'image') payload[spec.name] = input.value || null;
    else payload[spec.name] = input.value.trim();
  }
  payload.slug = slugify(String(payload.slug));

  setStatus('Guardando…');
  const { error } = editing
    ? await supabase.from(current.table).update(payload).eq('id', editing.id)
    : await supabase.from(current.table).insert(payload);

  if (error) return setStatus(explain(error), 'error');

  closeEditor();
  setStatus(
    payload.draft
      ? 'Guardado como borrador — no aparecerá en el sitio.'
      : 'Guardado y publicado. Ya se ve en el sitio.',
    'ok',
  );
  await load();
}

/* ── Arranque ───────────────────────────────────────────────────────────── */

// Solo iniciar sesión: el usuario se crea desde el dashboard de Supabase, no desde aquí.
$<HTMLFormElement>('#login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const box = $('#auth-error');

  const { error } = await supabase.auth.signInWithPassword({
    email: $<HTMLInputElement>('#email').value.trim(),
    password: $<HTMLInputElement>('#password').value,
  });

  if (error) {
    box.textContent =
      error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : error.message;
    box.hidden = false;
    return;
  }
  box.hidden = true;
});

$('#logout').addEventListener('click', () => supabase.auth.signOut());

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('[data-tab]').forEach((other) => other.removeAttribute('aria-current'));
    tab.setAttribute('aria-current', 'true');
    current = RESOURCES[tab.dataset.tab as 'projects' | 'posts'];
    $('#new').textContent = `+ Nuevo ${current.singular}`;
    await load();
  });
});

$('#new').addEventListener('click', () => openEditorSafely(null));

/**
 * Si abrir el formulario falla, el diálogo se queda cerrado y parece que el botón «no hace
 * nada». Mejor decirlo: cualquier error al montarlo sale en la barra de estado.
 */
function openEditorSafely(row: Row | null) {
  try {
    openEditor(row);
  } catch (error) {
    setStatus(
      `No se pudo abrir el formulario: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
    editor.close();
  }
}
editorForm.addEventListener('submit', save);
document
  .querySelectorAll('[data-editor-close]')
  .forEach((button) => button.addEventListener('click', closeEditor));
// Esc cierra el <dialog> por su cuenta; hay que soltar el editor igualmente.
editor.addEventListener('close', () => {
  body?.destroy();
  body = null;
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.email) void showApp(session.user.email);
  else showLogin();
});
