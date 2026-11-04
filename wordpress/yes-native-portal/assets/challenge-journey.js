(function () {
  'use strict';
  // Enhance the server-rendered programme without changing its links or content.
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px 30px 0px', threshold: 0.01 });
  document.querySelectorAll('.competition-programme-card').forEach(card => {
    card.dataset.yesEnter = '';
    observer.observe(card);
  });
})();
