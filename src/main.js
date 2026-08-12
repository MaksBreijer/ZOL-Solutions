import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const status = document.querySelector('#supabase-status')
const statusDot = document.querySelector('#supabase-dot')

function updateStatus(message, state) {
  status.textContent = message
  statusDot.classList.toggle('status-dot--online', state === 'online')
  statusDot.classList.toggle('status-dot--warning', state === 'warning')
}

async function verifySupabaseConnection() {
  if (!supabaseUrl || !supabasePublishableKey) {
    updateStatus('Wacht op Cloudflare-variabelen', 'warning')
    return
  }

  createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: supabasePublishableKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Supabase antwoordde met ${response.status}`)
    }

    updateStatus('Supabase verbonden', 'online')
  } catch (error) {
    console.error('Supabase connection check failed:', error)
    updateStatus('Verbinding nog niet beschikbaar', 'warning')
  }
}

verifySupabaseConnection()
