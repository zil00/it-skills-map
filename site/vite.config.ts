import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages serves the site at https://zil00.github.io/it-skills-map/
export default defineConfig({
  base: '/it-skills-map/',
  plugins: [react(), tailwindcss()],
})
