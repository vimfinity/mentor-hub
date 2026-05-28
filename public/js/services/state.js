// ===========================================
// State service - simple event bus
// ===========================================

/** @type {Map<string, Array<Function>>} Event-Listener Map */
const subscribers = new Map();

/**
 * Registers a listener for an event.
 * @param {string} eventName - Event-Name
 * @param {Function} callback - Callback-Funktion
 * @returns {Function} Unsubscribe function
 */
function subscribe(eventName, callback) {
  if (!subscribers.has(eventName)) {
    subscribers.set(eventName, []);
  }
  subscribers.get(eventName).push(callback);

  // Return the unsubscribe function.
  return () => {
    const list = subscribers.get(eventName);
    if (list) {
      const index = list.indexOf(callback);
      if (index > -1) {
        list.splice(index, 1);
      }
    }
  };
}

/**
 * Sends an event to all subscribers.
 * @param {string} eventName - Event-Name
 * @param {*} data - Data to pass to listeners
 */
function emit(eventName, data) {
  const list = subscribers.get(eventName);
  if (list) {
    list.forEach(callback => callback(data));
  }
}

export { subscribe, emit };
