(() => {
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    aperture:'<circle cx="12" cy="12" r="9"/><path d="m14.5 3.5-3 5.2M20.5 8.5l-6 1.5M20.5 15.5l-6-1.5M14.5 20.5l-3-5.2M5.5 20.5l3-5.2M3.5 8.5l6 1.5"/>',
    'plus-square':'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
    'hard-drive':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h.01M11 15h.01M16 15h2"/>',
    'book-open':'<path d="M12 7v14M3 5.5A2.5 2.5 0 0 1 5.5 3H12v18H5.5A2.5 2.5 0 0 0 3 23V5.5ZM21 5.5A2.5 2.5 0 0 0 18.5 3H12v18h6.5a2.5 2.5 0 0 1 2.5 2V5.5Z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>',
    'circle-help':'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.6 1.4c-.8 1-2.2 1.2-2.2 2.9M12 17h.01"/>',
    sparkles:'<path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16ZM5 2l.6 2.4L8 5l-2.4.6L5 8l-.6-2.4L2 5l2.4-.6L5 2Z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    'image-plus':'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21M18 3v6M15 6h6"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    'arrow-up-right':'<path d="M7 17 17 7M7 7h10v10"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 20h16"/>',
    search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
    'cloud-upload':'<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.7 10 4 4 0 0 1 19 18h-2M12 21V11m-4 4 4-4 4 4"/>',
    'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    x:'<path d="m18 6-12 12M6 6l12 12"/>',
    'settings-2':'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    cpu:'<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/>',
    'scan-eye':'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2"/>',
    lightbulb:'<path d="M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-.8.7-1 1.4-1 2H9c0-.6-.2-1.3-1-2Z"/>',
    'chevron-left':'<path d="m15 18-6-6 6-6"/>',
    save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    'rotate-ccw':'<path d="M3 7v6h6M4.5 13a8 8 0 1 0 2.1-7.5L3 9"/>',
    maximize:'<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/>',
    scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    frame:'<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7" y="7" width="10" height="10" rx=".5"/>',
    'alert-circle':'<circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/>',
    'alert-triangle':'<path d="m10.3 4.3-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
    'folder-down':'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2M3 7v11a2 2 0 0 0 2 2h6M16 15v6m-3-3 3 3 3-3"/>',
    'file-archive':'<path d="M4 3h16v18H4zM8 3v4h8V3M10 11h4m-4 3h4m-4 3h4"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/>',
    'refresh-cw':'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2"/>',
    'trash-2':'<path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7"/>',
    'wand-sparkles':'<path d="m15 4 5 5M4 20 18 6M3 7l1 1 1-1-1-1-1 1ZM10 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM19 15l1.5 1.5L22 17l-1.5.5L19 19l-.5-1.5L17 17l1.5-.5L19 15Z"/>',
    'circle-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  };
  window.refreshIcons = (root=document) => {
    root.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.iconReady) return;
      const name = el.getAttribute('data-icon');
      const path = paths[name] || '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>';
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.7'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round'); svg.setAttribute('aria-hidden','true');
      svg.innerHTML = path;
      el.appendChild(svg); el.dataset.iconReady='1';
    });
  };
  window.refreshIcons();
})();
