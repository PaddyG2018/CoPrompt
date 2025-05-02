import DOMPurify from "dompurify";

/**
 * Sanitizes HTML content using DOMPurify
 * @param {string} html - The HTML content to sanitize
 * @param {Object} config - Optional DOMPurify configuration
 * @returns {string} - The sanitized HTML
 */
export function sanitizeHtml(html, config = {}) {
  const defaultConfig = {
    ALLOWED_TAGS: ["svg", "path", "div", "span"],
    ALLOWED_ATTR: [
      "xmlns",
      "width",
      "height",
      "viewBox",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "class",
      "style",
      "margin-right",
    ],
    ALLOWED_STYLES: [
      "display",
      "align-items",
      "justify-content",
      "gap",
      "margin-right",
    ],
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false,
    RETURN_DOM_FRAGMENT: true,
    RETURN_DOM: false,
    RETURN_TRUSTED_TYPE: true,
  };

  return DOMPurify.sanitize(html, { ...defaultConfig, ...config });
}

/**
 * Creates a DOM element with secure attributes
 * @param {string} tagName - The HTML tag name
 * @param {Object} attributes - Object containing attributes to set
 * @param {Object} styles - Object containing styles to set
 * @returns {HTMLElement} - The created element
 */
export function createSecureElement(tagName, attributes = {}, styles = {}) {
  const element = document.createElement(tagName);

  // Set attributes securely
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "style") {
      // Handle styles separately
      Object.entries(value).forEach(([styleKey, styleValue]) => {
        element.style.setProperty(styleKey, styleValue);
      });
    } else {
      element.setAttribute(key, value);
    }
  });

  // Set additional styles securely
  Object.entries(styles).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });

  return element;
}

/**
 * Creates an SVG element with secure attributes
 * @param {Object} attributes - Object containing SVG attributes
 * @param {Array} paths - Array of path data strings
 * @returns {SVGElement} - The created SVG element
 */
export function createSecureSvg(attributes = {}, paths = []) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  // Set attributes securely
  Object.entries(attributes).forEach(([key, value]) => {
    svg.setAttribute(key, value);
  });

  // Add paths securely
  paths.forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
  });

  return svg;
}

/**
 * Safely sets innerHTML of an element
 * @param {HTMLElement} element - The target element
 * @param {string} html - The HTML content to set
 * @param {Object} config - Optional DOMPurify configuration
 */
export function setSecureInnerHtml(element, html, config = {}) {
  const sanitized = sanitizeHtml(html, config);
  element.innerHTML = sanitized;
}

/**
 * Safely appends HTML content to an element
 * @param {HTMLElement} element - The target element
 * @param {string} html - The HTML content to append
 * @param {Object} config - Optional DOMPurify configuration
 */
export function appendSecureHtml(element, html, config = {}) {
  const sanitized = sanitizeHtml(html, config);
  const temp = document.createElement("div");
  temp.innerHTML = sanitized;
  while (temp.firstChild) {
    element.appendChild(temp.firstChild);
  }
}
