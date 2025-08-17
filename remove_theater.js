// Требуемые OAuth scopes: https://www.googleapis.com/auth/drive  https://www.googleapis.com/auth/spreadsheets
(async () => {
  // --- токен ---
  async function getAccessToken() {
    if (window.GOOGLE_TOKEN) return window.GOOGLE_TOKEN;
    const id = window.GOOGLE_CLIENT_ID,
          sec = window.GOOGLE_CLIENT_SECRET,
          rt = window.GOOGLE_REFRESH_TOKEN;
    if (!(id && sec && rt)) throw new Error('Нет access_token и нет refresh-кредов');
    const body = new URLSearchParams({
      client_id: id, client_secret: sec,
      refresh_token: rt, grant_type: 'refresh_token'
    });
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
  const SHEETS_ID   = window.SHEETS_ID   || '1XLo39UfRJWXESFTBSJKa4hPO0S7XOjKounKeb2QNus8';
  const SHEET_NAME  = window.SHEET_NAME  || 'Лист1';
  const DO_SCREENSHOT = window.DO_SCREENSHOT !== false;
  const SCREEN_SCALE  = Number(window.SCREEN_SCALE || 1.5); // ← масштаб текста

  function waitForElement(selector, cb) {
    const el = document.querySelector(selector);
    if (el) return cb(el);
    const mo = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { mo.disconnect(); cb(el); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ======== Чистка страницы Theater и формат даты ========
  function cleanTheaterPage() {
    // Работа с датой формата YYYY/MM
    const monthElem = document.querySelector(
      'div.blessing_card_area > div > p:nth-child(2)'
    );
    if (monthElem) {
      const t = monthElem.textContent.trim();
      const m = t.match(/^(\d{4})\/(\d{1,2})$/);
      if (m) {
        let y = parseInt(m[1], 10);
        let mm = parseInt(m[2], 10);
        const pad2 = n => (n < 10 ? '0' + n : '' + n);
        const nextM = mm === 12 ? 1 : mm + 1;
        const nextY = mm === 12 ? y + 1 : y;
        monthElem.textContent =
          `01.${pad2(mm)}.${y} — 01.${pad2(nextM)}.${nextY}`;
        monthElem.style.fontSize = '1.6em';
        monthElem.style.fontWeight = 'bold';
        monthElem.style.textAlign = 'center';
      }
    }

    // ==== УДАЛЕНИЕ ЛИШНЕГО ====
    const selectors = [
      'section.typ',
      'p.avd.tip_3',
      'h3',
      'span.v_l',
      'span.v_r',
      'div.card_2.card_toggle',
      'div.mon_desc',
      'p.sch_2',
      'body > div.scroller > container > div > div.blessing_card_area > div:nth-child(3)',
      'body > div.scroller > container > div > div.blessing_card_area > div:nth-child(4)',
      'body > div.scroller > container > div > div.blessing_card_area > div:nth-child(5)'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
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

  // ——— вспомогательное: увеличение шрифтов в клон-DOM ———
  function bumpFontsInClone(doc, root, scale) {
    try {
      const win = doc.defaultView;
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const cs = win.getComputedStyle(el);

        // font-size
        const fs = parseFloat(cs.fontSize);
        if (!Number.isNaN(fs) && cs.fontSize.endsWith('px')) {
          el.style.fontSize = (fs * scale) + 'px';
        }

        // line-height (если в px)
        const lh = cs.lineHeight;
        if (lh && lh.endsWith && lh.endsWith('px')) {
          const lhPx = parseFloat(lh);
          if (!Number.isNaN(lhPx)) el.style.lineHeight = (lhPx * scale) + 'px';
        }

        // letter-spacing (если в px)
        const ls = cs.letterSpacing;
        if (ls && ls.endsWith && ls.endsWith('px')) {
          const lsPx = parseFloat(ls);
          if (!Number.isNaN(lsPx)) el.style.letterSpacing = (lsPx * scale) + 'px';
        }
      }
    } catch(e) {
      console.warn('bumpFontsInClone error:', e);
    }
  }

  waitForElement('body > div.scroller > container > div', async () => {
    try {
      cleanTheaterPage();

      const targetSelector = 'body > div.scroller > container > div';
      const target = document.querySelector(targetSelector) || document.body;

      const patchName = (document.querySelector('body > div.scroller > container > div > div.blessing_card_area > div > p:nth-child(1)')?.textContent || '').trim() || 'unknown';

      if (!DO_SCREENSHOT) return;

      await ensureHtml2Canvas();

      // — Снимаем скрин, увеличив ТЕКСТ в клон-DOM —
      const base = await html2canvas(target, {
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        backgroundColor: null,
        onclone: (doc) => {
          const clonedTarget = doc.querySelector(targetSelector) || doc.body;
          bumpFontsInClone(doc, clonedTarget, SCREEN_SCALE); // ← вот тут текст реально становится крупнее
        }
      });

      // Сохраняем PNG
      const blob = await new Promise(r => base.toBlob(r, 'image/png'));
      const fileId = await uploadToDrive(blob, `theater_${patchName}_${Date.now()}.png`, TOKEN);
      await makePublic(fileId, TOKEN);
      const publicUrl = `https://drive.google.com/uc?id=${fileId}`;

      // — Запись в Google Sheets —
      const row = await findRowByPatch(SHEETS_ID, SHEET_NAME, patchName, TOKEN);
      const ts = new Date().toISOString();

      if (row > 0) {
        // Обновляем B (URL) и C (timestamp)
        await updateCell(SHEETS_ID, `${SHEET_NAME}!B${row}:C${row}`, [[publicUrl, ts]], TOKEN);
      } else {
        // Добавляем новую строку: A=patch, B=URL, C=time
        await appendRow(SHEETS_ID, `${SHEET_NAME}!A:C`, [[patchName, publicUrl, ts]], TOKEN);
      }

      // Если хочешь видеть ссылку в консоли
      console.log('Public screenshot URL:', publicUrl);
    } catch (e) {
      console.error('Screenshot pipeline failed:', e);
    }
  });
})();
