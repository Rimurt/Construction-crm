#!/usr/bin/env sh
# Выкладывает только статические файлы CRM. База и nginx-конфиги здесь не меняются.
set -eu
if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Запустите через sudo: sudo sh install-release.sh' >&2
  exit 1
fi

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
test -s "$package_dir/site/index.html"
test -d "$package_dir/site/assets"
root_dir=/srv/construction-crm
install -d -m 755 "$root_dir" "$root_dir/releases"
if [ -e "$root_dir/current" ] && [ ! -L "$root_dir/current" ]; then
  printf '%s\n' 'current должен быть ссылкой. Существующий каталог сохранён.' >&2
  exit 1
fi

release_dir=$(mktemp -d "$root_dir/releases/release-$(date +%Y%m%d-%H%M%S)-XXXXXX")
cp -R "$package_dir/site/." "$release_dir/"
find "$release_dir" -type d -exec chmod 755 {} \;
find "$release_dir" -type f -exec chmod 644 {} \;

# Смена ссылки атомарна: nginx видит либо предыдущую, либо новую полную сборку.
next_link="$root_dir/.current-next-$$"
trap 'rm -f -- "$next_link"' EXIT
ln -s "$release_dir" "$next_link"
mv -Tf -- "$next_link" "$root_dir/current"
printf 'Опубликована сборка: %s\n' "$release_dir"
printf '%s\n' 'Предыдущие releases сохранены для отката.'
