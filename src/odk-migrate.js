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
  // robust instanceId detection across common property names
  function findInstanceId(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = ['instanceId', 'instanceID', 'InstanceId', '_id', 'id', 'uuid', 'submissionId', 'SubmissionId', 'SubmissionUUID', '__id'];
    for (const k of keys) if (obj[k]) return String(obj[k]);
    // nested meta.instanceID
    if (obj.meta && (obj.meta.instanceID || obj.meta.instanceId)) return String(obj.meta.instanceID || obj.meta.instanceId);
    // try common OData system container
    if (obj.__system && (obj.__system.instanceId || obj.__system.instanceID)) return String(obj.__system.instanceId || obj.__system.instanceID);
    return null;
  }

  const instanceId = findInstanceId(submission) || null;
  const doc = { ...submission };

  // build proxy template
  const proxyTemplate = process.env.ODK_ATTACHMENT_PROXY_TEMPLATE || process.env.ODK_ATTACHMENT_PROXY || '/api/getAttachment?instanceId={instanceId}&filename={filename}';

  // detect media and build attachments metadata
  const medias = detectMediaFields(submission);
  const attachments = [];
  for (const m of medias) {
    const filename = m.filename;
    const fieldPath = m.path;
    const att = { filename, fieldPath };

    // build proxy URL (for frontend) if instanceId is available
    if (instanceId) {
      att.proxyUrl = proxyTemplate.replace('{instanceId}', encodeURIComponent(instanceId))
        .replace('{filename}', encodeURIComponent(filename))
        .replace('{formId}', encodeURIComponent(formId))
        .replace('{projectId}', encodeURIComponent(projectId));
    }

    // attempt to download + store media (S3 or GridFS)
    try {
      if (instanceId) {
        const mediaStream = await odk.downloadMedia(projectId, formId, instanceId, filename);
        if (s3client && s3bucket) {
          const key = `${formId}/${instanceId}/${filename}`;
          const url = await uploadToS3(s3client, s3bucket, key, mediaStream, 'application/octet-stream');
          att.s3 = url;
          // keep backward compatibility
          doc[`${fieldPath}_url`] = url;
        } else {
          const res = await uploadToGridFS(bucket, `${formId}_${instanceId}_${filename}`, mediaStream);
          att.gridFs = res;
          doc[`${fieldPath}_gridfs`] = res;
        }
      } else {
        logger.warn({ fieldPath, filename }, 'no instanceId, skipping direct media download');
      }
    } catch (err) {
      logger.error({ err, filename, instanceId }, 'media download/upload failed');
    }

    attachments.push(att);
  }

  if (attachments.length) doc.attachments = attachments;

  // ensure we persist a stable instanceId in the document and use it as the upsert key
  const effectiveId = instanceId || (doc && (doc.__id || doc._id || doc.id || doc.uuid || (doc.meta && (doc.meta.instanceID || doc.meta.instanceId))));
  if (effectiveId) doc.instanceId = effectiveId;
  await upsertSubmission(formId, effectiveId || null, doc);
}

async function runOnce() {
  const formId = opts.form;
  if (!formId) throw new Error('--form is required');
  const projectId = opts.project;
  const pageSize = opts.pageSize || 200;
  const expand = opts.expand || '*';
  const backwindow = (opts.backwindow || 10) * 1000;

  const odk = createOdkClient({ baseUrl: process.env.ODK_BASE_URL, loginUrl: process.env.ODK_LOGIN_URL, email: process.env.ODK_EMAIL, pass: process.env.ODK_PASS, mediaTemplate: process.env.MEDIA_URL_TEMPLATE, submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL });
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

  // helper to build a lightweight listing query (only ids + system metadata)
  function buildListQstr() {
    const qs = [];
    qs.push(`$select=${encodeURIComponent('__id,__system')}`);
    qs.push(`$top=${pageSize}`);
    qs.push(`$skip=${skip}`);
    return qs.length ? `?${qs.join('&')}` : '';
  }

  while (more) {
    const qstr = buildListQstr();
    logger.info({ qstr }, 'fetching submission ids (lightweight)');
    let data;
    try {
      data = await odk.fetchSubmissions(projectId, formId, qstr);
    } catch (err) {
      logger.error({ err }, 'failed fetching submission ids');
      throw err;
    }

    const items = Array.isArray(data) ? data : (data && data.value) ? data.value : [];
    if (!items.length) break;

    await Promise.all(items.map(item => limit(async () => {
      try {
        // extract candidate id and submission date from lightweight row
        const rawId = item.__id || item._id || item.id || item.instanceId || item.uuid;
        let listedDate = null;
        if (item.__system) {
          listedDate = item.__system.submissionDate || item.__system.createdAt || item.__system.submissiontime || item.__system.timestamp;
        }
        // normalize listedDate
        const listedAt = listedDate ? new Date(listedDate) : null;

        // if we have a since and listedAt, skip early
        if (since && listedAt && listedAt <= since) return;

        // fetch full detail per-instance (with $expand) to get attachments and nested repeats
        let record = item;
        if (rawId) {
          // ensure proper quoting/encoding for OData key - preserve uuid: prefix if present
          const encodedId = encodeURIComponent(String(rawId));
          const perQ = `('${encodedId}')?${`$expand=${encodeURIComponent(expand)}`}`;
          try {
            const detail = await odk.fetchSubmissions(projectId, formId, perQ);
            if (detail && Array.isArray(detail)) record = detail[0] || record;
            else if (detail && detail.value && Array.isArray(detail.value)) record = detail.value[0] || record;
            else if (detail && typeof detail === 'object') record = detail;
          } catch (err) {
            logger.warn({ err, rawId }, 'failed fetching per-instance detail, falling back to list item');
          }
        }

        // determine submittedAt from the detailed record if possible
        let submittedAt = null;
        if (record.__system) submittedAt = record.__system.submissionDate || record.__system.createdAt;
        if (!submittedAt) submittedAt = record.submittedAt || record.createdAt || record._submittedAt;
        submittedAt = submittedAt ? new Date(submittedAt) : new Date();

        if (since && submittedAt <= since) return;
        if (submittedAt > maxSeen) maxSeen = submittedAt;

        await processSubmission(odk, s3client, s3bucket, gridfsBucket, projectId, formId, record);
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
