/** Собирает пакет для VPS, предварительно проверяя публичные настройки. */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deploy = join(root, 'deploy');
const env = loadEnv('production', root, 'VITE_');
const domain = process.argv[2] || '2b-test.duckdns.org';
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
  throw new Error('Передайте домен без https://, пути и порта.');
}

function publicUrl(value, label, rootOnly = false) {
  if (!value?.trim()) throw new Error(`${label} не задан. Заполните .env.local перед сборкой.`);
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (rootOnly && url.pathname !== '/')
  ) {
    throw new Error(
      `${label}: требуется HTTPS-адрес${rootOnly ? ' без /rest/v1/ и других путей' : ''}.`,
    );
  }
  return url;
}

const projectUrl = publicUrl(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL', true);
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!key?.startsWith('sb_publishable_'))
  throw new Error(
    'Для деплоя нужен публичный sb_publishable_ ключ, а не деморежим или секретный ключ.',
  );
const addressUrl = publicUrl(
  env.VITE_ADDRESS_SEARCH_URL || 'https://photon.komoot.io/api/',
  'VITE_ADDRESS_SEARCH_URL',
);

// Сборка и проверка используют одни значения. VITE-переменные попадут в браузер.
process.env.VITE_SUPABASE_URL = projectUrl.origin;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
process.env.VITE_ADDRESS_SEARCH_URL = addressUrl.href;
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], {
  cwd: root,
  stdio: 'inherit',
});
await build({ root, mode: 'production' });

if (existsSync(deploy) && lstatSync(deploy).isSymbolicLink()) {
  throw new Error('Папка deploy не должна быть символической ссылкой.');
}
mkdirSync(deploy, { recursive: true });
const site = join(deploy, 'site');
// Очищается только известная папка результата, никогда не исходники или весь deploy.
if (
  resolve(site) !== join(root, 'deploy', 'site') ||
  (existsSync(site) && lstatSync(site).isSymbolicLink())
) {
  throw new Error('Небезопасный путь результата сборки.');
}
rmSync(site, { recursive: true, force: true });
cpSync(join(root, 'dist'), site, { recursive: true });

const replacements = {
  __CRM_DOMAIN__: domain,
  __SUPABASE_ORIGIN__: projectUrl.origin,
  __ADDRESS_ORIGIN__: addressUrl.origin,
};
for (const name of ['nginx.conf', 'security-headers.conf']) {
  let template = readFileSync(join(deploy, `${name}.template`), 'utf8');
  for (const [placeholder, value] of Object.entries(replacements))
    template = template.replaceAll(placeholder, value);
  writeFileSync(join(deploy, name), template, 'utf8');
}
// Копируем только SQL: служебные папки Supabase CLI могут содержать локальные настройки.
const database = join(deploy, 'supabase');
if (
  resolve(database) !== join(root, 'deploy', 'supabase') ||
  (existsSync(database) && lstatSync(database).isSymbolicLink())
) {
  throw new Error('Небезопасный путь копии SQL.');
}
rmSync(database, { recursive: true, force: true });
mkdirSync(join(database, 'migrations'), { recursive: true });
for (const file of readdirSync(join(root, 'supabase/migrations'), { withFileTypes: true })) {
  if (file.isFile() && file.name.endsWith('.sql'))
    cpSync(join(root, 'supabase/migrations', file.name), join(database, 'migrations', file.name));
}
cpSync(join(root, 'supabase/seed.sql'), join(database, 'seed.sql'));
cpSync(join(root, 'docs/SUPABASE-SETUP.md'), join(deploy, 'SUPABASE-SETUP.md'));
writeFileSync(
  join(deploy, 'build-info.json'),
  JSON.stringify(
    {
      domain,
      built_at: new Date().toISOString(),
      supabase_origin: projectUrl.origin,
      address_origin: addressUrl.origin,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Готово: deploy/site и nginx для ${domain}. Локальные .env и пароли в пакет не копируются.`,
);
