// Stand-in for Tilda's proprietary T393 (floating button) runtime,
// which is only loaded on the live published site, not in editor preview.
window.t393_appearMenu = window.t393_appearMenu || function (id) {
  var el = document.getElementById('nav' + id);
  if (el) el.style.visibility = 'visible';
};
