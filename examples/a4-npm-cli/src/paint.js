// Paints a short label for the CLI banner.
// Base implementation: the color argument is accepted but ignored and the
// text is returned unchanged. The Box outcome asks for ANSI colouring.
export function paint(text, color) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text;
}
