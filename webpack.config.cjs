const path = require('path');
const CopyPlugin = require('copy-webpack-plugin'); // We still need to copy assets

module.exports = {
  mode: 'production', // Or process.env.NODE_ENV || 'development'
  entry: {
    // Scripts that need bundling (because they import npm packages or use modules)
    background: './background.js', 
    // If content.js uses imports that need resolving, add it here.
    // content: './content.js', 
    // If options.js uses imports, add it here.
    // options: './options.js', 
    // If popup.js uses imports, add it here.
    // popup: './popup.js', 
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js', // Bundled files: background.js, etc.
    clean: true, // Clean dist/ before build
  },
  module: {
    rules: [
      // Add loaders here if needed (e.g., for Babel/TypeScript)
      {
        test: /\.js$/,
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "." },
        // Copy HTML files
        { from: "options.html", to: "." },
        { from: "popup.html", to: "." },
        // Copy CSS
        { from: "content.css", to: "." },
        // Copy Icons
        { from: "icons", to: "icons" },
        // Copy scripts that *don't* need bundling (assuming they have no npm imports)
        { from: "content.js", to: "." }, // Adjust if content.js needs bundling
        { from: "options.js", to: "." }, // Adjust if options.js needs bundling
        { from: "popup.js", to: "." },   // Adjust if popup.js needs bundling
        { from: "injected.js", to: "." }, // Injected script is usually copied directly
        // Copy utility directories/files if they are plain JS and don't need bundling
        { from: "utils", to: "utils" }, 
        { from: "background/apiClient.js", to: "background/apiClient.js" }, // Copy if not bundled via background.js
        { from: "content", to: "content" } // Copy other content script files if needed
      ],
    }),
  ],
  // Enable source maps for debugging (consider 'source-map' for production if needed)
  devtool: 'cheap-module-source-map', 
  resolve: {
    // extensions: ['.js'], // Add '.ts' if using TypeScript
  },
  // Avoid including node built-ins if not needed in browser context
  target: 'webworker', // Change target to webworker for Service Worker context
}; 