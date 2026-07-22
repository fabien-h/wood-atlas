import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ensureLanguageInUrl } from './navigation/urlState';
import './styles/global.css';

ensureLanguageInUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
