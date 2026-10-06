import { createApp } from './app.js';
import { showFatal } from './shell.js';

createApp()
  .then((app) => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.__echo = app;
    }
  })
  .catch((error) => {
    console.error('[echo.us] failed to start', error);
    showFatal(error?.message || 'Something went wrong while starting the piece.');
  });
