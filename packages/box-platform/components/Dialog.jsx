'use client';
// Its own file: it needs the browser, and ui.jsx is also read by pages built on the server.
import { useEffect, useRef } from 'react';
import { Button } from './ui.jsx';

export default /** A dialog with a form: titled, primary action on the right, Escape closes it, full screen on a phone (Primer). */
function Dialog({ open, onClose, title, onSubmit, submit, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className="m-0 sm:m-auto w-full max-w-none sm:max-w-[32rem] h-full sm:h-auto max-h-none bg-card text-ink sm:rounded-2xl border border-line p-0 backdrop:bg-black/35">
      <form onSubmit={onSubmit} className="flex flex-col h-full">
        <header className="flex justify-between items-center px-5 py-4 border-b border-line"><h2 className="font-medium">{title}</h2><button type="button" aria-label="Close" className="text-soft" onClick={onClose}>✕</button></header>
        <div className="px-5 py-4 flex flex-col gap-4 flex-1 overflow-auto">{children}</div>
        <footer className="flex justify-end gap-2 px-5 py-3.5 border-t border-line"><Button onClick={onClose}>Cancel</Button><Button primary type="submit">{submit}</Button></footer>
      </form>
    </dialog>
  );
}
