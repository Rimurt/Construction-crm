import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSuggestions, suggestAddresses } from '../src/addresses.ts';

const feature = (properties = {}, coordinates = [37.61, 55.76]) => ({
  properties: {
    countrycode: 'RU',
    state: 'Москва',
    city: 'Москва',
    street: 'Тверская улица',
    ...properties,
  },
  geometry: { type: 'Point', coordinates },
});

test('различает улицу и дом, нормализует и удаляет дубли', () => {
  const results = parseSuggestions({
    features: [feature(), feature({ housenumber: '12 с9' }), feature({ housenumber: '12 с9' })],
  });
  assert.deepEqual(
    results.map((item) => [item.address, item.hasHouse]),
    [
      ['Москва, Тверская улица', false],
      ['Москва, Тверская улица, д. 12 с9', true],
    ],
  );
});

test('не принимает другой город, страну, координаты и случайный текст без улицы', () => {
  assert.deepEqual(
    parseSuggestions({
      features: [
        feature({ city: 'Тула', state: 'Тульская область' }),
        feature({ countrycode: 'DE' }),
        feature({ countrycode: 77 }),
        feature({}, [30, 60]),
        feature({}, [NaN, 55.7]),
        feature({ street: null, name: 'абракадабра', type: 'other' }),
        null,
      ],
    }),
    [],
  );
});

test('улица из геокодера без номера дома не считается полным адресом', () => {
  const [result] = parseSuggestions({
    features: [feature({ street: undefined, name: 'Арбат', type: 'street' })],
  });
  assert.equal(result.address, 'Москва, Арбат');
  assert.equal(result.hasHouse, false);
});

test('не маскирует неправильный ответ сервиса под успешную проверку', () => {
  assert.throws(() => parseSuggestions({ message: 'bad gateway' }));
  assert.throws(() => parseSuggestions(null));
});

test('короткий ввод не отправляется, запрос ограничивается Москвой, сетевые ошибки не обходят проверку', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url) => {
      calls++;
      assert.equal(url.searchParams.get('countrycode'), 'RU');
      assert.match(url.searchParams.get('q'), /^Москва /);
      assert.deepEqual(url.searchParams.getAll('layer'), ['street', 'house']);
      return new Response(JSON.stringify({ features: [feature({ housenumber: '12' })] }), {
        status: 200,
      });
    };
    assert.deepEqual(await suggestAddresses('Тв', new AbortController().signal), []);
    assert.equal(calls, 0);
    assert.equal(
      (await suggestAddresses('Тверская 12 test', new AbortController().signal))[0].hasHouse,
      true,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(() => suggestAddresses('Другой запрос', new AbortController().signal));
  } finally {
    globalThis.fetch = original;
  }
});
