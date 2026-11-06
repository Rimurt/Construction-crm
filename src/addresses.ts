export type AddressSuggestion = {
  id: string;
  address: string;
  hasHouse: boolean;
};

const cache = new Map<string, AddressSuggestion[]>();
const bounds = [36.8, 55.1, 38.1, 56.1];

/** Не считаем любое совпадение геокодера адресом: нужны Москва, улица и координаты. */
export function parseSuggestions(payload: unknown): AddressSuggestion[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('features' in payload) ||
    !Array.isArray(payload.features)
  ) {
    throw new Error('Сервис адресов вернул некорректный ответ.');
  }
  const addresses = new Map<string, AddressSuggestion>();
  for (const feature of payload.features) {
    if (!feature || typeof feature !== 'object') continue;
    const p = feature.properties;
    const point = feature.geometry?.coordinates;
    if (!p || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
      continue;
    if (
      point[0] < bounds[0] ||
      point[0] > bounds[2] ||
      point[1] < bounds[1] ||
      point[1] > bounds[3]
    )
      continue;
    if (
      typeof p.countrycode !== 'string' ||
      p.countrycode.toUpperCase() !== 'RU' ||
      (p.city !== 'Москва' && p.state !== 'Москва')
    )
      continue;
    const street =
      typeof p.street === 'string'
        ? p.street.trim()
        : p.type === 'street' && typeof p.name === 'string'
          ? p.name.trim()
          : '';
    const house = typeof p.housenumber === 'string' ? p.housenumber.trim() : '';
    if (!street || street.length > 180 || house.length > 50) continue;
    const address = `Москва, ${street}${house ? `, д. ${house}` : ''}`;
    addresses.set(address, { id: address, address, hasHouse: Boolean(house) });
  }
  return [...addresses.values()].slice(0, 8);
}

/** Photon допускает autocomplete; запросы задерживаются в компоненте и кешируются здесь. */
export async function suggestAddresses(
  query: string,
  signal: AbortSignal,
  endpoint = 'https://photon.komoot.io/api/',
): Promise<AddressSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 3) return [];
  const key = clean.toLocaleLowerCase('ru-RU');
  if (cache.has(key)) return cache.get(key)!;
  const url = new URL(endpoint);
  url.searchParams.set('q', /москв/i.test(clean) ? clean : `Москва ${clean}`);
  url.searchParams.set('limit', '12');
  url.searchParams.set('bbox', bounds.join(','));
  url.searchParams.set('countrycode', 'RU');
  url.searchParams.append('layer', 'street');
  url.searchParams.append('layer', 'house');
  // Не задаём lang=ru: публичный Photon не поддерживает этот параметр для русского.
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    headers: { 'Accept-Language': 'ru' },
  });
  if (!response.ok) throw new Error('Не удалось загрузить адреса. Попробуйте ещё раз.');
  const results = parseSuggestions(await response.json());
  if (cache.size >= 30) cache.delete(cache.keys().next().value!);
  cache.set(key, results);
  return results;
}
