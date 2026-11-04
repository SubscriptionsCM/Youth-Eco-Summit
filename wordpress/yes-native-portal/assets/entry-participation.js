(function () {
  'use strict';
  document.querySelectorAll('.yes-entry-start').forEach(function (form) {
    var group = form.querySelector('.yes-entry-team-size');
    var count = group.querySelector('input');
    function update() {
      var selected = form.querySelector('input[name="entry_type"]:checked');
      var team = selected && selected.value === 'team';
      group.hidden = !team;
      count.disabled = !team;
      count.required = !!team;
    }
    form.addEventListener('change', update);
    update();
  });
})();
