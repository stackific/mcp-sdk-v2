import './index.css';

import { StrictMode } from 'react';

import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';

import { ElicitationHost } from './components/elicitation-host';
import { startDebugStream } from './lib/debug';
import { router } from './router';

// Open the single live wire-debug stream for this window.
startDebugStream();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <ElicitationHost />
  </StrictMode>,
);
