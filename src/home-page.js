import './font-faces.css'
import './home-page.css'
import './site-runtime.js'
import './language.js'

const v = document.getElementById('storyVideo')
const b = document.getElementById('storyPlay')
// Speelt zonder geluid af zodra de video in beeld komt; de knop zet het geluid aan of pauzeert.
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) v.play().catch(() => {})
  else v.pause()
}, { threshold: 0.25 }).observe(v)
b.textContent = '🔊 Geluid aan'
b.onclick = () => {
  if (v.muted) { v.muted = false; v.play(); b.textContent = '❚❚ Pauze' }
  else if (v.paused) { v.play(); b.textContent = '❚❚ Pauze' }
  else { v.pause(); b.textContent = '▶ Afspelen' }
}


const socialPhones = document.querySelector('.social-phones')
if (socialPhones && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  socialPhones.addEventListener('pointermove', (event) => {
    const box = socialPhones.getBoundingClientRect()
    socialPhones.style.setProperty('--mx', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3))
    socialPhones.style.setProperty('--my', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3))
  })
  socialPhones.addEventListener('pointerleave', () => {
    socialPhones.style.setProperty('--mx', '0')
    socialPhones.style.setProperty('--my', '0')
  })
}

// Foto met diepte: de zolen, de bal en de achtergrond schuiven verschillend mee, zodat je er een beetje omheen kijkt.
const zolLook = document.querySelector('#zolLook')
if (zolLook && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const fallback = zolLook.querySelector('.look-fb')
  const canvas = zolLook.querySelector('.look-gl')
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  const vertexSource = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;v.y=1.-v.y;gl_Position=vec4(p,0.,1.);}'
  const fragmentSource = 'precision highp float;varying vec2 v;uniform sampler2D img,dep;uniform vec2 off;void main(){vec2 uv=(v-.5)/1.08+.5;float d=texture2D(dep,uv).r;for(int i=0;i<5;i++){d=texture2D(dep,clamp(uv+off*(d-.45),0.,1.)).r;}vec2 u2=clamp(uv+off*(d-.45),0.,1.);gl_FragColor=vec4(texture2D(img,u2).rgb,1.);}'
  const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); return shader }
  let program = null
  if (gl) {
    program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) program = null
  }
  if (program) {
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const offset = gl.getUniformLocation(program, 'off')
    gl.uniform1i(gl.getUniformLocation(program, 'img'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'dep'), 1)
    const upload = (unit, image) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      for (const [name, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, name, value)
    }
    let targetX = 0, targetY = 0, currentX = 0, currentY = 0, lastPointer = -1e9, visible = false, running = false, loaded = false
    const resize = () => {
      const box = zolLook.getBoundingClientRect(), ratio = Math.min(2, devicePixelRatio || 1)
      canvas.width = Math.round(box.width * ratio)
      canvas.height = Math.round(box.height * ratio)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    const point = (event) => {
      const box = zolLook.getBoundingClientRect()
      targetX = (event.clientX - box.left) / box.width * 2 - 1
      targetY = (event.clientY - box.top) / box.height * 2 - 1
      lastPointer = performance.now()
    }
    const frame = (time) => {
      if (!visible) { running = false; return }
      if (time - lastPointer > 2200) { targetX = Math.sin(time / 1700) * .55; targetY = Math.cos(time / 2300) * .3 }
      currentX += (targetX - currentX) * .08
      currentY += (targetY - currentY) * .08
      gl.uniform2f(offset, currentX * .045, currentY * .03)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      requestAnimationFrame(frame)
    }
    const load = () => {
      loaded = true
      const photo = new Image(), depth = new Image()
      let ready = 0
      const done = () => {
        if (++ready < 2) return
        resize()
        addEventListener('resize', resize)
        gl.uniform2f(offset, 0, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        canvas.hidden = false
        requestAnimationFrame(() => requestAnimationFrame(() => { fallback.style.visibility = 'hidden' }))
        if (visible && !running) { running = true; requestAnimationFrame(frame) }
      }
      photo.onload = () => { upload(0, photo); done() }
      depth.onload = () => { upload(1, depth); done() }
      photo.src = '/media/zol-parallax-foto.jpg'
      depth.src = '/media/zol-parallax-diepte.png'
    }
    zolLook.addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse' || event.buttons) point(event) })
    zolLook.addEventListener('pointerdown', point)
    zolLook.addEventListener('pointerleave', () => { lastPointer = performance.now() - 1500 })
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !loaded) load()
      if (visible && loaded && !canvas.hidden && !running) { running = true; requestAnimationFrame(frame) }
    }, { rootMargin: '120px' }).observe(zolLook)
  }
}
