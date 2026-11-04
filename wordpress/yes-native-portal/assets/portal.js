(function ($) {
  'use strict';
  if (!$) return;
  const initialized = new WeakSet();

  function draftErrorText(response) {
    const messages = [];
    function add(value) {
      if (typeof value !== 'string' || messages.length >= 6) return;
      // Template contents are inert. Never render server HTML or copy a full
      // response; only expose bounded native message/field-validation strings.
      const template = document.createElement('template');
      template.innerHTML = value.slice(0, 3000);
      template.content.querySelectorAll('script, style, iframe, object').forEach(node => node.remove());
      const text = (template.content.textContent || '').replace(/\s+/g, ' ').trim()
        .replace(/\b[a-f0-9]{24,}\b/gi, '[private reference]')
        .replace(/([?&](?:draft|token|nonce)=)[^\s&]+/gi, '$1[private reference]')
        .slice(0, 200);
      if (text && !messages.includes(text)) messages.push(text);
    }
    function fields(value, depth) {
      if (depth > 3 || messages.length >= 6) return;
      if (typeof value === 'string') add(value);
      else if (value && typeof value === 'object') Object.values(value).slice(0, 12).forEach(item => fields(item, depth + 1));
    }
    const data = response && response.data;
    if (typeof data === 'string') add(data);
    else if (data && typeof data === 'object') {
      add(data.message);
      fields(data.errors, 0);
    }
    return messages.join(' ').slice(0, 600);
  }

  function enhance(form) {
    if (initialized.has(form) || !form.querySelector('[name="save_draft"]')) return;
    initialized.add(form);
    if (new URL(window.location.href).searchParams.has('draft')) {
      form.querySelectorAll('.forminator-consent input[type="checkbox"], input[name^="consent-"]').forEach(input => {
        input.checked = false;
        $(input).trigger('change');
      });
    }
    const $form = $(form);
    const status = document.createElement('p');
    status.className = 'yes-native__save-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.insertBefore(status, form.firstChild);
    const resume = document.createElement('p');
    resume.className = 'yes-native__resume';
    resume.hidden = true;
    const link = document.createElement('a');
    link.textContent = 'Continue this saved form';
    resume.appendChild(link);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'yes-native__copy';
    copy.textContent = 'Copy link to saved form';
    copy.addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(link.href);
        status.textContent = 'Link copied. Keep it private.';
      } catch (_) {
        status.textContent = 'Open the saved form link and bookmark it to continue later.';
      }
    });
    resume.appendChild(copy);
    status.after(resume);

    let saving = false;
    let queued = false;
    let finished = false;
    let lastPage = currentPage();
    let timer;

    function resetDraftFlag() {
      form.querySelectorAll('input[name="save_draft"]').forEach(input => { input.value = 'false'; });
    }
    resetDraftFlag();
    // Intercept only this form's explicit draft action before Forminator's
    // body-level handler routes it through registration/OTP submit events.
    // Saving still uses the native nonce, server validation and draft storage.
    form.addEventListener('click', function (event) {
      const target = event.target instanceof Element ? event.target.closest('.forminator-save-draft-link') : null;
      if (!target || !form.contains(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearTimeout(timer);
      resetDraftFlag();
      save();
    }, true);
    // A prior native handler must not leave a draft flag behind and turn a
    // later real registration into a silent draft. Normal submit/OTP continues.
    form.addEventListener('submit', resetDraftFlag, true);

    function currentPage() {
      const pages = Array.from(form.querySelectorAll('.forminator-pagination'));
      return Math.max(0, pages.findIndex(page => $(page).is(':visible')));
    }
    function finalizeButtons(disabled) {
      form.querySelectorAll('.forminator-button-submit').forEach(button => {
        if (disabled && !button.disabled) { button.dataset.yesSaving = '1'; button.disabled = true; }
        if (!disabled && button.dataset.yesSaving) { delete button.dataset.yesSaving; button.disabled = false; }
      });
    }
    function schedule() {
      if (finished) return;
      clearTimeout(timer);
      timer = setTimeout(save, 220);
    }
    async function save() {
      if (finished) return;
      if (saving) { queued = true; return; }
      if (!window.ForminatorFront || !window.ForminatorFront.ajaxUrl) {
        status.textContent = 'Progress saving is unavailable. Keep this page open and try again later.';
        return;
      }
      // Use Forminator's existing nonce, validation and draft storage. A draft
      // request is never a final registration or a competition submission.
      resetDraftFlag();
      const body = new FormData(form);
      body.set('save_draft', 'true');
      body.set('draft_page', String(currentPage()));
      body.set('form_uid', String(form.dataset.uid || ''));
      for (const [name, value] of Array.from(body.entries())) {
        if (value instanceof File || /^(g-recaptcha-response|h-captcha-response|cf-turnstile-response)$/.test(name)) body.delete(name);
      }
      const exclusions = (window.YESNative && window.YESNative.draftExcludeFields) || [];
      exclusions.forEach(name => body.delete(name));
      saving = true;
      finalizeButtons(true);
      status.textContent = 'Saving your progress…';
      let failureReason = '';
      try {
        const response = await fetch(window.ForminatorFront.ajaxUrl, { method: 'POST', body, credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok || !data.success || !data.data || data.data.type !== 'save_draft' || !/^[a-zA-Z0-9_-]{10,80}$/.test(data.data.draft_id || '')) {
          failureReason = draftErrorText(data);
          throw new Error('Could not save');
        }
        let previous = form.querySelector('[name="previous_draft_id"]');
        if (!previous) { previous = document.createElement('input'); previous.type = 'hidden'; previous.name = 'previous_draft_id'; form.appendChild(previous); }
        previous.value = data.data.draft_id;
        const url = new URL(window.location.href);
        url.searchParams.set('draft', data.data.draft_id);
        // Only a private resume token is stored in the URL, never form answers.
        link.href = url.href;
        resume.hidden = false;
        history.replaceState(history.state, '', url.href);
        status.textContent = 'Progress saved. Uploads and verification codes must be added again if you return later.';
      } catch (_) {
        status.textContent = 'Progress could not be saved. ' + (failureReason || 'The server could not complete the save. Keep this page open and try again.');
      } finally {
        resetDraftFlag();
        saving = false;
        finalizeButtons(false);
        if (queued) { queued = false; schedule(); }
      }
    }
    // Observe the actual rendered page, rather than a click that validation may
    // reject. This also covers progress-bar navigation and the Previous button.
    const observer = new MutationObserver(function () {
      const page = currentPage();
      if (page !== lastPage) { lastPage = page; schedule(); }
    });
    form.querySelectorAll('.forminator-pagination').forEach(page => observer.observe(page, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }));
    $form.on('forminator:form:submit:success', function (event, formData, response) {
      // Forminator also emits this event for an HTTP-success response containing
      // validation errors. Keep the saved draft usable until submission succeeds.
      if (!response || response.success !== true || !response.data || response.data.success !== true) return;
      finished = true;
      queued = false;
      clearTimeout(timer);
      observer.disconnect();
      status.textContent = '';
      resume.hidden = true;
      const url = new URL(window.location.href);
      url.searchParams.delete('draft');
      history.replaceState(history.state, '', url.href);
    });
    $form.on('forminator:form:draft:success', function () { clearTimeout(timer); });
  }
  function scan() {
    document.querySelectorAll('.yes-native .forminator-button--mask').forEach(mask => {
      mask.removeAttribute('aria-label');
      mask.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.yes-native form.forminator-custom-form').forEach(enhance);
  }
  $(scan);
  $(document).on('after.load.forminator after.load.forminator.form', scan);
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})(window.jQuery);
