import './main.js'
import 'leaflet/dist/leaflet.css'
import './verkooppunten.css'
import L from 'leaflet'

const partners = {
  smc: { name: 'Sportmedisch Centrum Almere', type: 'Sportarts & fysiotherapie', phone: '' },
  kidscare: { name: 'B&B Kidscare', type: 'Kinderzorg', phone: '085 301 39 03' },
}
const places = [
  { id: 'smc', partner: 'smc', city: 'Almere', label: 'SMC Almere', address: 'Louis Armstrongweg 110, 1311 RL Almere', lat: 52.3672727, lng: 5.1876603 },
  { id: 'leyenburg', partner: 'kidscare', city: 'Den Haag', label: 'Leyenburg', address: 'Volendamlaan 660, 2547 CK Den Haag', lat: 52.0624264, lng: 4.269883 },
  { id: 'loosduinen', partner: 'kidscare', city: 'Den Haag', label: 'Loosduinen', address: 'Loosduinse Hoofdstraat 260, 2552 AM Den Haag', lat: 52.0534376, lng: 4.2357732 },
  { id: 'hendrik', partner: 'kidscare', city: 'Den Haag', label: 'Prins Hendrikplein', address: 'Prins Hendrikplein 3, 2518 JA Den Haag', lat: 52.0829052, lng: 4.2951025 },
  { id: 'maurits', partner: 'kidscare', city: 'Den Haag', label: 'Prins Mauritsplein', address: 'Prins Mauritsplein 24, 2582 ND Den Haag', lat: 52.0954625, lng: 4.2782739 },
  { id: 'werkhoven', partner: 'kidscare', city: 'Den Haag', label: 'Werkhoven', address: 'Werkhovenstraat 80, 2546 VJ Den Haag', lat: 52.059155, lng: 4.2719232 },
]

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const route = (p) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${partners[p.partner].name} ${p.address}`)}`

const map = L.map('vp-map', { scrollWheelZoom: false, zoomControl: false, attributionControl: true })
L.control.zoom({ position: 'bottomright' }).addTo(map)
const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_'
L.tileLayer(`${esri}Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: 'Kaart &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap' }).addTo(map)
L.tileLayer(`${esri}Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map)

const icon = (active) => L.divIcon({ className: `vp-marker${active ? ' is-active' : ''}`, html: '<span></span>', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] })
const list = document.getElementById('vp-items')
const markers = {}
let activeId = null

function popup(p) {
  const partner = partners[p.partner]
  return `<div class="vp-pop"><small>${esc(partner.name)}</small><strong>${esc(p.label)}</strong><span>${esc(p.address)}</span><a href="${route(p)}" target="_blank" rel="noopener noreferrer">Route plannen ↗</a></div>`
}

function select(id, { fly = true } = {}) {
  activeId = id
  for (const p of places) markers[p.id].setIcon(icon(p.id === id))
  list.querySelectorAll('.vp-item').forEach((el) => el.classList.toggle('is-active', el.dataset.id === id))
  const p = places.find((x) => x.id === id)
  if (fly) map.flyTo([p.lat, p.lng], 15, { duration: 0.8 })
  markers[id].openPopup()
  list.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

for (const p of places) {
  const partner = partners[p.partner]
  markers[p.id] = L.marker([p.lat, p.lng], { icon: icon(false), title: `${partner.name} ${p.label}` }).addTo(map).bindPopup(popup(p), { closeButton: false })
  markers[p.id].on('click', () => select(p.id, { fly: false }))
  const li = document.createElement('li')
  li.className = 'vp-item'
  li.dataset.id = p.id
  li.dataset.city = p.city
  li.innerHTML = `<button type="button" class="vp-item-main"><span class="vp-tag">${esc(p.city)} · ${esc(partner.type)}</span><strong>${esc(partner.name)}</strong><span class="vp-place">${esc(p.label)}</span><span class="vp-addr">${esc(p.address)}</span></button>
    <div class="vp-actions"><a href="${route(p)}" target="_blank" rel="noopener noreferrer">Route ↗</a>${partner.phone ? `<a href="tel:${partner.phone.replace(/\s/g, '')}">Bel ${esc(partner.phone)}</a>` : ''}</div>`
  li.querySelector('.vp-item-main').addEventListener('click', () => select(p.id))
  list.append(li)
}

function fit(city) {
  const shown = places.filter((p) => city === 'alle' || p.city === city)
  map.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 15 })
}
document.querySelectorAll('.vp-filter button').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.vp-filter button').forEach((b) => b.classList.toggle('is-on', b === btn))
  const city = btn.dataset.filter
  list.querySelectorAll('.vp-item').forEach((el) => { el.hidden = city !== 'alle' && el.dataset.city !== city })
  map.closePopup()
  fit(city)
}))
fit('alle')
map.on('focus', () => map.scrollWheelZoom.enable())
map.on('blur', () => map.scrollWheelZoom.disable())
