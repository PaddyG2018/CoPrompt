document.addEventListener("DOMContentLoaded", function () {
  console.log("CoPrompt Options: DOM Content Loaded.");

  // Load saved API key
  chrome.storage.local.get("openai_api_key", function (data) {
    if (data.openai_api_key) {
      // We don't actually show the decrypted key for security
      document.getElementById("apiKey").placeholder =
        "API key is set (hidden for security)";
    }
  });

  // Save API key
  const saveButton = document.getElementById("saveButton");
  if (saveButton) {
    console.log("CoPrompt Options: Adding listener to Save button.");
    saveButton.addEventListener("click", function () {
      const apiKey = document.getElementById("apiKey").value.trim();

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
            document.getElementById("apiKey").value = "";
            document.getElementById("apiKey").placeholder =
              "API key is set (hidden for security)";
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

  // Get modal elements
  const clearModal = document.getElementById("clearConfirmationModal");
  const confirmClearBtn = document.getElementById("confirmClearBtn");
  const cancelClearBtn = document.getElementById("cancelClearBtn");

  // --- Clear API key --- 
  const clearButton = document.getElementById("clearButton");
  if (clearButton) {
      console.log("CoPrompt Options: Adding listener to Clear button.");
      clearButton.addEventListener("click", function () {
          console.log("CoPrompt Options: Clear button clicked - showing modal.");
          // Show the custom modal instead of alert/confirm
          if (clearModal) {
             clearModal.style.display = "flex"; // Use flex to enable centering
          }
      });
  } else {
      console.error("CoPrompt Options: Clear button not found!");
  }

  // --- Modal Actions --- 
  if (cancelClearBtn) {
      cancelClearBtn.addEventListener("click", function() {
          console.log("CoPrompt Options: Modal Cancel clicked.");
          if (clearModal) {
              clearModal.style.display = "none"; // Hide modal
          }
      });
  }

  if (confirmClearBtn) {
      confirmClearBtn.addEventListener("click", function() {
          console.log("CoPrompt Options: Modal Confirm clicked, clearing key...");
          chrome.storage.local.remove("openai_api_key", function() {
            if (chrome.runtime.lastError) {
              showStatus("Error clearing API key: " + chrome.runtime.lastError.message, "error");
            } else {
              showStatus("API key cleared successfully.", "success");
              const apiKeyInput = document.getElementById("apiKey");
              apiKeyInput.value = ""; // Clear the input field visually
              apiKeyInput.placeholder = "sk-..."; // Restore original placeholder
            }
            // Always hide modal after action
            if (clearModal) {
              clearModal.style.display = "none";
            }
          });
      });
  }

  // Function to display status messages
  function showStatus(message, type) {
    const statusElement = document.getElementById("status");
    statusElement.textContent = message;
    statusElement.className = "status " + type;
    statusElement.style.display = "block";

    setTimeout(function () {
      statusElement.style.display = "none";
    }, 3000);
  }
});
