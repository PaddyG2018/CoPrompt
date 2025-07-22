// Utility functions for general use across the extension

// Generate a unique identifier for tracking
export function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
