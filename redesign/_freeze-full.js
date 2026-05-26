// Full-shell capture: opens every major surface so the snapshot contains
// theme editor, data hub, share-view, account panel, in addition to main dashboard.
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    await sleep(3500); // initial render settle

    // 1. Close the auto-opened account panel so dashboard chrome is visible
    document.querySelectorAll('.account-panel, .topbar-more-menu').forEach(p => {
      p.classList.add('is-hidden'); p.classList.remove('is-open');
    });
    await sleep(300);

    // 2. Click "SHARE YOUR DATA" tab to render share-view DOM
    const tabs = document.querySelectorAll('.ts-tab, [data-tab]');
    for (const t of tabs) {
      const label = (t.textContent || '').trim().toLowerCase();
      if (label.includes('share')) { t.click(); break; }
    }
    await sleep(2000); // share-view has canvases that take time

    // 3. Bring back the main tab too — but leave share-view in DOM. Easier:
    //    just go back to main tab via clicking GLOBAL OVERVIEW or CONTEXT.
    const overviewTab = Array.from(tabs).find(t => (t.textContent || '').trim().toLowerCase().includes('overview'));
    if (overviewTab) overviewTab.click();
    await sleep(1200);

    // 4. Programmatically OPEN data-hub, theme-editor, account, mapping (un-hide for visibility in snapshot)
    document.querySelectorAll('.data-hub-panel, .theme-editor-panel, .account-panel').forEach(p => {
      p.classList.remove('is-hidden');
    });
    await sleep(800);

    // 5. Freeze every canvas
    const canvases = Array.from(document.querySelectorAll('canvas'));
    let frozen = 0;
    for (const c of canvases) {
      try {
        if (!c.width || !c.height || !c.isConnected) continue;
        const dataUrl = c.toDataURL('image/png');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.width = c.width / (window.devicePixelRatio || 1);
        img.height = c.height / (window.devicePixelRatio || 1);
        img.style.cssText = c.style.cssText || '';
        img.style.maxWidth = '100%'; img.style.height = 'auto';
        if (c.className) img.className = c.className;
        if (c.id) img.id = c.id;
        img.setAttribute('data-frozen-canvas', '1');
        c.parentNode.replaceChild(img, c);
        frozen++;
      } catch (e) {}
    }
    document.documentElement.setAttribute('data-shell-frozen', `${frozen}/${canvases.length}`);
  } catch (e) {
    document.documentElement.setAttribute('data-shell-freeze-error', String(e).slice(0, 200));
  }
})();
