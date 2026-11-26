/* Page behavior: navigation state, project disclosure, publication filters, BibTeX copy, tabs.
   Everything here is an enhancement; the page reads fully without JavaScript. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  $$('[data-enhanced]').forEach(function (n) { n.hidden = false; });

  /* Top bar: hairline once the page scrolls, and the current section in the nav. */
  var bar = $('.topbar');
  function onScroll() { bar.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var navLinks = $$('.topnav a');
  var sections = navLinks.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    var visible = new Map();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0); });
      var best = null, bestRatio = 0;
      sections.forEach(function (s) {
        var r = visible.get(s.id) || 0;
        if (r > bestRatio) { best = s.id; bestRatio = r; }
      });
      navLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + best) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.01, 0.2, 0.5, 1] });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* Open a project when its link is followed (ledger rows, paper references, shared URLs). */
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    var details = target.tagName === 'DETAILS' ? target : target.closest('details');
    if (details && !details.open) details.open = true;
    if (target.classList.contains('is-filtered') && typeof applyPubFilter === 'function') applyPubFilter('all');
  }
  window.addEventListener('hashchange', openFromHash);

  /* Open or close every project in a section. */
  $$('[data-expand]').forEach(function (btn) {
    var scope = $(btn.getAttribute('data-expand'));
    var noun = btn.textContent.replace(/^Open all /, '');
    function sync() {
      var all = $$('details.entry', scope);
      var allOpen = all.length && all.every(function (d) { return d.open; });
      btn.textContent = (allOpen ? 'Close all ' : 'Open all ') + noun;
      return allOpen;
    }
    btn.addEventListener('click', function () {
      var allOpen = sync();
      $$('details.entry', scope).forEach(function (d) { d.open = !allOpen; });
      sync();
    });
    $$('details.entry', scope).forEach(function (d) { d.addEventListener('toggle', sync); });
  });

  /* Publication filters. */
  var pubs = $$('.pub');
  var countEl = $('[data-pubcount]');
  var pubButtons = $$('[data-pubfilter]');
  function applyPubFilter(key) {
    var shown = 0;
    pubs.forEach(function (li) {
      var tags = (li.getAttribute('data-tags') || '').split(/\s+/);
      var match = key === 'all' || tags.indexOf(key) >= 0;
      li.classList.toggle('is-filtered', !match);
      if (match) shown++;
    });
    pubButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pubfilter') === key)); });
    if (countEl) countEl.textContent = 'Showing ' + shown + ' of ' + pubs.length;
  }
  pubButtons.forEach(function (b) {
    var key = b.getAttribute('data-pubfilter');
    var n = key === 'all' ? pubs.length : pubs.filter(function (li) { return (li.getAttribute('data-tags') || '').split(/\s+/).indexOf(key) >= 0; }).length;
    b.textContent = b.textContent + ' (' + n + ')';
    b.addEventListener('click', function () { applyPubFilter(key); });
  });
  if (pubButtons.length) applyPubFilter('all');
  openFromHash();

  /* Copy BibTeX. */
  $$('button[data-copy]').forEach(function (btn) {
    var code = document.getElementById(btn.getAttribute('data-copy'));
    var status = btn.parentNode.querySelector('.copy-status');
    if (!code) return;
    btn.hidden = false;
    var timer = 0;
    btn.addEventListener('click', function () {
      var text = code.textContent;
      function say(msg) {
        clearTimeout(timer);
        status.textContent = '';
        timer = setTimeout(function () { status.textContent = msg; }, 60);
        setTimeout(function () { if (status.textContent === msg) status.textContent = ''; }, 4000);
      }
      function fallback() {
        var details = code.closest('details');
        if (details) details.open = true;
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        code.focus();
        say('Selected. Press Ctrl+C or Cmd+C to copy.');
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { say('Copied'); }, fallback);
      } else {
        fallback();
      }
    });
  });

  /* Example tabs (WAI-ARIA tabs pattern). */
  $$('[role="tablist"]').forEach(function (list) {
    var tabs = $$('[role="tab"]', list);
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    select(tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0], false);
  });

  /* Print everything, then put the page back. */
  var reopened = [];
  window.addEventListener('beforeprint', function () {
    reopened = $$('details:not([open])');
    reopened.forEach(function (d) { d.open = true; });
    $$('[role="tabpanel"]').forEach(function (p) { p.dataset.wasHidden = String(p.hidden); p.hidden = false; });
  });
  window.addEventListener('afterprint', function () {
    reopened.forEach(function (d) { d.open = false; });
    $$('[role="tabpanel"]').forEach(function (p) { if (p.dataset.wasHidden === 'true') p.hidden = true; });
  });
})();
