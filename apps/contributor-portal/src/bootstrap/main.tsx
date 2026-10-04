import { createRoot } from 'react-dom/client';
import { PortalScreen } from '../../portal/portal-screen.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<PortalScreen />);
