#!/usr/bin/env node
require('dotenv').config();
const { program } = require('commander');
let pLimit = require('p-limit');
if (pLimit && typeof pLimit !== 'function' && pLimit.default) pLimit = pLimit.default;
const { createOdkClient } = require('./odkClient');
const { connect, getBucket, upsertSubmission, getSyncState, setSyncState } = require('./mongoClient');
const pino = require('pino');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

program
  .option('--form <formId>', 'form id to sync')
  .option('--project <projectId>', 'ODK project id', process.env.ODK_PROJECT || '1')
  .option('--since <iso>', 'ISO date to fetch since')
  .option('--once', 'run once and exit')
  .option('--daemon', 'run continuously')
  .option('--pageSize <n>', 'page size', parseInt, 200)
  .option('--backwindow <secs>', 'backwindow seconds', parseInt, 10)
  .option('--expand <exp>', 'OData $expand value', '*')
  .parse(process.argv);

const opts = program.opts();

async function uploadToS3(s3client, bucket, key, streamBody, contentType) {
  const pass = new stream.PassThrough();
  streamBody.pipe(pass);
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: pass, ContentType: contentType });
  await s3client.send(cmd);
  return `s3://${bucket}/${key}`;
}

async function uploadToGridFS(bucket, filename, streamBody) {
  const upload = bucket.openUploadStream(filename);
  await pipeline(streamBody, upload);
  return { gridFsId: upload.id.toString(), filename };
}

function detectMediaFields(obj) {
  const media = [];
  function walk(o, path = []) {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string' && v.match(/\.(jpg|jpeg|png|gif|mp4|wav|mp3|pdf)$/i)) {
        media.push({ path: [...path, k].join('.'), filename: v });
      } else if (Array.isArray(v)) {
        v.forEach((it, idx) => walk(it, [...path, k, idx]));
      } else if (typeof v === 'object') {
        walk(v, [...path, k]);
      }
    }
  }
  walk(obj);
  return media;
}

async function processSubmission(odk, s3client, s3bucket, bucket, projectId, formId, submission) {
  const instanceId = submission.instanceId || submission.instanceId || submission._id || submission.uuid;
  const doc = { ...submission };
  // detect media
  const medias = detectMediaFields(submission);
  for (const m of medias) {
    try {
      const filename = m.filename;
      const mediaStream = await odk.downloadMedia(projectId, formId, instanceId, filename);
      if (s3client && s3bucket) {
        const key = `${formId}/${instanceId}/${filename}`;
        const url = await uploadToS3(s3client, s3bucket, key, mediaStream, 'application/octet-stream');
        doc[`${m.path}_url`] = url;
      } else {
        const res = await uploadToGridFS(bucket, `${formId}_${instanceId}_${filename}`, mediaStream);
        doc[`${m.path}_gridfs`] = res;
      }
    } catch (err) {
      logger.error({ err }, 'media download/upload failed');
    }
  }

  await upsertSubmission(formId, instanceId, doc);
}

async function runOnce() {
  const formId = opts.form;
  if (!formId) throw new Error('--form is required');
  const projectId = opts.project;
  const pageSize = opts.pageSize || 200;
  const expand = opts.expand || '*';
  const backwindow = (opts.backwindow || 10) * 1000;

  const odk = createOdkClient({ baseUrl: process.env.ODK_BASE_URL, loginUrl: process.env.ODK_LOGIN_URL, email: process.env.ODK_EMAIL, pass: process.env.ODK_PASS, mediaTemplate: process.env.MEDIA_URL_TEMPLATE });
  await odk.login();

  // mongo connection and bucket
  await connect();
  const gridfsBucket = getBucket();

  // s3 client if configured
  let s3client = null;
  const s3bucket = process.env.S3_BUCKET;
  if (process.env.AWS_ACCESS_KEY_ID && s3bucket) {
    s3client = new S3Client({ region: process.env.AWS_REGION });
  }

  // determine since
  let since = null;
  if (opts.since) {
    const d = Date.parse(opts.since);
    if (isNaN(d)) throw new Error('Invalid --since date');
    since = new Date(d - backwindow);
  } else {
    const state = await getSyncState(formId);
    if (state && state.lastSyncAt) since = new Date(new Date(state.lastSyncAt).getTime() - backwindow);
  }

  let skip = 0;
  let maxSeen = since ? new Date(since) : new Date(0);
  let more = true;
  const limit = pLimit(4);

  while (more) {
    const qs = [`?$expand=${encodeURIComponent(expand)}`];
    qs.push(`$top=${pageSize}`);
    qs.push(`$skip=${skip}`);
    if (since) qs.push(`$filter=submittedAt gt ${encodeURIComponent(new Date(since).toISOString())}`);
    const qstr = qs.length ? `?${qs.join('&')}` : '';
    logger.info({ qstr }, 'fetching submissions');
    let data;
    try {
      data = await odk.fetchSubmissions(projectId, formId, qstr);
    } catch (err) {
      logger.error({ err }, 'failed fetching submissions');
      throw err;
    }

    const items = Array.isArray(data) ? data : (data && data.value) ? data.value : [];
    if (!items.length) break;

    await Promise.all(items.map(item => limit(async () => {
      try {
        const submittedAt = new Date(item.submittedAt || item.createdAt || item._submittedAt || Date.now());
        if (submittedAt > maxSeen) maxSeen = submittedAt;
        await processSubmission(odk, s3client, s3bucket, gridfsBucket, projectId, formId, item);
      } catch (err) {
        logger.error({ err }, 'processing submission failed');
      }
    })));

    if (items.length < pageSize) more = false; else skip += pageSize;
  }

  if (maxSeen && maxSeen.getTime() > 0) {
    await setSyncState(formId, maxSeen.toISOString());
    logger.info({ lastSyncAt: maxSeen.toISOString() }, 'updated sync_state');
  }
}

async function main() {
  if (opts.once) {
    await runOnce();
    process.exit(0);
  }
  if (opts.daemon) {
    while (true) {
      try {
        await runOnce();
      } catch (err) {
        logger.error({ err }, 'runOnce failed in daemon');
      }
      await new Promise(r => setTimeout(r, 60 * 1000));
    }
  }
  console.error('Specify --once or --daemon');
  process.exit(2);
}

main().catch(err => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
