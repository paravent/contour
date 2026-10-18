import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// Relative base so the site works from a GitHub Pages project path.
export default defineConfig({
  base: './',
  plugins: [preact()],
})
