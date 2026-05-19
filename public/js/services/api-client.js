const BASE_URL = '';

async function get(path) {
  const response = await fetch(BASE_URL + path, {
    method: 'GET',
    headers: createHeaders()
  });
  return parseResponse(response);
}

async function post(path, data) {
  const response = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: createHeaders(),
    body: JSON.stringify(data)
  });
  return parseResponse(response);
}

async function put(path, data) {
  const response = await fetch(BASE_URL + path, {
    method: 'PUT',
    headers: createHeaders(),
    body: JSON.stringify(data)
  });
  return parseResponse(response);
}

async function remove(path) {
  const response = await fetch(BASE_URL + path, {
    method: 'DELETE',
    headers: createHeaders()
  });
  return parseResponse(response);
}

function createHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  const token = getToken();
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  return headers;
}

async function parseResponse(response) {
  const data = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function setToken(token) {
  try {
    sessionStorage.setItem('mentor-hub-token', token);
  } catch (error) {
    window.__mentorHubToken = token;
  }
}

function getToken() {
  try {
    return sessionStorage.getItem('mentor-hub-token');
  } catch (error) {
    return window.__mentorHubToken || null;
  }
}

function removeToken() {
  try {
    sessionStorage.removeItem('mentor-hub-token');
  } catch (error) {
    window.__mentorHubToken = null;
  }
}

export { get, post, put, remove, setToken, getToken, removeToken };
