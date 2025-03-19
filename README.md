# CoPrompt

CoPrompt is a browser extension that enhances your interactions with AI platforms like ChatGPT, Claude, and Google Gemini. It provides real-time prompt enhancement and management capabilities to help you get better responses from AI models.

## Features

- 🎯 **Real-time Prompt Enhancement**: Automatically improves your prompts before sending them to AI platforms
- 🌐 **Multi-Platform Support**: Works with:
  - ChatGPT
  - Claude.ai
  - Google Gemini
- 🎨 **User-Friendly Interface**: Draggable floating button that integrates seamlessly with AI chat interfaces
- ⚙️ **Customizable Settings**: Configure the extension through an easy-to-use options panel
- 🔒 **Privacy-Focused**: Processes prompts locally without sending data to external servers

## Installation

### From Source

1. Clone the repository

```bash
git clone https://github.com/yourusername/coprompt.git
```

2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the CoPrompt directory

### From Chrome Web Store

_(Coming soon)_

## Usage

1. Visit any supported AI platform (ChatGPT, Claude, or Gemini)
2. Look for the CoPrompt button near the input field
3. Type your prompt as usual
4. Click the CoPrompt button to enhance your prompt before sending
5. The enhanced prompt will automatically replace your original text

## Project Structure

```
coprompt/
├── manifest.json     # Extension configuration
├── content.js       # Main content script
├── injected.js      # Injected page script
├── background.js    # Service worker
├── popup.html/js    # Extension popup
├── options.html/js  # Settings page
└── icons/          # Extension icons
```

## Development

### Prerequisites

- Chrome or Edge browser
- Basic knowledge of JavaScript and browser extensions

### Local Development

1. Make changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test changes on supported platforms

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Copyright © 2024 CoPrompt. All rights reserved.
This software is proprietary and confidential.
Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited.

## Acknowledgments

- Built for modern AI platforms
- Uses Chrome Extensions Manifest V3
- Inspired by the need for better AI interactions
