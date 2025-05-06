// utils/secureApiKey.js

// 🔐 Improved API key security using Web Crypto API
export async function encryptAPIKey(apiKey) {
  // Use a consistent encryption key derived from browser fingerprint or extension ID
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);

  // Create a key from the extension ID (or another consistent value)
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(chrome.runtime.id),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  // Create a random initialization vector
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the data
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  // Combine IV and encrypted data for storage
  return btoa(
    String.fromCharCode(...iv) +
      String.fromCharCode(...new Uint8Array(encryptedData)),
  );
}

export async function decryptAPIKey(encryptedString) {
  try {
    const binaryData = atob(encryptedString);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData.charCodeAt(i);
    }

    // Extract IV (first 12 bytes)
    const iv = bytes.slice(0, 12);
    const encryptedData = bytes.slice(12);

    // Recreate the key
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(chrome.runtime.id),
    );

    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );

    // Decrypt
    const decryptedData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData,
    );

    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    console.error("Decryption failed:", error);
    // Consider throwing a custom error or logging more formally
    return null; 
  }
} 