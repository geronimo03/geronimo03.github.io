/* The hero sonagram: a small Klatt-style formant synthesizer says 조은수 [tɕo.ɯn.su],
   a simulated phone line band-limits it, and a wideband spectrogram is drawn in the
   style of a 1940s sonagraph (ink on paper). Everything is computed in the browser. */
(function () {
  'use strict';

  var fig = document.querySelector('[data-sonagram]');
  if (!fig) return;

  var SR = 16000;
  var DUR = 1.1;
  var N = Math.round(SR * DUR);
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Segment plan in seconds. The IPA labels under the plot are placed from this table. */
  var SEGMENTS = [
    { ipa: 'tɕ', start: 0.080, end: 0.162 },
    { ipa: 'o', start: 0.175, end: 0.335 },
    { ipa: 'ɯ', start: 0.390, end: 0.530 },
    { ipa: 'n', start: 0.545, end: 0.625 },
    { ipa: 's', start: 0.635, end: 0.750 },
    { ipa: 'u', start: 0.785, end: 1.000 }
  ];

  /* Control keyframes. Each parameter is linearly interpolated between the keyframes
     that mention it. F = formant frequencies (Hz), B = bandwidths (Hz).
     av = voicing, ah = aspiration, fa = [tɕ] frication, fs = [s] frication. */
  var KEYS = [
    [0.000, { f0: 190, av: 0, ah: 0, fa: 0, fs: 0, F1: 300, F2: 2050, F3: 2850, F4: 3700, F5: 4600, B1: 90, B2: 110, B3: 160, B4: 250, B5: 300 }],
    [0.080, { fa: 0 }],
    [0.0815, { fa: 1.0 }],
    [0.088, { fa: 0.55 }],
    [0.104, { fa: 0.85 }],
    [0.150, { fa: 0.7, ah: 0 }],
    [0.162, { fa: 0.2, ah: 0.25, av: 0 }],
    [0.172, { fa: 0, ah: 0.1, av: 0.55, F1: 300, F2: 2050, F3: 2850 }],
    [0.205, { ah: 0, av: 1, F1: 470, F2: 900, F3: 2650 }],
    [0.335, { f0: 186, F1: 470, F2: 880, F3: 2650 }],
    [0.390, { f0: 205, F1: 420, F2: 1550, F3: 2800 }],
    [0.530, { f0: 242, av: 1, F1: 420, F2: 1550, F3: 2800, B1: 90, B2: 110, B3: 160 }],
    [0.548, { av: 0.42, F1: 270, F2: 1650, F3: 2700, B1: 150, B2: 320, B3: 480 }],
    [0.620, { av: 0.38, f0: 236, ah: 0 }],
    [0.632, { av: 0, ah: 0.06, fs: 0 }],
    [0.645, { fs: 0.85, ah: 0 }],
    [0.735, { fs: 0.7 }],
    [0.752, { fs: 0.15, ah: 0.2, F1: 330, F2: 1600, F3: 2700, B1: 90, B2: 110, B3: 160 }],
    [0.770, { av: 0 }],
    [0.785, { fs: 0, ah: 0.08, av: 0.5, f0: 228 }],
    [0.825, { ah: 0, av: 1, F1: 370, F2: 900, F3: 2600 }],
    [0.930, { av: 0.72, f0: 205 }],
    [1.000, { av: 0, f0: 170, F1: 360, F2: 850 }],
    [1.100, { av: 0 }]
  ];

  /* ---------- small DSP helpers ---------- */

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussianNoise(n, seed) {
    var rand = mulberry32(seed);
    var out = new Float32Array(n);
    for (var i = 0; i < n; i += 2) {
      var u = Math.max(rand(), 1e-12), v = rand();
      var r = Math.sqrt(-2 * Math.log(u));
      out[i] = r * Math.cos(2 * Math.PI * v);
      if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v);
    }
    return out;
  }

  function track(name) {
    var pts = [];
    for (var k = 0; k < KEYS.length; k++) {
      if (Object.prototype.hasOwnProperty.call(KEYS[k][1], name)) pts.push([KEYS[k][0], KEYS[k][1][name]]);
    }
    var out = new Float32Array(N);
    var j = 0;
    for (var i = 0; i < N; i++) {
      var t = i / SR;
      while (j < pts.length - 2 && t > pts[j + 1][0]) j++;
      var a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
      if (t <= a[0]) out[i] = a[1];
      else if (t >= b[0]) out[i] = b[1];
      else out[i] = a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
    }
    return out;
  }

  /* Klatt (1980) resonator, coefficients updated every `step` samples. */
  function resonate(x, freq, bw, step) {
    var y = new Float32Array(x.length);
    var y1 = 0, y2 = 0, A = 1, B = 0, C = 0, T = 1 / SR;
    for (var i = 0; i < x.length; i++) {
      if (i % step === 0) {
        var f = typeof freq === 'number' ? freq : freq[i];
        var b = typeof bw === 'number' ? bw : bw[i];
        C = -Math.exp(-2 * Math.PI * b * T);
        B = 2 * Math.exp(-Math.PI * b * T) * Math.cos(2 * Math.PI * f * T);
        A = 1 - B - C;
      }
      var v = A * x[i] + B * y1 + C * y2;
      y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }

  function differentiate(x) {
    var y = new Float32Array(x.length);
    for (var i = 1; i < x.length; i++) y[i] = x[i] - x[i - 1];
    return y;
  }

  function rms(x, t0, t1) {
    var a = Math.round(t0 * SR), b = Math.round(t1 * SR), s = 0;
    for (var i = a; i < b; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, b - a)) || 1;
  }

  function scaleInto(out, x, gain) {
    for (var i = 0; i < out.length; i++) out[i] += x[i] * gain;
  }

  /* ---------- the synthesizer ---------- */

  function synthesize() {
    var f0 = track('f0'), av = track('av'), ah = track('ah'), fa = track('fa'), fs = track('fs');
    var F = [track('F1'), track('F2'), track('F3'), track('F4'), track('F5')];
    var B = [track('B1'), track('B2'), track('B3'), track('B4'), track('B5')];
    var rand = mulberry32(7);

    // Glottal source: jittered impulse train through Klatt's low-pass glottal resonator (-12 dB/octave);
    // radiation adds +6 dB/octave, so voiced speech falls at about -6 dB/octave overall.
    var pulses = new Float32Array(N);
    var phase = 0;
    for (var i = 0; i < N; i++) {
      phase += f0[i] / SR;
      if (phase >= 1) {
        phase -= 1 + (rand() - 0.5) * 0.01;
        pulses[i] = av[i] * (1 + (rand() - 0.5) * 0.06);
      }
    }
    var glottal = resonate(pulses, 0, 100, 16);

    var noise = gaussianNoise(N, 11);
    var aspNoise = new Float32Array(N), friA = new Float32Array(N), friS = new Float32Array(N);
    for (i = 0; i < N; i++) {
      aspNoise[i] = noise[i] * ah[i];
      friA[i] = noise[i] * fa[i];
      friS[i] = noise[i] * fs[i];
    }

    function cascade(x) {
      var y = x;
      for (var k = 4; k >= 0; k--) y = resonate(y, F[k], B[k], 16);
      return y;
    }

    // Radiation (+6 dB/octave) is applied per branch so each can be leveled by RMS.
    var voiced = differentiate(cascade(glottal));
    var aspirated = differentiate(cascade(aspNoise));
    var fricA = differentiate(resonate(resonate(friA, 4100, 1100, 64), 4900, 1500, 64));
    var fricS = differentiate(resonate(resonate(friS, 7100, 1300, 64), 6000, 1700, 64));

    var out = new Float32Array(N);
    scaleInto(out, voiced, 1 / rms(voiced, 0.22, 0.32));
    scaleInto(out, aspirated, 0.1 / rms(aspirated, 0.755, 0.78));
    scaleInto(out, fricA, 0.3 / rms(fricA, 0.1, 0.15));
    scaleInto(out, fricS, 0.38 / rms(fricS, 0.65, 0.73));

    fade(out, 0.006);
    normalizePeak(out, 0.85);
    return out;
  }

  function fade(x, seconds) {
    var n = Math.round(seconds * SR);
    for (var i = 0; i < n; i++) {
      var g = 0.5 - 0.5 * Math.cos(Math.PI * i / n);
      x[i] *= g; x[x.length - 1 - i] *= g;
    }
  }

  function normalizePeak(x, target) {
    var peak = 0;
    for (var i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    var g = peak > 0 ? target / peak : 1;
    for (i = 0; i < x.length; i++) x[i] *= g;
  }

  /* ---------- the phone line: 300-3,400 Hz, 8 kHz sampling, 8-bit mu-law ---------- */

  function biquad(type, fc, q, rate) {
    var w = 2 * Math.PI * fc / rate, cw = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    var b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    var a0 = 1 + alpha;
    return [b0 / a0, b1 / a0, b2 / a0, (-2 * cw) / a0, (1 - alpha) / a0];
  }

  function runBiquads(x, sections) {
    var y = x;
    for (var s = 0; s < sections.length; s++) {
      var c = sections[s], out = new Float32Array(y.length), z1 = 0, z2 = 0;
      for (var i = 0; i < y.length; i++) {
        var v = c[0] * y[i] + z1;
        z1 = c[1] * y[i] - c[3] * v + z2;
        z2 = c[2] * y[i] - c[4] * v;
        out[i] = v;
      }
      y = out;
    }
    return y;
  }

  function butterworth(type, fc, order, rate) {
    var qs = order === 4 ? [0.5412, 1.3066] : [0.5098, 0.6013, 0.9000, 2.5629];
    return qs.map(function (q) { return biquad(type, fc, q, rate); });
  }

  function muLaw(x) {
    var mu = 255, out = new Float32Array(x.length);
    for (var i = 0; i < x.length; i++) {
      var v = Math.max(-1, Math.min(1, x[i]));
      var c = Math.sign(v) * Math.log(1 + mu * Math.abs(v)) / Math.log(1 + mu);
      c = Math.round(c * 127) / 127;
      out[i] = Math.sign(c) * (Math.pow(1 + mu, Math.abs(c)) - 1) / mu;
    }
    return out;
  }

  function phoneLine(x) {
    var lp = butterworth('lp', 3400, 8, SR);
    var band = runBiquads(x, butterworth('hp', 300, 4, SR).concat(lp, lp));
    var narrow = new Float32Array(Math.ceil(band.length / 2));
    for (var i = 0; i < narrow.length; i++) narrow[i] = band[i * 2];
    var coded = muLaw(narrow);
    var up = new Float32Array(band.length);
    for (i = 0; i < coded.length && i * 2 < up.length; i++) up[i * 2] = coded[i] * 2;
    var interp = butterworth('lp', 3500, 8, SR);
    return runBiquads(up, interp.concat(interp, interp));
  }

  /* ---------- spectrogram ---------- */

  var WIN = 128, HOP = 16, NFFT = 256, BINS = NFFT / 2 + 1;

  function fft(re, im) {
    var n = re.length, i, j, k;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; var ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var ar = re[i + k], ai = im[i + k];
          var br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          var bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi;
          re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  function spectrogram(x) {
    var pre = new Float32Array(x.length);
    for (var i = 1; i < x.length; i++) pre[i] = x[i] - 0.94 * x[i - 1];
    var frames = Math.floor((x.length - WIN) / HOP) + 1;
    var data = new Float32Array(frames * BINS);
    var win = new Float32Array(WIN);
    for (i = 0; i < WIN; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1));
    var re = new Float64Array(NFFT), im = new Float64Array(NFFT);
    for (var f = 0; f < frames; f++) {
      re.fill(0); im.fill(0);
      for (i = 0; i < WIN; i++) re[i] = pre[f * HOP + i] * win[i];
      fft(re, im);
      for (var b = 0; b < BINS; b++) data[f * BINS + b] = 10 * Math.log10(re[b] * re[b] + im[b] * im[b] + 1e-12);
    }
    return { frames: frames, data: data };
  }

  function maxOf(arr) { var m = -Infinity; for (var i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; }

  /* ---------- drawing ---------- */

  var INK = [28, 35, 48], PAPER = [255, 255, 255];
  var RANGE = 62;

  function paint(spec, top, w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(w, h);
    var px = img.data, frames = spec.frames, d = spec.data;
    var floor = top - RANGE;
    for (var x = 0; x < w; x++) {
      var fx = x / Math.max(1, w - 1) * (frames - 1);
      var f0 = Math.floor(fx), f1 = Math.min(frames - 1, f0 + 1), tx = fx - f0;
      for (var y = 0; y < h; y++) {
        var fy = (1 - y / Math.max(1, h - 1)) * (BINS - 1);
        var b0 = Math.floor(fy), b1 = Math.min(BINS - 1, b0 + 1), ty = fy - b0;
        var v00 = d[f0 * BINS + b0], v01 = d[f0 * BINS + b1], v10 = d[f1 * BINS + b0], v11 = d[f1 * BINS + b1];
        var db = (v00 * (1 - ty) + v01 * ty) * (1 - tx) + (v10 * (1 - ty) + v11 * ty) * tx;
        var v = (db - floor) / RANGE;
        v = v <= 0 ? 0 : v >= 1 ? 1 : Math.pow(v, 1.35);
        var o = (y * w + x) * 4;
        px[o] = PAPER[0] + (INK[0] - PAPER[0]) * v;
        px[o + 1] = PAPER[1] + (INK[1] - PAPER[1]) * v;
        px[o + 2] = PAPER[2] + (INK[2] - PAPER[2]) * v;
        px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function hatchPattern(ctx, dpr) {
    var s = Math.round(7 * dpr);
    var p = document.createElement('canvas');
    p.width = s; p.height = s;
    var g = p.getContext('2d');
    g.strokeStyle = 'rgba(192, 23, 46, 0.42)';
    g.lineWidth = Math.max(1, dpr);
    g.beginPath(); g.moveTo(-1, s + 1); g.lineTo(s + 1, -1); g.stroke();
    g.beginPath(); g.moveTo(-1, 1); g.lineTo(1, -1); g.stroke();
    g.beginPath(); g.moveTo(s - 1, s + 1); g.lineTo(s + 1, s - 1); g.stroke();
    return ctx.createPattern(p, 'repeat');
  }

  /* ---------- wiring ---------- */

  var canvas = fig.querySelector('[data-canvas]');
  var wrap = canvas.parentNode;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var noscript = fig.querySelector('[data-noscript]');
  if (noscript) noscript.hidden = true;
  Array.prototype.forEach.call(fig.querySelectorAll('[data-enhanced]'), function (el) { el.hidden = false; });

  var studio = synthesize();
  var phone = phoneLine(studio);
  var specStudio = spectrogram(studio);
  var specPhone = spectrogram(phone);
  var top = maxOf(specStudio.data);

  // Place the IPA labels from the segment table.
  var segEls = fig.querySelectorAll('.sonagram-segments span');
  SEGMENTS.forEach(function (s, i) {
    if (segEls[i]) { segEls[i].textContent = s.ipa; segEls[i].style.setProperty('--t', ((s.start + s.end) / 2 / DUR).toFixed(3)); }
  });

  // Band-edge marker on the frequency axis and a label over the removed band.
  var yaxis = fig.querySelector('.sonagram-yaxis');
  var edge = document.createElement('span');
  edge.className = 'band-edge';
  edge.style.setProperty('--f', (3400 / 8000).toFixed(4));
  edge.textContent = '3.4';
  edge.style.opacity = '0';
  yaxis.appendChild(edge);
  var bandLabel = document.createElement('span');
  bandLabel.className = 'band-label';
  bandLabel.textContent = 'Removed by the phone line';
  bandLabel.style.top = '0.55rem';
  bandLabel.style.opacity = '0';
  bandLabel.setAttribute('aria-hidden', 'true');
  wrap.appendChild(bandLabel);

  var state = { mode: 'studio', mix: 0, sweep: reduceMotion ? 1 : 0, playhead: -1 };
  var layers = null, dpr = 1, W = 0, H = 0, pattern = null;

  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = wrap.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
      layers = { studio: paint(specStudio, top, W, H), phone: paint(specPhone, top, W, H) };
      pattern = hatchPattern(ctx, dpr);
    }
    draw();
  }

  function draw() {
    if (!layers) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    var clipW = Math.round(W * state.sweep);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, clipW, H); ctx.clip();
    ctx.globalAlpha = 1;
    ctx.drawImage(layers.studio, 0, 0);
    if (state.mix > 0) {
      ctx.globalAlpha = state.mix;
      ctx.drawImage(layers.phone, 0, 0);
      var yHi = Math.round(H * (1 - 3400 / 8000)), yLo = Math.round(H * (1 - 300 / 8000));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, yHi);
      ctx.fillRect(0, yLo, W, H - yLo);
      ctx.fillStyle = 'rgba(192, 23, 46, 0.9)';
      ctx.fillRect(0, yHi, W, Math.max(1, Math.round(dpr)));
      ctx.fillRect(0, yLo, W, Math.max(1, Math.round(dpr)));
    }
    ctx.restore();
    if (state.sweep < 1) {
      ctx.fillStyle = 'rgba(90, 99, 114, 0.9)';
      ctx.fillRect(clipW, 0, Math.max(1, Math.round(1.5 * dpr)), H);
    }
    if (state.playhead >= 0) {
      ctx.fillStyle = '#1c2330';
      ctx.fillRect(Math.round(state.playhead * W), 0, Math.max(2, Math.round(2 * dpr)), H);
    }
  }

  function animate(duration, from, to, apply, done) {
    if (reduceMotion || duration <= 0) { apply(to); draw(); if (done) done(); return; }
    var t0 = performance.now();
    function frame(now) {
      var p = Math.min(1, (now - t0) / duration);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      apply(from + (to - from) * e);
      draw();
      if (p < 1) requestAnimationFrame(frame); else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  /* Channel switch */
  var channelButtons = fig.querySelectorAll('[data-channel]');
  var playBtn = fig.querySelector('[data-play]');
  var playLabel = fig.querySelector('[data-play-label]');
  var LABELS = {
    studio: 'Spectrogram of the synthesized name 조은수 at studio bandwidth, 0 to 8 kHz. The hiss of tɕ and s reaches above 4 kHz.',
    phone: 'Spectrogram of the same synthesized name after a simulated phone line. Only 0.3 to 3.4 kHz remains; the bands above and below are marked as removed.'
  };

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    stop();
    Array.prototype.forEach.call(channelButtons, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-channel') === mode)); });
    canvas.setAttribute('aria-label', LABELS[mode]);
    playBtn.setAttribute('aria-label', mode === 'phone' ? 'Play the phone-line version' : 'Play the studio version');
    var target = mode === 'phone' ? 1 : 0;
    bandLabel.style.opacity = String(target);
    edge.style.opacity = String(target);
    animate(420, state.mix, target, function (v) { state.mix = v; });
  }

  Array.prototype.forEach.call(channelButtons, function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-channel')); });
  });

  /* Playback */
  var audio = null, source = null, startedAt = 0, buffers = {};

  function loudnessMatched(x, reference) {
    var y = new Float32Array(x);
    var g = rms(reference, 0, DUR) / rms(y, 0, DUR);
    var peak = 0;
    for (var i = 0; i < y.length; i++) { y[i] *= g; peak = Math.max(peak, Math.abs(y[i])); }
    if (peak > 0.95) for (i = 0; i < y.length; i++) y[i] *= 0.95 / peak;
    return y;
  }

  function bufferFor(mode) {
    if (buffers[mode]) return buffers[mode];
    var data = mode === 'phone' ? loudnessMatched(phone, studio) : studio;
    var out = new Float32Array(data.length);
    for (var i = 0; i < out.length; i++) out[i] = data[i] * 0.6;
    var buf;
    try {
      buf = audio.createBuffer(1, out.length, SR);
      buf.getChannelData(0).set(out);
    } catch (err) {
      var rate = audio.sampleRate, n = Math.round(out.length * rate / SR);
      buf = audio.createBuffer(1, n, rate);
      var ch = buf.getChannelData(0);
      for (var k = 0; k < n; k++) {
        var p = k * SR / rate, j = Math.floor(p), f = p - j;
        ch[k] = (out[j] || 0) * (1 - f) + (out[j + 1] || 0) * f;
      }
    }
    buffers[mode] = buf;
    return buf;
  }

  function stop() {
    if (source) { source.onended = null; try { source.stop(); } catch (e) { /* already stopped */ } source = null; }
    state.playhead = -1;
    playBtn.removeAttribute('data-state');
    playLabel.textContent = 'Play';
    playBtn.setAttribute('aria-label', state.mode === 'phone' ? 'Play the phone-line version' : 'Play the studio version');
    draw();
  }

  function tick() {
    if (!source) return;
    var p = (audio.currentTime - startedAt) / DUR;
    state.playhead = Math.max(0, Math.min(1, p));
    draw();
    if (p < 1) requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', function () {
    if (source) { stop(); return; }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { playLabel.textContent = 'Audio unavailable'; return; }
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume();
    source = audio.createBufferSource();
    source.buffer = bufferFor(state.mode);
    source.connect(audio.destination);
    startedAt = audio.currentTime + 0.02;
    source.start(startedAt);
    source.onended = stop;
    playBtn.setAttribute('data-state', 'playing');
    playBtn.setAttribute('aria-label', 'Stop playback');
    playLabel.textContent = 'Stop';
    requestAnimationFrame(tick);
  });

  /* First paint: the sonagraph sweep. */
  layout();
  if (!reduceMotion) {
    var started = false;
    var go = function () {
      if (started) return;
      started = true;
      animate(1300, 0, 1, function (v) { state.sweep = v; });
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { go(); io.disconnect(); }
      }, { threshold: 0.35 });
      io.observe(wrap);
    } else { go(); }
  }

  if ('ResizeObserver' in window) {
    var pending = 0;
    new ResizeObserver(function () {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(layout);
    }).observe(wrap);
  } else {
    window.addEventListener('resize', layout);
  }
})();
