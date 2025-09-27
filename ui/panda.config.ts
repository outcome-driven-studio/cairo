import { defineConfig } from '@pandacss/dev';

export default defineConfig({
  preflight: true,
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  theme: {
    extend: {
      tokens: {
        colors: {
          primary: {
            DEFAULT: { value: '#3B82F6' },
            50: { value: '#EFF6FF' },
            100: { value: '#DBEAFE' },
            200: { value: '#BFDBFE' },
            300: { value: '#93BBFC' },
            400: { value: '#60A5FA' },
            500: { value: '#3B82F6' },
            600: { value: '#2563EB' },
            700: { value: '#1D4ED8' },
            800: { value: '#1E40AF' },
            900: { value: '#1E3A8A' },
          },
        },
      },
    },
  },
  outdir: 'styled-system',
  jsxFramework: 'react',
});