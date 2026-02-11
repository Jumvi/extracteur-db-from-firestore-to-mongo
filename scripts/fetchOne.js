#!/usr/bin/env node
require('dotenv').config();
const { createOdkClient } = require('../src/odkClient');
const util = require('util');

async function main() {
  const formId = process.argv[2];
  const instanceId = process.argv[3];
  if (!formId || !instanceId) {
    console.error('Usage: node scripts/fetchOne.js <formId> <instanceId>');
    process.exit(2);
  }
  const odk = createOdkClient({ baseUrl: process.env.ODK_BASE_URL, loginUrl: process.env.ODK_LOGIN_URL, email: process.env.ODK_EMAIL, pass: process.env.ODK_PASS, mediaTemplate: process.env.MEDIA_URL_TEMPLATE, submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL });
  await odk.login();
  try {
      const attempts = [
        { name: "per-instance (raw)", q: `('${instanceId}')` },
        { name: "per-instance (encoded)", q: `('${encodeURIComponent(instanceId)}')` },
        { name: "filter by __id", q: `?$filter=__id eq '${instanceId}'` },
        { name: "filter by __id (encoded)", q: `?$filter=__id eq ${encodeURIComponent("'" + instanceId + "'")}` }
      ];
      for (const a of attempts) {
        try {
          console.log('\nTrying:', a.name, a.q);
          const detail = await odk.fetchSubmissions(process.env.ODK_PROJECT || '1', formId, a.q);
          console.log('Success:', a.name);
          console.log(util.inspect(detail, { depth: 5, colors: false }));
          break;
        } catch (err) {
          console.error('Attempt failed:', a.name, err && err.message);
          if (err && err.response) console.error('status', err.response.status, err.response.data);
        }
      }
  } catch (err) {
    console.error('fetch failed', err && err.message);
    if (err && err.response) console.error('status', err.response.status, err.response.data);
  }
}

main();
