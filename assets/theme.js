(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const updateScrollScenes = () => {
    document.querySelectorAll("[data-scroll-scene]").forEach((scene) => {
      const rect = scene.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = clamp(-rect.top / travel, 0, 1);
      scene.style.setProperty("--scroll-progress", progress.toFixed(4));
    });
  };

  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updateScrollScenes();
      ticking = false;
    });
  };

  updateScrollScenes();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  document.addEventListener("shopify:section:load", updateScrollScenes);
})();
