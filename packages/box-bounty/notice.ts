

// One line per notice a command owes the agent — a merge the tool itself
// recognised and closed on, or a close-up on GitHub the owner did not answer
// for (merged.ts and github.ts emit through here). The CLI registers a
// printer; library callers see the same truth in the record's events.
let mergeNoticeListener: ((line: string) => void) | null = null;
export function setMergeNoticeListener(next: ((line: string) => void) | null): void {
  mergeNoticeListener = next;
}
export const emitMergeNotice = (line: string): void => { mergeNoticeListener?.(line); };

// A stranger's text — a solver's path, a line of a solver's change, a line of
// another account's comment — is shown quoted and on one line: it can carry
// words, separators or spaces that would read as the tool's own prose. JSON
// quoting escapes the quote, the backslash and the C0 controls (ESC, CR, LF);
// DEL, the C1 controls and the characters that hide or reorder text on a
// terminal (zero-width, bidirectional overrides and isolates, line and
// paragraph separators, the byte-order mark) are escaped the same way, so what
// is printed is what is there. Every surface uses this one helper.
const HIDDEN = /[\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
const escapeHidden = (json: string): string => json.replace(HIDDEN, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
export const quoteForeign = (text: string): string => escapeHidden(JSON.stringify(text));
export const showPath = quoteForeign;
// The same escapes over a whole stored value printed on a text line: a
// record's event under `status --full`, which can hold a solver's paths
// (BT43). Those characters sit only inside the JSON's strings, so the line
// stays valid JSON that decodes to the same value.
export const foreignJson = (value: object): string => escapeHidden(JSON.stringify(value));
// The CLI's output guard (BT43 correction 3) applies the same escapes to the
// whole text it prints: each C0 control written as JSON writes it, except
// the line feed that ends the tool's own lines, the tab, and a carriage
// return directly before a line feed, none of which can move the cursor back
// over printed text or start a line (the owner's own text keeps its tabs and
// its CRLF line ends; a lone CR is still escaped; quoteForeign still escapes
// both inside a stranger's line), and each character above. Quotes and
// backslashes stay as they are, so text a renderer already quoted passes
// unchanged, and a second pass changes nothing.
const C0 = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|\r(?!\n)/g;
export const escapeControls = (text: string): string => escapeHidden(text.replace(C0, char => JSON.stringify(char).slice(1, -1)));

// The report of facts: who sent the answer and when, the change with counts
// and lines, the dry merge read, and eager flags — never a verdict. The
// nothing-was-run sentence is always there, verbatim.
export const NOTHING_RUN = 'nothing in the solution was run and this report says nothing about whether it works';
