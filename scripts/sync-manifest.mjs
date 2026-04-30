import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('./module.json', 'utf8'));

manifest.version = pkg.version;
manifest.esmodules = [`dist/table-mode-v${pkg.version}.js`];

writeFileSync('./module.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ module.json synced — version=${pkg.version}, esmodules=${manifest.esmodules[0]}`);
