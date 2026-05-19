import { holeRuntimeKonfiguration } from './runtime-config.js';

let eventSource = null;
let gestartet = false;

async function starteDevReload() {
  if (gestartet) {
    return;
  }

  gestartet = true;

  let runtimeConfig = null;
  try {
    runtimeConfig = await holeRuntimeKonfiguration();
  } catch (error) {
    return;
  }

  if (!runtimeConfig || !runtimeConfig.devReloadEnabled || typeof EventSource !== 'function') {
    return;
  }

  eventSource = new EventSource('/api/dev/events');
  eventSource.addEventListener('reload', () => {
    window.location.reload();
  });
  eventSource.onerror = () => {
    if (eventSource && eventSource.readyState === EventSource.CLOSED) {
      eventSource = null;
      gestartet = false;
    }
  };
}

export { starteDevReload };