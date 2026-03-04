#!/usr/bin/env node
require('dotenv').config();

const { createOdkClient } = require('../src/odkClient');

function parseArgs(argv) {
  const args = { json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else positional.push(a);
  }
  return { args, positional };
}

function unwrap(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.value && Array.isArray(data.value)) return data.value;
  return [];
}

async function main() {
  const { args, positional } = parseArgs(process.argv.slice(2));
  const projectId = positional[0] || process.env.ODK_PROJECT || '1';

  const odk = createOdkClient({
    baseUrl: process.env.ODK_BASE_URL,
    loginUrl: process.env.ODK_LOGIN_URL,
    email: process.env.ODK_EMAIL,
    pass: process.env.ODK_PASS,
    mediaTemplate: process.env.MEDIA_URL_TEMPLATE,
    submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL,
  });

  await odk.login();

  const data = await odk.fetchForms(projectId);
  const forms = unwrap(data);

  const out = forms.map((f) => ({
    xmlFormId: f.xmlFormId || f.xmlFormID || f.formId || f.id || null,
    name: f.name || f.title || null,
    state: f.state || null,
  }));

  if (args.json) {
    console.log(JSON.stringify({ projectId, count: out.length, forms: out }, null, 2));
    return;
  }

  console.log(`projectId=${projectId} forms=${out.length}`);
  for (const f of out) {
    console.log(`${f.xmlFormId || ''}\t${f.state || ''}\t${f.name || ''}`);
  }
}

main().catch((err) => {
  console.error('listForms failed:', err && err.message ? err.message : err);
  if (err && err.response) {
    console.error('status', err.response.status);
    try {
      console.error('data', JSON.stringify(err.response.data));
    } catch (e) {
      console.error('data', err.response.data);
    }
  }
  process.exit(1);
});
