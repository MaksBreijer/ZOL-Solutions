import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        product: resolve(import.meta.dirname, 'product/index.html'),
        contact: resolve(import.meta.dirname, 'contact/index.html'),
        knowledge: resolve(import.meta.dirname, 'kennisbank/index.html'),
        sever: resolve(import.meta.dirname, 'kennisbank/ziekte-van-sever/index.html'),
        heelPainChildren: resolve(import.meta.dirname, 'kennisbank/hielpijn-bij-kinderen/index.html'),
        heelPainSports: resolve(import.meta.dirname, 'kennisbank/hielpijn-tijdens-sporten/index.html'),
        severHockey: resolve(import.meta.dirname, 'kennisbank/ziekte-van-sever-hockey/index.html'),
        severFootball: resolve(import.meta.dirname, 'kennisbank/ziekte-van-sever-voetbal/index.html'),
        growingHeelPain: resolve(import.meta.dirname, 'kennisbank/groeipijn-in-de-hiel/index.html'),
        heelPainAfterSports: resolve(import.meta.dirname, 'kennisbank/kind-pijn-aan-hiel-na-sporten/index.html'),
        sportsWithSever: resolve(import.meta.dirname, 'kennisbank/sporten-met-ziekte-van-sever/index.html'),
        severExercises: resolve(import.meta.dirname, 'kennisbank/oefeningen-bij-ziekte-van-sever/index.html'),
        severInsoles: resolve(import.meta.dirname, 'kennisbank/inlegzolen-bij-ziekte-van-sever/index.html'),
        checkout: resolve(import.meta.dirname, 'checkout/index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
        terms: resolve(import.meta.dirname, 'algemene-voorwaarden/index.html'),
        unsubscribe: resolve(import.meta.dirname, 'uitschrijven/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        adminAlias: resolve(import.meta.dirname, 'zolsolutions/admin/index.html'),
      },
    },
  },
})
