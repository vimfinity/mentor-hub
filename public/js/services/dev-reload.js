import { getRuntimeConfig } from './runtime-config.js';

let eventSource = null;
let started = false;

async function startDevReload() {
  if (started) {
    return;
  }

  started = true;

  let runtimeConfig = null;
  try {
    runtimeConfig = await getRuntimeConfig();
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
      started = false;
    }
  };
}

export { startDevReload };