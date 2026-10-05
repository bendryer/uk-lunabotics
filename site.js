(function () {
  'use strict';

  document.documentElement.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var DAY = 86400000;

  /* After the deadline, swap the live calls to action for "closed" wording */
  var closeApplications = function () {
    if (document.documentElement.classList.contains('is-closed')) return;
    document.documentElement.classList.add('is-closed');
    document.querySelectorAll('[data-closed-text]').forEach(function (el) {
      /* Once its follow-up date has passed (places announced), an element moves on to its later wording */
      var after = el.getAttribute('data-announced-after');
      var later = after && Date.now() >= new Date(after).getTime();
      el.textContent = el.getAttribute(later ? 'data-announced-text' : 'data-closed-text');
    });
    document.querySelectorAll('[data-closed-href]').forEach(function (el) { el.setAttribute('href', el.getAttribute('data-closed-href')); });
  };

  /* One orange action at a time: quieten the masthead button while the hero buttons are visible */
  var mastCta = document.querySelector('.masthead__cta');
  var heroActions = document.querySelector('.hero__actions');
  if (mastCta && heroActions && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      mastCta.classList.toggle('is-quiet', entries[0].isIntersecting);
    }).observe(heroActions);
  }

  /* Countdown to the application deadline */
  var countdown = document.querySelector('.countdown');
  if (countdown) {
    var deadline = new Date(countdown.getAttribute('data-deadline')).getTime();
    var units = {};
    countdown.querySelectorAll('[data-unit]').forEach(function (el) { units[el.getAttribute('data-unit')] = el; });
    var tick = function () {
      var left = deadline - Date.now();
      if (left <= 0) {
        closeApplications();
        countdown.classList.add('is-closed');
        countdown.querySelector('.countdown__label').textContent = 'Applications for 2027 have closed. Email us with any questions.';
        return false;
      }
      var s = Math.floor(left / 1000);
      units.d.textContent = Math.floor(left / DAY);
      units.h.textContent = pad(Math.floor(s / 3600) % 24);
      units.m.textContent = pad(Math.floor(s / 60) % 60);
      units.s.textContent = pad(s % 60);
      return true;
    };
    if (tick()) {
      var timer = setInterval(function () { if (!tick()) clearInterval(timer); }, 1000);
    }
  }

  /* Key dates: mark what has passed and what is next (same day maths as the countdown) */
  var timeline = document.querySelector('[data-timeline]');
  if (timeline) {
    var now = Date.now();
    var foundNext = false;
    timeline.querySelectorAll('li').forEach(function (li) {
      var when = new Date(li.getAttribute('data-date')).getTime();
      var t = li.querySelector('.timeline__t');
      if (when < now) {
        li.classList.add('is-past');
        t.textContent = 'Done';
      } else {
        var days = Math.floor((when - now) / DAY);
        t.textContent = days < 1 ? 'Under 1 day' : 'T–' + days + (days === 1 ? ' day' : ' days');
        if (!foundNext) {
          li.classList.add('is-next');
          li.setAttribute('aria-current', 'step');
          foundNext = true;
        }
      }
    });
  }

  /* Camera switcher: cut between the 2026 team feeds.
     One clock drives the dwell bar, the cut and the replay timecode, and it only runs
     while the monitor is on screen, the tab is visible and the cycle is playing. */
  var monitor = document.querySelector('.monitor');
  if (monitor) {
    var tabs = Array.prototype.slice.call(monitor.querySelectorAll('[role="tab"]'));
    var pauseBtn = monitor.querySelector('.monitor__pause');
    var still = monitor.querySelector('[data-still]');
    var DWELL = 6500;
    var current = 0;
    var elapsed = 0;
    var stopped = reduceMotion;   /* stopped by the visitor (pause, or choosing a camera) */
    var onScreen = true;
    var rafId = null;
    var last = null;

    /* Feeds 2-4 are lazy in the markup, so they never compete with the first screen;
       once the page has loaded they are fetched eagerly so each cut lands on a ready image */
    var loadDeferred = function () {
      monitor.querySelectorAll('.feed img[loading="lazy"]').forEach(function (img) {
        img.loading = 'eager';
      });
    };
    if (document.readyState === 'complete') loadDeferred();
    else window.addEventListener('load', loadDeferred);

    var select = function (i, focus) {
      if (i === current) return;
      loadDeferred();
      var oldPanel = document.getElementById(tabs[current].getAttribute('aria-controls'));
      var newPanel = document.getElementById(tabs[i].getAttribute('aria-controls'));
      tabs[current].setAttribute('aria-selected', 'false');
      tabs[current].setAttribute('tabindex', '-1');
      tabs[current].style.removeProperty('--p');
      tabs[i].setAttribute('aria-selected', 'true');
      tabs[i].removeAttribute('tabindex');
      newPanel.hidden = false;
      newPanel.style.zIndex = 2;
      oldPanel.style.zIndex = 1;
      var finish = function () { oldPanel.hidden = true; newPanel.style.zIndex = ''; oldPanel.style.zIndex = ''; };
      if (reduceMotion) {
        finish();
      } else {
        newPanel.classList.remove('is-cutting');
        void newPanel.offsetWidth;
        newPanel.classList.add('is-cutting');
        setTimeout(finish, 520);
      }
      current = i;
      elapsed = 0;
      if (still) still.textContent = (i + 1) + '/' + tabs.length;
      if (focus) tabs[i].focus();
    };

    var setStopped = function (value) {
      stopped = value;
      elapsed = 0;
      tabs[current].style.setProperty('--p', 0);
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', value ? 'true' : 'false');
        pauseBtn.setAttribute('aria-label', value ? 'Play the camera cycle' : 'Pause the camera cycle');
      }
      schedule();
    };

    var cycling = function () { return !stopped; };

    var frame = function (t) {
      rafId = null;
      if (last === null) last = t;
      var dt = Math.min(t - last, 100);
      last = t;
      if (cycling()) {
        elapsed += dt;
        if (elapsed >= DWELL) select((current + 1) % tabs.length);
        tabs[current].style.setProperty('--p', Math.min(elapsed / DWELL, 1).toFixed(4));
      }
      schedule();
    };

    /* Run the loop only when there is something to show */
    function schedule() {
      var shouldRun = !reduceMotion && onScreen && !document.hidden;
      if (shouldRun && rafId === null) rafId = requestAnimationFrame(frame);
      if (!shouldRun && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (!shouldRun) last = null;
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); setStopped(true); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next !== null) { e.preventDefault(); select(next, true); setStopped(true); }
      });
    });
    if (pauseBtn && !reduceMotion) {
      pauseBtn.hidden = false;
      pauseBtn.addEventListener('click', function () { setStopped(!stopped); });
    }
    document.addEventListener('visibilitychange', schedule);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; schedule(); }).observe(monitor);
    }
    schedule();
  }

  /* Copy buttons */
  var copyText = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  };
  document.querySelectorAll('[data-copy], [data-copy-text]').forEach(function (btn) {
    var status = btn.parentNode.querySelector('.copy-status');
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy-text');
      if (!text) {
        var src = document.querySelector(btn.getAttribute('data-copy'));
        text = src ? src.textContent : '';
      }
      copyText(text).then(function () {
        if (status) status.textContent = 'Copied';
      }, function () {
        if (status) status.textContent = 'Couldn’t copy. Select the text and copy it yourself.';
      });
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { if (status) status.textContent = ''; }, 4000);
    });
  });

  /* Navigation: mark the section on screen */
  var links = Array.prototype.slice.call(document.querySelectorAll('.masthead__nav a, .subnav a'));
  if (links.length && 'IntersectionObserver' in window) {
    var sections = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) sections[id] = el;
    });
    var setCurrent = function (id) {
      links.forEach(function (a) {
        if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    };
    var spy = new IntersectionObserver(function (entries) {
      /* Back at the hero, no section is current */
      entries.forEach(function (e) { if (e.isIntersecting) setCurrent(e.target.id === 'top' ? '' : e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(sections).forEach(function (id) { spy.observe(sections[id]); });
    var heroTop = document.getElementById('top');
    if (heroTop) spy.observe(heroTop);
  }
})();
