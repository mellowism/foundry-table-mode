import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/module/main.js',
  output: {
    file: 'dist/table-mode.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [resolve()]
};
