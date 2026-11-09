(function () {
  "use strict";

  var page = document.getElementById("settings-page");
  if (!page) return;

  var toast = document.getElementById("settings-toast");
  var languageLayer = document.getElementById("settings-language-layer");
  var languageOptions = Array.prototype.slice.call(
    languageLayer.querySelectorAll("[data-language-option]")
  );
  var languageNames = { en: "English", vi: "Tiếng Việt", km: "ភាសាខ្មែរ" };
  var selectedLanguage = "en";
  try {
    var savedLanguage = localStorage.getItem("mb_lang");
    if (savedLanguage === "en" || savedLanguage === "vi" || savedLanguage === "km") selectedLanguage = savedLanguage;
  } catch (e) {}
  var languageTrigger = null;
  var toastTimer = 0;
  var languageCloseTimer = 0;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2100);
  }

  function openSettings() {
    if (window.mbReferral && window.mbReferral.close) window.mbReferral.close();
    if (window.mbNotifications && window.mbNotifications.close) window.mbNotifications.close();
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    document.body.classList.add("settings-open");
    document.documentElement.style.overflow = "hidden";
  }

  function closeSettings() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
    document.documentElement.style.overflow = "";
  }

  function syncLanguageOptions() {
    languageOptions.forEach(function (option) {
      var selected = option.getAttribute("data-language-option") === selectedLanguage;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-checked", selected ? "true" : "false");
    });
  }

  function openLanguagePicker(trigger) {
    languageTrigger = trigger;
    window.clearTimeout(languageCloseTimer);
    syncLanguageOptions();
    languageLayer.hidden = false;
    languageLayer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(function () {
      languageLayer.classList.add("open");
    });
    window.setTimeout(function () {
      var selected = languageLayer.querySelector('[data-language-option="' + selectedLanguage + '"]');
      if (selected) selected.focus();
    }, 0);
  }

  function closeLanguagePicker(save) {
    if (languageLayer.hidden) return;
    languageLayer.classList.remove("open");
    languageLayer.setAttribute("aria-hidden", "true");
    if (save) showToast(languageNames[selectedLanguage] + " selected");
    languageCloseTimer = window.setTimeout(function () {
      languageLayer.hidden = true;
      if (languageTrigger && page.classList.contains("open")) languageTrigger.focus();
      languageTrigger = null;
    }, 190);
  }

  page.addEventListener("click", function (event) {
    var languageOption = event.target.closest("[data-language-option]");
    if (languageOption) {
      selectedLanguage = languageOption.getAttribute("data-language-option");
      syncLanguageOptions();
      if (window.mbI18n && window.mbI18n.apply) window.mbI18n.apply(selectedLanguage);
      return;
    }

    if (event.target.closest("[data-language-done]")) {
      closeLanguagePicker(true);
      return;
    }
    if (event.target.closest("[data-language-close]")) {
      closeLanguagePicker(false);
      return;
    }

    var toggle = event.target.closest(".settings-toggle");
    if (toggle) {
      var enabled = toggle.classList.toggle("on");
      toggle.setAttribute("aria-checked", enabled ? "true" : "false");
      return;
    }

    var action = event.target.closest("[data-settings-action]");
    if (action) {
      if (action.getAttribute("data-settings-action") === "Change Language") {
        openLanguagePicker(action);
        return;
      }
      showToast(action.getAttribute("data-settings-action") + " is a demo setting");
      return;
    }

    if (event.target.closest("#settings-verify")) {
      showToast("Online verification is a demo feature");
      return;
    }

    var nav = event.target.closest("[data-settings-nav]");
    if (!nav) return;
    var destination = nav.getAttribute("data-settings-nav");
    if (destination === "home") {
      closeSettings();
      return;
    }
    closeSettings();
    if (destination === "scan") {
      window.setTimeout(function () {
        if (window.mbScanQR && window.mbScanQR.open) window.mbScanQR.open();
      }, 60);
    } else if (destination === "referral") {
      if (window.mbReferral && window.mbReferral.open) window.mbReferral.open();
    } else if (destination === "notifications") {
      if (window.mbNotifications && window.mbNotifications.open) window.mbNotifications.open();
    }
  });

  document.addEventListener("click", function (event) {
    if (page.classList.contains("open")) return;
    var button = event.target.closest('[data-testid="nav-settings"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSettings();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!languageLayer.hidden) {
      closeLanguagePicker(false);
    } else if (page.classList.contains("open")) {
      closeSettings();
    }
  });

  window.mbSettings = { open: openSettings, close: closeSettings };
})();
