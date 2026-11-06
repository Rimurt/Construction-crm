# Загрузка CRM на VPS: PuTTY и WinSCP

Домен в готовом пакете: **2b-test.duckdns.org**. Название `2b-test` трактуется
как поддомен DuckDNS; проверьте полное имя в своём аккаунте. Если оно другое,
передайте правильный домен при сборке, как показано ниже.

Сервер отдаёт готовые HTML/CSS/JS через nginx. Авторизация и база остаются
в Supabase. Docker, Python и Node.js для работы этого сайта на VPS не нужны.

## 1. Подготовить сборку на компьютере

В PowerShell из папки `ConstructionCRM`:

```powershell
npm ci
npm run check
npm run build:deploy -- 2b-test.duckdns.org
```

Эта команда обновляет папку `deploy`. Чтобы также заново получить ZIP в PowerShell:

```powershell
$crmFiles = 'site', 'nginx.conf', 'security-headers.conf', 'install-release.sh', 'build-info.json', 'supabase', 'SUPABASE-SETUP.md', 'README.md'
$crmPaths = $crmFiles | ForEach-Object { Join-Path .\deploy $_ }
Compress-Archive -LiteralPath $crmPaths -DestinationPath .\deploy\for-vps.zip -Force
```

После каждой новой сборки переупаковывайте архив этой командой или загружайте
актуальную папку `deploy` через WinSCP. Старый ZIP сам по себе не обновляется.

В `.env.local` до сборки должны быть правильные Project URL и publishable key.
Адрес Supabase — без `/rest/v1/`. Сборка откажется продолжать с пустыми настройками
или секретным ключом. Подробности настройки базы — в `SUPABASE-SETUP.md` пакета.

В папке `deploy` появятся:

| Файл/папка              | Назначение                                            |
| ----------------------- | ----------------------------------------------------- |
| `site/`                 | Готовый сайт, который будет отдавать nginx            |
| `nginx.conf`            | Отдельный хост CRM, первоначально HTTP                |
| `security-headers.conf` | Защитные заголовки с адресом вашего Supabase          |
| `install-release.sh`    | Установка новой версии сайта с сохранением предыдущей |
| `supabase/`             | Копии миграции и seed для ручной настройки Supabase   |
| `build-info.json`       | Домен, время сборки и публичные адреса сервисов       |

Локальные `.env` и тестовые пароли в пакет не копируются. Публичный ключ Supabase
есть внутри JS — это нормально для браузерного клиента. `service_role`, `sb_secret_`
и пароль базы туда попадать не должны.

## 2. Подготовить домен и загрузить пакет

В DuckDNS у `2b-test` установите публичный IPv4 вашего VPS. Проверьте:

```powershell
nslookup 2b-test.duckdns.org
```

Результат должен совпадать с IP VPS. Затем через WinSCP загрузите содержимое
готовой папки `deploy` в отдельную папку `/home/deploy/crm-upload/`.
`site/` должен оказаться непосредственно внутри `crm-upload/`.

Если используете подготовленный `for-vps.zip`, загрузите его в `/home/deploy/`,
а в PuTTY выполните:

```bash
mkdir -p /home/deploy/crm-upload
unzip -o /home/deploy/for-vps.zip -d /home/deploy/crm-upload
cd /home/deploy/crm-upload
```

`unzip` при необходимости: `sudo apt install -y unzip`.

## 3. Установить сайт и nginx-конфиг

В PuTTY под пользователем `deploy`:

```bash
sudo apt update
sudo apt install -y nginx
cd /home/deploy/crm-upload
sudo sh install-release.sh
sudo install -d -m 755 /etc/nginx/snippets
sudo install -m 644 security-headers.conf /etc/nginx/snippets/construction-crm-security.conf
sudo install -m 644 nginx.conf /etc/nginx/sites-available/construction-crm
sudo ln -sfn /etc/nginx/sites-available/construction-crm /etc/nginx/sites-enabled/construction-crm
sudo nginx -t
```

Продолжайте только если `nginx -t` завершился успешно:

```bash
sudo systemctl reload nginx
curl -I -H 'Host: 2b-test.duckdns.org' http://127.0.0.1/
```

Должен вернуться HTTP 200. Внешние 80 и 443 должны быть доступны:

```bash
sudo ufw allow 'Nginx Full'
```

Визитка и Forma используют другие хосты nginx; их конфиги менять не требуется.
Скрипт установки работает только с `/srv/construction-crm` и не обращается к базе.

## 4. Включить HTTPS

Когда DNS указывает на VPS и сайт открывается по HTTP:

```bash
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt install -y certbot python3-certbot-nginx
fi
sudo certbot --nginx -d 2b-test.duckdns.org
```

Если Certbot ранее установлен через Snap, используйте существующий `certbot`.
Не устанавливайте параллельно вторую копию. Следуйте подсказкам Certbot и
включите перенаправление на HTTPS, если он его предлагает. Затем:

```bash
sudo nginx -t
sudo certbot renew --dry-run
curl -I https://2b-test.duckdns.org/
```

В Supabase → Authentication → URL Configuration задайте Site URL:
`https://2b-test.duckdns.org`. Открытую регистрацию и анонимный вход отключите.

## 5. Проверить перед сдачей

- Войти постановщиком и двумя исполнителями через настоящие аккаунты Supabase.
- Постановщик видит все задачи, исполнитель — только свои и связанные объекты.
- Пройти цикл: новая → в работе → на проверке → принята/на доработке.
- Без комментария возврат на доработку запрещён. Комментарий сразу виден в карточке.
- В DevTools проверить отсутствие ошибок CSP и запросов на неправильные URL.
- Прямые запросы с JWT исполнителя не читают чужие задачи и не меняют историю.
- Проверить сайт без VPN и с мобильного интернета.

Если база уже настроена, **не запускайте первоначальную миграцию и seed повторно**.
В этом релизе нет новых изменений схемы: рефакторинг фронтенда не требует сброса БД.
Выполнение миграций — отдельное ручное действие в Supabase, не часть установки сайта.

## 6. Обновления и возврат предыдущей версии

После изменений снова выполните локально `npm run check` и `npm run build:deploy`.
Загрузите новую папку/архив в `crm-upload` и выполните:

```bash
cd /home/deploy/crm-upload
sudo sh install-release.sh
```

Скрипт создаёт новую папку в `/srv/construction-crm/releases/` и атомарно меняет
ссылку `current`. Предыдущие версии сохраняются. Для обычного обновления JS/CSS
перезагрузка nginx не нужна. **Не перезаписывайте nginx.conf после Certbot**:
готовый шаблон первоначально HTTP и заменит добавленные Certbot настройки HTTPS.
Если изменился адрес Supabase/Photon, обновите только security-headers.conf,
проверьте `nginx -t` и перезагрузите nginx.

Чтобы выбрать предыдущую сборку:

```bash
ls -1 /srv/construction-crm/releases/
readlink -f /srv/construction-crm/current
```

Подставьте существующее имя нужной папки вместо `ИМЯ_ПАПКИ_РЕЛИЗА`:

```bash
sudo ln -sfn /srv/construction-crm/releases/ИМЯ_ПАПКИ_РЕЛИЗА /srv/construction-crm/current
```

Старые releases автоматически не удаляются; контролируйте свободное место.
Откат сайта не откатывает изменения данных в Supabase.

## Диагностика

```bash
sudo tail -n 80 /var/log/nginx/error.log
sudo nginx -t
namei -l /srv/construction-crm/current/index.html
```

При 403 проверьте права каталогов, при странице другого сайта — DNS и `server_name`.
При ошибке входа — корневой Project URL, ключ того же проекта, подтверждение
пользователя и его строку в `profiles`. При изменении публичных переменных нужна
новая сборка: редактирование `.env` на VPS уже собранный JS не меняет.
