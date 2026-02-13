const axios = require('axios');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function buildMediaUrl(template, params) {
  if (!template) return null;
  return template.replace('{projectId}', params.projectId)
    .replace('{formId}', params.formId)
    .replace('{instanceId}', params.instanceId)
    .replace('{filename}', encodeURIComponent(params.filename));
}

function createOdkClient({ baseUrl, loginUrl, email, pass, mediaTemplate, submissionsTemplate }) {
  const ax = axios.create({ baseURL: baseUrl, timeout: 60000 });
  let cookie = null;

  async function login() {
    if (!loginUrl || !email || !pass) {
      logger.info('No login credentials provided, assuming tokenless auth');
      return;
    }
    try {
      const res = await ax.post(loginUrl, { email, password: pass });
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        cookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
        ax.defaults.headers.common['Cookie'] = cookie;
        logger.info('Logged in to ODK and stored session cookie');
      } else if (res.data && res.data.token) {
        ax.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        logger.info('Logged in to ODK and stored bearer token');
      } else {
        logger.warn('Login response had no cookie or token');
      }
    } catch (err) {
      logger.error({ err }, 'ODK login failed');
      throw err;
    }
  }

  function buildSubmissionsUrl(template, projectId, formId, query) {
    if (!template) return `/projects/${projectId}/forms/${formId}.svc/Submissions${query || ''}`;
    let url = template.replace('{projectId}', projectId).replace('{formId}', formId);
    // if template expects a {query} placeholder, inject without leading '?'
    if (url.indexOf('{query}') !== -1) {
      const q = query && query.startsWith('?') ? query.substring(1) : (query || '');
      return url.replace('{query}', q);
    }
    // otherwise append query appropriately
    if (query) {
      if (url.includes('?')) return `${url}&${query.substring(1)}`;
      return `${url}${query}`;
    }
    return url;
  }

  async function fetchSubmissions(projectId, formId, query) {
    const path = buildSubmissionsUrl(submissionsTemplate, projectId, formId, query);
    const res = await ax.get(path);
    return res.data;
  }

  async function fetchForms(projectId) {
    const path = `/projects/${projectId}/forms`;
    const res = await ax.get(path);
    return res.data;
  }

  async function downloadMedia(projectId, formId, instanceId, filename) {
    const url = buildMediaUrl(mediaTemplate, { projectId, formId, instanceId, filename }) ||
      `/projects/${projectId}/forms/${formId}/submissions/${instanceId}/attachments/${encodeURIComponent(filename)}`;
    const res = await ax.get(url, { responseType: 'stream' });
    return { stream: res.data, headers: res.headers };
  }

  return { login, fetchSubmissions, downloadMedia, axios: ax, buildSubmissionsUrl, fetchForms };
}

module.exports = { createOdkClient };
