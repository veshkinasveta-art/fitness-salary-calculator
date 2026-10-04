import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/fitness-salary-calculator/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Зарплата студии',
        short_name: 'Зарплата',
        description: 'Расчёт зарплаты команды фитнес-студии',
        theme_color: '#12372a',
        background_color: '#f5f7f4',
        display: 'standalone',
        start_url: '/fitness-salary-calculator/',
        scope: '/fitness-salary-calculator/',
        lang: 'ru',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
