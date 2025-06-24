document.addEventListener("DOMContentLoaded", function () {
  // Open settings page
  document
    .getElementById("optionsButton")
    .addEventListener("click", function () {
      chrome.runtime.openOptionsPage();
    });
});
