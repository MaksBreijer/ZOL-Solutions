import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        product: resolve(import.meta.dirname, 'product/index.html'),
        contact: resolve(import.meta.dirname, 'contact/index.html'),
        checkout: resolve(import.meta.dirname, 'checkout/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
})
