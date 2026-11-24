import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/theme.css';
import './app/base.css';
import App from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';

// Coming back through the browser's back-forward cache restores a page whose camera was shut down when it was
// hidden (e.g. after opening a game from Bobo's Arcade and pressing Back). Start clean instead.
window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
