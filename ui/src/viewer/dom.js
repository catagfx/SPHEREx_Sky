// DOM shortcuts used across the viewer (it binds to index.html and the React story by element id).
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);

/** Run `fn(el)` only if the element exists (optional parts of the page). */
export function withEl(selector, fn) {
  const el = $(selector);
  if (el) fn(el);
}
