import {StrictMode, Component, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { asset } from './lib/asset';

// Keep the tab icon fresh too (Chrome caches favicons aggressively).
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon) icon.href = asset('assets/favicon.png');

class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{padding: 32, color: '#f1ca62', fontFamily: 'monospace'}}>
        <h2>Dynamic Robotics 53 — something went wrong</h2>
        <p>Please refresh the page. Details: {this.state.error.message}</p>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
