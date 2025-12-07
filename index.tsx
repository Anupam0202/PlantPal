import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';


// Get root element
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element. Please ensure index.html contains <div id="root"></div>');
}

// Create React root and render
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Log app initialization
console.log('%c🌿 PlantPal Initialized', 'color: #10B981; font-weight: bold; font-size: 14px;');
console.log('%cGreen Urban Planning Assistant', 'color: #64748B; font-size: 12px;');