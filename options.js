document.addEventListener("DOMContentLoaded", () => {
  console.log("CoPrompt Options: DOM Content Loaded.");

  const apiKeyInput = document.getElementById("apiKey");
  const saveButton = document.getElementById("saveButton");
  const clearButton = document.getElementById("clearButton");
  const statusDiv = document.getElementById("status");
  // Modal elements
  const modal = document.getElementById("clearConfirmationModal");
  const confirmClearBtn = document.getElementById("confirmClearBtn");
  const cancelClearBtn = document.getElementById("cancelClearBtn");

  // Load saved API Key
  chrome.storage.local.get("openai_api_key", (data) => {
    if (data.openai_api_key) {
      // We don't actually show the decrypted key for security
      apiKeyInput.placeholder = "API key is set (hidden for security)";
    }
  });

  // Save API Key
  if (saveButton) {
    console.log("CoPrompt Options: Adding listener to Save button.");
    saveButton.addEventListener("click", function () {
      const apiKey = apiKeyInput.value.trim();

      if (!apiKey) {
        showStatus("Please enter your OpenAI API key.", "error");
        return;
      }

      // Basic validation
      if (!apiKey.startsWith("sk-") || apiKey.length < 20) {
        showStatus(
          'Invalid API key format. It should start with "sk-" and be longer.',
          "error",
        );
        return;
      }

      chrome.runtime.sendMessage(
        { type: "SAVE_API_KEY", apiKey: apiKey },
        function (response) {
          if (response.success) {
            showStatus("API key saved successfully!", "success");
            apiKeyInput.value = "";
            apiKeyInput.placeholder = "API key is set (hidden for security)";
          } else {
            showStatus(
              "Error saving API key: " + (response.error || "Unknown error"),
              "error",
            );
          }
        },
      );
    });
  } else {
    console.error("CoPrompt Options: Save button not found!");
  }

  // Clear API Key (with confirmation)
  if (clearButton) {
    console.log("CoPrompt Options: Adding listener to Clear button.");
    clearButton.addEventListener("click", function () {
      console.log("CoPrompt Options: Clear button clicked - showing modal.");
      // Show the custom modal instead of alert/confirm
      if (modal) {
        modal.style.display = "flex"; // Use flex to enable centering
      }
    });
  } else {
    console.error("CoPrompt Options: Clear button not found!");
  }

  // Modal Actions
  if (confirmClearBtn) {
    confirmClearBtn.addEventListener("click", function () {
      console.log("CoPrompt Options: Modal Confirm clicked, clearing key...");
      chrome.storage.local.remove("openai_api_key", function () {
        if (chrome.runtime.lastError) {
          showStatus(
            "Error clearing API key: " + chrome.runtime.lastError.message,
            "error",
          );
        } else {
          showStatus("API key cleared successfully.", "success");
          apiKeyInput.value = ""; // Clear the input field visually
          apiKeyInput.placeholder = "sk-..."; // Restore original placeholder
        }
        // Always hide modal after action
        if (modal) {
          modal.style.display = "none";
        }
      });
    });
  }

  if (cancelClearBtn) {
    cancelClearBtn.addEventListener("click", function () {
      console.log("CoPrompt Options: Modal Cancel clicked.");
      if (modal) {
        modal.style.display = "none"; // Hide modal
      }
    });
  }

  // Function to display status messages
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = "status " + type;
    statusDiv.style.display = "block";

    setTimeout(function () {
      statusDiv.style.display = "none";
    }, 3000);
  }
});
