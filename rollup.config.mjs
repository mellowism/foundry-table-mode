import resolve from '@rollup/plugin-node-resolve';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
  input: 'src/module/main.js',
  output: {
    file: `dist/table-mode-v${pkg.version}.js`,
    format: 'es',
    sourcemap: true
  },
  plugins: [resolve()]
};
