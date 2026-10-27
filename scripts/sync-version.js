#!/usr/bin/env node
/**
 * Keeps manifest.json and versions.json in sync after `npm version`.
 *
 * - `manifest.json` takes its version from package.json.
 * - `versions.json` gains an entry mapping the new version to `minAppVersion`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const write = (file, data) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data, null, 2)}\n`);

const pkg = read("package.json");
const manifest = read("manifest.json");
const versions = read("versions.json");

manifest.version = pkg.version;
versions[pkg.version] = manifest.minAppVersion;

write("manifest.json", manifest);
write("versions.json", versions);

console.log(`[version] manifest.json and versions.json set to ${pkg.version} (minAppVersion ${manifest.minAppVersion})`);
