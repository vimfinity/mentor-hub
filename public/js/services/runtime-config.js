let runtimeConfigPromise = null;

async function holeRuntimeKonfiguration() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch('/api/runtime-config', {
      headers: {
        Accept: 'application/json'
      }
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Runtime config not available');
        }

        return response.json();
      })
      .catch((error) => {
        runtimeConfigPromise = null;
        throw error;
      });
  }

  return runtimeConfigPromise;
}

export { holeRuntimeKonfiguration };