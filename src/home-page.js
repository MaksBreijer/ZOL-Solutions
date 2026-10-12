import './font-faces.css'
import './home-page.css'
import './site-runtime.js'

      const v = document.getElementById("storyVideo"), b = document.getElementById("storyPlay");
      b.onclick = () => { if (v.paused || v.muted) { v.muted = false; v.play(); b.textContent = "❚❚ Pauze"; } else { v.pause(); b.textContent = "▶ Bekijk met geluid"; } };

    