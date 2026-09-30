/* transitions disabled — kill curtain if cached version created it */
(function () {
  function killCurtain() {
    var el = document.getElementById('page-curtain');
    if (el) el.parentNode.removeChild(el);
  }
  killCurtain();
  document.addEventListener('DOMContentLoaded', killCurtain);
})();
