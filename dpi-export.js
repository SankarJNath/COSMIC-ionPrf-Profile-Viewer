/*
 * dpi-export.js — write correct DPI metadata into PNG / JPEG byte streams.
 *
 * Plotly renders figures at a chosen pixel size but does not tag them with a
 * physical resolution. For publication (journals, LaTeX \includegraphics,
 * Word) the stated DPI matters, so after exporting we patch:
 *   - PNG : insert/replace a pHYs chunk (pixels-per-metre, unit = 1)
 *   - JPEG: set the JFIF APP0 density (units = 1 dots/inch, X=Y=dpi)
 *
 * The real resolution is already set by the pixel dimensions; this just makes
 * the file's self-reported DPI correct so a 2400x1800 px figure declared at
 * 300 DPI prints as an 8x6 inch figure.
 */
(function (global) {
  'use strict';

  // ---- CRC32 (for PNG chunks) ----
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes, start, end) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dataURLtoBytes(dataURL) {
    const b64 = dataURL.split(',')[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function writeU32(arr, off, val) {
    arr[off] = (val >>> 24) & 0xff;
    arr[off + 1] = (val >>> 16) & 0xff;
    arr[off + 2] = (val >>> 8) & 0xff;
    arr[off + 3] = val & 0xff;
  }

  // ---- PNG: insert/replace pHYs after IHDR ----
  function setPngDpi(bytes, dpi) {
    const ppm = Math.round(dpi / 0.0254); // pixels per metre
    // Build pHYs chunk: len(4) "pHYs"(4) data(9) crc(4)
    const chunk = new Uint8Array(4 + 4 + 9 + 4);
    writeU32(chunk, 0, 9);
    chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73; // "pHYs"
    writeU32(chunk, 8, ppm);
    writeU32(chunk, 12, ppm);
    chunk[16] = 1; // unit = metre
    writeU32(chunk, 17, crc32(chunk, 4, 17));

    // Walk chunks starting after 8-byte signature; find IHDR end, drop any existing pHYs.
    const sig = 8;
    let p = sig;
    const keep = [];
    while (p < bytes.length) {
      const len = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      const total = 12 + len;
      if (type !== 'pHYs') keep.push({ start: p, total, type });
      p += total;
      if (type === 'IEND') break;
    }
    // Assemble: signature + IHDR + pHYs + rest
    const parts = [bytes.subarray(0, sig)];
    for (let i = 0; i < keep.length; i++) {
      const k = keep[i];
      parts.push(bytes.subarray(k.start, k.start + k.total));
      if (k.type === 'IHDR') parts.push(chunk);
    }
    return concat(parts);
  }

  // ---- JPEG: set JFIF APP0 density ----
  function setJpegDpi(bytes, dpi) {
    const d = Math.min(65535, Math.round(dpi));
    // Expect SOI (FFD8). Look for APP0 (FFE0) "JFIF".
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
    let p = 2;
    while (p + 4 < bytes.length) {
      if (bytes[p] !== 0xff) break;
      const marker = bytes[p + 1];
      const len = (bytes[p + 2] << 8) | bytes[p + 3];
      if (marker === 0xe0 &&
          bytes[p + 4] === 0x4a && bytes[p + 5] === 0x46 && bytes[p + 6] === 0x49 && bytes[p + 7] === 0x46) {
        const out = bytes.slice();
        out[p + 11] = 1;                 // density units = dots per inch
        out[p + 12] = (d >> 8) & 0xff;   // Xdensity hi
        out[p + 13] = d & 0xff;          // Xdensity lo
        out[p + 14] = (d >> 8) & 0xff;   // Ydensity hi
        out[p + 15] = d & 0xff;          // Ydensity lo
        return out;
      }
      if (marker === 0xda) break;        // start of scan — no APP0 found
      p += 2 + len;
    }
    // No JFIF APP0 — insert a standard 16-byte one right after SOI.
    const app0 = new Uint8Array([
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 1,
      (d >> 8) & 0xff, d & 0xff, (d >> 8) & 0xff, d & 0xff, 0x00, 0x00,
    ]);
    return concat([bytes.subarray(0, 2), app0, bytes.subarray(2)]);
  }

  function concat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // Public: take a Plotly data URL, return a Blob tagged with the right DPI.
  function tagDataURL(dataURL, format, dpi) {
    let bytes = dataURLtoBytes(dataURL);
    if (format === 'png') bytes = setPngDpi(bytes, dpi);
    else bytes = setJpegDpi(bytes, dpi);
    return new Blob([bytes], { type: format === 'png' ? 'image/png' : 'image/jpeg' });
  }

  global.DpiExport = { tagDataURL, setPngDpi, setJpegDpi, dataURLtoBytes };
})(typeof window !== 'undefined' ? window : globalThis);
