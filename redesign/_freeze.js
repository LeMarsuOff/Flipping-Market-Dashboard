// Browser-side script injected by single-file-cli during capture.
// Freezes <canvas> elements as <img> data URLs and closes auto-opened panels.
(async () => {
  try {
    // Wait for dashboard to settle (charts may render async after networkidle)
    await new Promise(r => setTimeout(r, 3500));

    // Close auto-opened account / data-hub / theme panels
    document.querySelectorAll('.account-panel, .data-hub-panel, .theme-editor-panel, .topbar-more-menu').forEach(p => {
      p.classList.add('is-hidden');
      p.classList.remove('is-open');
    });

    // Wait a frame for any re-render
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 400));

    // Freeze every visible canvas into an <img>
    const canvases = Array.from(document.querySelectorAll('canvas'));
    let frozen = 0, skipped = 0;
    for (const c of canvases) {
      try {
        if (!c.width || !c.height || !c.isConnected) { skipped++; continue; }
        const dataUrl = c.toDataURL('image/png');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.width = c.width / (window.devicePixelRatio || 1);
        img.height = c.height / (window.devicePixelRatio || 1);
        img.style.cssText = c.style.cssText || '';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        if (c.className) img.className = c.className;
        if (c.id) img.id = c.id;
        img.setAttribute('data-frozen-canvas', '1');
        c.parentNode.replaceChild(img, c);
        frozen++;
      } catch (e) {
        skipped++;
      }
    }
    // Drop a beacon so we can verify the freeze happened
    document.documentElement.setAttribute('data-shell-frozen', `${frozen}/${canvases.length}`);
  } catch (e) {
    document.documentElement.setAttribute('data-shell-freeze-error', String(e).slice(0, 100));
  }
})();
