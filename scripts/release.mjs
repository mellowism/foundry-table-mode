#!/usr/bin/env node
/**
 * Release pipeline:
 *   1. Pre-flight (on main, tag doesn't exist)
 *   2. npm run build (rimraf → rollup → sync-manifest)
 *   3. Build zip via scripts/build-zip.ps1
 *   4. Stage + commit (if dirty) + push
 *   5. gh release create with zip attached
 *
 * Usage:
 *   - Edit CHANGELOG.md with new version section
 *   - Bump package.json version
 *   - npm run release
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};
const capture = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); }
  catch { return null; }
};

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const tag = `v${pkg.version}`;

console.log(`\n=== Releasing ${tag} ===`);

// Pre-flight: on main branch
const branch = capture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`✗ Not on main (current: ${branch}). Aborting.`);
  process.exit(1);
}

// Pre-flight: tag doesn't already exist (locally or remote)
const localTag = capture(`git rev-parse ${tag} 2>/dev/null`);
if (localTag) {
  console.error(`✗ Tag ${tag} already exists locally. Bump package.json version first.`);
  process.exit(1);
}
const remoteTag = capture(`git ls-remote --tags origin refs/tags/${tag}`);
if (remoteTag) {
  console.error(`✗ Tag ${tag} already exists on origin. Bump package.json version first.`);
  process.exit(1);
}

// Pre-flight: CHANGELOG mentions this version
const changelog = readFileSync('./CHANGELOG.md', 'utf8');
if (!changelog.includes(`[${pkg.version}]`)) {
  console.error(`✗ CHANGELOG.md has no [${pkg.version}] entry. Add release notes first.`);
  process.exit(1);
}

// 1. Build (rimraf + rollup + sync-manifest)
run('npm run build');

// 2. Zip
run('powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1');

// 3. Git
const status = capture('git status --porcelain');
if (status) {
  run('git add -A');
  run(`git commit -m "${tag} — release"`);
}
run('git push origin main');

// 4. Release notes — extract this version's section from CHANGELOG
const versionSection = (() => {
  const m = changelog.match(new RegExp(`## \\[${pkg.version}\\][\\s\\S]*?(?=\\n## \\[|$)`));
  return m ? m[0].trim() : `Release ${tag}.`;
})();
const notesFile = './release-notes-tmp.md';
import('node:fs').then(fs => {
  fs.writeFileSync(notesFile, versionSection);
  try {
    run(`gh release create ${tag} foundry-table-mode.zip --title "${tag}" --notes-file ${notesFile}`);
  } finally {
    fs.unlinkSync(notesFile);
  }
  console.log(`\n✓ Released ${tag}`);
  console.log(`  https://github.com/mellowism/foundry-table-mode/releases/tag/${tag}`);
});
