const path = require('path');
const CopyPlugin = require('copy-webpack-plugin'); // We still need to copy assets
const webpack = require('webpack'); // Added for DefinePlugin
require('dotenv').config(); // Added for DefinePlugin

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    // Scripts that need bundling (because they import npm packages or use modules)
    background: './background.js', 
    content: './content.js',
    injected: './injected.js', // Add injected.js back as an entry point
    // If content.js uses imports that need resolving, add it here.
    // content: './content.js', 
    // If options.js uses imports, add it here.
    // options: './options.js', 
    // If popup.js uses imports, add it here.
    // popup: './popup.js', 
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js', // Bundled files: background.js, content.js, etc.
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
        // Copy the lib directory
        { from: "lib", to: "lib" },
        // Copy scripts that *don't* need bundling 
        { from: "options.js", to: "." },
        { from: "popup.js", to: "." },
        // Copy background script dependencies IF NOT imported directly by background.js
        // Example: { from: "background/apiClient.js", to: "background/apiClient.js" }, // Only if apiClient isn't imported by background.js
      ],
    }),
    new webpack.DefinePlugin({
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY)
    })
  ],
  // Enable source maps for debugging (consider 'source-map' for production if needed)
  devtool: 'cheap-module-source-map', 
  resolve: {
    // extensions: ['.js'], // Add '.ts' if using TypeScript
  },
  // Avoid including node built-ins if not needed in browser context
  target: 'web', // Change target to web for content script compatibility
}; 