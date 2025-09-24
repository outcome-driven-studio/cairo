import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default [
  // ES module build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cairo.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        sourceMap: true,
      }),
    ],
  },
  // UMD build for browsers
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cairo.min.js',
      format: 'umd',
      name: 'Cairo',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
      }),
      production && terser({
        compress: {
          drop_console: false,
          drop_debugger: true,
        },
        format: {
          comments: false,
        },
      }),
    ],
  },
  // Snippet build (minimal loader)
  {
    input: 'src/snippet.ts',
    output: {
      file: 'dist/snippet.js',
      format: 'iife',
      name: 'CairoSnippet',
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
      }),
      production && terser(),
    ],
  },
];