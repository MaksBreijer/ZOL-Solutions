export function trackingRemovalUpdate() {
  return {
    tracking_code: '',
    tracking_carrier: '',
    tracking_url: '',
    tracking_destination: { type: 'customer' },
  }
}

export function normalizeTrackingDestination(destination = {}) {
  if (destination?.type !== 'physio') return { type: 'customer' }
  return {
    type: 'physio',
    practice_name: String(destination.practice_name || '').trim(),
    contact_name: String(destination.contact_name || '').trim(),
    email: String(destination.email || '').trim().toLowerCase(),
    street: String(destination.street || '').trim(),
    postal_code: String(destination.postal_code || '').trim().toUpperCase(),
    city: String(destination.city || '').trim(),
    country: String(destination.country || 'NL').trim().toUpperCase() || 'NL',
  }
}

export function trackingDestinationFromForm(values = {}) {
  if (values.tracking_destination_type !== 'physio') return { type: 'customer' }
  return normalizeTrackingDestination({
    type: 'physio',
    practice_name: values.physio_practice_name,
    contact_name: values.physio_contact_name,
    email: values.physio_email,
    street: values.physio_street,
    postal_code: values.physio_postal_code,
    city: values.physio_city,
    country: 'NL',
  })
}

export function trackingDestinationLabel(destination = {}) {
  const normalized = normalizeTrackingDestination(destination)
  if (normalized.type === 'customer') return 'Klant'
  return normalized.practice_name || normalized.contact_name || 'Fysio'
}
