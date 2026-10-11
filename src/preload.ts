import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("apraxus", {
  aiSearch: (query: string, provider: "auto" | "web" | "openai" | "gemini" | "claude") =>
    ipcRenderer.invoke("ai-search", query, provider),
  chooseExtensionFolder: () => ipcRenderer.invoke("choose-extension-folder"),
  getExtensions: () => ipcRenderer.invoke("get-extensions"),
  loadExtension: (extensionPath: string) =>
    ipcRenderer.invoke("load-extension", extensionPath),
  setExtensionEnabled: (extensionId: string, enabled: boolean) =>
    ipcRenderer.invoke("set-extension-enabled", extensionId, enabled),
  removeExtension: (extensionId: string) =>
    ipcRenderer.invoke("remove-extension", extensionId),
  navigate: (input: string) => ipcRenderer.send("navigate", input),
  findInPage: (text: string) => ipcRenderer.send("find-in-page", text),
  findNext: (text: string) => ipcRenderer.send("find-next", text),
  findPrevious: (text: string) => ipcRenderer.send("find-previous", text),
  stopFindInPage: () => ipcRenderer.send("stop-find-in-page"),
  zoomIn: () => ipcRenderer.send("zoom-in"),
  zoomOut: () => ipcRenderer.send("zoom-out"),
  zoomReset: () => ipcRenderer.send("zoom-reset"),
  toggleFullscreen: () => ipcRenderer.send("toggle-fullscreen"),
  back: () => ipcRenderer.send("go-back"),
  forward: () => ipcRenderer.send("go-forward"),
  reload: () => ipcRenderer.send("reload"),
  getUrl: () => ipcRenderer.invoke("get-url"),
  toggleBookmark: () => ipcRenderer.invoke("toggle-bookmark"),
  getBookmarks: () => ipcRenderer.invoke("get-bookmarks"),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  clearBrowsingData: (options: {
    history: boolean;
    cache: boolean;
    siteData: boolean;
  }) => ipcRenderer.invoke("clear-browsing-data", options),
  getPasswords: () => ipcRenderer.invoke("get-passwords"),
  savePassword: (data: {
    origin: string;
    username: string;
    password: string;
  }) => ipcRenderer.invoke("save-password", data),
  getPassword: (id: string) => ipcRenderer.invoke("get-password", id),
  deletePassword: (id: string) => ipcRenderer.invoke("delete-password", id),
  getPermissionPolicy: () => ipcRenderer.invoke("get-permission-policy"),
  setPermission: (permission: string, allowed: boolean) =>
    ipcRenderer.invoke("set-permission", permission, allowed),
  clearPermissionPolicy: () => ipcRenderer.invoke("clear-permission-policy"),
  isBookmarked: () => ipcRenderer.invoke("is-bookmarked"),
  newTab: () => ipcRenderer.invoke("new-tab"),
  openPrivateWindow: () => ipcRenderer.send("open-private-window"),
  privateNavigate: (input: string) => ipcRenderer.send("private-navigate", input),
  privateBack: () => ipcRenderer.send("private-back"),
  privateForward: () => ipcRenderer.send("private-forward"),
  privateReload: () => ipcRenderer.send("private-reload"),
  closePrivateWindow: () => ipcRenderer.send("close-private-window"),
  getPrivateUrl: () => ipcRenderer.invoke("get-private-url"),
  onPrivateUrl: (callback: (url: string) => void) => {
    ipcRenderer.on("private-url", (_event, url: string) => callback(url));
  },
  onPrivateDownloadStatus: (callback: (data: {
    state: string;
    filename: string;
    received: number;
    total: number;
  }) => void) => {
    ipcRenderer.on("private-download-status", (_event, data) => callback(data));
  },
  activateTab: (id: number) => ipcRenderer.send("activate-tab", id),
  closeTab: (id: number) => ipcRenderer.send("close-tab", id),
  rendererReady: () => ipcRenderer.send("renderer-ready"),
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window-toggle-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  onTabActivated: (callback: (data: { id: number; url: string }) => void) => {
    ipcRenderer.on("tab-activated", (_event, data) => {
      callback(data);
    });
  },
  onTabCreated: (callback: (data: { id: number; url: string }) => void) => {
    ipcRenderer.on("tab-created", (_event, data) => {
      callback(data);
    });
  },
  onTabTitle: (callback: (data: { id: number; title: string }) => void) => {
    ipcRenderer.on("tab-title", (_event, data) => {
      callback(data);
    });
  },
  onUrlChange: (callback: (url: string) => void) => {
    ipcRenderer.on("page-url", (_event, url: string) => {
      callback(url);
    });
  },
  onRequestCloseTab: (callback: (id: number) => void) => {
    ipcRenderer.on("request-close-tab", (_event, id: number) => {
      callback(id);
    });
  },
  onFocusAddress: (callback: () => void) => {
    ipcRenderer.on("focus-address", () => {
      callback();
    });
  },  onFocusFind: (callback: () => void) => {
    ipcRenderer.on("focus-find", () => {
      callback();
    });
  },  onFindResult: (callback: (data: {
    activeMatchOrdinal: number;
    matches: number;
    finalUpdate: boolean;
  }) => void) => {
    ipcRenderer.on("find-result", (_event, data) => {
      callback(data);
    });
  },


  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on("window-maximized", (_event, maximized: boolean) => {
      callback(maximized);
    });
  },  onWindowFullscreen: (callback: (fullscreen: boolean) => void) => {
    ipcRenderer.on("window-fullscreen", (_event, fullscreen: boolean) => {
      callback(fullscreen);
    });
  },

  onDownloadStatus: (callback: (data: { state: string; filename: string; received: number; total: number }) => void) => {
    ipcRenderer.on("download-status", (_event, data) => {
      callback(data);
    });
  },
});
