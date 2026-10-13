import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App.jsx';
import { startSeasonalIconUpdates } from './services/seasonalIcons.js';
import './styles/app.css';

startSeasonalIconUpdates();

const rootElement = document.querySelector('#root');
if (!rootElement) throw new Error('Application root element was not found.');

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
