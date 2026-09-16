// The language menu is a <details>, so it already opens, closes and takes focus on
// its own. This adds only the two things a menu needs that <details> does not do:
// it closes when you click away from it, and it closes on Escape.
(function () {
  var menu = document.querySelector('.nav-lang');
  if (!menu) return;

  document.addEventListener('click', function (event) {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    var summary = menu.querySelector('summary');
    if (summary) summary.focus();
  });
}());
