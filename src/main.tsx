import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';


// HASH_ROUTER_COMPAT_REDIRECT:
// If a user visits /app (no hash), redirect to /#/app so HashRouter routes correctly.
if (!window.location.hash && window.location.pathname !== '/') {
  const path = window.location.pathname + window.location.search;
  window.location.replace('/#' + path);
}


// Disable Service Workers during rapid iteration to avoid stale cached builds.
// This also cleans up any previously-registered SW for this origin.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
