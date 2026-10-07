import { app, BrowserWindow, BrowserView, ipcMain } from "electron";
import path from "node:path";

let win: BrowserWindow | null = null;
let view: BrowserView | null = null;

function normalizeUrl(input: string): string {
  const value = input.trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^[^\s]+\.[^\s]+$/.test(value)) {
    return `https://${value}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setBrowserView(view);

  view.setBounds({
    x: 0,
    y: 64,
    width: 1440,
    height: 836,
  });

  view.webContents.loadURL("https://www.google.com");

  win.loadFile(path.join(__dirname, "index.html"));

  win.on("resize", () => {
    if (!view || !win) return;

    const [width, height] = win.getContentSize();

    view.setBounds({
      x: 0,
      y: 64,
      width,
      height: height - 64,
    });
  });

  view.webContents.on("did-navigate", (_event, url) => {
    win?.webContents.send("page-url", url);
  });

  view.webContents.on("did-navigate-in-page", (_event, url) => {
    win?.webContents.send("page-url", url);
  });
}

ipcMain.on("navigate", (_event, input: string) => {
  if (!view) return;
  view.webContents.loadURL(normalizeUrl(input));
});

ipcMain.on("go-back", () => {
  if (view?.webContents.canGoBack()) {
    view.webContents.goBack();
  }
});

ipcMain.on("go-forward", () => {
  if (view?.webContents.canGoForward()) {
    view.webContents.goForward();
  }
});

ipcMain.on("reload", () => {
  view?.webContents.reload();
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
