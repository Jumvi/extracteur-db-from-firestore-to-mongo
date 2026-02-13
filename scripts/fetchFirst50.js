#!/usr/bin/env node
require('dotenv').config();

const { createOdkClient } = require('../src/odkClient');

function parseArgs(argv) {
  const args = { json: false, orderby: '__system/submissionDate asc' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--orderby') args.orderby = argv[++i] || args.orderby;
    else positional.push(a);
  }
  return { args, positional };
}

function unwrapOData(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.value && Array.isArray(data.value)) return data.value;
  return [];
}

async function main() {
  const { args, positional } = parseArgs(process.argv.slice(2));
  const formId = positional[0];
  const projectId = positional[1] || process.env.ODK_PROJECT || '1';

  if (!formId) {
    console.error('Usage: node scripts/fetchFirst50.js <formId> [projectId] [--orderby "__system/submissionDate asc"] [--json]');
    process.exit(2);
  }

  const odk = createOdkClient({
    baseUrl: process.env.ODK_BASE_URL,
    loginUrl: process.env.ODK_LOGIN_URL,
    email: process.env.ODK_EMAIL,
    pass: process.env.ODK_PASS,
    mediaTemplate: process.env.MEDIA_URL_TEMPLATE,
    submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL,
  });

  await odk.login();

  const qs = [];
  qs.push(`$select=${encodeURIComponent('__id,__system')}`);
  qs.push(`$top=50`);
  qs.push(`$skip=0`);
  if (args.orderby) qs.push(`$orderby=${encodeURIComponent(args.orderby)}`);
  const query = `?${qs.join('&')}`;

  const data = await odk.fetchSubmissions(projectId, formId, query);
  const items = unwrapOData(data);

  const out = items.map((it) => ({
    __id: it.__id,
    submissionDate: it.__system && it.__system.submissionDate,
    attachmentsExpected: it.__system && it.__system.attachmentsExpected,
    attachmentsPresent: it.__system && it.__system.attachmentsPresent,
  }));

  if (args.json) {
    console.log(JSON.stringify({ formId, projectId, count: out.length, orderby: args.orderby, items: out }, null, 2));
  } else {
    console.log(`formId=${formId} projectId=${projectId} count=${out.length} orderby=${args.orderby}`);
    for (const row of out) {
      console.log(`${row.submissionDate || ''}\t${row.__id}\tattachments ${row.attachmentsPresent}/${row.attachmentsExpected}`);
    }
  }
}

main().catch((err) => {
  console.error('fetchFirst50 failed:', err && err.message ? err.message : err);
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
