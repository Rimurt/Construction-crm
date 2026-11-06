import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const baseEnv = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_config_test',
  VITE_ADDRESS_SEARCH_URL: 'https://photon.komoot.io/api/',
};

function refused(env, domain) {
  const result = spawnSync(process.execPath, ['scripts/build-deploy.mjs', domain], {
    env: { ...baseEnv, ...env },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.notEqual(result.status, 0);
  return result.stderr;
}

test('деплой отклоняет REST URL до начала сборки', () => {
  assert.match(
    refused({ VITE_SUPABASE_URL: 'https://example.supabase.co/rest/v1/' }, 'crm.example.com'),
    /без \/rest\/v1\//,
  );
});

test('деплой не принимает и не печатает серверный ключ', () => {
  const secret = 'sb_secret_never_print_this';
  const output = refused({ VITE_SUPABASE_PUBLISHABLE_KEY: secret }, 'crm.example.com');
  assert.match(output, /публичный sb_publishable_/);
  assert.ok(!output.includes(secret));
});

test('домен не может содержать URL или nginx-директивы', () => {
  assert.match(refused({}, 'https://crm.example.com/path'), /домен без https/);
});
