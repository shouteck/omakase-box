// Paints a short label for the CLI banner.
// Base implementation: the color argument is accepted but ignored and the
// text is returned unchanged. The Box outcome asks for ANSI colouring.
const CODES = { red: 31, green: 32, blue: 34 };

export function paint(text, color) {
  if (typeof text !== 'string' || text.length === 0) return text;
  const code = CODES[color];
  if (code === undefined) return text;
  return `\x1b[${code}m${text}\x1b[39m`;
}
