document.addEventListener('DOMContentLoaded', function() {
    // Check if API key is set
    chrome.storage.local.get('openai_api_key', function(data) {
        const statusElement = document.getElementById('apiKeyStatus');
        
        if (data.openai_api_key) {
            statusElement.textContent = "API key is set and ready to use.";
            statusElement.className = "status success";
        } else {
            statusElement.textContent = "Please set your OpenAI API key in the settings.";
            statusElement.className = "status error";
        }
    });
    
    // Open options page
    document.getElementById('optionsButton').addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });
}); 