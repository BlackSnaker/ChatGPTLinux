const { app, BrowserWindow, Menu, nativeImage, session, shell } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHATGPT_URL = "https://chatgpt.com/";
const PARTITION = "persist:chatgpt-linux";
const isWidgetLaunch = process.argv.includes("--widget");
let chatWindow = null;
let widgetWindow = null;
let chatSession = null;

app.setName("ChatGPT");
app.setPath("userData", path.join(app.getPath("appData"), "ChatGPTLinux"));
if (process.platform === "linux") {
  app.setDesktopName(isWidgetLaunch ? "chatgpt-widget.desktop" : "chatgpt-linux.desktop");
}
app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function browserUserAgent() {
  const chromeVersion = process.versions.chrome || "125.0.0.0";
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

function isAllowedInApp(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") {
      return false;
    }

    return (
      hostname === "chatgpt.com" ||
      hostname.endsWith(".chatgpt.com") ||
      hostname === "openai.com" ||
      hostname.endsWith(".openai.com") ||
      hostname === "auth0.com" ||
      hostname.endsWith(".auth0.com")
    );
  } catch {
    return false;
  }
}

function configureSession(chatSession) {
  chatSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] = browserUserAgent();
    callback({ requestHeaders: details.requestHeaders });
  });

  chatSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const allowedPermissions = new Set([
      "clipboard-read",
      "media",
      "notifications",
      "display-capture"
    ]);

    callback(allowedPermissions.has(permission) && isAllowedInApp(requestingUrl));
  });
}

function attachChatHandlers(win) {
  win.webContents.setUserAgent(browserUserAgent());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInApp(url)) {
      win.loadURL(url);
    } else {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedInApp(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function applyWidgetPolish(win) {
  win.webContents.insertCSS(`
    @media (max-width: 700px) {
      [data-testid="sidebar"],
      nav[aria-label="Chat history"],
      aside {
        display: none !important;
      }

      main,
      [role="main"] {
        max-width: none !important;
      }

      body {
        min-width: 0 !important;
      }
    }
  `).catch(() => {});
}

function parseIni(text) {
  const sections = new Map();
  let section = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      sections.set(section, {});
      continue;
    }

    const separator = line.indexOf("=");
    if (!section || separator === -1) {
      continue;
    }

    sections.get(section)[line.slice(0, separator)] = line.slice(separator + 1);
  }

  return sections;
}

function firefoxProfileCandidates() {
  const firefoxRoot = path.join(os.homedir(), ".mozilla", "firefox");
  const profilesIni = path.join(firefoxRoot, "profiles.ini");
  const candidates = [];

  if (process.env.CHATGPT_FIREFOX_PROFILE) {
    candidates.push(process.env.CHATGPT_FIREFOX_PROFILE);
  }

  if (fs.existsSync(profilesIni)) {
    const sections = parseIni(fs.readFileSync(profilesIni, "utf8"));
    const profiles = new Map();

    for (const [name, values] of sections) {
      if (!name.startsWith("Profile") || !values.Path) {
        continue;
      }

      const profilePath = values.IsRelative === "1"
        ? path.join(firefoxRoot, values.Path)
        : values.Path;
      profiles.set(values.Path, { ...values, profilePath });
    }

    for (const [name, values] of sections) {
      if (name.startsWith("Install") && values.Default) {
        candidates.push(path.join(firefoxRoot, values.Default));
      }
    }

    for (const profile of profiles.values()) {
      if (profile.Name === "dev-edition-default") {
        candidates.push(profile.profilePath);
      }
    }

    for (const profile of profiles.values()) {
      if (profile.Default === "1") {
        candidates.push(profile.profilePath);
      }
    }

    for (const profile of profiles.values()) {
      candidates.push(profile.profilePath);
    }
  }

  return [...new Set(candidates)]
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => fs.existsSync(path.join(candidate, "cookies.sqlite")));
}

function sameSiteForElectron(value) {
  switch (Number(value)) {
    case 1:
      return "lax";
    case 2:
      return "strict";
    case 3:
      return "no_restriction";
    default:
      return "unspecified";
  }
}

async function importFirefoxCookies(chatSession) {
  if (process.platform !== "linux" || process.env.CHATGPT_DISABLE_FIREFOX_IMPORT === "1") {
    return;
  }

  const sqlite3 = spawnSync("bash", ["-lc", "command -v sqlite3"], { encoding: "utf8" });
  if (sqlite3.status !== 0) {
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const profiles = firefoxProfileCandidates();
  const query = `
    select host, name, value, path, expiry, isSecure, isHttpOnly, sameSite
    from moz_cookies
    where value <> ''
      and expiry > ${now}
      and (
        host like '%chatgpt.com'
        or host like '%openai.com'
        or host like '%auth0.com'
      );
  `;

  for (const profile of profiles) {
    const source = path.join(profile, "cookies.sqlite");
    const copy = path.join(app.getPath("temp"), `chatgpt-firefox-cookies-${process.pid}.sqlite`);

    try {
      fs.copyFileSync(source, copy);
      const result = spawnSync(sqlite3.stdout.trim(), ["-json", copy, query], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024
      });

      if (result.status !== 0 || !result.stdout.trim()) {
        continue;
      }

      const cookies = JSON.parse(result.stdout);
      if (!cookies.length) {
        continue;
      }

      for (const cookie of cookies) {
        const host = String(cookie.host || "");
        const hostname = host.replace(/^\./, "");
        const cookiePath = cookie.path || "/";
        const details = {
          url: `https://${hostname}${cookiePath}`,
          name: String(cookie.name),
          value: String(cookie.value),
          path: cookiePath,
          secure: Boolean(cookie.isSecure),
          httpOnly: Boolean(cookie.isHttpOnly),
          expirationDate: Number(cookie.expiry),
          sameSite: sameSiteForElectron(cookie.sameSite)
        };

        if (host.startsWith(".")) {
          details.domain = host;
        }

        await chatSession.cookies.set(details);
      }

      console.log(`Imported ${cookies.length} ChatGPT/OpenAI cookies from Firefox profile ${path.basename(profile)}.`);
      return;
    } catch (error) {
      console.warn(`Could not import Firefox cookies from ${path.basename(profile)}: ${error.message}`);
    } finally {
      fs.rmSync(copy, { force: true });
    }
  }
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    return chatWindow;
  }

  const iconPath = path.join(__dirname, "..", "assets", "icon.png");
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "ChatGPT",
    icon: nativeImage.createFromPath(iconPath),
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: PARTITION,
      sandbox: true,
      spellcheck: true
    }
  });

  chatWindow = win;
  win.on("closed", () => {
    chatWindow = null;
  });

  attachChatHandlers(win);
  win.loadURL(CHATGPT_URL);
  return win;
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
    widgetWindow.focus();
    return widgetWindow;
  }

  const iconPath = path.join(__dirname, "..", "assets", "icon.png");
  const win = new BrowserWindow({
    width: 440,
    height: 720,
    minWidth: 390,
    minHeight: 560,
    maxWidth: 620,
    maxHeight: 980,
    title: "ChatGPT Widget",
    icon: nativeImage.createFromPath(iconPath),
    frame: true,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: PARTITION,
      sandbox: true,
      spellcheck: true
    }
  });

  widgetWindow = win;
  win.on("closed", () => {
    widgetWindow = null;
  });

  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  attachChatHandlers(win);
  win.webContents.on("did-finish-load", () => applyWidgetPolish(win));
  win.loadURL(CHATGPT_URL);
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  chatSession = session.fromPartition(PARTITION);
  configureSession(chatSession);
  return importFirefoxCookies(chatSession);
}).then(() => {
  if (isWidgetLaunch) {
    createWidgetWindow();
  } else {
    createChatWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isWidgetLaunch) {
        createWidgetWindow();
      } else {
        createChatWindow();
      }
    }
  });
});

app.on("second-instance", (_event, argv) => {
  if (argv.includes("--widget")) {
    createWidgetWindow();
    return;
  }

  createChatWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
