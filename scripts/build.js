#!/usr/bin/env node
/**
 * Build script for PDL Flashcard.
 *
 * Bundles src/index.js into the single CommonJS `main.js` that Obsidian loads,
 * copies `styles.css` next to it, and (optionally) deploys everything into an
 * Obsidian vault plugin folder.
 *
 * Usage:
 *   node scripts/build.js                 # development build (sourcemaps)
 *   node scripts/build.js --production    # minified, for a release
 *   node scripts/build.js --watch         # rebuild on change
 *   node scripts/build.js --deploy        # copy output into the vault
 */
import esbuild from "esbuild";
import { builtinModules } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "dist");
const args = new Set(process.argv.slice(2));
const production = args.has("--production");
const watch = args.has("--watch");
const deploy = args.has("--deploy");

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

/** Copy files Obsidian needs into `dist/`. */
function copyStatic() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "styles.css"), path.join(OUT_DIR, "styles.css"));
  fs.copyFileSync(path.join(ROOT, "manifest.json"), path.join(OUT_DIR, "manifest.json"));
  if (fs.existsSync(path.join(ROOT, "versions.json"))) {
    fs.copyFileSync(path.join(ROOT, "versions.json"), path.join(OUT_DIR, "versions.json"));
  }
  // The repo root is ESM ("type": "module"); mark dist/ as CommonJS so Node (and
  // the test suite) can require the bundle while Obsidian keeps loading main.js.
  fs.writeFileSync(path.join(OUT_DIR, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
}

/** Deploy `dist/` into a vault. Reads OBSIDIAN_VAULT + OBSIDIAN_PLUGIN_DIR, or .deploy.json. */
function deployToVault() {
  let vault = process.env.OBSIDIAN_VAULT;
  let pluginDir = process.env.OBSIDIAN_PLUGIN_DIR || "pdl-flashcard";
  const configPath = path.join(ROOT, ".deploy.json");
  if ((!vault || !pluginDir) && fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    vault = vault || config.vault;
    pluginDir = config.pluginDir || pluginDir;
  }
  if (!vault) {
    console.warn("[deploy] No vault configured. Set OBSIDIAN_VAULT or create .deploy.json.");
    return;
  }
  const target = path.join(vault, ".obsidian", "plugins", pluginDir);
  fs.mkdirSync(target, { recursive: true });
  for (const file of ["main.js", "styles.css", "manifest.json"]) {
    fs.copyFileSync(path.join(OUT_DIR, file), path.join(target, file));
  }
  console.log(`[deploy] Copied main.js, styles.css, manifest.json -> ${target}`);
  console.log("[deploy] Reload Obsidian (Ctrl/Cmd+R) to pick up the new build.");
}

/** Build options shared by one-shot and watch modes. */
const buildOptions = {
  entryPoints: [path.join(ROOT, "src", "index.js")],
  outfile: path.join(OUT_DIR, "main.js"),
  bundle: true,
  format: "cjs",
  target: "es2022",
  platform: "node",
  logLevel: "info",
  external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map(m => `node:${m}`)],
  sourcemap: production ? false : "inline",
  minify: production,
  legalComments: "none",
  // Obsidian reads the plugin as `module.exports = PluginClass`, while the source
  // uses `export default`; this footer bridges the two.
  footer: { js: "module.exports = module.exports.default;" },
  banner: { js: `/* PDL Flashcard v${manifest.version} - https://github.com/ */` }
};

copyStatic();

if (watch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log("[build] Watching src/ for changes…");
} else {
  await esbuild.build(buildOptions);
  const size = fs.statSync(path.join(OUT_DIR, "main.js")).size;
  console.log(`[build] dist/main.js ${(size / 1024).toFixed(1)} KB (${production ? "production" : "development"})`);
  if (deploy) deployToVault();
}
