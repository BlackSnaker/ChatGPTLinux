#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_exec="${1:-}"

if [[ -z "$app_exec" ]]; then
  if [[ -x "$root_dir/dist/linux-unpacked/chatgpt-linux" ]]; then
    app_exec="$root_dir/dist/linux-unpacked/chatgpt-linux"
  else
    printf 'Usage: %s /absolute/path/to/chatgpt-linux-or-AppImage\n' "$0" >&2
    exit 2
  fi
fi

if [[ "$app_exec" != /* ]]; then
  printf 'Expected an absolute executable path, got: %s\n' "$app_exec" >&2
  exit 2
fi

if [[ ! -x "$app_exec" ]]; then
  printf 'Executable not found or not executable: %s\n' "$app_exec" >&2
  exit 2
fi

apps_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
icons_dir="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/1024x1024/apps"
desktop_dir="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop\n' "$HOME")"
icon_path="$icons_dir/chatgpt-linux.png"

mkdir -p "$apps_dir" "$icons_dir" "$desktop_dir"
cp "$root_dir/assets/icon.png" "$icon_path"

cat > "$apps_dir/chatgpt-linux.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ChatGPT
Comment=Unofficial ChatGPT Electron wrapper
Exec=$app_exec
Path=$(dirname "$app_exec")
Icon=$icon_path
Terminal=false
Categories=Network;
StartupWMClass=chatgpt-linux
EOF

cat > "$apps_dir/chatgpt-widget.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ChatGPT Widget
Comment=Floating ChatGPT widget
Exec=$app_exec --widget
Path=$(dirname "$app_exec")
Icon=$icon_path
Terminal=false
Categories=Network;
StartupWMClass=chatgpt-linux
EOF

cp "$apps_dir/chatgpt-linux.desktop" "$desktop_dir/ChatGPT.desktop"
cp "$apps_dir/chatgpt-widget.desktop" "$desktop_dir/ChatGPT Widget.desktop"
chmod +x "$apps_dir/chatgpt-linux.desktop" "$apps_dir/chatgpt-widget.desktop" \
  "$desktop_dir/ChatGPT.desktop" "$desktop_dir/ChatGPT Widget.desktop"

gio set "$desktop_dir/ChatGPT.desktop" metadata::trusted true 2>/dev/null || true
gio set "$desktop_dir/ChatGPT Widget.desktop" metadata::trusted true 2>/dev/null || true

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$apps_dir/chatgpt-linux.desktop"
  desktop-file-validate "$apps_dir/chatgpt-widget.desktop"
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$apps_dir" >/dev/null 2>&1 || true
fi

printf 'Installed desktop launchers for %s\n' "$app_exec"
