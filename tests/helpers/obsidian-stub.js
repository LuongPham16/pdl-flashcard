/**
 * Minimal Obsidian API stub used by the test suite.
 *
 * Only the surface the plugin actually touches is implemented, so the tests run
 * in plain Node without Obsidian or Electron.
 */

/** Every modal opened during a test, in order, so tests can inspect its DOM. */
export const openedModals = [];

export class Events {
  constructor() { this._handlers = new Map(); }
  on(name, fn) {
    if (!this._handlers.has(name)) this._handlers.set(name, []);
    this._handlers.get(name).push(fn);
    return fn;
  }
  off(name, fn) {
    const list = this._handlers.get(name) || [];
    this._handlers.set(name, list.filter(item => item !== fn));
  }
  trigger(name, ...args) { for (const fn of this._handlers.get(name) || []) fn(...args); }
}

export const notices = [];
export const renderedCalls = [];
/** The plugin's prompts are persisted through this flag store in some tests. */
export const settingWrites = [];

export class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest || {};
    this._data = null;
  }
  async loadData() { return this._data; }
  async saveData(data) { this._data = JSON.parse(JSON.stringify(data)); settingWrites.push(data); }
  registerView() {}
  addRibbonIcon() {}
  addCommand() {}
  addSettingTab() {}
  registerEvent() {}
  registerDomEvent() {}
  registerMarkdownCodeBlockProcessor() {}
}

/**
 * `ItemView` with the same `containerEl.children[1]` content slot the real view
 * uses, so dashboard/review rendering can be exercised in Node.
 */
export class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf && leaf.app;
    this.containerEl = document.createElement("div");
    this.containerEl.appendChild(document.createElement("div"));
    this.containerEl.appendChild(document.createElement("div"));
  }
  registerEvent() {}
  registerDomEvent() {}
  addChild() {}
  load() {}
  unload() {}
}

/**
 * Modal stub: `open()` builds `modalEl`/`contentEl` and awaits `onOpen`, which
 * lets tests drive a dialog exactly like a user would. `open()` returns the
 * onOpen promise, so `await command.callback()` settles the rendered dialog.
 */
export class Modal {
  constructor(app) {
    this.app = app;
    this.modalEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.isOpen = false;
  }
  open() {
    this.isOpen = true;
    openedModals.push(this);
    this._openPromise = Promise.resolve(this.onOpen ? this.onOpen() : undefined);
    return this._openPromise;
  }
  close() {
    this.isOpen = false;
    if (this.onClose) this.onClose();
  }
}

export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
}

export class Setting {
  constructor(containerEl) { this.containerEl = containerEl; }
  setName() { return this; }
  setDesc() { return this; }
  addText(cb) { cb({ setValue: () => this, setPlaceholder: () => this, onChange: () => this, inputEl: document.createElement("input") }); return this; }
  addTextArea(cb) { cb({ setValue: () => this, setPlaceholder: () => this, onChange: () => this }); return this; }
  addButton(cb) { cb({ setButtonText: () => this, setCta: () => this, onClick: () => this }); return this; }
  addDropdown(cb) { cb({ addOption: () => this, setValue: () => this, onChange: () => this }); return this; }
  addSlider(cb) { cb({ setLimits: () => this, setDynamicTooltip: () => this, setValue: () => this, onChange: () => this }); return this; }
  addExtraButton(cb) { cb({ setIcon: () => this, setTooltip: () => this, onClick: () => this }); return this; }
  addToggle(cb) { cb({ setValue: () => this, onChange: () => this }); return this; }
}

export class Notice {
  constructor(message) { notices.push(String(message)); }
}

/** Records every call so tests can assert on the Markdown passed in. */
export const MarkdownRenderer = {
  async render(app, markdown, el, sourcePath) {
    renderedCalls.push({ markdown, sourcePath });
    const escaped = String(markdown)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    el.innerHTML = `<p>${escaped}</p>`;
  }
};

/**
 * Network gate. `requestUrl` itself is a module binding (read-only), so tests
 * install a handler on this mutable state object instead of reassigning it.
 */
export const requestUrlState = { handler: null, calls: [] };
export async function requestUrl(options) {
  requestUrlState.calls.push(options);
  if (requestUrlState.handler) return requestUrlState.handler(options);
  throw new Error("network disabled in tests");
}

export function setIcon() {}
export function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
export function moment() { return new Date(); }
export class Component {
  registerEvent() {}
  registerDomEvent() {}
  addChild() {}
  load() {}
  unload() {}
}
export class MarkdownView {}
export class TFile {}
export class TFolder {}
export class WorkspaceLeaf {}
export const Platform = { isDesktopApp: true };
