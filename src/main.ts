import {
  app,
  dialog,
  BrowserWindow,
  BrowserView,
  ipcMain,
  globalShortcut,
  Menu,
  MenuItem,
  safeStorage,
  session,
  clipboard,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import "dotenv/config";
import { searchWithAI, type SearchProvider } from "./ai-search.js";

type BrowserTab = {
  id: number;
  view: BrowserView;
  isPrivate: boolean;
};

let win: BrowserWindow | null = null;
let tabs: BrowserTab[] = [];
let activeTabId: number | null = null;
let nextTabId = 1;

type Bookmark = {
  url: string;
  title: string;
};

let bookmarks: Bookmark[] = [];

type PermissionRecord = {
  origin: string;
  permission: string;
  allowed: boolean;
};

type PasswordRecord = {
  id: string;
  origin: string;
  username: string;
  encryptedPassword: string;
  createdAt: number;
  updatedAt: number;
};

const permissionPolicy = new Set<string>();
const passwordRecords: PasswordRecord[] = [];
const permissionRecords: PermissionRecord[] = [];

type HistoryEntry = {
  url: string;
  title: string;
  visitedAt: number;
};

let historyEntries: HistoryEntry[] = [];

function encryptSecret(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable");
  }

  return safeStorage.encryptString(value).toString("base64");
}

function decryptSecret(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable");
  }

  return safeStorage.decryptString(Buffer.from(value, "base64"));
}

async function loadHistory() {
  try {
    const file = path.join(app.getPath("userData"), "history.json");
    const data = await fs.readFile(file, "utf8");
    historyEntries = JSON.parse(data);
  } catch {
    historyEntries = [];
  }
}

async function saveHistory() {
  const file = path.join(app.getPath("userData"), "history.json");
  await fs.writeFile(file, JSON.stringify(historyEntries, null, 2), "utf8");
}

async function addHistoryEntry(tab: BrowserTab) {
  if (tab.isPrivate) return;

  const url = displayUrl(tab.view.webContents.getURL());

  if (!url || url.startsWith("file://")) return;

  const title = tab.view.webContents.getTitle() || url;

  historyEntries.unshift({
    url,
    title,
    visitedAt: Date.now(),
  });

  // Keep the history database reasonably small.
  historyEntries = historyEntries.slice(0, 1000);

  await saveHistory();
}

async function loadPasswords() {
  try {
    const file = path.join(app.getPath("userData"), "passwords.json");
    const data = await fs.readFile(file, "utf8");
    const records = JSON.parse(data);

    passwordRecords.length = 0;

    if (Array.isArray(records)) {
      for (const record of records) {
        if (
          record &&
          typeof record.id === "string" &&
          typeof record.origin === "string" &&
          typeof record.username === "string" &&
          typeof record.encryptedPassword === "string" &&
          typeof record.createdAt === "number" &&
          typeof record.updatedAt === "number"
        ) {
          passwordRecords.push(record);
        }
      }
    }
  } catch {
    passwordRecords.length = 0;
  }
}

async function savePasswords() {
  const file = path.join(app.getPath("userData"), "passwords.json");
  await fs.writeFile(
    file,
    JSON.stringify(passwordRecords, null, 2),
    "utf8"
  );
}

async function loadPermissions() {
  try {
    const file = path.join(app.getPath("userData"), "permissions.json");
    const data = await fs.readFile(file, "utf8");
    const permissions = JSON.parse(data);

    permissionPolicy.clear();

    if (Array.isArray(permissions)) {
      for (const permission of permissions) {
        if (typeof permission === "string" && permission.trim()) {
          permissionPolicy.add(permission);
        }
      }
    }
  } catch {
    permissionPolicy.clear();
  }
}

async function savePermissions() {
  const file = path.join(app.getPath("userData"), "permissions.json");
  await fs.writeFile(
    file,
    JSON.stringify(Array.from(permissionPolicy), null, 2),
    "utf8"
  );
}

async function loadBookmarks() {
  try {
    const file = path.join(app.getPath("userData"), "bookmarks.json");
    const data = await fs.readFile(file, "utf8");
    bookmarks = JSON.parse(data);
  } catch {
    bookmarks = [];
  }
}

async function saveBookmarks() {
  const file = path.join(app.getPath("userData"), "bookmarks.json");
  await fs.writeFile(file, JSON.stringify(bookmarks, null, 2), "utf8");
}

function normalizeUrl(input: string): string {
  const value = input.trim();

  if (value === "apraxus://newtab") {
    return `file://${path.join(__dirname, "newtab.html")}`;
  }

  if (value === "apraxus://settings") {
    return `file://${path.join(__dirname, "settings.html")}`;
  }

  if (value === "apraxus://search") {
    return `file://${path.join(__dirname, "search.html")}`;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^[^\s]+\.[^\s]+$/.test(value)) {
    return `https://${value}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function getActiveTab(): BrowserTab | null {
  if (activeTabId === null) return null;
  return tabs.find((tab) => tab.id === activeTabId) ?? null;
}

function displayUrl(url: string): string {
  if (url.endsWith("/newtab.html")) {
    return "";
  }

  return url;
}

function positionTab(tab: BrowserTab) {
  if (!win) return;

  const [width, height] = win.getContentSize();

  tab.view.setBounds({
    x: 0,
    y: 100,
    width,
    height: Math.max(0, height - 100),
  });
}

function activateTab(id: number) {
  if (!win) return;

  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;

  activeTabId = id;

  // Remove every BrowserView from the window first.
  for (const item of tabs) {
    if (win.getBrowserViews().includes(item.view)) {
      win.removeBrowserView(item.view);
    }
  }

  // Add only the selected tab's BrowserView.
  win.addBrowserView(tab.view);
  positionTab(tab);

  win.webContents.send("tab-activated", {
    id: tab.id,
    url: displayUrl(tab.view.webContents.getURL()),
  });
}

function createTab(url = "apraxus://newtab", isPrivate = false) {
  if (!win) return;

  const id = nextTabId++;
  const browsingSession = isPrivate
    ? session.fromPartition("apraxus-private")
    : session.fromPartition("persist:apraxus-browser");

  const tab: BrowserTab = {
    id,
    isPrivate,
    view: new BrowserView({
      webPreferences: {
        session: browsingSession,
        contextIsolation: true,
        nodeIntegration: false,
      },
    }),
  };

  tabs.push(tab);

  win.webContents.send("tab-created", {
    id: tab.id,
    url,
  });

  tab.view.webContents.on("found-in-page", (_event, result) => {
    if (activeTabId === tab.id) {
      win?.webContents.send("find-result", {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate,
      });
    }
  });

  tab.view.webContents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      template.push({
        label: "Open Link in New Tab",
        click: () => {
          createTab(params.linkURL);
        },
      });
      template.push({
        label: "Copy Link Address",
        click: () => {
          clipboard.writeText(params.linkURL);
        },
      });
      template.push({ type: "separator" });
    }

    if (params.selectionText) {
      template.push({
        label: "Copy",
        click: () => {
          tab.view.webContents.copy();
        },
      });
      template.push({ type: "separator" });
    }

    if (params.mediaType === "image" && params.srcURL) {
      template.push({
        label: "Open Image in New Tab",
        click: () => {
          createTab(params.srcURL);
        },
      });

      template.push({
        label: "Copy Image Address",
        click: () => {
          tab.view.webContents.copyImageAt(params.x, params.y);
        },
      });

      template.push({
        label: "Save Image As…",
        click: () => {
          tab.view.webContents.downloadURL(params.srcURL);
        },
      });

      template.push({ type: "separator" });
    }

    if (params.linkURL) {
      template.push({
        label: "Save Link As…",
        click: () => {
          tab.view.webContents.downloadURL(params.linkURL);
        },
      });

      template.push({ type: "separator" });
    }

    if (params.isEditable) {
      if (params.editFlags.canCut) {
        template.push({
          label: "Cut",
          click: () => tab.view.webContents.cut(),
        });
      }

      if (params.editFlags.canCopy) {
        template.push({
          label: "Copy",
          click: () => tab.view.webContents.copy(),
        });
      }

      if (params.editFlags.canPaste) {
        template.push({
          label: "Paste",
          click: () => tab.view.webContents.paste(),
        });
      }

      if (params.editFlags.canSelectAll) {
        template.push({
          label: "Select All",
          click: () => tab.view.webContents.selectAll(),
        });
      }

      if (template.length) {
        template.push({ type: "separator" });
      }
    }

    template.push({
      label: "Back",
      enabled: tab.view.webContents.canGoBack(),
      click: () => tab.view.webContents.goBack(),
    });

    template.push({
      label: "Forward",
      enabled: tab.view.webContents.canGoForward(),
      click: () => tab.view.webContents.goForward(),
    });

    template.push({
      label: "Reload",
      click: () => tab.view.webContents.reload(),
    });

    template.push({ type: "separator" });

    template.push({
      label: "Inspect",
      click: () => tab.view.webContents.inspectElement(params.x, params.y),
    });

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win ?? undefined });
  });

  tab.view.webContents.on("did-navigate", (_event, pageUrl) => {
    if (activeTabId === tab.id) {
      win?.webContents.send("page-url", displayUrl(pageUrl));
    }

    void addHistoryEntry(tab);
  });

  tab.view.webContents.on("did-navigate-in-page", (_event, pageUrl) => {
    if (activeTabId === tab.id) {
      win?.webContents.send("page-url", displayUrl(pageUrl));
    }
  });

  tab.view.webContents.on("page-title-updated", (_event, title) => {
    win?.webContents.send("tab-title", {
      id: tab.id,
      title: title || tab.view.webContents.getURL(),
    });
  });

  activateTab(id);

  tab.view.webContents.loadURL(normalizeUrl(url));
}


type PrivateWindowContext = {
  window: BrowserWindow;
  view: BrowserView;
  browsingSession: Electron.Session;
};

const privateWindows = new Map<number, PrivateWindowContext>();

function createPrivateWindow() {
  const partition = `apraxus-private-${crypto.randomUUID()}`;
  const browsingSession = session.fromPartition(partition);

  // Private windows default-deny site permissions until a dedicated
  // private permission prompt and per-window consent flow are implemented.
  browsingSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );
  browsingSession.setPermissionCheckHandler((_webContents, _permission) => {
    return false;
  });

  const privateWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 850,
    minHeight: 560,
    backgroundColor: "#09090d",
    title: "Apraxus Incognito",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const view = new BrowserView({
    webPreferences: {
      session: browsingSession,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const context: PrivateWindowContext = {
    window: privateWindow,
    view,
    browsingSession,
  };

  privateWindows.set(privateWindow.id, context);
  privateWindow.addBrowserView(view);

  const positionPrivateView = () => {
    if (privateWindow.isDestroyed()) return;

    const [width, height] = privateWindow.getContentSize();
    view.setBounds({
      x: 0,
      y: 94,
      width,
      height: Math.max(0, height - 94),
    });
    view.setAutoResize({ width: true, height: true });
  };

  privateWindow.on("resize", positionPrivateView);

  browsingSession.on("will-download", (_event, item) => {
    const filename = item.getFilename();
    const downloadsPath = app.getPath("downloads");
    item.setSavePath(path.join(downloadsPath, filename));

    const sendPrivateStatus = (state: string) => {
      if (privateWindow.isDestroyed()) return;
      privateWindow.webContents.send("private-download-status", {
        state,
        filename,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
      });
    };

    sendPrivateStatus("started");
    item.on("updated", () => sendPrivateStatus("progress"));
    item.once("done", (_event, state) => {
      sendPrivateStatus(state === "completed" ? "completed" : "failed");
    });
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    // Keep links inside this private browsing context.
    // Do not create uncontrolled Electron windows from page content.
    if (/^https?:\/\//i.test(url)) {
      void view.webContents.loadURL(url).catch((error) => {
        console.error("Private link navigation failed:", error);
      });
    }
    return { action: "deny" };
  });

  view.webContents.on("will-navigate", (event, url) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol !== "https:" && protocol !== "http:" && protocol !== "file:") {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  view.webContents.on("did-navigate", () => {
    if (!privateWindow.isDestroyed()) {
      privateWindow.webContents.send(
        "private-url",
        displayUrl(view.webContents.getURL())
      );
    }
  });

  view.webContents.on("did-navigate-in-page", () => {
    if (!privateWindow.isDestroyed()) {
      privateWindow.webContents.send(
        "private-url",
        displayUrl(view.webContents.getURL())
      );
    }
  });

  privateWindow.on("closed", () => {
    privateWindows.delete(privateWindow.id);

    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }

    // Best-effort cleanup for this unique, non-persistent session.
    // Electron does not expose a direct API to destroy a Session object.
    void (async () => {
      try {
        await browsingSession.clearCache();
        await browsingSession.clearStorageData();
      } catch (error) {
        console.error("Private session cleanup failed:", error);
      }
    })();
  });

  void privateWindow.loadFile(path.join(__dirname, "private.html"));
  positionPrivateView();

  void view.webContents.loadURL("https://www.google.com").catch(() => {});
}

function getPrivateContext(sender: Electron.WebContents) {
  const senderWindow = BrowserWindow.fromWebContents(sender);
  if (!senderWindow || senderWindow.isDestroyed()) return null;

  const context = privateWindows.get(senderWindow.id);
  if (!context || context.window !== senderWindow) return null;

  // Only the trusted private-window UI may control its private browsing view.
  const expectedUiPath = path.join(__dirname, "private.html");
  const senderUrl = sender.getURL();

  try {
    const parsedSenderUrl = new URL(senderUrl);

    if (
      parsedSenderUrl.protocol !== "file:" ||
      path.resolve(fileURLToPath(parsedSenderUrl)) !== path.resolve(expectedUiPath)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return context;
}

ipcMain.on("open-private-window", () => {
  createPrivateWindow();
});

ipcMain.handle("get-private-url", (event) => {
  const context = getPrivateContext(event.sender);
  return context ? displayUrl(context.view.webContents.getURL()) : "";
});

ipcMain.on("private-navigate", (event, input: string) => {
  const context = getPrivateContext(event.sender);
  if (!context || typeof input !== "string") return;

  const value = input.trim();
  if (!value || value.length > 8192) return;

  try {
    const target = normalizeUrl(value);
    const parsed = new URL(target);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:" && parsed.protocol !== "file:") {
      return;
    }

    void context.view.webContents.loadURL(target).catch((error) => {
      console.error("Private navigation failed:", error);
    });
  } catch (error) {
    console.error("Invalid private navigation target:", error);
  }
});

ipcMain.on("private-back", (event) => {
  const contents = getPrivateContext(event.sender)?.view.webContents;
  if (contents && contents.canGoBack()) contents.goBack();
});

ipcMain.on("private-forward", (event) => {
  const contents = getPrivateContext(event.sender)?.view.webContents;
  if (contents && contents.canGoForward()) contents.goForward();
});

ipcMain.on("private-reload", (event) => {
  getPrivateContext(event.sender)?.view.webContents.reload();
});

ipcMain.on("close-private-window", (event) => {
  getPrivateContext(event.sender)?.window.close();
});



type ManagedExtension = {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
};


const managedExtensions = new Map<string, ManagedExtension>();

async function saveExtensions() {
  const file = path.join(app.getPath("userData"), "extensions.json");
  await fs.writeFile(
    file,
    JSON.stringify(Array.from(managedExtensions.values()), null, 2),
    "utf8",
  );
}

async function loadSavedExtensions(): Promise<ManagedExtension[]> {
  try {
    const file = path.join(app.getPath("userData"), "extensions.json");
    const data: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(data)) return [];

    return data.filter((item): item is ManagedExtension =>
      Boolean(
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.version === "string" &&
        typeof item.path === "string" &&
        typeof item.enabled === "boolean"
      )
    );
  } catch {
    return [];
  }
}


ipcMain.handle("choose-extension-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Unpacked Extension Folder",
    properties: ["openDirectory"],
    buttonLabel: "Select Extension",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("get-extensions", () => {
  return Array.from(managedExtensions.values());
});

ipcMain.handle("load-extension", async (_event, extensionPath: string) => {
  if (typeof extensionPath !== "string" || !extensionPath.trim()) {
    return { success: false, error: "Select an extension folder first." };
  }

  try {
    const resolvedPath = path.resolve(extensionPath.trim());
    const fs = await import("node:fs/promises");
    const manifestPath = path.join(resolvedPath, "manifest.json");
    const manifestText = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);

    if (
      !manifest ||
      typeof manifest.name !== "string" ||
      typeof manifest.version !== "string" ||
      ![2, 3].includes(manifest.manifest_version)
    ) {
      return { success: false, error: "Invalid or unsupported extension manifest." };
    }

    const browserSession = session.fromPartition("persist:apraxus-browser");
    const extension = await browserSession.loadExtension(resolvedPath, {
      allowFileAccess: false,
    });

    const item: ManagedExtension = {
      id: extension.id,
      name: manifest.name,
      version: manifest.version,
      path: resolvedPath,
      enabled: true,
    };
    managedExtensions.set(extension.id, item);
    await saveExtensions();
    return { success: true, extension: item };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load extension.";
    return { success: false, error: message };
  }
});

ipcMain.handle(
  "set-extension-enabled",
  async (_event, extensionId: string, enabled: boolean) => {
    if (typeof extensionId !== "string" || typeof enabled !== "boolean") {
      return { success: false, error: "Invalid extension settings." };
    }

    const item = managedExtensions.get(extensionId);
    if (!item) {
      return { success: false, error: "Extension not found." };
    }

    if (item.enabled === enabled) {
      return { success: true };
    }

    try {
      const browserSession = session.fromPartition("persist:apraxus-browser");

      if (!enabled) {
        await browserSession.removeExtension(extensionId);
        item.enabled = false;
        await saveExtensions();
        return { success: true };
      }

      const extension = await browserSession.loadExtension(item.path, {
        allowFileAccess: false,
      });

      managedExtensions.delete(extensionId);
      item.id = extension.id;
      item.enabled = true;
      managedExtensions.set(extension.id, item);
      await saveExtensions();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not change extension state.";
      return { success: false, error: message };
    }
  },
);

ipcMain.handle("remove-extension", async (_event, extensionId: string) => {
  if (typeof extensionId !== "string" || !managedExtensions.has(extensionId)) {
    return { success: false, error: "Extension not found in this session." };
  }

  try {
    const item = managedExtensions.get(extensionId);
    if (!item) {
      return { success: false, error: "Extension not found." };
    }

    if (item.enabled) {
      const browserSession = session.fromPartition("persist:apraxus-browser");
      await browserSession.removeExtension(extensionId);
    }

    managedExtensions.delete(extensionId);
    await saveExtensions();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove extension.";
    return { success: false, error: message };
  }
});

process.on("uncaughtException", (error) => {
  console.error("[Apraxus Main] Uncaught exception:", error.stack || error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Apraxus Main] Unhandled rejection:", reason);
});

let windowIpcHandlersRegistered = false;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(__dirname, "../assets/apraxus-browser-icon.png"),
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error("[Apraxus Renderer]", message, "line:", line, "source:", sourceId);
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[Apraxus Renderer] Process gone:", details);
  });

  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("[Apraxus Renderer] Load failed:", { code, description, url });
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.on("resize", () => {
    const activeTab = getActiveTab();
    if (activeTab) {
      positionTab(activeTab);
    }
  });

  win.on("maximize", () => {
    win?.webContents.send("window-maximized", true);
  });

  win.on("unmaximize", () => {
    win?.webContents.send("window-maximized", false);
  });
  win.on("enter-full-screen", () => {
    win?.webContents.send("window-fullscreen", true);
  });

  win.on("leave-full-screen", () => {
    win?.webContents.send("window-fullscreen", false);
  });







  if (!windowIpcHandlersRegistered) {
    windowIpcHandlersRegistered = true;

    ipcMain.handle(
      "clear-browsing-data",
      async (
        _event,
        options: {
          history: boolean;
          cache: boolean;
          siteData: boolean;
        }
      ) => {
        try {
          const browserSession = session.fromPartition(
            "persist:apraxus-browser"
          );

          if (options?.history === true) {
            historyEntries = [];
            await saveHistory();
          }

          if (options?.cache === true) {
            await browserSession.clearCache();
          }

          if (options?.siteData === true) {
            await browserSession.clearStorageData({
              storages: [
                "cookies",
                "localstorage",
                "indexdb",
                "serviceworkers",
                "cachestorage",
                "filesystem",
              ],
            });
          }

          return { success: true };
        } catch {
          return {
            success: false,
            error: "Unable to clear the selected browsing data.",
          };
        }
      }
    );

    ipcMain.handle("get-passwords", () => {
      return passwordRecords.map(({ id, origin, username, createdAt, updatedAt }) => ({
        id,
        origin,
        username,
        createdAt,
        updatedAt,
      }));
    });

    ipcMain.handle(
      "save-password",
      async (
        _event,
        data: { origin: string; username: string; password: string }
      ) => {
        let origin =
          typeof data?.origin === "string" ? data.origin.trim() : "";
        const username =
          typeof data?.username === "string" ? data.username.trim() : "";
        const password =
          typeof data?.password === "string" ? data.password : "";

        if (!origin || !username || !password) {
          return false;
        }

        try {
          const parsedOrigin = new URL(origin);

          if (!["http:", "https:"].includes(parsedOrigin.protocol)) {
            return false;
          }

          origin = parsedOrigin.origin;
        } catch {
          return false;
        }

        const now = Date.now();
        const encryptedPassword = encryptSecret(password);

        const existing = passwordRecords.find(
          (record) =>
            record.origin === origin && record.username === username
        );

        if (existing) {
          existing.encryptedPassword = encryptedPassword;
          existing.updatedAt = now;
        } else {
          passwordRecords.push({
            id: crypto.randomUUID(),
            origin,
            username,
            encryptedPassword,
            createdAt: now,
            updatedAt: now,
          });
        }

        await savePasswords();
        return true;
      }
    );

    ipcMain.handle("delete-password", async (_event, id: string) => {
      const index = passwordRecords.findIndex((record) => record.id === id);

      if (index === -1) {
        return false;
      }

      passwordRecords.splice(index, 1);
      await savePasswords();
      return true;
    });

    ipcMain.handle(
      "get-password",
      async (_event, id: string) => {
        try {
          const record = passwordRecords.find((item) => item.id === id);

          if (!record) {
            return null;
          }

          return {
            id: record.id,
            origin: record.origin,
            username: record.username,
            password: decryptSecret(record.encryptedPassword),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          };
        } catch {
          return null;
        }
      }
    );

    ipcMain.handle("get-permission-policy", () => {
      return Array.from(permissionPolicy);
    });

    ipcMain.handle("set-permission", async (_event, permission: string, allowed: boolean) => {
      if (!permission.trim()) return false;

      if (allowed) {
        permissionPolicy.add(permission);
      } else {
        permissionPolicy.delete(permission);
      }

      await savePermissions();
      return true;
    });

    ipcMain.handle("clear-permission-policy", async () => {
      permissionPolicy.clear();
      await savePermissions();
      return true;
    });

    const browserSession = session.fromPartition("persist:apraxus-browser");

    browserSession.on("will-download", (_event, item) => {
      const downloadsPath = app.getPath("downloads");
      const filename = item.getFilename();

      item.setSavePath(path.join(downloadsPath, filename));

      const sendStatus = (state: string) => {
        if (!win || win.isDestroyed()) return;
        win.webContents.send("download-status", {
          state,
          filename,
          received: item.getReceivedBytes(),
          total: item.getTotalBytes(),
        });
      };

      sendStatus("started");

      item.on("updated", () => sendStatus("progress"));
      item.once("done", (_event, state) => {
        sendStatus(state === "completed" ? "completed" : "failed");
      });
    });

  }

  createTab();
}

ipcMain.on("window-minimize", () => {
  win?.minimize();
});

ipcMain.on("window-toggle-maximize", () => {
  if (!win) return;

  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on("window-close", () => {
  win?.close();
});

ipcMain.on("toggle-fullscreen", () => {
  if (!win) return;
  win.setFullScreen(!win.isFullScreen());
});

ipcMain.on("zoom-in", () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  activeTab.view.webContents.setZoomLevel(
    Math.min(activeTab.view.webContents.getZoomLevel() + 1, 5)
  );
});

ipcMain.on("zoom-out", () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  activeTab.view.webContents.setZoomLevel(
    Math.max(activeTab.view.webContents.getZoomLevel() - 1, -5)
  );
});

ipcMain.on("zoom-reset", () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  activeTab.view.webContents.setZoomLevel(0);
});

ipcMain.on("find-in-page", (_event, text: string) => {
  const activeTab = getActiveTab();
  if (!activeTab || !text.trim()) return;

  activeTab.view.webContents.findInPage(text.trim(), {
    forward: true,
    findNext: false,
  });
});

ipcMain.on("find-next", (_event, text: string) => {
  const activeTab = getActiveTab();
  if (!activeTab || !text.trim()) return;

  activeTab.view.webContents.findInPage(text.trim(), {
    forward: true,
    findNext: true,
  });
});

ipcMain.on("find-previous", (_event, text: string) => {
  const activeTab = getActiveTab();
  if (!activeTab || !text.trim()) return;

  activeTab.view.webContents.findInPage(text.trim(), {
    forward: false,
    findNext: true,
  });
});

ipcMain.on("stop-find-in-page", () => {
  const activeTab = getActiveTab();
  activeTab?.view.webContents.stopFindInPage("clearSelection");
});

ipcMain.on("activate-tab", (_event, id: number) => {
  console.log("MAIN: activate-tab", id);
  activateTab(id);
});

ipcMain.on("close-tab", (_event, id: number) => {
  if (!win) return;

  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const tab = tabs[index];
  const wasActive = activeTabId === id;

  if (win.getBrowserViews().includes(tab.view)) {
    win.removeBrowserView(tab.view);
  }

  tab.view.webContents.close();
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    createTab();
    return;
  }

  if (wasActive) {
    const nextTab = tabs[Math.max(0, index - 1)];
    activateTab(nextTab.id);
  }
});

ipcMain.handle("ai-search", async (event, input: unknown, providerInput: unknown) => {
  const senderUrl = event.sender.getURL();
  let isAuthorizedSearchPage = false;

  try {
    const parsedSenderUrl = new URL(senderUrl);
    isAuthorizedSearchPage =
      parsedSenderUrl.protocol === "file:" &&
      path.resolve(fileURLToPath(parsedSenderUrl)) ===
        path.resolve(path.join(__dirname, "search.html"));
  } catch {
    isAuthorizedSearchPage = false;
  }

  if (!isAuthorizedSearchPage) {
    return {
      query: "",
      summary: null,
      sources: [],
      provider: "web",
      status: "error",
      message: "AI Search request rejected.",
    };
  }

  if (typeof input !== "string" || input.trim().length === 0 || input.length > 2000) {
    return {
      query: "",
      summary: null,
      sources: [],
      provider: "web",
      status: "error",
      message: "Enter a search query of up to 2000 characters.",
    };
  }

  const allowedProviders: SearchProvider[] = ["auto", "web", "openai", "gemini", "claude"];
  const provider: SearchProvider =
    typeof providerInput === "string" && allowedProviders.includes(providerInput as SearchProvider)
      ? providerInput as SearchProvider
      : "web";

  try {
    return await searchWithAI(input, provider);
  } catch (error) {
    console.error("AI Search failed:", error);
    return {
      query: input.trim(),
      summary: null,
      sources: [],
      provider,
      status: "error",
      message: "AI Search is temporarily unavailable.",
    };
  }
});

ipcMain.on("navigate", (_event, input: string) => {
  const tab = getActiveTab();
  if (!tab) return;

  tab.view.webContents.loadURL(normalizeUrl(input));
});

ipcMain.on("go-back", () => {
  const tab = getActiveTab();

  if (tab?.view.webContents.canGoBack()) {
    tab.view.webContents.goBack();
  }
});

ipcMain.on("go-forward", () => {
  const tab = getActiveTab();

  if (tab?.view.webContents.canGoForward()) {
    tab.view.webContents.goForward();
  }
});

ipcMain.on("reload", () => {
  getActiveTab()?.view.webContents.reload();
});

ipcMain.handle("get-url", () => {
  return displayUrl(getActiveTab()?.view.webContents.getURL() ?? "");
});

ipcMain.handle("get-bookmarks", () => {
  return bookmarks;
});

ipcMain.handle("get-history", () => {
  return historyEntries;
});

ipcMain.handle("clear-history", async () => {
  historyEntries = [];
  await saveHistory();
  return true;
});

ipcMain.handle("is-bookmarked", () => {
  const tab = getActiveTab();
  if (!tab) return false;

  const url = displayUrl(tab.view.webContents.getURL());
  if (!url) return false;

  return bookmarks.some((bookmark) => bookmark.url === url);
});

ipcMain.handle("toggle-bookmark", async () => {
  const tab = getActiveTab();
  if (!tab) return false;

  const url = displayUrl(tab.view.webContents.getURL());
  if (!url) return false;

  const existing = bookmarks.findIndex((bookmark) => bookmark.url === url);

  if (existing >= 0) {
    bookmarks.splice(existing, 1);
    await saveBookmarks();
    return false;
  }

  bookmarks.push({
    url,
    title: tab.view.webContents.getTitle() || url,
  });

  await saveBookmarks();
  return true;
});

ipcMain.handle("new-tab", () => {
  console.log("MAIN: new-tab handler called");

  if (!win) {
    console.log("MAIN: window missing");
    return null;
  }

  const before = nextTabId;
  createTab();

  const result = {
    id: before,
    url: "apraxus://newtab",
  };

  console.log("MAIN: new tab created", result);

  return result;
});

ipcMain.on("renderer-ready", () => {
  const tab = getActiveTab();
  if (!tab || !win) return;

  win.webContents.send("tab-activated", {
    id: tab.id,
    url: displayUrl(tab.view.webContents.getURL()),
  });
});

async function restoreSavedExtensions() {
  const browserSession = session.fromPartition("persist:apraxus-browser");
  const savedExtensions = await loadSavedExtensions();

  managedExtensions.clear();

  for (const saved of savedExtensions) {
    try {
      if (saved.enabled) {
        const extension = await browserSession.loadExtension(saved.path, {
          allowFileAccess: false,
        });

        managedExtensions.set(extension.id, {
          ...saved,
          id: extension.id,
          enabled: true,
        });
      } else {
        // Keep disabled extensions in the manager without loading them.
        managedExtensions.set(saved.id, { ...saved, enabled: false });
      }
    } catch (error) {
      console.error(
        `Could not restore extension "${saved.name}":`,
        error instanceof Error ? error.message : error,
      );
      // One broken extension must not prevent the browser from starting.
      managedExtensions.set(saved.id, { ...saved, enabled: false });
    }
  }

  await saveExtensions();
}

app.whenReady().then(async () => {
  const browserSession = session.fromPartition("persist:apraxus-browser");

  browserSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permissionPolicy.has(permission));
    }
  );

  browserSession.setPermissionCheckHandler((_webContents, permission) => {
    return permissionPolicy.has(permission);
  });

  await loadBookmarks();
  await loadHistory();
  await loadPermissions();
  await loadPasswords();
  await restoreSavedExtensions();
  createWindow();

  globalShortcut.register("CommandOrControl+T", () => {
    createTab();
  });

  globalShortcut.register("CommandOrControl+Shift+N", () => {
    createPrivateWindow();
  });

  globalShortcut.register("CommandOrControl+W", () => {
    const tab = getActiveTab();
    if (!tab) return;

    win?.webContents.send("request-close-tab", tab.id);
  });

  globalShortcut.register("CommandOrControl+F", () => {
    win?.webContents.send("focus-find");
  });
  globalShortcut.register("CommandOrControl+Shift+F", () => {
    if (!win) return;
    win.setFullScreen(!win.isFullScreen());
  });


  globalShortcut.register("CommandOrControl+=", () => {
    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.view.webContents.setZoomLevel(
        activeTab.view.webContents.getZoomLevel() + 1
      );
    }
  });

  globalShortcut.register("CommandOrControl+-", () => {
    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.view.webContents.setZoomLevel(
        activeTab.view.webContents.getZoomLevel() - 1
      );
    }
  });

  globalShortcut.register("CommandOrControl+0", () => {
    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.view.webContents.setZoomLevel(0);
    }
  });



  globalShortcut.register("CommandOrControl+L", () => {
    win?.webContents.send("focus-address");
  });

  globalShortcut.register("CommandOrControl+R", () => {
    getActiveTab()?.view.webContents.reload();
  });

  globalShortcut.register("CommandOrControl+[", () => {
    const tab = getActiveTab();

    if (tab?.view.webContents.canGoBack()) {
      tab.view.webContents.goBack();
    }
  });

  globalShortcut.register("CommandOrControl+]", () => {
    const tab = getActiveTab();

    if (tab?.view.webContents.canGoForward()) {
      tab.view.webContents.goForward();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
