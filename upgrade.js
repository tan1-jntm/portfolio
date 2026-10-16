/* 只增强视觉；脚本失败时，正文和导航仍完整可读。 */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var motionPreference = 'on';
  try { motionPreference = localStorage.getItem('portfolio-motion') || 'on'; } catch (_) {}
  root.dataset.motion = motionPreference;

  var photo = document.querySelector('.hero-photo');
  if (photo && !photo.querySelector('.energy-orbit')) {
    var orbit = document.createElement('div');
    orbit.className = 'energy-orbit';
    orbit.setAttribute('aria-hidden', 'true');
    photo.appendChild(orbit);
  }

  var footer = document.querySelector('.footer-inner') || document.querySelector('footer .wrap') || document.querySelector('footer');
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'motion-toggle';
  function syncToggle() {
    var disabled = root.dataset.motion === 'off';
    toggle.textContent = disabled ? '动效已关闭' : (reduced.matches ? '跟随系统：减少动效' : '关闭动效');
    toggle.setAttribute('aria-pressed', String(disabled));
    toggle.setAttribute('aria-label', disabled ? '开启页面装饰动效' : '关闭页面装饰动效');
  }
  toggle.addEventListener('click', function () {
    root.dataset.motion = root.dataset.motion === 'off' ? 'on' : 'off';
    try { localStorage.setItem('portfolio-motion', root.dataset.motion); } catch (_) {}
    syncToggle();
  });
  if (footer) footer.appendChild(toggle);
  syncToggle();
  if (reduced.addEventListener) reduced.addEventListener('change', syncToggle);

  // 先建立观察器，再开启隐藏规则；不支持时保持全部内容可见。
  if ('IntersectionObserver' in window && !reduced.matches) {
    var cards = document.querySelectorAll('.work-card, .skill-card, .research-card, .timeline-item, .section-head');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.07, rootMargin: '0px 0px -20px 0px' });
    cards.forEach(function (card) {
      card.classList.add('scroll-reveal');
      observer.observe(card);
    });
    root.classList.add('reveal-ready');
  }

  // 卡片局部灯光只在精细指针设备上计算，触摸端保持静态。
  if (finePointer.matches) {
    document.querySelectorAll('.work-card, .research-card, .skill-card').forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        if (root.dataset.motion === 'off' || reduced.matches) return;
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
        card.style.setProperty('--my', (event.clientY - rect.top) + 'px');
      }, { passive: true });
    });
  }
})();
