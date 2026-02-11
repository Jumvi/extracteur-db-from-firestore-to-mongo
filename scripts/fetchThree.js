#!/usr/bin/env node
require('dotenv').config();
const { createOdkClient } = require('../src/odkClient');
const util = require('util');

async function main() {
  const formId = process.argv[2] || process.env.FORM_ID || 'audit_chantier_routier_ouvrage_v1';
  const projectId = process.env.ODK_PROJECT || '1';
  const pageSize = 3;
  const odk = createOdkClient({ baseUrl: process.env.ODK_BASE_URL, loginUrl: process.env.ODK_LOGIN_URL, email: process.env.ODK_EMAIL, pass: process.env.ODK_PASS, mediaTemplate: process.env.MEDIA_URL_TEMPLATE, submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL });
  await odk.login();
  // lightweight list
  const qstr = `?$select=${encodeURIComponent('__id,__system')}&$top=${pageSize}`;
  const list = await odk.fetchSubmissions(projectId, formId, qstr);
  const items = Array.isArray(list) ? list : (list && list.value) ? list.value : [];
  console.log('Found', items.length, 'items');
  for (const it of items) {
    const rawId = it.__id || it._id || it.id || it.instanceId || it.uuid;
    console.log('\n===', rawId);
    try {
      const detailQ = `?$filter=__id eq '${rawId}'`;
      const detail = await odk.fetchSubmissions(projectId, formId, detailQ);
      console.log(util.inspect(detail, { depth: 4, colors: false }));
    } catch (err) {
      console.error('detail fetch failed', err && err.message);
      if (err && err.response) console.error(err.response.status, err.response.data);
    }
  }
}

main();
