import { getLocaleID, getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

class PdfNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfNotFoundError";
  }
}

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 11_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1";

export class AnnasArchiveManager {
  private static _instance: AnnasArchiveManager;
  private observerID: string | null = null;
  private menuRegistered = false;

  private constructor() {}

  public static getInstance(): AnnasArchiveManager {
    if (!AnnasArchiveManager._instance) {
      AnnasArchiveManager._instance = new AnnasArchiveManager();
    }
    return AnnasArchiveManager._instance;
  }

  public registerMenus() {
    if (this.menuRegistered) return;

    const icon = `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`;

    // Prefer Zotero 8+ MenuManager (required path for Zotero 10)
    if (Zotero.MenuManager?.registerMenu) {
      Zotero.MenuManager.registerMenu({
        menuID: `${addon.data.config.addonRef}-item-menu`,
        pluginID: addon.data.config.addonID,
        target: "main/library/item",
        menus: [
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menuitem-download"),
            icon,
            onCommand: () => {
              void this.downloadSelectedItems();
            },
          },
        ],
      });

      Zotero.MenuManager.registerMenu({
        menuID: `${addon.data.config.addonRef}-collection-menu`,
        pluginID: addon.data.config.addonID,
        target: "main/library/collection",
        menus: [
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menuitem-download-collection"),
            icon,
            onCommand: () => {
              void this.downloadSelectedCollections();
            },
          },
        ],
      });

      Zotero.MenuManager.registerMenu({
        menuID: `${addon.data.config.addonRef}-tools-menu`,
        pluginID: addon.data.config.addonID,
        target: "main/menubar/tools",
        menus: [
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menuitem-update-all"),
            icon,
            onCommand: () => {
              void this.downloadAllEditableItems();
            },
          },
        ],
      });

      this.menuRegistered = true;
      return;
    }

    // Zotero 7 fallback: inject menu items into each main window
    this.registerLegacyMenus();
  }

  private registerLegacyMenus() {
    const win = Zotero.getMainWindow();
    if (!win) return;
    const doc = win.document;
    const icon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

    const ensureItem = (
      parentSelector: string,
      id: string,
      label: string,
      onCommand: () => void,
    ) => {
      if (doc.getElementById(id)) return;
      const parent = doc.querySelector(parentSelector);
      if (!parent) return;
      const item = doc.createXULElement("menuitem");
      item.id = id;
      item.setAttribute("label", label);
      item.setAttribute("class", "menuitem-iconic");
      item.setAttribute("image", icon);
      item.addEventListener("command", onCommand);
      parent.appendChild(item);
    };

    ensureItem(
      "#zotero-itemmenu",
      "zotero-itemmenu-annasarchive-download",
      getString("menuitem-download"),
      () => void this.downloadSelectedItems(),
    );
    ensureItem(
      "#zotero-collectionmenu",
      "zotero-collectionmenu-annasarchive-download",
      getString("menuitem-download-collection"),
      () => void this.downloadSelectedCollections(),
    );
    ensureItem(
      "#menu_ToolsPopup",
      "zotero-toolsmenu-annasarchive-update-all",
      getString("menuitem-update-all"),
      () => void this.downloadAllEditableItems(),
    );
  }

  public registerNotifier() {
    if (this.observerID) return;

    this.observerID = Zotero.Notifier.registerObserver(
      {
        notify: async (
          event: string,
          type: string,
          ids: string[] | number[],
          _extraData: { [key: string]: any },
        ) => {
          if (event !== "add" || type !== "item") return;
          if (!getPref("automaticPdfDownload")) return;

          const items = await Zotero.Items.getAsync(ids as number[]);
          await this.updateItems(items);
        },
      },
      ["item"],
      "annasarchive",
    );
  }

  public unregisterNotifier() {
    if (this.observerID) {
      Zotero.Notifier.unregisterObserver(this.observerID);
      this.observerID = null;
    }
  }

  private async downloadSelectedItems() {
    const pane = Zotero.getActiveZoteroPane();
    if (!pane) {
      this.showProgressWindow("No Zotero pane available", "fail");
      return;
    }
    const items = pane.getSelectedItems();
    if (!items.length) {
      this.showProgressWindow("No items selected", "fail");
      return;
    }
    await this.updateItems(items);
  }

  private async downloadSelectedCollections() {
    const pane = Zotero.getActiveZoteroPane();
    if (!pane) {
      this.showProgressWindow("No Zotero pane available", "fail");
      return;
    }

    // Zotero 10: plural selection getters
    const collections =
      typeof pane.getSelectedCollections === "function"
        ? pane.getSelectedCollections()
        : [pane.getSelectedCollection()].filter(
            (c): c is Zotero.Collection => !!c,
          );

    if (!collections.length) {
      this.showProgressWindow("No collection selected", "fail");
      return;
    }

    const items: Zotero.Item[] = [];
    for (const collection of collections) {
      items.push(...collection.getChildItems(false, false));
    }
    await this.updateItems(items);
  }

  private async downloadAllEditableItems() {
    const items: Zotero.Item[] = [];
    for (const library of Zotero.Libraries.getAll()) {
      if (!Zotero.Libraries.isEditable(library.libraryID)) continue;
      const libraryItems = await Zotero.Items.getAll(library.libraryID);
      items.push(...libraryItems.filter((item) => item.isRegularItem()));
    }
    await this.updateItems(items);
  }

  public async updateItems(items: Zotero.Item[]): Promise<void> {
    const processable = items.filter((item) => item.isRegularItem());

    if (!processable.length) {
      this.showProgressWindow("No processable items", "fail");
      return;
    }

    const progressWin = new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: `Processing ${processable.length} item(s)...`,
        type: "default",
      })
      .show();

    for (const item of processable) {
      const doi = this.getDoi(item);
      if (!doi) {
        progressWin.changeLine({
          text: `DOI missing: "${item.getField("title")}"`,
          type: "fail",
        });
        continue;
      }

      const endpoint = this.getEndpoint();
      const url = new URL(doi.replace(/^\//, ""), endpoint).href;

      try {
        await this.updateItem(url, item, progressWin);
      } catch (error: any) {
        if (error instanceof PdfNotFoundError) {
          progressWin.changeLine({
            text: `PDF not available: "${item.getField("title")}"`,
            type: "fail",
          });
          continue;
        }

        progressWin.changeLine({
          text: `Captcha or error for "${item.getField("title")}". Opening in browser...`,
          type: "fail",
        });
        Zotero.launchURL(url);
        break;
      }
    }
  }

  private getEndpoint(): string {
    const endpoint = (getPref("endpoint") as string) || "";
    if (endpoint) {
      return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
    }
    return "https://annas-archive.org/scidb/";
  }

  private getDoi(item: Zotero.Item): string | null {
    const doiField = item.getField("DOI") as string;
    const doiFromExtra = this.getDoiFromExtra(item);
    const doiFromUrl = this.getDoiFromUrl(item);
    const doi = doiField || doiFromExtra || doiFromUrl;

    if (doi && typeof doi === "string" && doi.trim().length > 0) {
      return doi.trim();
    }
    return null;
  }

  private getDoiFromExtra(item: Zotero.Item): string | null {
    const extra = item.getField("extra") as string;
    const match = extra?.match(/^DOI:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private getDoiFromUrl(item: Zotero.Item): string | null {
    const url = item.getField("url") as string;
    if (!url?.match(/\bdoi\.org\b/i)) return null;
    try {
      const doiPath = new URL(url).pathname;
      return decodeURIComponent(doiPath).replace(/^\//, "");
    } catch {
      return null;
    }
  }

  private async updateItem(
    url: string,
    item: Zotero.Item,
    progressWin: InstanceType<ZToolkit["ProgressWindow"]>,
  ): Promise<void> {
    progressWin.changeLine({
      text: `Fetching PDF for "${item.getField("title")}"...`,
      type: "default",
    });

    const xhr = await Zotero.HTTP.request("GET", url, {
      responseType: "document",
      headers: { "User-Agent": USER_AGENT },
    });

    if (xhr.status !== 200) {
      throw new Error(`Failed to fetch page: ${xhr.status}`);
    }

    const iframe = xhr.responseXML?.querySelector("iframe");
    if (iframe) {
      const iframeSrc = iframe.getAttribute("src");
      if (iframeSrc && iframe.id !== "pdf") {
        const absolute = new URL(iframeSrc, url).href;
        return this.updateItem(absolute, item, progressWin);
      }
    }

    const pdfElement = xhr.responseXML?.querySelector("#pdf");
    let pdfUrl = pdfElement?.getAttribute("src") || undefined;

    if (!pdfUrl) {
      const links = Array.from(
        xhr.responseXML?.querySelectorAll("a[href]") || [],
      ) as Element[];
      const pdfLink = links.find((link) => {
        const href = link.getAttribute("href") || "";
        return href.endsWith(".pdf") || href.includes("/pdf/");
      });
      pdfUrl = pdfLink?.getAttribute("href") || undefined;
    }

    if (pdfUrl && !pdfUrl.startsWith("http") && !pdfUrl.startsWith("//")) {
      pdfUrl = new URL(pdfUrl, url).href;
    }

    const body = xhr.responseXML?.querySelector("body");

    if (!pdfUrl || this.isPdfNotAvailable(body)) {
      throw new PdfNotFoundError(`PDF not available at ${url}`);
    }

    if (pdfUrl.startsWith("//")) {
      pdfUrl = `https:${pdfUrl}`;
    } else if (pdfUrl.startsWith("http:")) {
      pdfUrl = pdfUrl.replace("http:", "https:");
    }

    await this.attachPdfToItem(pdfUrl, item);

    progressWin.changeLine({
      text: `Downloaded PDF for "${item.getField("title")}"`,
      type: "success",
    });
  }

  private isPdfNotAvailable(body: Element | null | undefined): boolean {
    if (!body) return true;

    const innerHTML = String(body.innerHTML || "");
    if (!innerHTML.trim()) return true;

    const errorPatterns = [
      /Please try to search again using DOI/im,
      /статья не найдена в базе/im,
      /article not found/i,
      /sci-hub has no access to this paper/i,
      /no paper with this doi/i,
      /not found in database/i,
      /file not found/i,
    ];

    return errorPatterns.some((pattern) => pattern.test(innerHTML));
  }

  private async attachPdfToItem(
    pdfUrl: string,
    item: Zotero.Item,
  ): Promise<void> {
    const filename =
      new URL(pdfUrl).pathname.split("/").pop() || `${item.key}.pdf`;

    await Zotero.Attachments.importFromURL({
      libraryID: item.libraryID,
      url: pdfUrl,
      parentItemID: item.id,
      title: item.getField("title") as string,
      fileBaseName: filename.replace(/\.pdf$/i, ""),
      contentType: "application/pdf",
      referrer: this.getEndpoint(),
    });
  }

  private showProgressWindow(
    message: string,
    type: "success" | "fail" | "default" = "default",
  ) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({ text: message, type })
      .show();
  }
}
