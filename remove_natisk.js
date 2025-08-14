// Требуемые OAuth scopes: https://www.googleapis.com/auth/drive  https://www.googleapis.com/auth/spreadsheets
(async () => {
  // --- токен ---
  async function getAccessToken() {
    if (window.GOOGLE_TOKEN) return window.GOOGLE_TOKEN;
    const id = window.GOOGLE_CLIENT_ID, sec = window.GOOGLE_CLIENT_SECRET, rt = window.GOOGLE_REFRESH_TOKEN;
    if (!(id && sec && rt)) throw new Error('Нет access_token и нет refresh-кредов');
    const body = new URLSearchParams({ client_id: id, client_secret: sec, refresh_token: rt, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!r.ok) throw new Error('Не удалось получить access_token');
    const j = await r.json();
    if (!j.access_token) throw new Error('Пустой access_token');
    return j.access_token;
  }

  const TOKEN = await getAccessToken();
  const SHEETS_ID = window.SHEETS_ID || '1XLo39UfRJWXESFTBSJKa4hPO0S7XOjKounKeb2QNus8';
  const DO_SCREENSHOT = window.DO_SCREENSHOT !== false;

  function waitForElement(selector, cb) {
    const el = document.querySelector(selector);
    if (el) return cb(el);
    const mo = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { mo.disconnect(); cb(el); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function cleanNatiskPage() {
    const selectorsToRemove = [
      // старые
      'div.emote_',
      '.toggle_1.mon_buffs.sw_1_2',
      '.toggle_1.mon_buffs.sw_1_1',
      '.toggle_2.mon_buffs.sw_2_2',
      '.toggle_2.mon_buffs.sw_2_1',
      '.toggle_3.mon_buffs.sw_3_1',
      '.pic_dl',
      'p.nosel[style*="font-size: 1.3em"]',
      'span.v_l',
      'span.v_r',
      // новые
      '.toggle_3.mon_buffs.sw_3_2',
      'p.avd.tip_3',
      'h3:has(.title)'
    ];

    selectorsToRemove.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });

    // fallback для :has
    if (!('matches' in Element.prototype) || !document.querySelector('h3:has(.title)')) {
      document.querySelectorAll('h3').forEach(h3 => {
        if (h3.querySelector('.title')) h3.remove();
      });
    }

    // форматируем дату
    const dateElem = document.querySelector('body > div.scroller > container > div > div > div.card_2 > p:nth-child(2)');
    if (dateElem) {
      const t = dateElem.textContent.trim();
      const m = t.match(/(\d{4})\/(\d{2})\/(\d{2})\s*-\s*(\d{4})\/(\d{2})\/(\d{2})/);
      if (m) {
        const [, y1, m1, d1, y2, m2, d2] = m;
        dateElem.textContent = `${d1}.${m1}.${y1} — ${d2}.${m2}.${y2}`;
        dateElem.style.fontSize = '1.4em';
        dateElem.style.fontWeight = 'bold';
      }
    }
  }

  function ensureHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve();
    return new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = () => res();
      document.body.appendChild(s);
    });
  }

  async function uploadToDrive(blob, name, token) {
    const meta = { name, mimeType: 'image/png' };
    const boundary = '-------314159265358979323846';
    const delim = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const base64 = btoa(bin);

    const body = delim + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) +
      delim + 'Content-Type: image/png\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
      base64 + closeDelim;

    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    if (!r.ok) throw new Error('Drive upload failed');
    return (await r.json()).id;
  }

  async function makePublic(fileId, token) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
    if (!r.ok) throw new Error('Drive makePublic failed');
  }

  async function findRowByPatch(spreadsheetId, sheetName, patch, token) {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:A`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error('Sheets read failed');
    const rows = (await r.json()).values || [];
    for (let i = 0; i < rows.length; i++) if ((rows[i][0] || '').trim() === patch) return i + 1;
    return 0;
  }

  async function updateCell(spreadsheetId, range, values, token) {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    });
    if (!r.ok) throw new Error('Sheets update failed');
  }

  async function appendRow(spreadsheetId, range, values, token) {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });
    if (!r.ok) throw new Error('Sheets append failed');
  }

  waitForElement('body > div.scroller > container > div', async () => {
    cleanNatiskPage();

    const patchName = (document.querySelector('body > div.scroller > container > div > div > div.card_2 > p:nth-child(1)')?.textContent || '').trim();

    let publicUrl = '';

    if (DO_SCREENSHOT) {
      await ensureHtml2Canvas();
      const target = document.querySelector('body > div.scroller > container > div') || document.body;
      const base = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: null });

      const out = document.createElement('canvas');
      out.width = 1080; out.height = 1080;
      const ctx = out.getContext('2d');
      const rw = base.width, rh = base.height;
      const sRatio = Math.min(1080 / rw, 1080 / rh);
      const dw = Math.round(rw * sRatio);
      const dh = Math.round(rh * sRatio);
      const dx = Math.floor((1080 - dw) / 2);
      const dy = Math.floor((1080 - dh) / 2);

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 1080, 1080);
      ctx.drawImage(base, 0, 0, rw, rh, dx, dy, dw, dh);

      const blob = await new Promise(r => out.toBlob(r, 'image/png'));
      const fileId = await uploadToDrive(blob, `natisk_${patchName || 'unknown'}_${Date.now()}.png`, TOKEN);
      await makePublic(fileId, TOKEN);
      publicUrl = `https://drive.google.com/uc?id=${fileId}`;
    }

    if (patchName && publicUrl) {
      const row = await findRowByPatch(SHEETS_ID, 'Natisk', patchName, TOKEN);
      if (row) await updateCell(SHEETS_ID, `Natisk!D${row}`, [[publicUrl]], TOKEN);
      else await appendRow(SHEETS_ID, 'Natisk!A:D', [[patchName, '', '', publicUrl]], TOKEN);
    }
  });
})();
