import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { injectDesignTokens } from './theme/tokens.js';
import './styles/global.css';

// Inject CSS custom properties from design tokens
injectDesignTokens();

// Mount React app
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
