import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Нативный dialog удерживает фокус, закрывается по Escape и возвращает фокус на кнопку. */
export default function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={wide ? 'dialog task-dialog' : 'dialog'}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-header">
        <span>{title}</span>
        <button className="icon-button" aria-label="Закрыть окно" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
