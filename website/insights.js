// Anonymous, cookie-free visit counting for the Space-please site. No personal data, no fingerprinting:
// a random id in localStorage, page path, referrer and a few interaction counts. Honours Do Not Track
// and Global Privacy Control, and never blocks the page.
(function () {
  'use strict'
  var INSIGHTS_URL = 'https://space-please-insights.vercel.app'
  var ENDPOINT = INSIGHTS_URL + '/api/collect'

  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return
  } catch (e) {
    return
  }

  function store(kind) {
    try {
      return kind === 'session' ? window.sessionStorage : window.localStorage
    } catch (e) {
      return null
    }
  }
  function randomId() {
    try {
      var a = new Uint8Array(16)
      crypto.getRandomValues(a)
      return Array.prototype.map.call(a, function (n) { return ('0' + n.toString(16)).slice(-2) }).join('')
    } catch (e) {
      return String(Date.now()) + Math.random().toString(16).slice(2)
    }
  }
  function persisted(s, key) {
    if (!s) return randomId()
    try {
      var v = s.getItem(key)
      if (!v) { v = randomId(); s.setItem(key, v) }
      return v
    } catch (e) {
      return randomId()
    }
  }

  var anonId = persisted(store('local'), 'sp_anon')
  var sessionId = persisted(store('session'), 'sp_session')
  var startedAt = Date.now()

  function screenClass() {
    var w = window.innerWidth
    return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'
  }

  function send(events, beacon) {
    var body = JSON.stringify({
      source: 'site',
      anon_id: anonId,
      session_id: sessionId,
      locale: (navigator.language || '').slice(0, 40),
      events: events,
    })
    try {
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))
        return
      }
      fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true }).catch(function () {})
    } catch (e) {
      /* never break the page */
    }
  }

  function params() {
    try {
      var q = new URLSearchParams(location.search)
      var p = {}
      if (q.get('utm_source')) p.utm_source = q.get('utm_source').slice(0, 120)
      if (q.get('utm_medium')) p.utm_medium = q.get('utm_medium').slice(0, 120)
      if (q.get('utm_campaign')) p.utm_campaign = q.get('utm_campaign').slice(0, 120)
      return p
    } catch (e) {
      return {}
    }
  }

  // Pageview
  var pv = params()
  pv.screen = screenClass()
  send([{ name: 'pageview', ts: Date.now(), path: location.pathname.slice(0, 300), referrer: (document.referrer || '').slice(0, 500), props: pv }])

  // Which download/outbound links people click, and where on the page.
  function locationOf(el) {
    var section = el.closest('.hero') ? 'hero' : el.closest('.nav') ? 'nav' : el.closest('.install') ? 'install' : el.closest('.footer') ? 'footer' : 'body'
    return section
  }
  function host(href) {
    try {
      var h = new URL(href, location.href).hostname.replace(/^www\./, '')
      if (h.indexOf('github.com') === 0) return href.indexOf('/releases') > -1 ? 'releases' : href.indexOf('/issues') > -1 ? 'issues' : 'github'
      return h.slice(0, 120)
    } catch (e) {
      return 'other'
    }
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
    if (!a) return
    var href = a.getAttribute('href') || ''
    if (/\.dmg($|\?)/i.test(href)) {
      send([{ name: 'download_click', ts: Date.now(), props: { location: locationOf(a) } }])
    } else if (/^https?:/i.test(href) && a.hostname !== location.hostname) {
      send([{ name: 'outbound_click', ts: Date.now(), props: { target: host(href) } }])
    }
  }, true)

  // Scroll depth, each threshold once.
  var seen = {}
  window.addEventListener('scroll', function () {
    var doc = document.documentElement
    var scrollable = doc.scrollHeight - window.innerHeight
    if (scrollable <= 0) return
    var pct = Math.round(((window.scrollY || doc.scrollTop) / scrollable) * 100)
    ;[25, 50, 75, 100].forEach(function (mark) {
      if (pct >= mark && !seen[mark]) {
        seen[mark] = true
        send([{ name: 'scroll_depth', ts: Date.now(), props: { percent: mark } }])
      }
    })
  }, { passive: true })

  // Time on page, sent once as the tab goes away.
  var left = false
  window.addEventListener('pagehide', function () {
    if (left) return
    left = true
    send([{ name: 'page_leave', ts: Date.now(), props: { seconds: Math.round((Date.now() - startedAt) / 1000) } }], true)
  })
})()
