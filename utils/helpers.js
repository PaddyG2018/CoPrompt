/**
 * Generates a simple unique ID using timestamp and random string.
 * @returns {string} A unique identifier.
 */
export function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Add other general-purpose, framework-agnostic helpers here if needed
