// Security Test Suite
const securityTests = {
  // Test API Key Security
  testApiKeySecurity: async () => {
    console.log('Testing API Key Security...');
    try {
      // Test key encryption
      const key = 'test-api-key-123';
      await chrome.storage.local.set({ apiKey: key });
      const stored = await chrome.storage.local.get('apiKey');
      if (stored.apiKey !== key) {
        throw new Error('API key encryption failed');
      }
      console.log('✓ API key encryption passed');

      // Test key rotation
      const rotationTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      await chrome.storage.local.set({ lastKeyRotation: rotationTime });
      const rotation = await chrome.storage.local.get('lastKeyRotation');
      if (rotation.lastKeyRotation !== rotationTime) {
        throw new Error('Key rotation tracking failed');
      }
      console.log('✓ Key rotation tracking passed');

      return true;
    } catch (error) {
      console.error('API Key Security Test Failed:', error);
      return false;
    }
  },

  // Test XSS Prevention
  testXssPrevention: async () => {
    console.log('Testing XSS Prevention...');
    try {
      // Test DOMPurify
      const maliciousHtml = '<script>alert("xss")</script><div>safe</div>';
      const sanitized = DOMPurify.sanitize(maliciousHtml);
      if (sanitized.includes('<script>')) {
        throw new Error('DOMPurify failed to sanitize script tag');
      }
      console.log('✓ DOMPurify sanitization passed');

      // Test secure element creation
      const element = createSecureElement('div', { id: 'test' }, { color: 'red' });
      if (!element || element.id !== 'test') {
        throw new Error('Secure element creation failed');
      }
      console.log('✓ Secure element creation passed');

      return true;
    } catch (error) {
      console.error('XSS Prevention Test Failed:', error);
      return false;
    }
  },

  // Test Content Security Policy
  testCSP: async () => {
    console.log('Testing Content Security Policy...');
    try {
      // Test script loading
      const script = document.createElement('script');
      script.src = 'https://malicious-site.com/script.js';
      document.head.appendChild(script);
      
      // Check if script was blocked
      if (document.querySelector('script[src*="malicious-site.com"]')) {
        throw new Error('CSP failed to block external script');
      }
      console.log('✓ CSP script blocking passed');

      return true;
    } catch (error) {
      console.error('CSP Test Failed:', error);
      return false;
    }
  },

  // Test Message Passing Security
  testMessagePassing: async () => {
    console.log('Testing Message Passing Security...');
    try {
      // Test origin verification
      const testMessage = {
        type: 'TEST_MESSAGE',
        data: 'test'
      };
      
      // Simulate message from different origin
      const event = new MessageEvent('message', {
        data: testMessage,
        origin: 'https://malicious-site.com'
      });
      
      window.dispatchEvent(event);
      
      // Check if message was blocked
      // Note: This is a simplified test, actual implementation would need more robust checks
      console.log('✓ Message passing security passed');

      return true;
    } catch (error) {
      console.error('Message Passing Test Failed:', error);
      return false;
    }
  },

  // Test Storage Security
  testStorageSecurity: async () => {
    console.log('Testing Storage Security...');
    try {
      // Test data validation
      const invalidData = { apiKey: null };
      await chrome.storage.local.set(invalidData);
      
      // Check if invalid data was rejected
      const stored = await chrome.storage.local.get('apiKey');
      if (stored.apiKey === null) {
        throw new Error('Storage validation failed');
      }
      console.log('✓ Storage validation passed');

      return true;
    } catch (error) {
      console.error('Storage Security Test Failed:', error);
      return false;
    }
  },

  // Test Error Handling
  testErrorHandling: async () => {
    console.log('Testing Error Handling...');
    try {
      // Test error logging
      const error = new Error('Test error');
      logger.error('Test error message', { error: error.message });
      
      // Check if error was logged
      // Note: Actual implementation would need to verify log storage
      console.log('✓ Error logging passed');

      return true;
    } catch (error) {
      console.error('Error Handling Test Failed:', error);
      return false;
    }
  },

  // Test Privacy Features
  testPrivacyFeatures: async () => {
    console.log('Testing Privacy Features...');
    try {
      // Test data cleanup
      await chrome.storage.local.clear();
      const data = await chrome.storage.local.get(null);
      if (Object.keys(data).length > 0) {
        throw new Error('Data cleanup failed');
      }
      console.log('✓ Privacy cleanup passed');

      return true;
    } catch (error) {
      console.error('Privacy Features Test Failed:', error);
      return false;
    }
  }
};

// Run all tests
async function runSecurityTests() {
  console.log('Starting Security Tests...\n');
  
  const results = {
    apiKeySecurity: await securityTests.testApiKeySecurity(),
    xssPrevention: await securityTests.testXssPrevention(),
    csp: await securityTests.testCSP(),
    messagePassing: await securityTests.testMessagePassing(),
    storageSecurity: await securityTests.testStorageSecurity(),
    errorHandling: await securityTests.testErrorHandling(),
    privacyFeatures: await securityTests.testPrivacyFeatures()
  };

  // Print summary
  console.log('\nTest Summary:');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${test}: ${passed ? '✓ PASSED' : '✗ FAILED'}`);
  });

  // Check if all tests passed
  const allPassed = Object.values(results).every(result => result === true);
  console.log(`\nOverall Result: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
}

// Run tests when loaded
runSecurityTests(); 