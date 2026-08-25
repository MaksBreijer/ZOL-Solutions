import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('De Supabase-omgeving is niet geconfigureerd.')
}

const authMemoryStorage = new Map()
const safeAuthStorage = {
  getItem(key) {
    try { return window.localStorage.getItem(key) ?? authMemoryStorage.get(key) ?? null }
    catch { return authMemoryStorage.get(key) ?? null }
  },
  setItem(key, value) {
    authMemoryStorage.set(key, value)
    try { window.localStorage.setItem(key, value) } catch { /* Safari privémodus gebruikt tijdelijk geheugen. */ }
  },
  removeItem(key) {
    authMemoryStorage.delete(key)
    try { window.localStorage.removeItem(key) } catch { /* Tijdelijke opslag is al gewist. */ }
  },
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: safeAuthStorage,
  },
})

export const formatMoney = (cents = 0, currency = 'EUR') =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(Number(cents || 0) / 100)

export const formatDate = (value, options = {}) =>
  new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(value))
