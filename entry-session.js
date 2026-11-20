// Read before the body can paint: reloads must not flash the entrance again.
(() => {
  try {
    // Explicit local review URL; public pages always keep normal session rules.
    const local=location.hostname==='127.0.0.1'||location.hostname==='localhost'||location.hostname==='[::1]';
    if(local&&new URLSearchParams(location.search).get('preview-entry')==='1')return;
    if (sessionStorage.getItem('canopia_entry_seen_v2') === '1') {
      document.documentElement.dataset.entrySeen = 'true';
      window.CanopiaEntrySeen = true;
    }
  } catch { /* The entrance can still recover if browser storage is blocked. */ }
})();
