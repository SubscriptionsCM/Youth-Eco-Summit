(function ($) {
  'use strict';
  function attach() {
    if (!window.YESRegistrationEmail) return;
    Object.entries(YESRegistrationEmail.forms).forEach(function ([formId, field]) {
      var form = document.getElementById('forminator-module-' + formId);
      if (!form || form.querySelector('.yes-email-verification')) return;
      var email = form.querySelector('input[name="' + field + '"]');
      if (!email) return;
      var block = document.createElement('div');
      block.className = 'yes-email-verification';
      var send = document.createElement('button');
      send.type = 'button';
      send.className = 'forminator-button yes-email-verification__send';
      send.textContent = 'Send email verification code';
      var panel = document.createElement('div');
      panel.hidden = true;
      panel.className = 'yes-email-verification__code';
      var label = document.createElement('label');
      label.className = 'forminator-label';
      label.htmlFor = 'yes-email-code-' + formId;
      label.textContent = 'Email verification code';
      var code = document.createElement('input');
      code.type = 'text';
      code.id = label.htmlFor;
      code.className = 'forminator-input';
      code.inputMode = 'numeric';
      code.autocomplete = 'one-time-code';
      code.maxLength = 12;
      // No name: the OTP never enters registration records or saved drafts.
      var verify = document.createElement('button');
      verify.type = 'button';
      verify.className = 'forminator-button';
      verify.textContent = 'Verify email';
      var status = document.createElement('p');
      status.className = 'yes-email-verification__status';
      status.id = 'yes-email-status-' + formId;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      code.setAttribute('aria-describedby', status.id);
      panel.append(label, code, verify);
      block.append(send, panel, status);
      var fieldContainer = email.closest('.forminator-field');
      (fieldContainer || email.parentElement).appendChild(block);
      var busy = false, cooldown = 0, verified = false, verifiedEmail = '', currentEmail = email.value.trim().toLowerCase();
      function render() {
        send.disabled = busy || verified || Date.now() < cooldown;
        verify.disabled = busy;
        send.textContent = verified ? 'Email verified' : Date.now() < cooldown ? 'Resend email code in ' + Math.ceil((cooldown - Date.now()) / 1000) + 's' : 'Send email verification code';
        block.classList.toggle('is-verified', verified);
      }
      async function request(action) {
        if (busy) return;
        if (!email.value.trim() || !email.checkValidity()) {
          status.textContent = 'Enter a valid email address first.';
          email.focus();
          return;
        }
        if (action === 'verify' && !/^[0-9]{4,12}$/.test(code.value.trim())) {
          status.textContent = 'Enter the verification code from your email.';
          code.focus();
          return;
        }
        var requestedEmail = email.value.trim().toLowerCase();
        busy = true;
        render();
        status.textContent = action === 'send' ? 'Sending your email code…' : 'Checking your email code…';
        try {
          var data = new URLSearchParams({action: 'yes_registration_email_' + action, form_id: formId, email: email.value.trim(), security: YESRegistrationEmail.nonce});
          if (action === 'verify') data.set('code', code.value.trim());
          var response = await fetch(YESRegistrationEmail.url, {method: 'POST', credentials: 'same-origin', body: data});
          var result = await response.json();
          if (email.value.trim().toLowerCase() !== requestedEmail) {
            status.textContent = 'Your email address changed. Request a code for the new address.';
            return;
          }
          status.textContent = result.data && result.data.message ? result.data.message : 'Verification could not be completed. Please try again.';
          if (result.success && action === 'send') {
            cooldown = Date.now() + 60000;
            verified = false;
            panel.hidden = false;
            code.value = '';
            code.focus();
          } else if (result.success && action === 'verify') {
            verified = true;
            verifiedEmail = requestedEmail;
            panel.hidden = true;
            code.value = '';
          }
        } catch (_) { status.textContent = 'Connection interrupted. Please try again. You can save your progress.'; }
        finally { busy = false; render(); }
      }
      send.addEventListener('click', function () { request('send'); });
      verify.addEventListener('click', function () { request('verify'); });
      code.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); request('verify'); } });
      email.addEventListener('input', function () {
        var nextEmail = email.value.trim().toLowerCase();
        if (nextEmail === currentEmail) return;
        currentEmail = nextEmail;
        verified = false;
        verifiedEmail = '';
        panel.hidden = true;
        code.value = '';
        status.textContent = '';
        render();
      });
      // UI status also expires; the server always checks its own expiry.
      var verificationTimer;
      verify.addEventListener('click', function () {
        clearTimeout(verificationTimer);
        verificationTimer = setTimeout(function () {
          if (verified && verifiedEmail === email.value.trim().toLowerCase()) {
            verified = false;
            status.textContent = 'Email verification expired. Request a new code before registering.';
            render();
          }
        }, 30 * 60 * 1000);
      });
      setInterval(function () { if (!verified && !busy && cooldown) { render(); if (Date.now() >= cooldown) cooldown = 0; } }, 1000);
      render();
    });
  }
  $(attach);
  $(document).on('after.load.forminator', attach);
})(jQuery);
