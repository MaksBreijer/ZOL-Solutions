const apiUrl = import.meta.env.VITE_SUPABASE_URL
const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function headers(extra = {}) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  }
}

async function responseData(response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

export async function selectPublic(path) {
  if (!apiUrl || !apiKey) return { data: null, error: new Error('De publieke API is niet geconfigureerd.') }
  try {
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, { headers: headers() })
    const data = await responseData(response)
    return response.ok ? { data, error: null } : { data: null, error: new Error(data?.message || 'Ophalen mislukt.') }
  } catch (error) { return { data: null, error } }
}

export async function insertPublic(table, value) {
  if (!apiUrl || !apiKey) return { error: new Error('De publieke API is niet geconfigureerd.') }
  try {
    const response = await fetch(`${apiUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(value),
      keepalive: true,
    })
    const data = await responseData(response)
    return response.ok ? { data, error: null } : { data: null, error: new Error(data?.message || 'Opslaan mislukt.') }
  } catch (error) { return { data: null, error } }
}

export async function invokePublicFunction(name, body) {
  if (!apiUrl || !apiKey) return { data: null, error: new Error('De publieke API is niet geconfigureerd.') }
  try {
    const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    const data = await responseData(response)
    return response.ok ? { data, error: null } : { data, error: new Error(data?.error || 'Versturen mislukt.') }
  } catch (error) { return { data: null, error } }
}
