/* COSMIC ionPrf Profile Viewer — application logic */
(function () {
  'use strict';

  var FILL = -999;
  var isFill = function (x) { return !isFinite(x) || Math.abs(x - FILL) < 1e-3; };

  // Variable catalogue (column order used for tables / Excel)
  var VARS = [
    { key: 'alt', nc: 'MSL_alt', label: 'MSL altitude', unit: 'km' },
    { key: 'ed', nc: 'ELEC_dens', label: 'Electron density', unit: 'el/cm³' },
    { key: 'tec', nc: 'TEC_cal', label: 'Calibrated TEC', unit: 'TECU' },
    { key: 'lat', nc: 'GEO_lat', label: 'Latitude', unit: '°N' },
    { key: 'lon', nc: 'GEO_lon', label: 'Longitude', unit: '°E' },
    { key: 'azi', nc: 'OCC_azi', label: 'Azimuth', unit: '°' },
  ];

  var PLOT_FONT = { family: 'system-ui, Arial, sans-serif', size: 13, color: '#1a1e23' };
  var AX = {
    showline: true, linecolor: '#33373c', mirror: true, ticks: 'outside',
    tickcolor: '#33373c', gridcolor: '#e4e7eb', zeroline: false, automargin: true,
  };
  var PLOT_CONFIG = { responsive: true, displaylogo: false, displayModeBar: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'toImage'] };

  // ---------- State ----------
  var state = {
    allFiles: [],      // [{file, name, mission, year, doy, hh, mm, prn, time, sortKey}]
    filtered: [],
    currentIndex: -1,  // into filtered
    nc: null,          // parsed dataset
    raw: null,         // {alt,ed,tec,lat,lon,azi} raw Float64Arrays
    masked: null,      // fill-masked copies
    attrs: null,
    stamp: '',
    view: 'edens',
    opts: { edScale: 'linear', edMaskNonPos: true, edMarkPeak: true, tecScale: 'linear',
            cmpVar: 'ed', cmpScale: 'linear' },
    baseW: 760, baseH: 600,
    compare: [], // [{name,file,time,prn,lat,lon,color,data:{alt,ed,tec},attrs,label}]
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var els = {};
  ['openFolderBtn','openFilesBtn','folderInput','filesInput','folderName','fileCount',
   'filterBox','prevBtn','nextBtn','fileList','welcome','viewHost','controls','plot',
   'statline','tableWrap','metaGrid','exportbar','dpiSel','fmtSel','dlImgBtn',
   'dlXlsxBtn','dlCsvBtn','exportHint','tabbar','latMin','latMax','lonMin','lonMax',
   'geoClear','indexStatus','aboutPanel','compareList'].forEach(function (id) { els[id] = $(id); });

  // Qualitative palette for overlays (blue/black/red/green first, matching the
  // common quiet/disturbed-day convention), then more distinct hues.
  var PALETTE = ['#1f5fae', '#000000', '#d62728', '#2e7d32', '#ff7f0e', '#6a3d9a',
                 '#17becf', '#8c564b', '#e377c2', '#bcbd22', '#7f7f7f', '#1b9e77'];

  // ---------- Filename parsing ----------
  function parseName(name) {
    var m = name.match(/ionPrf_([A-Za-z0-9]+)\.(\d{4})\.(\d{3})\.(\d{2})\.(\d{2})\.([A-Za-z]\d+)/);
    if (!m) return { name: name, mission: '', year: '', doy: '', hh: '', mm: '', prn: '', time: '', sortKey: name };
    return { name: name, mission: m[1], year: m[2], doy: m[3], hh: m[4], mm: m[5],
             prn: m[6], time: m[4] + ':' + m[5], sortKey: m[4] + m[5] + m[6] };
  }

  // ---------- Folder / file loading ----------
  function acceptFile(f) {
    var n = f.name;
    return n.indexOf('ionPrf') !== -1 && (/_nc$/.test(n) || /\.nc$/i.test(n));
  }

  function ingest(fileListLike, label) {
    var arr = [];
    for (var i = 0; i < fileListLike.length; i++) {
      var f = fileListLike[i];
      if (acceptFile(f)) {
        var info = parseName(f.name);
        info.file = f;
        arr.push(info);
      }
    }
    if (!arr.length) {
      alert('No ionPrf NetCDF files found in the selection.\nExpected files like "ionPrf_C2E1.2021.308.00.00.G11_0001.0001_nc".');
      return;
    }
    arr.sort(function (a, b) { return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0; });
    state.allFiles = arr;
    state.filtered = arr.slice();
    state.currentIndex = -1;
    els.folderName.textContent = label + ' — ' + arr.length + ' files';
    els.filterBox.value = '';
    [els.latMin, els.latMax, els.lonMin, els.lonMax].forEach(function (i) { i.value = ''; });
    updateCount();
    renderFileList();
    // auto-select first
    selectIndex(0);
    // index perigee-point locations in the background so the lat/lon filter works
    indexLocations(arr);
  }

  function updateCount() {
    var n = state.filtered.length, t = state.allFiles.length;
    els.fileCount.textContent = (n === t) ? (t + ' occultations loaded') : (n + ' of ' + t + ' occultations');
  }

  els.openFolderBtn.addEventListener('click', function () { els.folderInput.click(); });
  els.openFilesBtn.addEventListener('click', function () { els.filesInput.click(); });
  els.folderInput.addEventListener('change', function (e) {
    var files = e.target.files;
    var label = 'Folder';
    if (files.length && files[0].webkitRelativePath) label = files[0].webkitRelativePath.split('/')[0];
    ingest(files, label);
  });
  els.filesInput.addEventListener('change', function (e) { ingest(e.target.files, 'Selected files'); });

  // ---------- Location indexing (powers the lat/lon filter) ----------
  // Lat/lon live inside each NetCDF file, not in the filename, so we read each
  // file's peak/endpoint location from its attributes in the background.
  var indexGen = 0;
  function validLat(x) { return isFinite(x) && Math.abs(x - FILL) > 1e-3 && x >= -90 && x <= 90; }
  function validLon(x) { return isFinite(x) && Math.abs(x - FILL) > 1e-3 && x >= -180 && x <= 180; }
  function pick(cands, ok) { for (var i = 0; i < cands.length; i++) if (ok(cands[i])) return cands[i]; return null; }

  function indexLocations(items) {
    var gen = ++indexGen, total = items.length, done = 0, next = 0, CONC = 16;
    setIndexStatus(done, total);
    function worker() {
      return new Promise(function (resolve) {
        function after() {
          if (gen !== indexGen) return resolve();
          if (done % 100 === 0 || done === total) {
            setIndexStatus(done, total);
            if (geoActive()) applyFilter(true);
          }
          if (done % 250 === 0) setTimeout(step, 0); else step();
        }
        function step() {
          if (gen !== indexGen) return resolve();
          var i = next++;
          if (i >= total) return resolve();
          var it = items[i];
          it.file.arrayBuffer().then(function (ab) {
            try {
              var a = NetCDF3.parse(ab).attributes;
              it.lat = pick([a.edmaxlat, a.botlat, a.toplat], validLat);
              it.lon = pick([a.edmaxlon, a.botlon, a.toplon], validLon);
            } catch (e) { it.lat = null; it.lon = null; }
            done++; after();
          }, function () { it.lat = null; it.lon = null; done++; after(); });
        }
        step();
      });
    }
    var ws = [];
    for (var w = 0; w < CONC; w++) ws.push(worker());
    Promise.all(ws).then(function () {
      if (gen !== indexGen) return;
      setIndexStatus(total, total);
      if (geoActive()) applyFilter(true);
      else renderFileList(); // refresh location tooltips now that indexing is done
    });
  }
  function setIndexStatus(done, total) {
    els.indexStatus.textContent = done < total
      ? ('Indexing locations… ' + done + '/' + total)
      : ('Locations indexed (' + total + ')');
  }

  // ---------- Filtering (text + geographic) ----------
  function geoBounds() {
    function num(el) { var v = parseFloat(el.value); return isFinite(v) ? v : null; }
    var latMin = num(els.latMin), latMax = num(els.latMax), lonMin = num(els.lonMin), lonMax = num(els.lonMax);
    // Tolerate swapped entries: interpret the two numbers as a range either way.
    if (latMin != null && latMax != null && latMin > latMax) { var tl = latMin; latMin = latMax; latMax = tl; }
    if (lonMin != null && lonMax != null && lonMin > lonMax) { var to = lonMin; lonMin = lonMax; lonMax = to; }
    return { latMin: latMin, latMax: latMax, lonMin: lonMin, lonMax: lonMax };
  }
  function geoActive() { var g = geoBounds(); return g.latMin != null || g.latMax != null || g.lonMin != null || g.lonMax != null; }

  function applyFilter(keepSel) {
    var tokens = els.filterBox.value.trim().toLowerCase();
    tokens = tokens ? tokens.split(/\s+/) : [];
    var g = geoBounds(), gActive = geoActive();
    var prevName = (state.currentIndex >= 0 && state.filtered[state.currentIndex]) ? state.filtered[state.currentIndex].name : null;
    state.filtered = state.allFiles.filter(function (it) {
      if (tokens.length) {
        var hay = (it.time + ' ' + it.prn + ' ' + it.name).toLowerCase();
        if (!tokens.every(function (t) { return hay.indexOf(t) !== -1; })) return false;
      }
      if (gActive) {
        if (it.lat == null || it.lon == null) return false; // not yet indexed / no location
        if (g.latMin != null && it.lat < g.latMin) return false;
        if (g.latMax != null && it.lat > g.latMax) return false;
        if (g.lonMin != null && it.lon < g.lonMin) return false;
        if (g.lonMax != null && it.lon > g.lonMax) return false;
      }
      return true;
    });
    updateCount();
    var newIdx = -1;
    if (keepSel && prevName) {
      for (var i = 0; i < state.filtered.length; i++) if (state.filtered[i].name === prevName) { newIdx = i; break; }
    }
    if (newIdx >= 0) { state.currentIndex = newIdx; renderFileList(); updateNav(); }
    else {
      state.currentIndex = -1;
      renderFileList();
      if (state.filtered.length) selectIndex(0); else els.statline.textContent = '';
      updateNav();
    }
  }

  // ---------- File list ----------
  function renderFileList() {
    var frag = document.createDocumentFragment();
    if (!state.filtered.length) {
      els.fileList.innerHTML = '<div class="empty">No files match the filter.</div>';
      return;
    }
    state.filtered.forEach(function (it, idx) {
      var div = document.createElement('div');
      div.className = 'file-item' + (idx === state.currentIndex ? ' active' : '');
      div.dataset.idx = idx;
      var loc = (it.lat != null && it.lon != null) ? (it.lat.toFixed(2) + '°, ' + it.lon.toFixed(2) + '°') : '';
      div.title = it.name + (loc ? '\n' + loc : '');
      div.innerHTML = '<span class="ftime">' + (it.time || it.name) + '</span>' +
                      '<span class="fsat">' + (it.prn || '') + '</span>';
      frag.appendChild(div);
    });
    els.fileList.innerHTML = '';
    els.fileList.appendChild(frag);
  }

  els.fileList.addEventListener('click', function (e) {
    var item = e.target.closest('.file-item');
    if (!item) return;
    selectIndex(parseInt(item.dataset.idx, 10));
  });

  els.filterBox.addEventListener('input', function () { applyFilter(true); });
  [els.latMin, els.latMax, els.lonMin, els.lonMax].forEach(function (el) {
    el.addEventListener('input', function () { applyFilter(true); });
  });
  els.geoClear.addEventListener('click', function () {
    [els.latMin, els.latMax, els.lonMin, els.lonMax].forEach(function (i) { i.value = ''; });
    applyFilter(true);
  });

  els.prevBtn.addEventListener('click', function () { if (state.currentIndex > 0) selectIndex(state.currentIndex - 1); });
  els.nextBtn.addEventListener('click', function () { if (state.currentIndex < state.filtered.length - 1) selectIndex(state.currentIndex + 1); });

  function updateNav() {
    els.prevBtn.disabled = !(state.currentIndex > 0);
    els.nextBtn.disabled = !(state.currentIndex >= 0 && state.currentIndex < state.filtered.length - 1);
  }

  // ---------- Select & parse ----------
  function selectIndex(idx) {
    if (idx < 0 || idx >= state.filtered.length) return;
    state.currentIndex = idx;
    // highlight
    var items = els.fileList.querySelectorAll('.file-item');
    items.forEach(function (el) { el.classList.toggle('active', parseInt(el.dataset.idx, 10) === idx); });
    var active = els.fileList.querySelector('.file-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
    updateNav();

    var item = state.filtered[idx];
    item.file.arrayBuffer().then(function (ab) {
      try {
        var nc = NetCDF3.parse(ab);
        loadDataset(nc, item);
      } catch (err) {
        alert('Failed to read ' + item.name + '\n' + err.message);
      }
    });
  }

  function loadDataset(nc, item) {
    state.nc = nc;
    state.attrs = nc.attributes;
    var raw = {};
    VARS.forEach(function (v) {
      try { raw[v.key] = nc.getData(v.nc); }
      catch (e) { raw[v.key] = new Float64Array(0); }
    });
    state.raw = raw;
    var masked = {};
    Object.keys(raw).forEach(function (k) {
      var src = raw[k], out = new Float64Array(src.length);
      for (var i = 0; i < src.length; i++) out[i] = isFill(src[i]) ? NaN : src[i];
      masked[k] = out;
    });
    state.masked = masked;
    state.stamp = (state.attrs.fileStamp || item.name).toString().replace(/[^\w.-]/g, '_');

    els.welcome.classList.add('hidden');
    els.viewHost.classList.remove('hidden');
    render();
  }

  // ---------- Stats ----------
  function stats(raw) {
    var v = [];
    for (var i = 0; i < raw.length; i++) if (!isFill(raw[i])) v.push(raw[i]);
    if (!v.length) return null;
    v.sort(function (a, b) { return a - b; });
    var n = v.length, sum = 0;
    for (var j = 0; j < n; j++) sum += v[j];
    var med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    return { n: n, min: v[0], max: v[n - 1], mean: sum / n, median: med };
  }
  function fmt(x, d) { if (x == null || !isFinite(x)) return '—'; return Number(x).toLocaleString(undefined, { maximumFractionDigits: d == null ? 4 : d }); }

  // ---------- Tabs ----------
  els.tabbar.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    state.view = tab.dataset.view;
    Array.prototype.forEach.call(els.tabbar.children, function (t) { t.classList.toggle('active', t === tab); });
    render();
  });

  // ---------- Render dispatch ----------
  function render() {
    var v = state.view;
    var hasData = !!state.raw;
    var isPlot = hasData && v !== 'meta' && v !== 'table' && v !== 'about';
    els.welcome.classList.toggle('hidden', hasData || v === 'about');
    els.viewHost.classList.toggle('hidden', !hasData && v !== 'about');
    els.plot.classList.toggle('hidden', !isPlot);
    els.compareList.classList.toggle('hidden', v !== 'compare');
    els.tableWrap.classList.toggle('hidden', !(v === 'table' && hasData));
    els.metaGrid.classList.toggle('hidden', !(v === 'meta' && hasData));
    els.aboutPanel.classList.toggle('hidden', v !== 'about');
    els.exportbar.classList.toggle('hidden', v === 'about');
    els.dlImgBtn.disabled = !isPlot;
    els.dlXlsxBtn.disabled = !hasData;
    els.dlCsvBtn.disabled = !hasData;
    els.exportHint.textContent = hasData ? ('File: ' + state.stamp) : '';

    if (v === 'about') { renderAbout(); return; }
    if (!hasData) return;
    if (v === 'edens') renderEdens();
    else if (v === 'tec') renderTec();
    else if (v === 'latlon') renderLatLon();
    else if (v === 'azi') renderAzi();
    else if (v === 'geo') renderGeo();
    else if (v === 'compare') renderCompare();
    else if (v === 'meta') renderMeta();
    else if (v === 'table') renderTable();
  }

  function renderAbout() {
    setControls('');
    els.statline.textContent = '';
    els.aboutPanel.innerHTML =
      '<div class="welcome" style="margin:10px 0">' +
      '<h2>COSMIC ionPrf Profile Viewer</h2>' +
      '<p>An interactive, offline viewer and export tool for COSMIC GPS radio-occultation ' +
      'ionospheric profiles (UCAR/CDAAC <code>ionPrf</code>, NetCDF-3): electron density, ' +
      'calibrated TEC, perigee-point geolocation and occultation azimuth — with ' +
      'publication-quality figure export (PNG/JPG at 300/600/1000&nbsp;DPI) and data export ' +
      'to Excel/CSV. Everything runs locally in your browser.</p>' +
      '<table class="about-table">' +
      '<tr><td>Author</td><td class="author"><strong>Sankar Jyoti Nath</strong></td></tr>' +
      '<tr><td>Repository</td><td><a href="https://github.com/SankarJNath/COSMIC-ionPrf-Profile-Viewer" target="_blank" rel="noopener">github.com/SankarJNath/COSMIC-ionPrf-Profile-Viewer</a></td></tr>' +
      '<tr><td>Data source</td><td>UCAR / CDAAC — <a href="https://cdaac-www.cosmic.ucar.edu/" target="_blank" rel="noopener">cdaac-www.cosmic.ucar.edu</a></td></tr>' +
      '<tr><td>Version</td><td>1.0</td></tr>' +
      '</table>' +
      '<p class="muted">Independent tool, not affiliated with or endorsed by UCAR/CDAAC.</p>' +
      '</div>';
  }

  function layout(title, xtitle, ytitle, extra) {
    var L = {
      title: { text: title, font: { size: 15 } },
      font: PLOT_FONT, paper_bgcolor: '#fff', plot_bgcolor: '#fff',
      margin: { l: 78, r: 26, t: 48, b: 58 },
      xaxis: Object.assign({ title: { text: xtitle } }, AX),
      yaxis: Object.assign({ title: { text: ytitle } }, AX),
      hovermode: 'closest', showlegend: false,
    };
    return Object.assign(L, extra || {});
  }

  function setControls(html) { els.controls.innerHTML = html; els.controls.classList.toggle('hidden', !html); }

  // ----- Electron density -----
  function renderEdens() {
    state.baseW = 760; state.baseH = 600;
    setControls(
      '<div class="group"><label>X scale</label>' +
      '<select id="edScale"><option value="linear">Linear</option><option value="log">Log</option></select></div>' +
      '<label><input type="checkbox" id="edMaskNonPos"> Mask non-positive values</label>' +
      '<label><input type="checkbox" id="edMarkPeak"> Mark peak (edmax)</label>' +
      '<span class="qc-note" id="edQc"></span>');
    var o = state.opts;
    $('edScale').value = o.edScale;
    $('edMaskNonPos').checked = o.edMaskNonPos;
    $('edMarkPeak').checked = o.edMarkPeak;
    $('edScale').addEventListener('change', function () { o.edScale = this.value; renderEdens(); });
    $('edMaskNonPos').addEventListener('change', function () { o.edMaskNonPos = this.checked; renderEdens(); });
    $('edMarkPeak').addEventListener('change', function () { o.edMarkPeak = this.checked; renderEdens(); });

    var alt = state.masked.alt, ed = state.masked.ed.slice();
    var log = o.edScale === 'log';
    var nNeg = 0, masked = 0;
    for (var i = 0; i < ed.length; i++) {
      if (!isFinite(ed[i])) continue;
      if (ed[i] <= 0) nNeg++;
      if ((o.edMaskNonPos || log) && ed[i] <= 0) { ed[i] = NaN; masked++; }
    }
    var traces = [{
      x: ed, y: alt, mode: 'lines+markers', type: 'scatter',
      line: { color: '#1f5fae', width: 1.3 }, marker: { size: 3, color: '#1f5fae' },
      name: 'ELEC_dens', hovertemplate: 'Ne = %{x:.3s} el/cm³<br>alt = %{y:.2f} km<extra></extra>',
    }];
    if (o.edMarkPeak && isFinite(state.attrs.edmax) && isFinite(state.attrs.edmaxalt)) {
      traces.push({
        x: [state.attrs.edmax], y: [state.attrs.edmaxalt], mode: 'markers', type: 'scatter',
        marker: { symbol: 'star', size: 12, color: '#b4531a', line: { color: '#fff', width: 1 } },
        name: 'edmax', hovertemplate: 'edmax = %{x:.3s}<br>edmaxalt = %{y:.1f} km<extra>metadata</extra>',
      });
    }
    var lay = layout('Electron Density Profile', 'Electron density (el/cm³)', 'MSL altitude (km)');
    if (log) lay.xaxis.type = 'log';
    lay.showlegend = o.edMarkPeak;
    lay.legend = { x: 0.98, y: 0.02, xanchor: 'right', yanchor: 'bottom', bgcolor: 'rgba(255,255,255,0.7)', font: { weight: 'bold' } };
    Plotly.react(els.plot, traces, lay, PLOT_CONFIG);

    var s = stats(state.raw.ed);
    var qc = $('edQc');
    if (qc) qc.textContent = (nNeg ? nNeg + ' non-positive sample(s)' + (masked ? ' — masked' : ' — shown') : 'all samples positive');
    els.statline.textContent = s ? ('n=' + s.n + ' valid   min=' + fmt(s.min, 0) + '   max=' + fmt(s.max, 0) +
      '   mean=' + fmt(s.mean, 0) + '   median=' + fmt(s.median, 0) + ' el/cm³') : 'no valid electron-density samples';
  }

  // ----- TEC -----
  function renderTec() {
    state.baseW = 720; state.baseH = 600;
    setControls('<div class="group"><label>X scale</label>' +
      '<select id="tecScale"><option value="linear">Linear</option><option value="log">Log</option></select></div>');
    $('tecScale').value = state.opts.tecScale;
    $('tecScale').addEventListener('change', function () { state.opts.tecScale = this.value; renderTec(); });

    var lay = layout('Calibrated Occultation TEC Profile', 'TEC below LEO orbit (TECU)', 'MSL altitude (km)');
    if (state.opts.tecScale === 'log') lay.xaxis.type = 'log';
    Plotly.react(els.plot, [{
      x: state.masked.tec, y: state.masked.alt, mode: 'lines+markers', type: 'scatter',
      line: { color: '#2e7d32', width: 1.3 }, marker: { size: 3, color: '#2e7d32' },
      hovertemplate: 'TEC = %{x:.3f} TECU<br>alt = %{y:.2f} km<extra></extra>',
    }], lay, PLOT_CONFIG);
    var s = stats(state.raw.tec);
    els.statline.textContent = s ? ('n=' + s.n + '   min=' + fmt(s.min, 3) + '   max=' + fmt(s.max, 3) +
      '   mean=' + fmt(s.mean, 3) + '   median=' + fmt(s.median, 3) + ' TECU   (TEC_cal = calibrated occ. TEC below LEO orbit)') : '';
  }

  // ----- Latitude & Longitude -----
  function renderLatLon() {
    state.baseW = 900; state.baseH = 560;
    setControls('');
    var alt = state.masked.alt;
    var traces = [
      { x: state.masked.lat, y: alt, xaxis: 'x', yaxis: 'y', mode: 'lines+markers', type: 'scatter',
        line: { color: '#1f5fae', width: 1.3 }, marker: { size: 3 },
        hovertemplate: 'lat = %{x:.3f}°<br>alt = %{y:.1f} km<extra></extra>' },
      { x: state.masked.lon, y: alt, xaxis: 'x2', yaxis: 'y2', mode: 'lines+markers', type: 'scatter',
        line: { color: '#b4531a', width: 1.3 }, marker: { size: 3 },
        hovertemplate: 'lon = %{x:.3f}°<br>alt = %{y:.1f} km<extra></extra>' },
    ];
    var lay = {
      title: { text: 'Perigee-Point Latitude & Longitude vs Altitude', font: { size: 15 } },
      font: PLOT_FONT, paper_bgcolor: '#fff', plot_bgcolor: '#fff',
      grid: { rows: 1, columns: 2, pattern: 'independent' },
      margin: { l: 78, r: 26, t: 48, b: 58 }, showlegend: false,
      xaxis: Object.assign({ title: { text: 'Latitude (°N)' } }, AX),
      yaxis: Object.assign({ title: { text: 'MSL altitude (km)' } }, AX),
      xaxis2: Object.assign({ title: { text: 'Longitude (°E)' } }, AX),
      yaxis2: Object.assign({ title: { text: '' }, matches: 'y' }, AX),
    };
    Plotly.react(els.plot, traces, lay, PLOT_CONFIG);
    var sl = stats(state.raw.lat), so = stats(state.raw.lon);
    els.statline.textContent = (sl ? 'lat ' + fmt(sl.min, 3) + '…' + fmt(sl.max, 3) + '°   ' : '') +
      (so ? 'lon ' + fmt(so.min, 3) + '…' + fmt(so.max, 3) + '°' : '');
  }

  // ----- Azimuth -----
  function renderAzi() {
    state.baseW = 720; state.baseH = 600;
    setControls('');
    var lay = layout('Occultation-Plane Azimuth vs Altitude', 'Azimuth w.r.t. north (°)', 'MSL altitude (km)');
    Plotly.react(els.plot, [{
      x: state.masked.azi, y: state.masked.alt, mode: 'lines+markers', type: 'scatter',
      line: { color: '#6a3d9a', width: 1.3 }, marker: { size: 3, color: '#6a3d9a' },
      hovertemplate: 'azi = %{x:.3f}°<br>alt = %{y:.1f} km<extra></extra>',
    }], lay, PLOT_CONFIG);
    var s = stats(state.raw.azi);
    els.statline.textContent = s ? ('azimuth ' + fmt(s.min, 3) + '…' + fmt(s.max, 3) + '°   mean=' + fmt(s.mean, 3) + '°') : '';
  }

  // ----- Geographic map -----
  function renderGeo() {
    state.baseW = 820; state.baseH = 640;
    setControls('<span class="qc-note">Perigee-point track coloured by altitude — not a full satellite ground track.</span>');
    var lat = [], lon = [], alt = [], a = state.masked;
    for (var i = 0; i < a.alt.length; i++) {
      if (isFinite(a.lat[i]) && isFinite(a.lon[i])) { lat.push(a.lat[i]); lon.push(a.lon[i]); alt.push(a.alt[i]); }
    }
    var traces = [{
      type: 'scattergeo', lon: lon, lat: lat, mode: 'lines+markers',
      line: { color: '#888', width: 1 },
      marker: { size: 5, color: alt, colorscale: 'Viridis', showscale: true,
                colorbar: { title: { text: 'Alt (km)', side: 'right' }, thickness: 14, len: 0.8 } },
      hovertemplate: 'lat %{lat:.3f}°, lon %{lon:.3f}°<extra></extra>', name: 'perigee track',
    }];
    var at = state.attrs;
    if (isFinite(at.edmaxlat) && isFinite(at.edmaxlon)) {
      traces.push({ type: 'scattergeo', lon: [at.edmaxlon], lat: [at.edmaxlat], mode: 'markers',
        marker: { symbol: 'star', size: 13, color: '#b4531a' }, name: 'edmax',
        hovertemplate: 'edmax point<br>%{lat:.3f}°, %{lon:.3f}°<extra></extra>' });
    }
    // Frame with padding so regional coastlines appear for context (a single
    // RO track is short; a tight auto-fit would show only empty ocean).
    var loMin = Math.min.apply(null, lon), loMax = Math.max.apply(null, lon);
    var laMin = Math.min.apply(null, lat), laMax = Math.max.apply(null, lat);
    var pad = Math.max((loMax - loMin), (laMax - laMin)) * 0.9;
    if (!(pad > 0) || pad < 7) pad = 7;
    var lay = {
      title: { text: 'Geographic Perigee-Point Track', font: { size: 15 } },
      font: PLOT_FONT, paper_bgcolor: '#fff', margin: { l: 10, r: 10, t: 48, b: 10 }, showlegend: false,
      geo: {
        projection: { type: 'natural earth' }, resolution: 50,
        lonaxis: { range: [loMin - pad, loMax + pad] },
        lataxis: { range: [Math.max(-90, laMin - pad), Math.min(90, laMax + pad)] },
        showland: true, landcolor: '#eef0e6', showocean: true, oceancolor: '#eaf1f6',
        showcountries: true, countrycolor: '#c3cab8', coastlinecolor: '#9aa390',
        showlakes: true, lakecolor: '#eaf1f6', bgcolor: '#fff',
      },
    };
    Plotly.react(els.plot, traces, lay, PLOT_CONFIG);
    els.statline.textContent = 'start (' + fmt(lat[0], 3) + '°, ' + fmt(lon[0], 3) + '°)  →  end (' +
      fmt(lat[lat.length - 1], 3) + '°, ' + fmt(lon[lon.length - 1], 3) + '°)';
  }

  // ----- Compare / overlay multiple profiles -----
  function maskedArr(src) { var o = new Float64Array(src.length); for (var i = 0; i < src.length; i++) o[i] = isFill(src[i]) ? NaN : src[i]; return o; }
  function profileFromNc(nc) {
    return { alt: maskedArr(nc.getData('MSL_alt')), ed: maskedArr(nc.getData('ELEC_dens')), tec: maskedArr(nc.getData('TEC_cal')) };
  }
  function compareLabel(e) {
    var loc = '';
    if (e.lat != null && e.lon != null) {
      loc = Math.abs(e.lat).toFixed(1) + (e.lat >= 0 ? '°N' : '°S') + ' ' +
            Math.abs(e.lon).toFixed(1) + (e.lon >= 0 ? '°E' : '°W');
    }
    var when = e.time ? ('(' + e.time + (e.prn ? ' ' + e.prn : '') + ')') : e.name;
    return (loc ? loc + ' ' : '') + when;
  }
  var cmpTimer = null;
  function scheduleCompareRefresh() {
    if (cmpTimer) return;
    cmpTimer = setTimeout(function () { cmpTimer = null; if (state.view === 'compare') renderCompare(); }, 70);
  }
  function addToCompare(item) {
    if (!item || state.compare.some(function (e) { return e.name === item.name; })) return;
    var entry = { name: item.name, file: item.file, time: item.time, prn: item.prn,
                  lat: item.lat, lon: item.lon, color: PALETTE[state.compare.length % PALETTE.length],
                  data: null, attrs: null, label: '' };
    entry.label = compareLabel(entry);
    state.compare.push(entry);
    item.file.arrayBuffer().then(function (ab) {
      var nc = NetCDF3.parse(ab);
      entry.data = profileFromNc(nc);
      entry.attrs = nc.attributes;
      if (entry.lat == null) entry.lat = pick([nc.attributes.edmaxlat, nc.attributes.botlat, nc.attributes.toplat], validLat);
      if (entry.lon == null) entry.lon = pick([nc.attributes.edmaxlon, nc.attributes.botlon, nc.attributes.toplon], validLon);
      entry.label = compareLabel(entry);
      scheduleCompareRefresh();
    }, function () { scheduleCompareRefresh(); });
  }
  function addCurrentToCompare() {
    if (state.currentIndex >= 0) { addToCompare(state.filtered[state.currentIndex]); renderCompare(); }
  }
  function addAllFiltered() {
    if (state.filtered.length > 50) {
      alert('That is ' + state.filtered.length + ' profiles — too many to overlay legibly.\nNarrow the list (lat/lon or text filter) to 50 or fewer first.');
      return;
    }
    state.filtered.forEach(addToCompare);
    renderCompare();
  }
  function clearCompare() { state.compare = []; renderCompare(); }

  function renderCompare() {
    state.baseW = 780; state.baseH = 600;
    var o = state.opts;
    setControls(
      '<div class="group"><label>Variable</label>' +
      '<select id="cmpVar"><option value="ed">Electron density</option><option value="tec">TEC</option></select></div>' +
      '<div class="group"><label>X scale</label>' +
      '<select id="cmpScale"><option value="linear">Linear</option><option value="log">Log</option></select></div>' +
      '<button id="cmpAdd" class="cmp-btn">+ Add current</button>' +
      '<button id="cmpAddAll" class="cmp-btn">+ Add all filtered (' + state.filtered.length + ')</button>' +
      '<button id="cmpClear" class="cmp-btn">Clear all</button>');
    $('cmpVar').value = o.cmpVar; $('cmpScale').value = o.cmpScale;
    $('cmpVar').addEventListener('change', function () { o.cmpVar = this.value; renderCompare(); });
    $('cmpScale').addEventListener('change', function () { o.cmpScale = this.value; renderCompare(); });
    $('cmpAdd').addEventListener('click', addCurrentToCompare);
    $('cmpAddAll').addEventListener('click', addAllFiltered);
    $('cmpClear').addEventListener('click', clearCompare);

    var vkey = o.cmpVar;
    var vlabel = vkey === 'ed' ? 'Electron density (el/cm³)' : 'TEC (TECU)';
    var traces = state.compare.filter(function (e) { return e.data; }).map(function (e) {
      var x = e.data[vkey];
      if (vkey === 'ed') { // hide non-physical (<=0) densities so the overlay stays readable
        var m = new Float64Array(x.length);
        for (var k = 0; k < x.length; k++) m[k] = x[k] > 0 ? x[k] : NaN;
        x = m;
      }
      return { x: x, y: e.data.alt, mode: 'lines', type: 'scatter', name: e.label,
               line: { color: e.color, width: 1.5 },
               hovertemplate: '%{x:.3s}<br>%{y:.1f} km<extra>' + e.label + '</extra>' };
    });
    var day = '';
    var first = state.compare.find ? state.compare.find(function (e) { return e.attrs; }) : null;
    if (first && first.attrs) { var a = first.attrs; day = ' — ' + a.year + '-' + pad2(a.month) + '-' + pad2(a.day); }
    var lay = layout('Overlaid ' + (vkey === 'ed' ? 'Electron-Density' : 'TEC') + ' Profiles' + day, vlabel, 'MSL altitude (km)');
    if (o.cmpScale === 'log') lay.xaxis.type = 'log';
    lay.showlegend = true;
    lay.legend = { x: 0.98, y: 0.02, xanchor: 'right', yanchor: 'bottom',
                   bgcolor: 'rgba(255,255,255,0.78)', bordercolor: '#ccc', borderwidth: 1, font: { size: 11, weight: 'bold' } };
    Plotly.react(els.plot, traces, lay, PLOT_CONFIG);

    if (!state.compare.length) {
      els.compareList.innerHTML = '<div class="cmp-empty">No profiles added yet. Filter by lat/lon (left), then <strong>Add all filtered</strong> — or pick an occultation and <strong>Add current</strong>. Click a swatch to change its colour.</div>';
    } else {
      els.compareList.innerHTML = state.compare.map(function (e, i) {
        return '<div class="cmp-row">' +
          '<input type="color" value="' + e.color + '" data-i="' + i + '" title="Choose colour">' +
          '<span class="cmp-label">' + e.label + (e.data ? '' : ' — loading…') + '</span>' +
          '<button class="cmp-rm" data-i="' + i + '" title="Remove">&times;</button></div>';
      }).join('');
    }
    els.statline.textContent = state.compare.length + ' profile(s) overlaid' +
      (state.compare.length ? '  —  colour swatches below are editable' : '') +
      (state.compare.length && vkey === 'ed' ? '  ·  non-positive Ne hidden' : '');
  }

  // Colour change / removal (delegated; list DOM is rebuilt on structural change)
  els.compareList.addEventListener('input', function (e) {
    if (e.target.type === 'color') {
      var i = parseInt(e.target.dataset.i, 10);
      if (state.compare[i]) { state.compare[i].color = e.target.value; recolorCompare(); }
    }
  });
  els.compareList.addEventListener('click', function (e) {
    var rm = e.target.closest('.cmp-rm');
    if (rm) { state.compare.splice(parseInt(rm.dataset.i, 10), 1); renderCompare(); }
  });
  function recolorCompare() {
    // update line colours in place without rebuilding the list (keeps picker open)
    var colors = state.compare.filter(function (e) { return e.data; }).map(function (e) { return e.color; });
    Plotly.restyle(els.plot, { 'line.color': colors });
  }

  // ----- Metadata -----
  function renderMeta() {
    setControls('');
    els.statline.textContent = '';
    var at = state.attrs;
    var g = function (k) { return at[k]; };
    function card(title, rows) {
      var html = '<div class="meta-card"><h3>' + title + '</h3><table>';
      rows.forEach(function (r) {
        var val = r[1];
        if (val === undefined || val === null || val === '') val = '—';
        html += '<tr><td class="k">' + r[0] + '</td><td class="v">' + val + '</td></tr>';
      });
      return html + '</table></div>';
    }
    var date = g('year') + '-' + pad2(g('month')) + '-' + pad2(g('day')) + ' ' +
               pad2(g('hour')) + ':' + pad2(g('minute')) + ':' + pad2(Math.round(g('second'))) + ' UTC';
    var html = '';
    html += card('Observation', [
      ['File stamp', g('fileStamp')], ['Mission', g('mission')], ['Data centre', g('center')],
      ['Observation time', date], ['Occultation ID', g('occ_id')],
      ['Occulting satellite', g('occulting_sat_id')], ['Reference satellite', g('reference_sat_id')],
      ['Local time (bottom)', fmt(g('botlct'), 3) + ' h'],
    ]);
    html += card('Electron-density peak', [
      ['edmax', fmt(g('edmax'), 2) + ' el/cm³'], ['edmaxalt', fmt(g('edmaxalt'), 2) + ' km'],
      ['edmaxlat', fmt(g('edmaxlat'), 3) + ' °N'], ['edmaxlon', fmt(g('edmaxlon'), 3) + ' °E'],
      ['edmaxaz', fmt(g('edmaxaz'), 3) + ' °'], ['Critical freq (foF2)', fmt(g('critfreq'), 4) + ' MHz'],
    ]);
    html += card('TEC parameters', [
      ['tec0', fmt(g('tec0'), 4) + ' TECU'], ['tec1', fmt(g('tec1'), 4) + ' TECU'],
    ]);
    html += card('Endpoints', [
      ['Bottom alt / lat / lon', fmt(g('botalt'), 2) + ' km / ' + fmt(g('botlat'), 3) + '° / ' + fmt(g('botlon'), 3) + '°'],
      ['Top alt / lat / lon', fmt(g('topalt'), 2) + ' km / ' + fmt(g('toplat'), 3) + '° / ' + fmt(g('toplon'), 3) + '°'],
      ['Sample count', g('shortlen') || (state.raw.alt && state.raw.alt.length)],
    ]);
    html += card('Processing / provenance', [
      ['Inverter', g('inverter')], ['Parms file', g('parmsfile')], ['icalib', g('icalib')],
      ['smear', fmt(g('smear'), 3)], ['topfit', fmt(g('topfit'), 6)], ['hscale', g('hscale')],
      ['Creation time', g('creation_time')],
    ]);
    // Derived statistics card
    var rows = [];
    VARS.forEach(function (v) {
      var s = stats(state.raw[v.key]);
      rows.push([v.label + ' (' + v.unit + ')', s ? fmt(s.min, 3) + ' … ' + fmt(s.max, 3) + '  (n=' + s.n + ')' : '—']);
    });
    html += card('Profile statistics (computed)', rows);

    els.metaGrid.innerHTML = html;
  }

  // ----- Data table -----
  function renderTable() {
    setControls('');
    els.statline.textContent = 'Raw values as stored (−999 = fill value, shown in colour). ' + state.raw.alt.length + ' rows.';
    var head = '<tr>' + VARS.map(function (v) { return '<th>' + v.nc + '<br><span style="font-weight:400;color:#5c6773">' + v.unit + '</span></th>'; }).join('') + '</tr>';
    var n = state.raw.alt.length, body = '';
    for (var i = 0; i < n; i++) {
      var tds = VARS.map(function (v) {
        var x = state.raw[v.key][i];
        var cls = isFill(x) ? ' class="fill"' : '';
        return '<td' + cls + '>' + (isFinite(x) ? Number(x).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—') + '</td>';
      }).join('');
      body += '<tr>' + tds + '</tr>';
    }
    els.tableWrap.innerHTML = '<table class="data"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function pad2(x) { x = Math.round(Number(x)); return (x < 10 ? '0' : '') + x; }

  // ---------- Exports ----------
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  els.dlImgBtn.addEventListener('click', function () {
    var dpi = parseInt(els.dpiSel.value, 10);
    var fmt = els.fmtSel.value; // 'png' | 'jpeg'
    var scale = dpi / 100;      // base figure is defined at 100 DPI
    els.dlImgBtn.disabled = true; els.dlImgBtn.textContent = 'Rendering…';
    Plotly.toImage(els.plot, { format: fmt, width: state.baseW, height: state.baseH, scale: scale })
      .then(function (dataURL) {
        var blob = DpiExport.tagDataURL(dataURL, fmt, dpi);
        var ext = fmt === 'jpeg' ? 'jpg' : 'png';
        saveBlob(blob, state.stamp + '_' + state.view + '_' + dpi + 'dpi.' + ext);
      })
      .catch(function (e) { alert('Image export failed: ' + e.message); })
      .finally(function () { els.dlImgBtn.disabled = false; els.dlImgBtn.textContent = 'Download image'; });
  });

  els.dlCsvBtn.addEventListener('click', function () {
    if (!state.raw) return;
    var lines = [VARS.map(function (v) { return v.nc + ' (' + v.unit + ')'; }).join(',')];
    var n = state.raw.alt.length;
    for (var i = 0; i < n; i++) {
      lines.push(VARS.map(function (v) { var x = state.raw[v.key][i]; return isFinite(x) ? x : ''; }).join(','));
    }
    saveBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), state.stamp + '_profile.csv');
  });

  els.dlXlsxBtn.addEventListener('click', function () {
    if (!state.raw) return;
    var wb = XLSX.utils.book_new();

    // Sheet 1: profile data (raw, all parameters as columns)
    var header = VARS.map(function (v) { return v.nc + ' (' + v.unit + ')'; });
    var data = [header];
    var n = state.raw.alt.length;
    for (var i = 0; i < n; i++) {
      data.push(VARS.map(function (v) { var x = state.raw[v.key][i]; return isFinite(x) ? x : null; }));
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Profile_Data');

    // Sheet 2: statistics
    var srows = [['Parameter', 'Units', 'N_valid', 'Min', 'Max', 'Mean', 'Median']];
    VARS.forEach(function (v) {
      var s = stats(state.raw[v.key]);
      srows.push(s ? [v.label, v.unit, s.n, s.min, s.max, s.mean, s.median] : [v.label, v.unit, 0, null, null, null, null]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(srows), 'Statistics');

    // Sheet 3: metadata (global attributes)
    var mrows = [['Attribute', 'Value']];
    Object.keys(state.attrs).forEach(function (k) {
      var val = state.attrs[k];
      mrows.push([k, Array.isArray(val) ? val.join(' ') : val]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mrows), 'Metadata');

    XLSX.writeFile(wb, state.stamp + '.xlsx');
  });

  // keyboard nav
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); els.nextBtn.click(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); els.prevBtn.click(); }
  });
})();
