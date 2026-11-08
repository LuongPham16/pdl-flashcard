/**
 * Publishes the current manifest version of PDL Flashcard to GitHub: pushes master,
 * pushes the version tag and opens a release with main.js, styles.css and manifest.json.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/publish.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OWNER = process.env.GITHUB_OWNER || 'LuongPham16';
const REPO = process.env.GITHUB_REPO || 'pdl-flashcard';
const TOKEN = process.env.GITHUB_TOKEN;
const DRY = process.argv.includes('--dry-run');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

if (!TOKEN && !DRY) {
  console.error('GITHUB_TOKEN is not set.');
  process.exit(1);
}

const API = 'https://api.github.com';
const UPLOAD = 'https://uploads.github.com';
const REMOTE_URL = `https://github.com/${OWNER}/${REPO}.git`;
const PUSH_URL = `https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git`;

const headers = (extra = {}) => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'pdl-flashcard-publish',
  ...extra
});

async function request(url, options = {}) {
  if (DRY) {
    console.log(`[dry-run] ${options.method || 'GET'} ${url}`);
    return { dry: true, status: 0, data: null };
  }
  const response = await fetch(url, { ...options, headers: headers(options.headers) });
  const text = await response.text();
  if (!response.ok && response.status !== 404) {
    throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}\n${text}`);
  }
  return { status: response.status, ok: response.ok, data: text ? safeJson(text) : null };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

function git(args) {
  const shown = args.map((arg) => (arg === PUSH_URL ? REMOTE_URL : arg)).join(' ');
  console.log('$ git', shown);
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (error) {
    const raw = String((error && (error.stderr || error.message)) || error);
    throw new Error(raw.split(TOKEN).join('***'));
  }
}

function releaseNotes() {
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  const pattern = new RegExp(`## \\[?${version.replace(/\./g, '\\.')}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = changelog.match(pattern);
  const section = match ? match[1].trim() : '';
  return `${section}\n\n---\n\n**Install:** copy \`main.js\`, \`manifest.json\` and \`styles.css\` from the assets below into \`<vault>/.obsidian/plugins/pdl-flashcard/\`, then enable the plugin.`;
}

async function main() {
  const repo = await request(`${API}/repos/${OWNER}/${REPO}`);
  if (repo.status === 404) {
    console.log(`creating ${OWNER}/${REPO}`);
    await request(`${API}/user/repos`, {
      method: 'POST',
      body: JSON.stringify({
        name: REPO,
        description: manifest.description,
        private: false,
        has_issues: true,
        has_wiki: false
      })
    });
  } else {
    console.log(`repository ${OWNER}/${REPO} ready`);
  }

  await request(`${API}/repos/${OWNER}/${REPO}`, {
    method: 'PATCH',
    body: JSON.stringify({
      description: manifest.description,
      topics: ['obsidian', 'obsidian-plugin', 'flashcards', 'spaced-repetition', 'active-recall', 'ai']
    })
  });

  if (!DRY) {
    git(['push', PUSH_URL, 'master:master']);
    git(['push', PUSH_URL, `refs/tags/${version}:refs/tags/${version}`, '--force']);
  } else {
    console.log('[dry-run] push master + tag', version);
  }

  const remotes = git(['remote']).split('\n').filter(Boolean);
  if (!remotes.includes('origin')) git(['remote', 'add', 'origin', REMOTE_URL]);
  else git(['remote', 'set-url', 'origin', REMOTE_URL]);

  const existing = await request(`${API}/repos/${OWNER}/${REPO}/releases/tags/${version}`);
  let release = existing.data;
  if (!release || existing.status === 404) {
    const created = await request(`${API}/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: version,
        name: `PDL Flashcard ${version}`,
        body: releaseNotes(),
        draft: false,
        prerelease: false
      })
    });
    release = created.data;
  } else {
    console.log(`release ${version} already exists (#${release.id})`);
  }

  const assets = [
    ['dist/main.js', 'main.js', 'application/javascript'],
    ['dist/styles.css', 'styles.css', 'text/css'],
    ['manifest.json', 'manifest.json', 'application/json']
  ];

  for (const [file, name, type] of assets) {
    if (!fs.existsSync(file)) throw new Error(`missing ${file}; run npm run build:prod first`);
    if (DRY) { console.log(`[dry-run] upload ${file} as ${name}`); continue; }
    const body = fs.readFileSync(path.resolve(file));
    const upload = await fetch(`${UPLOAD}/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': type }),
      body
    });
    if (!upload.ok && upload.status !== 422) {
      throw new Error(`upload ${name} -> ${upload.status}\n${await upload.text()}`);
    }
    console.log(`uploaded ${name}`);
  }

  console.log(`\nrelease: https://github.com/${OWNER}/${REPO}/releases/tag/${version}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
