/* Two charts drawn from the tables that sit under them.
   The tables are the source of truth: edit a number in index.html and the chart follows. */
(function () {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fmt(v, digits) {
    var s = Math.abs(v).toFixed(digits == null ? 2 : digits);
    if (v > 0) return '+' + s;
    if (v < 0) return '−' + s;
    return s;
  }

  /* ---------- One tooltip shared by both charts ---------- */
  var tip = el('div', 'chart-tip');
  tip.hidden = true;
  tip.setAttribute('role', 'presentation');
  document.body.appendChild(tip);

  function showTip(target, build, evt) {
    tip.textContent = '';
    build(tip);
    tip.hidden = false;
    var r = target.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = evt && evt.clientX != null ? evt.clientX + 14 : r.left + r.width / 2;
    var y = evt && evt.clientY != null ? evt.clientY + 16 : r.bottom + 8;
    if (x + tw > window.innerWidth - 8) x = Math.max(8, window.innerWidth - tw - 8);
    if (y + th > window.innerHeight - 8) y = (evt && evt.clientY != null ? evt.clientY : r.top) - th - 12;
    tip.style.left = x + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  window.addEventListener('scroll', hideTip, { passive: true });

  function tipLine(parent, color, text) {
    var line = el('span', 'tip-line');
    var key = el('span', 'tip-key');
    key.style.background = color;
    line.appendChild(key);
    line.appendChild(document.createTextNode(text));
    parent.appendChild(line);
  }

  function bindTip(node, build) {
    node.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch') showTip(node, build, e); });
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', function () { showTip(node, build); });
    node.addEventListener('blur', hideTip);
  }

  var css = getComputedStyle(document.documentElement);
  var GAIN = css.getPropertyValue('--gain').trim() || '#2563a8';
  var LOSS = css.getPropertyValue('--loss').trim() || '#c0172e';

  /* ---------- Ledger: target-domain gain vs general-speech change ---------- */
  (function ledger() {
    var fig = document.querySelector('[data-ledger]');
    if (!fig) return;
    var table = fig.querySelector('[data-ledger-table]');
    var host = fig.querySelector('[data-ledger-chart]');
    Array.prototype.forEach.call(fig.querySelectorAll('[data-enhanced]'), function (n) { n.hidden = false; });

    var rows = Array.prototype.map.call(table.tBodies[0].rows, function (tr) {
      return {
        project: tr.cells[0].textContent.trim(),
        cond: tr.cells[1].textContent.trim(),
        gain: parseFloat(tr.getAttribute('data-gain')),
        general: parseFloat(tr.getAttribute('data-general')),
        approx: tr.getAttribute('data-approx') === 'true',
        target: tr.getAttribute('data-target'),
        detail: tr.getAttribute('data-detail') || '',
        gainText: tr.cells[2].textContent.trim(),
        generalText: tr.cells[3].textContent.trim()
      };
    });

    var MIN = -8, MAX = 24, TICKS = [-5, 0, 5, 10, 15, 20];
    function pos(v) { return (v - MIN) / (MAX - MIN) * 100; }

    var wrapNode = el('div', 'lg');
    var prev = null;
    var gainLabels = [];

    rows.forEach(function (r, i) {
      var row = el('a', 'lg-row');
      row.href = '#' + r.target;
      if (prev !== r.project && i > 0) row.classList.add('lg-first');
      var label = el('span', 'lg-label');
      if (prev !== r.project) label.appendChild(el('span', 'lg-project', r.project));
      label.appendChild(el('span', 'lg-cond', r.cond));
      row.appendChild(label);

      var strip = el('span', 'lg-strip');
      TICKS.forEach(function (t) {
        var tick = el('span', 'lg-tick' + (t === 0 ? ' lg-zero' : ''));
        tick.style.left = pos(t) + '%';
        strip.appendChild(tick);
      });
      if (r.general < 0) {
        var loss = el('span', 'lg-bar lg-bar-loss' + (r.approx ? ' is-approx' : ''));
        loss.style.left = pos(r.general) + '%';
        loss.style.width = (pos(0) - pos(r.general)) + '%';
        strip.appendChild(loss);
      }
      var lossVal = el('span', 'lg-val lg-val-loss', r.generalText);
      lossVal.style.right = 'calc(' + (100 - pos(Math.min(0, r.general))) + '% + 0.45rem)';
      strip.appendChild(lossVal);

      var gain = el('span', 'lg-bar lg-bar-gain');
      gain.style.left = pos(0) + '%';
      gain.style.width = (pos(r.gain) - pos(0)) + '%';
      strip.appendChild(gain);
      var gainVal = el('span', 'lg-val lg-val-gain', r.gainText);
      gainVal.style.left = 'calc(' + pos(r.gain) + '% + 0.45rem)';
      strip.appendChild(gainVal);
      gainLabels.push({ node: gainVal, strip: strip, at: pos(r.gain) });

      row.appendChild(strip);
      row.setAttribute('aria-label', r.project + ', ' + r.cond + ': gain ' + r.gainText + ' percentage points; general speech ' + (r.approx ? 'about ' : '') + r.generalText.replace('≈', '').trim() + ' percentage points. Open the project.');
      bindTip(row, function (t) {
        t.appendChild(el('strong', null, r.project));
        t.appendChild(el('span', null, r.cond));
        tipLine(t, GAIN, 'Gain ' + r.gainText + ' pp');
        tipLine(t, LOSS, 'General speech ' + r.generalText + ' pp');
        if (r.detail) { var d = el('span', null, r.detail); d.style.display = 'block'; d.style.marginTop = '.3rem'; t.appendChild(d); }
      });
      wrapNode.appendChild(row);
      prev = r.project;
    });

    var axis = el('div', 'lg-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.appendChild(el('span', 'lg-axis-name', 'Percentage points'));
    var axisStrip = el('span', 'lg-axis-strip');
    TICKS.forEach(function (t) {
      var s = el('span', null, t > 0 ? '+' + t : t < 0 ? '−' + Math.abs(t) : '0');
      s.style.left = pos(t) + '%';
      axisStrip.appendChild(s);
    });
    axis.appendChild(axisStrip);
    wrapNode.appendChild(axis);
    host.appendChild(wrapNode);

    // A value that does not fit past the end of its bar moves inside the bar.
    function fitLabels() {
      gainLabels.forEach(function (g) {
        g.node.classList.remove('is-inside');
        g.node.style.left = 'calc(' + g.at + '% + 0.45rem)';
        g.node.style.right = '';
        var sw = g.strip.clientWidth;
        var need = g.at / 100 * sw + 7 + g.node.offsetWidth;
        if (need > sw) {
          g.node.classList.add('is-inside');
          g.node.style.left = '';
          g.node.style.right = 'calc(' + (100 - g.at) + '% + 0.45rem)';
        }
      });
    }
    fitLabels();
    window.addEventListener('resize', fitLabels);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitLabels);
  })();

  /* ---------- Thesis: baseline vs one decoding method, log CER axis ---------- */
  (function thesis() {
    var fig = document.querySelector('[data-thesis]');
    if (!fig) return;
    var table = fig.querySelector('[data-thesis-table]');
    var host = fig.querySelector('[data-dumbbell]');
    Array.prototype.forEach.call(fig.querySelectorAll('[data-enhanced]'), function (n) { n.hidden = false; });

    var METHOD = { grammar: 'Word-level grammar', lexicon: 'Lexicon only', shallow: 'Shallow fusion' };
    var ENCODER = { citrinet: 'Citrinet-1024', conformer: 'Conformer-L' };
    var data = Array.prototype.map.call(table.tBodies[0].rows, function (tr) {
      var d = {};
      ['encoder', 'set', 'desc'].forEach(function (k) { d[k] = tr.getAttribute('data-' + k); });
      ['ppl', 'baseline', 'grammar', 'lexicon', 'shallow'].forEach(function (k) { d[k] = parseFloat(tr.getAttribute('data-' + k)); });
      return d;
    });
    var sets = [];
    data.forEach(function (d) { if (sets.indexOf(d.set) < 0) sets.push(d.set); });
    sets.sort(function (a, b) {
      var pa = data.filter(function (d) { return d.set === a; })[0].ppl;
      var pb = data.filter(function (d) { return d.set === b; })[0].ppl;
      return pa - pb;
    });

    var LO = Math.log10(0.3), HI = Math.log10(30), TICKS = [0.5, 1, 2, 5, 10, 20];
    function pos(v) { return (Math.log10(v) - LO) / (HI - LO) * 100; }
    function pplText(p) { return p >= 100 ? Math.round(p).toLocaleString('en-US') : p.toFixed(2); }

    var state = { encoder: 'citrinet', method: 'grammar' };
    var rowsUI = sets.map(function (name) {
      var first = data.filter(function (d) { return d.set === name; })[0];
      var row = el('div', 'db-row');
      row.tabIndex = 0;
      var label = el('div', 'db-label');
      label.appendChild(el('span', 'db-set', name));
      label.appendChild(el('span', 'db-desc', first.desc + ', perplexity ' + pplText(first.ppl)));
      row.appendChild(label);
      var strip = el('div', 'db-strip');
      TICKS.forEach(function (t) { var k = el('span', 'db-tick'); k.style.left = pos(t) + '%'; strip.appendChild(k); });
      var line = el('span', 'db-line');
      var base = el('span', 'db-dot db-dot-base');
      var meth = el('span', 'db-dot db-dot-method');
      var baseVal = el('span', 'db-val db-val-base');
      var methVal = el('span', 'db-val db-val-method');
      [line, base, meth, baseVal, methVal].forEach(function (n) { strip.appendChild(n); });
      row.appendChild(strip);
      host.appendChild(row);
      var ui = { name: name, row: row, line: line, base: base, meth: meth, baseVal: baseVal, methVal: methVal, current: null };
      bindTip(row, function (t) {
        var d = ui.current;
        if (!d) return;
        var change = (d[state.method] - d.baseline) / d.baseline * 100;
        t.appendChild(el('strong', null, d.set));
        t.appendChild(el('span', null, ENCODER[state.encoder] + ', ' + d.desc + ', LM perplexity ' + pplText(d.ppl)));
        tipLine(t, '#8a919c', 'Baseline ' + d.baseline.toFixed(2) + '% CER');
        tipLine(t, d[state.method] < d.baseline ? GAIN : LOSS, METHOD[state.method] + ' ' + d[state.method].toFixed(2) + '% CER (' + fmt(change, 0) + '% errors)');
      });
      return ui;
    });

    var axis = el('div', 'db-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.appendChild(el('span', 'db-axis-name', 'CER (%), log scale'));
    var axisStrip = el('div', 'db-axis-strip');
    TICKS.forEach(function (t) { var s = el('span', null, String(t)); s.style.left = pos(t) + '%'; axisStrip.appendChild(s); });
    axis.appendChild(axisStrip);
    host.appendChild(axis);

    var summary = el('p', 'figure-note');
    summary.style.marginTop = '.9rem';
    host.appendChild(summary);

    function render() {
      var better = [], worse = [];
      rowsUI.forEach(function (ui) {
        var d = data.filter(function (x) { return x.set === ui.name && x.encoder === state.encoder; })[0];
        ui.current = d;
        var b = d.baseline, m = d[state.method], gain = m < b;
        (gain ? better : worse).push(ui.name);
        ui.row.classList.toggle('is-gain', gain);
        ui.row.classList.toggle('is-loss', !gain);
        var pb = pos(b), pm = pos(m);
        ui.line.style.left = Math.min(pb, pm) + '%';
        ui.line.style.width = Math.abs(pm - pb) + '%';
        ui.base.style.left = pb + '%';
        ui.meth.style.left = pm + '%';
        ui.baseVal.textContent = b.toFixed(2);
        ui.methVal.textContent = m.toFixed(2);
        ui.baseVal.style.left = pb + '%';
        ui.methVal.style.left = pm + '%';
        ui.baseVal.className = 'db-val db-val-base ' + (gain ? 'right' : 'left');
        ui.methVal.className = 'db-val db-val-method ' + (gain ? 'left' : 'right');
        ui.row.setAttribute('aria-label', d.set + ', ' + d.desc + ', perplexity ' + pplText(d.ppl) + '. Baseline ' + b.toFixed(2) + ' percent CER; ' + METHOD[state.method] + ' ' + m.toFixed(2) + ' percent.');
      });
      function list(a) { return !a.length ? 'none' : a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
      var lead = ENCODER[state.encoder] + ' with ' + METHOD[state.method].toLowerCase() + ': ';
      if (!worse.length) summary.textContent = lead + 'fewer errors on all ' + better.length + ' test sets.';
      else if (!better.length) summary.textContent = lead + 'more errors on all ' + worse.length + ' test sets.';
      else summary.textContent = lead + 'fewer errors on ' + list(better) + '; more errors on ' + list(worse) + '.';
    }

    function bindGroup(attr, key) {
      var buttons = fig.querySelectorAll('button[' + attr + ']');
      Array.prototype.forEach.call(buttons, function (btn) {
        btn.addEventListener('click', function () {
          state[key] = btn.getAttribute(attr);
          Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
          render();
        });
      });
    }
    bindGroup('data-encoder', 'encoder');
    bindGroup('data-method', 'method');
    render();
  })();
})();
