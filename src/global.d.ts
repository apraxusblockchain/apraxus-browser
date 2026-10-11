export {};

declare global {
  interface Window {
    apraxus: {
      aiSearch: (
        query: string,
        provider: "auto" | "web" | "openai" | "gemini" | "claude"
      ) => Promise<{
        query: string;
        summary: string | null;
        sources: { title: string; url: string; snippet: string }[];
        provider: "auto" | "web" | "openai" | "gemini" | "claude";
        status: "not_configured" | "success" | "error";
        message: string;
      }>;
      chooseExtensionFolder: () => Promise<string | null>;
      getExtensions: () => Promise<{
        id: string;
        name: string;
        version: string;
        path: string;
        enabled: boolean;
      }[]>;
      loadExtension: (extensionPath: string) => Promise<{
        success: boolean;
        error?: string;
        extension?: {
          id: string;
          name: string;
          version: string;
          path: string;
          enabled: boolean;
        };
      }>;
      setExtensionEnabled: (extensionId: string, enabled: boolean) => Promise<{
        success: boolean;
        error?: string;
      }>;
      removeExtension: (extensionId: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      navigate: (input: string) => void;
      back: () => void;
      forward: () => void;
      reload: () => void;
      findInPage: (text: string) => void;
      findNext: (text: string) => void;
      findPrevious: (text: string) => void;
      stopFindInPage: () => void;
      zoomIn: () => void;
      zoomOut: () => void;
      zoomReset: () => void;
      toggleFullscreen: () => void;
      getUrl: () => Promise<string>;
      toggleBookmark: () => Promise<boolean>;
      getBookmarks: () => Promise<{ url: string; title: string }[]>;
      getHistory: () => Promise<
        { url: string; title: string; visitedAt: number }[]
      >;
      clearHistory: () => Promise<boolean>;
      clearBrowsingData: (options: {
        history: boolean;
        cache: boolean;
        siteData: boolean;
      }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      getPasswords: () => Promise<
        {
          id: string;
          origin: string;
          username: string;
          createdAt: number;
          updatedAt: number;
        }[]
      >;
      savePassword: (data: {
        origin: string;
        username: string;
        password: string;
      }) => Promise<boolean>;
      getPassword: (id: string) => Promise<{
        id: string;
        origin: string;
        username: string;
        password: string;
        createdAt: number;
        updatedAt: number;
      } | null>;
      deletePassword: (id: string) => Promise<boolean>;
      getPermissionPolicy: () => Promise<string[]>;
      setPermission: (permission: string, allowed: boolean) => Promise<boolean>;
      clearPermissionPolicy: () => Promise<boolean>;
      isBookmarked: () => Promise<boolean>;
      newTab: () => Promise<{ id: number; url: string } | null>;
      openPrivateWindow: () => void;
      privateNavigate: (input: string) => void;
      privateBack: () => void;
      privateForward: () => void;
      privateReload: () => void;
      closePrivateWindow: () => void;
      getPrivateUrl: () => Promise<string>;
      onPrivateUrl: (callback: (url: string) => void) => void;
      onPrivateDownloadStatus: (callback: (data: {
        state: string;
        filename: string;
        received: number;
        total: number;
      }) => void) => void;
      activateTab: (id: number) => void;
      closeTab: (id: number) => void;
      rendererReady: () => void;
  minimizeWindow: () => void;
  toggleMaximizeWindow: () => void;
  closeWindow: () => void;
      onTabActivated: (
        callback: (data: { id: number; url: string }) => void
      ) => void;
      onTabCreated: (
        callback: (data: { id: number; url: string }) => void
      ) => void;
      onTabTitle: (
        callback: (data: { id: number; title: string }) => void
      ) => void;
      onUrlChange: (callback: (url: string) => void) => void;
      onRequestCloseTab: (callback: (id: number) => void) => void;
      onFocusAddress: (callback: () => void) => void;
      onFocusFind: (callback: () => void) => void;
      onFindResult: (
        callback: (data: {
          activeMatchOrdinal: number;
          matches: number;
          finalUpdate: boolean;
        }) => void
      ) => void;
      onWindowMaximized: (callback: (maximized: boolean) => void) => void;
      onWindowFullscreen: (callback: (fullscreen: boolean) => void) => void;
      onDownloadStatus: (
        callback: (data: {
          state: string;
          filename: string;
          received: number;
          total: number;
        }) => void
      ) => void;
    };
  }
}
