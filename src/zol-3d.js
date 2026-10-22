// 3D-zool: een gebogen plaat (arch + hielkom) met de echte productfoto als huid. Sleep om te draaien.
import {
  AmbientLight, Color, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, SRGBColorSpace, Scene, TextureLoader, WebGLRenderer,
} from 'three'

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// t: 0 = voorkant (afgeknipt, onderkant van de foto), 1 = hielkant (bovenkant van de foto). u: -1..1 dwars over de zool.
const bend = (t, u) => 0.07 * Math.sin(Math.PI * Math.min(1, t / 0.75)) * (1 - smooth(0.7, 1, t)) // lichte boog onder de voet
  + 0.16 * smooth(0.55, 1, t) ** 1.6 // hiel komt omhoog
  + 0.1 * u * u * smooth(0.45, 1, t) // zijkanten krullen op: hielkom

export function mountZol3d(stage, { top, mask }) {
  const canvas = document.createElement('canvas')
  canvas.className = 'spin-canvas'
  stage.prepend(canvas)
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 0.1, 20)
  camera.position.set(0, 1.35, 2.1)
  camera.lookAt(0, 0, 0)

  scene.add(new HemisphereLight(0xffffff, 0xb9c6d8, 1.5))
  const key = new DirectionalLight(0xffffff, 1.6)
  key.position.set(1.5, 2.5, 2.5)
  scene.add(key)
  scene.add(new AmbientLight(0xffffff, 0.35))

  const loader = new TextureLoader()
  const [map, alpha] = [top, mask].map((src) => new Promise((resolve, reject) => loader.load(src, resolve, undefined, reject)))

  return Promise.all([map, alpha]).then(([mapTex, maskTex]) => {
    mapTex.colorSpace = SRGBColorSpace
    const aspect = mapTex.image.width / mapTex.image.height
    const height = 1.35
    const width = height * aspect

    const geometry = new PlaneGeometry(width, height, 36, 90)
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + height / 2) / height
      const u = pos.getX(i) / (width / 2)
      pos.setZ(i, bend(t, u))
    }
    geometry.computeVertexNormals()

    // Boven: de foto. Daaronder een paar lagen voor dikte, onderop het rode schuim.
    const layers = [
      { color: 0xffffff, map: mapTex, dz: 0 },
      { color: 0x6f9be0, dz: -0.006 },
      { color: 0x4c78c9, dz: -0.012 },
      { color: 0xd85a4a, dz: -0.018 },
      { color: 0xc4493a, dz: -0.024 },
    ]
    const model = new Group()
    layers.forEach(({ color, map: layerMap, dz }) => {
      const material = new MeshStandardMaterial({
        color: new Color(color), map: layerMap, alphaMap: maskTex, alphaTest: 0.5, side: DoubleSide, roughness: 0.62, metalness: 0,
      })
      const mesh = new Mesh(geometry, material)
      mesh.position.z = dz
      model.add(mesh)
    })

    const pivot = new Group() // draait om de verticale as
    const tilt = new Group() // liggend, schuin naar de kijker toe
    tilt.rotation.x = -Math.PI / 2
    model.position.set(0, 0, -0.04)
    tilt.add(model)
    pivot.add(tilt)
    scene.add(pivot)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = stage
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    new ResizeObserver(resize).observe(stage)
    resize()

    let yaw = 0.6
    let velocity = 0
    let dragging = false
    let lastX = 0
    let auto = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let visible = true

    stage.addEventListener('pointerdown', (event) => {
      dragging = true
      auto = false
      lastX = event.clientX
      stage.setPointerCapture(event.pointerId)
      stage.classList.add('is-dragging')
    })
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return
      const delta = ((event.clientX - lastX) / stage.clientWidth) * Math.PI * 2
      lastX = event.clientX
      yaw += delta
      velocity = delta
    })
    const end = () => { dragging = false; stage.classList.remove('is-dragging') }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      auto = false
      velocity += event.key === 'ArrowRight' ? 0.12 : -0.12
    })

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }).observe(stage)

    const frame = () => {
      requestAnimationFrame(frame)
      if (!visible) return
      if (!dragging) {
        yaw += auto ? 0.006 : velocity
        velocity *= 0.94
      }
      pivot.rotation.y = yaw
      renderer.render(scene, camera)
    }
    frame()

    // Alleen tijdens ontwikkelen: losse beelden renderen voor een video (scripts/render-draaivideo.mjs).
    if (import.meta.env.DEV) {
      window.__zol3d = {
        shot(angle, w, h, bob = 0) {
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.position.set(0, (1.35 + bob) * 1.75, 2.1 * 1.75)
          camera.lookAt(0, 0, 0)
          camera.updateProjectionMatrix()
          pivot.rotation.y = angle
          renderer.render(scene, camera)
          return canvas.toDataURL('image/png')
        },
      }
    }
    return true
  })
}
