document.addEventListener('DOMContentLoaded', function() {
    // Load saved API key
    chrome.storage.local.get('openai_api_key', function(data) {
        if (data.openai_api_key) {
            // We don't actually show the decrypted key for security
            document.getElementById('apiKey').placeholder = "API key is set (hidden for security)";
        }
    });
    
    // Save API key
    document.getElementById('saveButton').addEventListener('click', function() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const statusElement = document.getElementById('status');
        
        if (!apiKey) {
            showStatus('Please enter your OpenAI API key.', 'error');
            return;
        }
        
        // Basic validation
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
            showStatus('Invalid API key format. It should start with "sk-" and be longer.', 'error');
            return;
        }
        
        chrome.runtime.sendMessage(
            { type: 'SAVE_API_KEY', apiKey: apiKey },
            function(response) {
                if (response.success) {
                    showStatus('API key saved successfully!', 'success');
                    document.getElementById('apiKey').value = '';
                    document.getElementById('apiKey').placeholder = "API key is set (hidden for security)";
                } else {
                    showStatus('Error saving API key: ' + (response.error || 'Unknown error'), 'error');
                }
            }
        );
    });
    
    function showStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = 'status ' + type;
        statusElement.style.display = 'block';
        
        setTimeout(function() {
            statusElement.style.display = 'none';
        }, 3000);
    }
}); 