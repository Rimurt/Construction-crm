import { Check } from 'lucide-react';
import type { FormEvent } from 'react';
import Dialog from './Dialog';
import AddressInput from '../AddressInput';
import type { Profile, Site, Task } from '../types';

export type Editor = { kind: 'site'; value?: Site } | { kind: 'task'; value?: Task };
type Props = {
  editor: Editor;
  siteId: string | null;
  sites: Site[];
  profiles: Profile[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddressValidityChange: (valid: boolean) => void;
};

export default function EditorDialog({
  editor,
  siteId,
  sites,
  profiles,
  busy,
  error,
  onClose,
  onSave,
  onAddressValidityChange,
}: Props) {
  return (
    <Dialog
      title={
        editor.kind === 'site'
          ? editor.value
            ? 'Изменить объект'
            : 'Новый объект'
          : editor.value
            ? 'Изменить задачу'
            : 'Новая задача'
      }
      close={onClose}
    >
      <form
        className="editor-form"
        onSubmit={(event) => {
          void onSave(event);
        }}
      >
        {editor.kind === 'site' ? (
          <>
            <label>
              Название
              <input
                name="name"
                required
                maxLength={150}
                defaultValue={editor.value?.name}
                placeholder="Например, ЖК «Сосновый парк»"
              />
            </label>
            <AddressInput
              initialValue={editor.value?.address}
              onValidityChange={onAddressValidityChange}
            />
          </>
        ) : (
          <>
            <label>
              Название задачи
              <input name="title" required maxLength={200} defaultValue={editor.value?.title} />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                rows={4}
                maxLength={5000}
                defaultValue={editor.value?.description}
              />
            </label>
            <label>
              Объект
              <select
                name="site_id"
                required
                defaultValue={editor.value?.site_id ?? siteId ?? sites[0]?.id}
              >
                <option value="" disabled>
                  Выберите объект
                </option>
                {sites.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Исполнитель
              <select name="assignee_id" required defaultValue={editor.value?.assignee_id ?? ''}>
                <option value="" disabled>
                  Выберите исполнителя
                </option>
                {profiles
                  .filter((profile) => profile.role === 'executor')
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
