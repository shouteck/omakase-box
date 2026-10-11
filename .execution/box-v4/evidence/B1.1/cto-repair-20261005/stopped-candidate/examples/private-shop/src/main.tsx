import { createRoot } from 'react-dom/client';
import { SelectionPanel } from './selection/SelectionPanel.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root.');
createRoot(root).render(<><p>Synthetic private fixture — pre-change behaviour, not a completed task.</p><SelectionPanel subject={{ id: 'synthetic-subject', tier: 'basic', region: 'north' }} /></>);
