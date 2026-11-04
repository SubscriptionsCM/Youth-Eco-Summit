(function () {
  'use strict';
  let serial = 0;
  function setup(input) {
    if (input.dataset.yesSchoolPickerReady) return;
    input.dataset.yesSchoolPickerReady = 'true';
    const nameField = input.dataset.yesSchoolNameField && input.form
      ? input.form.elements.namedItem(input.dataset.yesSchoolNameField) : null;
    function fillSchoolName(name) {
      if (!nameField || nameField.value === name) return;
      nameField.value = name;
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      nameField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const uid = 'yes-school-picker-' + (++serial);
    const wrapper = document.createElement('div');
    wrapper.className = 'yes-school-picker';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const list = document.createElement('ul');
    list.id = uid + '-list';
    list.className = 'yes-school-picker__list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Registered schools');
    list.hidden = true;
    const status = document.createElement('p');
    status.id = uid + '-status';
    status.className = 'yes-school-picker__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Search by school name or ID, then select your school.';
    wrapper.append(list, status);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), status.id].filter(Boolean).join(' '));
    let items = [], active = -1, timer, controller, revision = 0, internalChange = false;
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function cancel() {
      clearTimeout(timer);
      revision++;
      if (controller) controller.abort();
      input.removeAttribute('aria-busy');
    }
    function highlight(index) {
      active = index;
      Array.from(list.children).forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
      if (index >= 0) {
        input.setAttribute('aria-activedescendant', list.children[index].id);
        list.children[index].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function location(school) {
      return [school.city, school.state].filter(Boolean).join(', ');
    }
    function choose(index) {
      const school = items[index];
      if (!school) return;
      cancel();
      input.value = school.reference;
      fillSchoolName(school.name);
      close();
      status.textContent = school.name + (location(school) ? ' · ' + location(school) : '');
      internalChange = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      internalChange = false;
      input.focus();
    }
    async function search() {
      cancel();
      const current = revision;
      const query = input.value.trim();
      controller = new AbortController();
      input.setAttribute('aria-busy', 'true');
      status.textContent = 'Finding registered schools…';
      try {
        const url = new URL(YESSchoolPicker.url, window.location.origin);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '8');
        const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('School search unavailable');
        const payload = await response.json();
        if (current !== revision || input.value.trim() !== query) return;
        const records = payload && payload.data && payload.data.items;
        if (!Array.isArray(records)) throw new Error('Invalid school search response');
        items = records.filter(school => school && typeof school.reference === 'string' && typeof school.name === 'string');
        // Restore saved/prefilled IDs only when they match a complete registered ID.
        const exact = items.find(school => [school.reference].concat(school.legacy_ids || [])
          .some(id => String(id).toUpperCase() === query.toUpperCase()));
        if (exact) fillSchoolName(exact.name);
        list.replaceChildren();
        active = -1;
        input.removeAttribute('aria-activedescendant');
        items.forEach((school, index) => {
          const option = document.createElement('li');
          option.id = uid + '-option-' + index;
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', 'false');
          const name = document.createElement('strong');
          name.textContent = school.name;
          const detail = document.createElement('span');
          detail.textContent = school.reference + (location(school) ? ' · ' + location(school) : '');
          option.append(name, detail);
          option.addEventListener('pointerdown', event => event.preventDefault());
          option.addEventListener('click', () => choose(index));
          list.appendChild(option);
        });
        const focused = document.activeElement === input;
        list.hidden = !items.length || !focused;
        input.setAttribute('aria-expanded', String(!list.hidden));
        status.textContent = items.length ? items.length + ' schools shown. Select your school and branch.' : 'No matching registered school. Try another name or ID, or register your school first.';
      } catch (error) {
        if (current !== revision || error.name === 'AbortError') return;
        items = [];
        close();
        status.textContent = 'School search is unavailable. Enter the registered school ID provided by your coordinator.';
      } finally {
        if (current === revision) input.removeAttribute('aria-busy');
      }
    }
    input.addEventListener('input', () => {
      if (internalChange) return;
      fillSchoolName('');
      cancel();
      items = [];
      close();
      status.textContent = 'Finding registered schools…';
      timer = setTimeout(search, 200);
    });
    input.addEventListener('focus', () => {
      if (!internalChange) search();
    });
    input.addEventListener('blur', () => { cancel(); close(); });
    if (input.value.trim() && nameField) search();
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { cancel(); close(); return; }
      if (event.key === 'Tab') { cancel(); close(); return; }
      if (list.hidden || !items.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        highlight(event.key === 'ArrowDown' ? (active + 1) % items.length : (active < 0 ? items.length - 1 : (active - 1 + items.length) % items.length));
      } else if (event.key === 'Enter' && active >= 0) {
        event.preventDefault();
        choose(active);
      }
    });
  }
  function initialize() {
    if (!window.YESSchoolPicker || !YESSchoolPicker.url) return;
    document.querySelectorAll('input[data-yes-school-search]').forEach(setup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
  if (window.jQuery) window.jQuery(document).on('after.load.forminator', initialize);
})();
