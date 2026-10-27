/**
 * Test harness: loads the *built* bundle (dist/main.js) with an Obsidian stub so
 * the plugin can be exercised without Obsidian. Rebuilt automatically if stale.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BUNDLE = path.join(ROOT, "dist", "main.js");

/** A tiny DOM good enough for the view helpers. */
export class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.dataset = {};
    this.className = "";
    this._text = "";
    this._html = "";
    this.value = "";
    this.disabled = false;
    this.checked = false;
    this.parentNode = null;
    const set = new Set();
    this.classList = {
      add: c => set.add(c),
      remove: c => set.delete(c),
      contains: c => set.has(c),
      toggle: (c, on) => {
        const next = on === undefined ? !set.has(c) : on !== false;
        if (next) set.add(c); else set.delete(c);
        return next;
      }
    };
  }
  get nodeType() { return 1; }
  get childNodes() { return this.children; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text || this.innerHTML.replace(/<[^>]*>/g, ""); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  createDiv(o) { return this.createEl("div", o); }
  createSpan(o) { return this.createEl("span", o); }
  createEl(tag, o = {}) {
    const el = new El(tag);
    if (o.cls) String(o.cls).split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    if (o.text !== undefined) el.textContent = o.text;
    if (o.attr) {
      Object.assign(el.attrs, o.attr);
      if (o.attr.value !== undefined) el.value = String(o.attr.value);
    }
    el.parentNode = this;
    this.children.push(el);
    return el;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  empty() { this.children = []; this._text = ""; this._html = ""; }
  setText(t) { this.textContent = t; return this; }
  addClass(c) { this.classList.add(c); return this; }
  removeClass(c) { this.classList.remove(c); return this; }
  toggleClass(c, on) { return this.classList.toggle(c, on); }
  setAttr(k, v) {
    this.attrs[k] = v;
    if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = String(v);
    return this;
  }
  getAttr(k) { return this.attrs[k]; }
  click() { if (typeof this.onclick === "function") return this.onclick(); }
  focus() {}
  blur() {}
  scrollIntoView() {}
  addEventListener() {}
  removeEventListener() {}
  contains(target) {
    if (target === this) return true;
    return this.children.some(child => child.contains ? child.contains(target) : false);
  }
  closest(selector) {
    const match = selector.startsWith(".") ? el => el.classList.contains(selector.slice(1)) : el => el.tagName === selector.toUpperCase();
    let node = this;
    while (node) {
      if (match(node)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const parts = String(sel).trim().split(/\s+/).filter(part => part && part !== ">");
    const matches = (el, part) => {
      if (part.startsWith(".")) return el.classList.contains(part.slice(1));
      if (part.startsWith("#")) return el.attrs && el.attrs.id === part.slice(1);
      return el.tagName === part.toUpperCase();
    };
    const out = [];
    const walk = (node, depth) => node.children.forEach(child => {
      if (matches(child, parts[depth])) {
        if (depth === parts.length - 1) out.push(child);
        else walk(child, depth + 1);
      }
      walk(child, 0);
    });
    walk(this, 0);
    return out;
  }
  get isConnected() { return true; }
  get parentElement() { return this.parentNode; }
  get ownerDocument() { return { defaultView: globalThis.window }; }
  getBoundingClientRect() { return { width: 900, height: 600, x: 0, y: 0, bottom: 600, right: 900 }; }
}

/** Install globals the bundle expects (document/window). */
export function installDom() {
  globalThis.document = {
    createElement: tag => new El(tag),
    createDocumentFragment: () => new El("fragment"),
    createTextNode: text => {
      const node = new El("#text");
      node.nodeType = 3;
      node.nodeValue = text;
      node.textContent = text;
      return node;
    },
    addEventListener() {},
    removeEventListener() {},
    body: new El("body")
  };
  const spoken = [];
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    speechSynthesis: {
      cancel() {},
      speak(utterance) { spoken.push(utterance); }
    },
    // Cross-file state: other test files may reinstall the DOM, so tests read
    // the currently active window instead of a module-load snapshot.
    __spoken: spoken
  };
  globalThis.speechSynthesis = globalThis.window.speechSynthesis;
  globalThis.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; this.lang = ""; }
  };
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  return { spoken };
}

/** A fake vault backed by a Map of path -> content. */
export function createVault(initial = {}) {
  const files = new Map(Object.entries(initial));
  const folders = new Set();
  const fileOf = p => {
    const name = p.split("/").pop();
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    return {
      path: p,
      extension: name.includes(".") ? name.split(".").pop() : "",
      basename: name.replace(/\.[^.]+$/, ""),
      name,
      parent: dir ? { path: dir, name: dir.split("/").pop() } : null
    };
  };
  const vault = {
    files,
    folders,
    getMarkdownFiles: () => [...files.keys()].filter(p => p.endsWith(".md")).map(fileOf),
    getAbstractFileByPath: p => (files.has(p) ? fileOf(p) : null),
    async cachedRead(file) { return files.get(file.path) ?? ""; },
    async read(file) { return files.get(file.path) ?? ""; },
    async modify(file, data) {
      if (!files.has(file.path)) throw new Error(`Cannot modify missing file ${file.path}`);
      files.set(file.path, data);
    },
    async create(p, data) {
      if (files.has(p)) throw new Error(`File already exists: ${p}`);
      files.set(p, data);
      return fileOf(p);
    },
    async createFolder(p) { folders.add(p); },
    adapter: {
      async exists(p) { return files.has(p) || folders.has(p); },
      async write(p, data) { files.set(p, data); },
      async mkdir(p) { folders.add(p); },
      async list(dir) {
        const prefix = `${dir}/`;
        return {
          files: [...files.keys()].filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes("/")),
          folders: [...folders].filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
        };
      },
      async remove(p) { files.delete(p); }
    }
  };
  return vault;
}

export function createApp(initial = {}) {
  const vault = createVault(initial);
  const handlers = new Map();
  const leaves = [];
  const openedFiles = [];
  const viewStates = [];
  const app = {
    vault,
    workspace: {
      on: (name, fn) => {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(fn);
        return { fn };
      },
      getLeavesOfType: type => leaves.filter(leaf => !type || leaf.viewType === type),
      getActiveFile: () => app.workspace.activeFile || null,
      getLeaf: () => {
        const leaf = {
          app,
          viewType: null,
          async setViewState(state) { leaf.viewType = state.type; viewStates.push(state); },
          openFile(file) { openedFiles.push(file); }
        };
        leaves.push(leaf);
        return leaf;
      },
      revealLeaf: async () => {},
      detachLeavesOfType: () => {},
      trigger: (name, ...args) => (handlers.get(name) || []).forEach(fn => fn(...args))
    },
    _leaves: leaves,
    _openedFiles: openedFiles,
    _viewStates: viewStates
  };
  return app;
}

/** Load the bundle as a CommonJS module with `obsidian` resolved to the stub. */
export function loadBundle() {
  if (!fs.existsSync(BUNDLE)) throw new Error("dist/main.js missing - run `npm run build` first");
  const stub = path.join(ROOT, "tests", "helpers", "obsidian-stub.js");
  const require = createRequire(import.meta.url);
  // Redirect the "obsidian" bare import to the local stub via a temporary shim module.
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdl-shim-"));
  const shimFile = path.join(shimDir, "obsidian.js");
  fs.writeFileSync(shimFile, `module.exports = require(${JSON.stringify(stub.replace(/\\/g, "/"))});`);
  const originalResolve = require("node:module")._resolveFilename;
  require("node:module")._resolveFilename = function (request, ...rest) {
    if (request === "obsidian") return shimFile;
    return originalResolve.call(this, request, ...rest);
  };
  delete require.cache[BUNDLE];
  const loaded = require(BUNDLE);
  return { PluginClass: loaded, stub: require(shimFile) };
}

/** Depth-first walk over an element tree (the fake DOM has no real NodeList). */
export function visit(root, fn) {
  for (const child of root.children || []) {
    fn(child);
    visit(child, fn);
  }
}

/** Aggregated text of an element and all of its descendants. */
export function textOf(el) {
  const own = el._text || "";
  return [own, ...(el.children || []).map(textOf)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** First descendant whose aggregated text contains `text`, optionally filtered by tag. */
export function findByText(root, text, tag) {
  let hit = null;
  visit(root, el => {
    if (hit) return;
    if (tag && el.tagName !== tag.toUpperCase()) return;
    if (textOf(el).includes(text)) hit = el;
  });
  return hit;
}

/** Fresh plugin instance with default settings. */
export function makePlugin(PluginClass, stub, { app = createApp(), settings = {} } = {}) {
  const plugin = new PluginClass(app, { dir: "pdl-flashcard" });
  plugin.settings = {
    outputFolder: "06 - Flashcards",
    sourceFolders: [],
    excludedFolders: [],
    sessionSize: 12,
    minAnswerLength: 36,
    requeueForgotten: true,
    requeueLimit: 2,
    leechThreshold: 8,
    maxIntervalDays: 36500,
    schedule: {},
    reviews: [],
    streakDates: [],
    aiPrompts: [],
    selectedPromptId: "default",
    ai: { provider: "openai", apiKeys: {}, endpoints: {}, models: {}, apiKey: "" },
    ...settings
  };
  plugin.getView = () => null;
  return plugin;
}

/**
 * Load the plugin, capture the view class it registers, then open a view.
 * `onload` owns the real defaults, so test settings are applied afterwards.
 */
export async function createView(plugin, settings = {}) {
  let ViewClass = null;
  plugin.registerView = (type, factory) => { ViewClass = factory({ app: plugin.app }).constructor; };
  plugin.addCommand = () => {};
  plugin.addSettingTab = () => {};
  plugin.addRibbonIcon = () => {};
  plugin.registerEvent = () => {};
  plugin.registerDomEvent = () => {};
  plugin.registerMarkdownCodeBlockProcessor = () => {};
  plugin.ensureOutputFolder = async () => {};
  plugin.autoBackup = async () => {};
  await plugin.onload();
  Object.assign(plugin.settings, settings);
  const view = new ViewClass({ app: plugin.app }, plugin);
  await view.onOpen();
  return view;
}

export { ROOT };
