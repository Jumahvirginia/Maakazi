/* Makazi – Minimal UI Interactions */

(function () {
  "use strict";

  const toggle = document.getElementById("mobile-menu-toggle");
  const nav = document.getElementById("main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen);
    });
  }
})();
