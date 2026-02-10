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

function createOdkClient({ baseUrl, loginUrl, email, pass, mediaTemplate }) {
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

  async function fetchSubmissions(projectId, formId, query) {
    const path = `/projects/${projectId}/forms/${formId}.svc/Submissions${query || ''}`;
    const res = await ax.get(path);
    return res.data;
  }

  async function downloadMedia(projectId, formId, instanceId, filename) {
    const url = buildMediaUrl(mediaTemplate, { projectId, formId, instanceId, filename }) ||
      `/projects/${projectId}/forms/${formId}/submissions/${instanceId}/attachments/${encodeURIComponent(filename)}`;
    const res = await ax.get(url, { responseType: 'stream' });
    return res.data;
  }

  return { login, fetchSubmissions, downloadMedia, axios: ax };
}

module.exports = { createOdkClient };
