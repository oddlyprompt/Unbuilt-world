import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import '../../../../packages/renderer/src/web-fonts.css';
import { installBackend } from './backend';
import { App } from './App';

// The backend layer (demo or remote) is installed before anything fetches.
void installBackend().then((mode) => createRoot(document.getElementById('root')!).render(<App mode={mode} />));
