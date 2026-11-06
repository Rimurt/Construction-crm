import { useEffect, useId, useRef, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import { suggestAddresses, type AddressSuggestion } from './addresses';

const requiredMessage = 'Выберите московский адрес с номером дома из подсказок.';

export default function AddressInput({
  initialValue = '',
  onValidityChange,
}: {
  initialValue?: string;
  onValidityChange: (valid: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [selected, setSelected] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Старый адрес не мешает менять название существующего объекта. Новый проверяется заново.
  const unchanged = Boolean(initialValue && value === initialValue);
  const valid = selected === value || unchanged;

  useEffect(() => {
    input.current?.setCustomValidity(valid ? '' : requiredMessage);
    onValidityChange(valid);
  }, [valid, onValidityChange]);

  useEffect(() => {
    setSuggestions([]);
    setActive(-1);
    setFailure('');
    setLoading(false);
    if (valid || value.trim().length < 3) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      suggestAddresses(
        value,
        controller.signal,
        import.meta.env.VITE_ADDRESS_SEARCH_URL || undefined,
      )
        .then((results) => {
          if (!controller.signal.aborted) setSuggestions(results);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setFailure('Поиск адресов недоступен. Проверьте соединение и повторите запрос.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, valid, attempt]);

  function choose(item: AddressSuggestion) {
    const next = item.hasHouse ? item.address : `${item.address}, д. `;
    setValue(next);
    setSelected(item.hasHouse ? next : null);
    onValidityChange(item.hasHouse);
    input.current?.setCustomValidity(item.hasHouse ? '' : requiredMessage);
    setOpen(!item.hasHouse);
    setActive(-1);
    input.current?.focus();
  }

  return (
    <div className="address-field">
      <label htmlFor={id}>Адрес в Москве</label>
      <div
        className="address-combobox"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <input
          ref={input}
          id={id}
          name="address"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`${id}-options`}
          aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-hint`}
          required
          maxLength={300}
          autoComplete="off"
          value={value}
          placeholder="Начните вводить улицу и номер дома"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setValue(event.target.value);
            setSelected(null);
            setOpen(true);
            input.current?.setCustomValidity(requiredMessage);
            onValidityChange(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
              event.preventDefault();
              setOpen(true);
              setActive((previous) =>
                event.key === 'ArrowDown'
                  ? (previous + 1) % suggestions.length
                  : previous <= 0
                    ? suggestions.length - 1
                    : previous - 1,
              );
            }
            if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) {
              event.preventDefault();
              choose(suggestions[active]);
            }
          }}
        />
        {open && suggestions.length > 0 && (
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label="Подсказки адресов Москвы"
            className="address-suggestions"
          >
            {suggestions.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${id}-option-${index}`}
                  tabIndex={-1}
                  aria-selected={active === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                >
                  <MapPin size={16} />
                  <span>
                    {item.address}
                    <small>{item.hasHouse ? 'Выбрать адрес' : 'Укажите номер дома'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p
        id={`${id}-hint`}
        className={`address-hint ${valid ? 'confirmed' : ''}`}
        aria-live="polite"
      >
        {selected === value ? (
          <>
            <Check size={14} />
            Адрес выбран из подсказок.
          </>
        ) : unchanged ? (
          'Текущий адрес сохранён. Для изменения выберите новый из подсказок.'
        ) : loading ? (
          'Ищем адреса Москвы…'
        ) : (
          failure ||
          (value.trim().length >= 3 && !suggestions.length
            ? 'Адрес не найден. Уточните название улицы и номер дома.'
            : 'Выберите улицу и дом из подсказок, чтобы подтвердить адрес.')
        )}
      </p>
      {failure && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setOpen(true);
            setAttempt((value) => value + 1);
          }}
        >
          Повторить поиск
        </button>
      )}
      <p className="address-attribution">
        Поиск отправляет введённый адрес в{' '}
        <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">
          Photon
        </a>
        . Данные ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
        .
      </p>
    </div>
  );
}
