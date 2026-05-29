# ChatGPT Linux

Unofficial Electron wrapper for `https://chatgpt.com` on Linux.

This project packages the ChatGPT web app as a Linux desktop application. It
keeps its own Electron profile, supports a compact widget mode, and can import
an existing Firefox ChatGPT/OpenAI session so Google login can be completed in a
regular browser first.

> This project is not affiliated with OpenAI. ChatGPT and OpenAI are trademarks
> of OpenAI. The app icon in this repository is intentionally generic.

## Features

- Full-size Electron window for `https://chatgpt.com`.
- Compact `--widget` mode: a real ChatGPT web window pinned above other windows.
- Persistent app session under the user config directory.
- Firefox cookie import for `chatgpt.com`, `openai.com`, and `auth0.com`.
- Linux desktop integration script for app and widget launchers.

## Requirements

- Linux x86_64.
- Node.js 22+ for development/builds.
- `sqlite3` is optional and only needed for Firefox session import.
- Firefox is optional and only needed if you want session import.

## Development

```bash
npm ci
npm run check
npm start
```

Start the compact widget:

```bash
npm run start:widget
```

Build local artifacts:

```bash
npm run pack
npm run dist:linux
```

## Install Desktop Launchers

After building `dist/linux-unpacked`, install menu and desktop launchers:

```bash
npm run install:desktop
```

For an AppImage release, pass the absolute AppImage path:

```bash
bash scripts/install-desktop.sh /absolute/path/to/ChatGPT-Linux.AppImage
```

## Firefox Session Import

Google can block OAuth inside Electron because Electron is treated as an
embedded browser. The recommended flow is:

1. Sign in to `https://chatgpt.com` in Firefox.
2. Start this Electron app.
3. The app automatically imports non-expired ChatGPT/OpenAI/Auth0 cookies from Firefox into
   the Electron profile.

Cookie values are not printed. A temporary copy of `cookies.sqlite` is deleted
after import.

To force a specific Firefox profile:

```bash
CHATGPT_FIREFOX_PROFILE=/absolute/path/to/profile npm start
```

To disable Firefox import:

```bash
CHATGPT_DISABLE_FIREFOX_IMPORT=1 npm start
```

## Release

GitHub Actions builds Linux artifacts on pushes, pull requests, and version
tags. To publish a GitHub release:

```bash
git tag v1.0.0
git push origin main --tags
```

The release workflow uploads AppImage and `linux-unpacked.tar.gz` artifacts for
tag builds.

Before publishing, replace the placeholder `OWNER` in `package.json` with the
actual GitHub account or organization.
