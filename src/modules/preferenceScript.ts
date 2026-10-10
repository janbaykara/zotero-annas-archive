import { config } from "../../package.json";
import { getPref } from "../utils/prefs";

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = { window: _window };
  } else {
    addon.data.prefs.window = _window;
  }
  updatePrefsUI();
}

async function updatePrefsUI() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;
  const endpointInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-endpoint`,
  ) as HTMLInputElement | null;

  if (endpointInput && !endpointInput.value) {
    endpointInput.value =
      (getPref("endpoint") as string) || "https://annas-archive.org/scidb/";
  }
}
