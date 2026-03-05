#!/usr/bin/env node
require('dotenv').config();
const { program } = require('commander');
const util = require('util');
let pLimit = require('p-limit');
if (pLimit && typeof pLimit !== 'function' && pLimit.default) pLimit = pLimit.default;
const { createOdkClient } = require('./odkClient');
const { connect, getBucket, upsertSubmission, getSubmission, getSyncState, setSyncState, clearSyncState, materializeSegmentsFromSubmission } = require('./mongoClient');
const pino = require('pino');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const stream = require('stream');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pipeline = promisify(stream.pipeline);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function parseInt10(v) {
  const n = Number.parseInt(String(v), 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer: ${v}`);
  return n;
}

program
  .option('--form <formId>', 'form id to sync')
  .option('--project <projectId>', 'ODK project id', process.env.ODK_PROJECT || '1')
  .option('--since <iso>', 'ISO date to fetch since')
  .option('--until <iso>', 'ISO date upper bound (exclusive) for Mongo backfill filtering')
  .option('--no-server-filter-since', 'do not send $filter __system/submissionDate gt ...; filter client-side only')
  .option('--instance <instanceId>', 'process only a specific submission instanceId (__id)')
  .option('--once', 'run once and exit')
  .option('--daemon', 'run continuously')
  .option('--backfill-segments', 'for submissions already in Mongo, hydrate only etat_troncon/segments via OData and update docs in-place')
  .option('--segments-force', 'overwrite existing etat_troncon.segments (default: skip if already present)')
  .option('--pageSize <n>', 'page size', parseInt10, 200)
  .option('--limit <n>', 'max number of submissions to process per run', parseInt10)
  .option('--orderby <expr>', 'OData $orderby expression (e.g. "__system/submissionDate asc")', '')
  .option('--reset-state', 'clear sync_state for this form before running')
  .option('--ignore-state', 'do not read sync_state when determining --since')
  .option('--backwindow <secs>', 'backwindow seconds', parseInt10, 10)
  .option('--expand <exp>', 'OData $expand value', '')
  .option('--no-hydrate-nav', 'disable @odata.navigationLink hydration')
  .option('--nav-depth <n>', 'navigationLink hydration max depth', parseInt10, 4)
  .option('--nav-concurrency <n>', 'max concurrent navigationLink requests per submission', parseInt10, 6)
  .option('--nav-max-requests <n>', 'max navigationLink requests per submission', parseInt10, 250)
  .option('--nav-timeout-ms <n>', 'hard timeout per navigationLink request (ms)', parseInt10, 60000)
  .option('--nav-budget-ms <n>', 'total time budget for navigationLink hydration per submission (ms)', parseInt10, 120000)
  .option('--strip-navlinks', 'delete "@odata.navigationLink" keys after successful hydration')
  .option('--no-diff', 'disable differential mode (skip unchanged submissions)')
  .option('--exclude-tests', 'skip submissions where type_donnee is test/tests (default: true unless --include-tests)')
  .option('--include-tests', 'do not skip test submissions')
  .option('--media-concurrency <n>', 'max concurrent media downloads/uploads per submission', parseInt10, 2)
  .option('--skip-media', 'do not download or store media')
  .option('--materialize-segments', 'write derived segment documents into Mongo collection odk_segments')
  .option('--dry-run', 'print resulting documents instead of upserting')
  .option('--all', 'migrate all forms in the project')
  .parse(process.argv);

const opts = program.opts();

function shouldMaterializeSegments() {
  if (typeof opts.materializeSegments === 'boolean') return opts.materializeSegments;
  const env = (process.env.ODK_MATERIALIZE_SEGMENTS || '').toString().toLowerCase().trim();
  if (!env) return false;
  return env === '1' || env === 'true' || env === 'yes' || env === 'y';
}

function shouldExcludeTests() {
  if (opts.includeTests) return false;
  if (opts.excludeTests) return true;
  const env = (process.env.ODK_EXCLUDE_TESTS || '').toString().toLowerCase().trim();
  if (!env) return false;
  return env === '1' || env === 'true' || env === 'yes' || env === 'y';
}

function isTestValue(v) {
  if (v === null || typeof v === 'undefined') return false;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === 'test' || s === 'tests';
}

function isTestSubmission(record) {
  if (!record || typeof record !== 'object') return false;
  const g = record.group_02;
  if (g && typeof g === 'object') {
    if (isTestValue(g.type_donnee)) return true;
    if (isTestValue(g.type_donnee_save)) return true;
  }
  // fallback: some forms may have the flag at the root
  if (isTestValue(record.type_donnee)) return true;
  if (isTestValue(record.type_donnee_save)) return true;
  return false;
}

function normalizeInstanceId(id) {
  if (id === null || typeof id === 'undefined') return null;
  let s = String(id);
  // Some OData responses already include percent-encoded ids (e.g. "uuid%3A...").
  // Decode once so we can re-encode deterministically (avoids double-encoding).
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try { s = decodeURIComponent(s); } catch (e) { /* ignore */ }
  }
  return s;
}

function encodeInstanceIdOnce(id) {
  const normalized = normalizeInstanceId(id);
  if (!normalized) return '';
  return encodeURIComponent(normalized);
}

function escapeODataStringLiteral(v) {
  // OData string literal escaping: single quote doubled
  return String(v).replace(/'/g, "''");
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function parseSinceInput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // Accept YYYY-MM-DD and treat as UTC midnight.
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const iso = dateOnly ? `${trimmed}T00:00:00Z` : trimmed;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    // Special-case Feb 29 on non-leap years to provide a helpful hint.
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo === 2 && d === 29 && !isLeapYear(y)) {
        throw new Error(`Invalid --since date (${trimmed}): ${y} is not a leap year. Use ${y}-02-28 (or a leap year like 2024-02-29).`);
      }
    }
    throw new Error(`Invalid --since date (${trimmed}). Use ISO 8601 like 2026-02-28 or 2026-02-28T00:00:00Z.`);
  }
  return new Date(ms);
}

async function uploadToS3(s3client, bucket, key, streamBody, contentType) {
  // streamBody may be either a plain stream or an object { stream, headers }
  let actualStream = streamBody;
  let contentLength = undefined;
  if (streamBody && typeof streamBody === 'object' && streamBody.stream) {
    actualStream = streamBody.stream;
    if (streamBody.headers) {
      contentLength = streamBody.headers['content-length'] || streamBody.headers['Content-Length'];
      if (!contentType) contentType = streamBody.headers['content-type'] || streamBody.headers['Content-Type'];
    }
  }

  const acl = process.env.S3_PUBLIC_ACL || 'public-read';
  // If we know the size, stream directly. Otherwise buffer once to a temp file.
  // (Important: we must not try to read the same stream twice.)
  if (contentLength) {
    const pass = new stream.PassThrough();
    actualStream.pipe(pass);
    const params = { Bucket: bucket, Key: key, Body: pass, ContentType: contentType, ACL: acl };
    const n = parseInt(contentLength, 10);
    if (!isNaN(n)) params.ContentLength = n;
    const cmd = new PutObjectCommand(params);
    await s3client.send(cmd);
    return buildPublicUrl(bucket, key);
  }

  const tmpName = `odk_upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpPath = path.join(os.tmpdir(), tmpName);
  try {
    await pipeline(actualStream, fs.createWriteStream(tmpPath));
    const st = await fs.promises.stat(tmpPath);
    const size = st.size;
    const readStream = fs.createReadStream(tmpPath);
    const params2 = { Bucket: bucket, Key: key, Body: readStream, ContentType: contentType, ContentLength: size, ACL: acl };
    const cmd2 = new PutObjectCommand(params2);
    await s3client.send(cmd2);
    return buildPublicUrl(bucket, key);
  } finally {
    try { await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
  }
}

function buildPublicUrl(bucket, key) {
  const useCdn = (process.env.S3_USE_CDN || '').toString().toLowerCase() === 'true';
  const cdn = process.env.S3_CDN;
  const publicTemplate = process.env.S3_PUBLIC_URL_TEMPLATE || '{cdn}/{key}';
  // encode each path segment but preserve slashes
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (useCdn && cdn) {
    return publicTemplate.replace('{cdn}', cdn).replace('{bucket}', bucket).replace('{key}', encodedKey);
  }
  const endpoint = process.env.S3_ENDPOINT ? process.env.S3_ENDPOINT.replace(/\/$/, '') : null;
  if (endpoint) {
    const e = endpoint.replace(/^https?:\/\//, '');
    if (endpoint.includes('{bucket}') || endpoint.includes('{key}')) {
      return endpoint.replace('{bucket}', bucket).replace('{key}', encodedKey);
    }
    if (e.includes('digitaloceanspaces.com')) {
      return `https://${bucket}.${e}/${encodedKey}`;
    }
    return `${endpoint}/${bucket}/${encodedKey}`;
  }
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

function parseODataCollection(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.value)) return data.value;
  // single object
  if (typeof data === 'object') return [data];
  return [];
}

function pickSegmentsNavLinkFromDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  // The navigationLink is often stored under the parent object (etat_troncon), but may also appear at the root.
  if (doc.etat_troncon && typeof doc.etat_troncon === 'object') {
    const nested = doc.etat_troncon['segments@odata.navigationLink'];
    if (nested) return String(nested);
  }
  const root = doc['segments@odata.navigationLink'];
  if (root) return String(root);
  return null;
}

async function backfillSegmentsOnly({ odk, db, projectId, formId, resolveNavLink }) {
  const col = db.collection(`odk_submissions_${formId}`);
  const navConcurrency = opts.navConcurrency || 6;
  const timeoutMs = opts.navTimeoutMs || 60000;

  let sinceIso = null;
  if (opts.since) {
    const d = parseSinceInput(opts.since);
    sinceIso = d.toISOString();
  }

  let untilIso = null;
  if (opts.until) {
    const d = parseSinceInput(opts.until);
    untilIso = d.toISOString();
  }

  const filter = {};
  if (sinceIso || untilIso) {
    filter['__system.submissionDate'] = {};
    if (sinceIso) filter['__system.submissionDate'].$gte = sinceIso;
    if (untilIso) filter['__system.submissionDate'].$lt = untilIso;
  }

  const projection = {
    _id: 0,
    instanceId: 1,
    '__system.submissionDate': 1,
    etat_troncon: 1,
    'segments@odata.navigationLink': 1,
  };

  const hardLimit = typeof opts.limit === 'number' && !isNaN(opts.limit) && opts.limit > 0 ? opts.limit : null;

  let scanned = 0;
  let hydrated = 0;
  let skipped = 0;
  let failed = 0;

  logger.info({ formId, sinceIso, untilIso, navConcurrency, timeoutMs, hardLimit }, 'starting backfill-segments (Mongo -> ODK -> Mongo)');

  const limit = pLimit(navConcurrency);
  const pending = [];

  const cursor = col.find(filter).project(projection);
  for await (const doc of cursor) {
    if (hardLimit && scanned >= hardLimit) break;
    scanned += 1;

    pending.push(limit(async () => {
      const instanceId = doc && doc.instanceId ? String(doc.instanceId) : null;
      if (!instanceId) {
        skipped += 1;
        return;
      }

      const existingSegments = doc.etat_troncon && typeof doc.etat_troncon === 'object' ? doc.etat_troncon.segments : null;
      if (!opts.segmentsForce && Array.isArray(existingSegments) && existingSegments.length) {
        skipped += 1;
        return;
      }

      const storedNavLink = pickSegmentsNavLinkFromDoc(doc);
      const fallbackNavLink = `Submissions('${encodeInstanceIdOnce(instanceId)}')/etat_troncon/segments`;
      const rel = storedNavLink || fallbackNavLink;
      const url = resolveNavLink(rel);

      let segments = [];
      try {
        const res = await odk.axios.get(url, { timeout: timeoutMs });
        segments = parseODataCollection(res.data);
      } catch (err) {
        failed += 1;
        logger.warn({ err, formId, instanceId, url, rel }, 'segments hydration failed');
        return;
      }

      const hydratedAt = new Date().toISOString();
      try {
        await col.updateOne(
          { instanceId },
          {
            $set: {
              'etat_troncon.segments': segments,
              'etat_troncon.segments__hydratedAt': hydratedAt,
              'etat_troncon.segments__odataNavigationLink': rel,
            },
          }
        );
        hydrated += 1;
      } catch (err) {
        failed += 1;
        logger.warn({ err, formId, instanceId }, 'failed updating Mongo with hydrated segments');
        return;
      }

      if (shouldMaterializeSegments()) {
        try {
          const saved = await getSubmission(formId, instanceId);
          if (saved) {
            const res2 = await materializeSegmentsFromSubmission({ formId, projectId, submission: saved });
            logger.info({ formId, instanceId, deleted: res2.deleted, inserted: res2.inserted }, 'materialized odk_segments (backfill)');
          }
        } catch (err) {
          logger.warn({ err, formId, instanceId }, 'segment materialization failed (backfill)');
        }
      }
    }));

    if (pending.length >= navConcurrency * 4) {
      await Promise.allSettled(pending.splice(0, pending.length));
    }
  }

  if (pending.length) await Promise.allSettled(pending);

  logger.info({ formId, scanned, hydrated, skipped, failed, sinceIso, untilIso }, 'finished backfill-segments');
  return { scanned, hydrated, skipped, failed, sinceIso, untilIso };
}

async function hydrateNavigationLinks(root, odk, {
  maxDepth = 4,
  maxRequests = 250,
  concurrency = 4,
  resolveLink,
  requestTimeoutMs = 60000,
  timeBudgetMs = 120000,
} = {}) {
  if (!root || typeof root !== 'object') return root;
  // maxDepth here represents how many *fetch hops* we allow when following navLinks.
  // - maxDepth = 1: fetch navLinks found anywhere in the existing record, but do not
  //   recursively hydrate navLinks inside the fetched results.
  // - maxDepth > 1: recursively hydrate inside fetched results up to maxDepth.
  if (maxDepth <= 0) return root;

  const seenObjects = new WeakSet();
  const seenLinks = new Set();
  const linkCache = new Map();
  let requestCount = 0;
  let hydratedCount = 0;
  const limit = pLimit(concurrency);
  const startedAt = Date.now();
  const deadlineAt = timeBudgetMs && timeBudgetMs > 0 ? (startedAt + timeBudgetMs) : null;

  function remainingBudgetMs() {
    if (!deadlineAt) return null;
    return Math.max(0, deadlineAt - Date.now());
  }

  function budgetExceeded() {
    if (!timeBudgetMs || timeBudgetMs <= 0) return false;
    return (Date.now() - startedAt) >= timeBudgetMs;
  }

  function getNextLink(data) {
    if (!data || typeof data !== 'object') return null;
    return data['@odata.nextLink'] || data['@odata.nextlink'] || data.nextLink || null;
  }

  async function fetchAndAttach(container, propName, linkKey, linkUrl, depthLeft) {
    if (!linkUrl || requestCount >= maxRequests) return;
    if (budgetExceeded()) return;
    const finalUrl = typeof resolveLink === 'function' ? resolveLink(linkUrl) : linkUrl;

    // Deduplicate by URL, but still attach results everywhere this URL appears.
    // We cache the *promise* so multiple callers share the same in-flight work.
    let promise = linkCache.get(finalUrl);
    if (!promise) {
      promise = (async () => {
        if (seenLinks.has(finalUrl)) return [];
        seenLinks.add(finalUrl);

        const allVals = [];
        let pageUrl = finalUrl;
        while (pageUrl && requestCount < maxRequests) {
          if (budgetExceeded()) break;
          const remaining = remainingBudgetMs();
          if (remaining !== null && remaining <= 0) break;
          requestCount += 1;
          logger.info({ propName, pageUrl, requestCount, requestTimeoutMs }, 'fetching navigationLink');
          const controller = new AbortController();
          const hard = Math.max(1, requestTimeoutMs || 60000);
          const effectiveTimeout = remaining !== null ? Math.max(1, Math.min(hard, remaining)) : hard;
          const to = setTimeout(() => controller.abort(), effectiveTimeout);
          let res;
          try {
            res = await odk.axios.get(pageUrl, { signal: controller.signal });
          } finally {
            clearTimeout(to);
          }
          const vals = parseODataCollection(res && res.data);
          if (vals && vals.length) allVals.push(...vals);

          const nextRaw = getNextLink(res && res.data);
          if (!nextRaw) break;
          const nextUrl = typeof resolveLink === 'function' ? resolveLink(nextRaw) : nextRaw;
          if (seenLinks.has(nextUrl)) break;
          seenLinks.add(nextUrl);
          pageUrl = nextUrl;
        }
        return allVals;
      })();

      linkCache.set(finalUrl, promise);
    }

    try {
      const allVals = await promise;

      // attach values under the property name while keeping the nav link key for traceability
      container[propName] = allVals;
      if (opts.stripNavlinks) {
        try { delete container[linkKey]; } catch (e) { /* ignore */ }
      }

      hydratedCount += 1;
      logger.info({ propName, items: allVals.length, depthLeft, requestCount, maxRequests }, 'hydrated navigationLink');

      // recursively hydrate within the fetched children if requested
      if (depthLeft > 1 && allVals.length) {
        if (!budgetExceeded()) {
          await Promise.all(allVals.map(v => limit(() => walk(v, depthLeft - 1))));
        }
      }
    } catch (err) {
      logger.warn({ err, linkUrl, finalUrl, propName }, 'navigationLink fetch failed');
      // leave as-is; downstream can still use the linkKey if needed
    }
  }

  async function walk(node, depthLeft) {
    if (!node || typeof node !== 'object') return;
    if (seenObjects.has(node)) return;
    seenObjects.add(node);
    if (budgetExceeded()) return;

    if (Array.isArray(node)) {
      await Promise.all(node.map(it => limit(() => walk(it, depthLeft))));
      return;
    }

    // 1) First recurse into existing children so we fully discover navLinks anywhere in
    // the current record, without requiring a large depth just due to JSON nesting.
    const childTasks = [];
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (!val || typeof val !== 'object') continue;
      if (key.endsWith('@odata.navigationLink')) continue;
      childTasks.push(limit(() => walk(val, depthLeft)));
    }
    if (childTasks.length) await Promise.all(childTasks);

    // 2) Then resolve navigation links on this object. Any fetched values can optionally
    // be recursively hydrated (fetch-hop depth) inside fetchAndAttach().
    const tasks = [];
    for (const key of Object.keys(node)) {
      const m = key.match(/^(.+)@odata\.navigationLink$/);
      if (!m) continue;
      const propName = m[1];
      const linkUrl = node[key];
      tasks.push(limit(() => fetchAndAttach(node, propName, key, linkUrl, depthLeft)));
    }
    if (tasks.length) await Promise.all(tasks);
  }

  logger.info({ maxDepth, maxRequests, concurrency, requestTimeoutMs, timeBudgetMs }, 'starting navigationLink hydration');
  await walk(root, maxDepth);
  logger.info({ hydratedCount, requestCount, seenLinks: seenLinks.size, elapsedMs: Date.now() - startedAt, timeBudgetMs }, 'finished navigationLink hydration');
  return root;
}

function coerceDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function getRemoteUpdatedAtFromListItem(item) {
  if (!item || typeof item !== 'object') return null;
  const sys = item.__system;
  if (!sys || typeof sys !== 'object') return null;
  // Prefer updatedAt when available (captures edits), else fallback to submissionDate.
  return coerceDate(sys.updatedAt || sys.updatedAtUtc || sys.submissionDate || sys.createdAt);
}

function getStoredUpdatedAtFromMongo(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const sys = doc.__system;
  if (!sys || typeof sys !== 'object') return null;
  return coerceDate(sys.updatedAt || sys.updatedAtUtc || sys.submissionDate || sys.createdAt);
}

async function processSubmission(odk, s3client, s3bucket, bucket, projectId, formId, submission, { skipMedia = false, dryRun = false, mediaConcurrency = 2 } = {}) {
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
  const effectiveId = instanceId || (doc && (doc.__id || doc._id || doc.id || doc.uuid || (doc.meta && (doc.meta.instanceID || doc.meta.instanceId))));
  if (effectiveId) doc.instanceId = effectiveId;

  // Resume optimization: if the document already exists, reuse stored attachment URLs
  // so reruns after interruption don't re-download everything.
  let existing = null;
  if (!dryRun && effectiveId) {
    try {
      existing = await getSubmission(formId, effectiveId);
    } catch (err) {
      logger.debug({ err, formId, instanceId: effectiveId }, 'failed loading existing submission');
    }
  }
  const existingAttachments = existing && Array.isArray(existing.attachments) ? existing.attachments : [];
  const existingByFilename = new Map(existingAttachments.map(a => [a && a.filename, a]));

  // build proxy template
  const proxyTemplate = process.env.ODK_ATTACHMENT_PROXY_TEMPLATE || process.env.ODK_ATTACHMENT_PROXY || '/api/getAttachment?instanceId={instanceId}&filename={filename}';

  // detect media and build attachments metadata
  const medias = detectMediaFields(submission);
  const attachments = [];

  const mediaLimit = pLimit(Math.max(1, parseInt(mediaConcurrency, 10) || 1));
  await Promise.all(medias.map(m => mediaLimit(async () => {
    const filename = m.filename;
    const fieldPath = m.path;
    const att = { filename, fieldPath };

    // build proxy URL (for frontend) if instanceId is available
    if (effectiveId) {
      att.proxyUrl = proxyTemplate.replace('{instanceId}', encodeURIComponent(effectiveId))
        .replace('{filename}', encodeURIComponent(filename))
        .replace('{formId}', encodeURIComponent(formId))
        .replace('{projectId}', encodeURIComponent(projectId));
    }

    // If we already uploaded this file before, reuse its URL
    const prior = existingByFilename.get(filename);
    if (prior && prior.s3) {
      att.s3 = prior.s3;
      doc[`${fieldPath}_url`] = prior.s3;
      attachments.push(att);
      return;
    }
    if (prior && prior.gridFs) {
      att.gridFs = prior.gridFs;
      doc[`${fieldPath}_gridfs`] = prior.gridFs;
      attachments.push(att);
      return;
    }

    // attempt to download + store media (S3 or GridFS) unless skipMedia is set
    try {
      if (!skipMedia && effectiveId) {
        const mediaRes = await odk.downloadMedia(projectId, formId, effectiveId, filename);
        if (s3client && s3bucket) {
          const key = `${formId}/${effectiveId}/${filename}`;
          const url = await uploadToS3(
            s3client,
            s3bucket,
            key,
            mediaRes,
            (mediaRes && mediaRes.headers && (mediaRes.headers['content-type'] || mediaRes.headers['Content-Type'])) || 'application/octet-stream'
          );
          att.s3 = url;
          doc[`${fieldPath}_url`] = url;
        } else {
          const res = await uploadToGridFS(bucket, `${formId}_${effectiveId}_${filename}`, mediaRes && mediaRes.stream ? mediaRes.stream : mediaRes);
          att.gridFs = res;
          doc[`${fieldPath}_gridfs`] = res;
        }
      } else {
        // build proxy URL only (no binary transfer)
        if (effectiveId) {
          doc[`${fieldPath}_url`] = att.proxyUrl;
        } else {
          logger.debug({ fieldPath, filename }, 'no instanceId, skipping media proxy');
        }
      }
    } catch (err) {
      logger.error({ err, filename, instanceId: effectiveId }, 'media download/upload failed');
    }

    attachments.push(att);
    logger.info({ instanceId: effectiveId, formId, filename, fieldPath, attachment: att }, 'prepared attachment mapping');
  })));

  if (attachments.length) doc.attachments = attachments;

  if (dryRun) {
    logger.info({ instanceId: effectiveId }, 'dry-run document:');
    console.log(util.inspect(doc, { depth: 5 }));
  } else {
    await upsertSubmission(formId, effectiveId || null, doc);

    if (shouldMaterializeSegments()) {
      try {
        const res = await materializeSegmentsFromSubmission({ formId, projectId, submission: doc });
        logger.info({ formId, instanceId: effectiveId || null, deleted: res.deleted, inserted: res.inserted }, 'materialized odk_segments');
      } catch (err) {
        logger.warn({ err, formId, instanceId: effectiveId || null }, 'segment materialization failed');
      }
    }

    // verify persistence and that attachments are associated
    try {
      const saved = await getSubmission(formId, effectiveId || null);
      if (!saved) {
        logger.warn({ formId, instanceId: effectiveId }, 'upsert completed but document not found on verification');
      } else {
        const savedAttachments = Array.isArray(saved.attachments) ? saved.attachments : [];
        for (const att of attachments) {
          const match = savedAttachments.find(sa => sa.filename === att.filename);
          if (match) {
            const url = match.s3 || (match.gridFs && match.gridFs.filename) || match.proxyUrl || match.url || null;
            logger.info({ formId, instanceId: effectiveId, filename: att.filename, url, match }, 'verified attachment persisted');
          } else {
            logger.warn({ formId, instanceId: effectiveId, filename: att.filename, savedAttachments }, 'attachment missing after upsert');
          }
        }
      }
    } catch (err) {
      logger.error({ err, formId, instanceId: effectiveId }, 'verification query failed');
    }
  }
}

async function runOnce() {
  const formId = opts.form;
  if (!formId) throw new Error('--form is required');
  const projectId = opts.project;
  const pageSize = opts.pageSize || 200;
  // disable per-instance $expand by default (empty string). Set via --expand if needed.
  const expand = opts.expand || '';
  const backwindow = (opts.backwindow || 10) * 1000;
  const hardLimit = typeof opts.limit === 'number' && !isNaN(opts.limit) && opts.limit > 0 ? opts.limit : null;
  const orderBy = (opts.orderby || '').trim() || (hardLimit ? '__system/submissionDate asc' : '');

  const odk = createOdkClient({ baseUrl: process.env.ODK_BASE_URL, loginUrl: process.env.ODK_LOGIN_URL, email: process.env.ODK_EMAIL, pass: process.env.ODK_PASS, mediaTemplate: process.env.MEDIA_URL_TEMPLATE, submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL });
  await odk.login();

  // mongo connection and bucket
  const { db } = await connect();
  const gridfsBucket = getBucket();

  if (opts.resetState) {
    await clearSyncState(formId);
    logger.info({ formId }, 'cleared sync_state for form');
  }

  // s3 client if configured
  let s3client = null;
  const s3bucket = process.env.S3_BUCKET;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKey && secretKey && s3bucket) {
    const s3Config = {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
    };
    if (process.env.S3_ENDPOINT) {
      s3Config.endpoint = process.env.S3_ENDPOINT.replace(/\/$/, '');
      if (typeof process.env.S3_FORCE_PATH_STYLE !== 'undefined') {
        s3Config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
      }
    }
    s3client = new S3Client(s3Config);
  }

  // determine since
  let since = null;
  if (opts.since) {
    const d = parseSinceInput(opts.since);
    since = new Date(d.getTime() - backwindow);
  } else if (!opts.ignoreState) {
    const state = await getSyncState(formId);
    if (state && state.lastSyncAt) since = new Date(new Date(state.lastSyncAt).getTime() - backwindow);
  }

  // navigationLink URLs returned by OData are often relative to the .svc root.
  // Resolve them against the current form service root so nested links (segments) can be fetched.
  const submissionsTemplate = process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL;
  const submissionsUrl = odk.buildSubmissionsUrl ? odk.buildSubmissionsUrl(submissionsTemplate, projectId, formId, '') : null;
  const svcRoot = (() => {
    if (!submissionsUrl) return null;
    const s = String(submissionsUrl);
    const idx = s.indexOf('.svc/');
    if (idx !== -1) return s.slice(0, idx + 5);
    // fallback: strip entity set name
    return s.replace(/Submissions.*$/i, '').replace(/\?$/, '');
  })();
  function resolveNavLink(link) {
    if (!link) return link;
    const u = String(link);
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/')) return u;
    if (svcRoot) return `${svcRoot}${u}`;
    return u;
  }

  if (opts.backfillSegments) {
    await backfillSegmentsOnly({ odk, db, projectId, formId, resolveNavLink });
    return;
  }

  let skip = 0;
  let maxSeen = null;
  let more = true;
  let processed = 0;

  // If an explicit instanceId is provided, sync only that submission.
  if (opts.instance) {
    const targetId = normalizeInstanceId(opts.instance);
    logger.info({ formId, instanceId: targetId, navDepth: opts.navDepth, navMaxRequests: opts.navMaxRequests }, 'starting targeted instance run');
    let record = null;
    try {
      if (expand) {
        const encodedId = encodeInstanceIdOnce(targetId);
        const perQ = `('${encodedId}')?${`$expand=${encodeURIComponent(expand)}`}`;
        record = await odk.fetchSubmissions(projectId, formId, perQ);
      } else {
        const filterExpr = `__id eq '${escapeODataStringLiteral(targetId)}'`;
        const q = `?$filter=${encodeURIComponent(filterExpr)}`;
        record = await odk.fetchSubmissions(projectId, formId, q);
      }
    } catch (err) {
      logger.error({ err, formId, instanceId: targetId }, 'failed fetching targeted submission');
      throw err;
    }

    let doc = record;
    if (doc && Array.isArray(doc)) doc = doc[0] || null;
    else if (doc && doc.value && Array.isArray(doc.value)) doc = doc.value[0] || null;

    if (!doc) {
      logger.warn({ formId, instanceId: targetId }, 'targeted submission not found');
      return;
    }

    if (shouldExcludeTests() && isTestSubmission(doc)) {
      logger.info({ formId, instanceId: targetId }, 'skipping targeted test submission (type_donnee=test/tests)');
      return;
    }

    if (opts.hydrateNav !== false) {
      try {
        await hydrateNavigationLinks(doc, odk, {
          maxDepth: opts.navDepth || 4,
          maxRequests: opts.navMaxRequests || 250,
          concurrency: 4,
          resolveLink: resolveNavLink,
          requestTimeoutMs: opts.navTimeoutMs || 60000,
          timeBudgetMs: opts.navBudgetMs || 120000,
        });
      } catch (err) {
        logger.warn({ err, instanceId: targetId }, 'recursive navigationLink hydration failed');
      }
    }

    await processSubmission(odk, s3client, s3bucket, gridfsBucket, projectId, formId, doc, {
      skipMedia: opts.skipMedia,
      dryRun: opts.dryRun,
      mediaConcurrency: opts.mediaConcurrency,
    });

    logger.info({ formId, instanceId: targetId }, 'finished targeted instance run');

    // Intentionally do not update sync_state when running a targeted instance.
    return;
  }

  // helper to build a lightweight listing query (only ids + system metadata)
  function buildListQstr() {
    const qs = [];
    qs.push(`$select=${encodeURIComponent('__id,__system')}`);
    qs.push(`$top=${pageSize}`);
    qs.push(`$skip=${skip}`);
    if (orderBy) qs.push(`$orderby=${encodeURIComponent(orderBy)}`);
    if (since && opts.serverFilterSince !== false) {
      // ODK Central OData accepts ISO timestamps directly, and also quoted.
      // We prefer unquoted to keep query shorter.
      const expr = `__system/submissionDate gt ${since.toISOString()}`;
      qs.push(`$filter=${encodeURIComponent(expr)}`);
    }
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

    // If a hard limit is requested, process sequentially for deterministic cutoff.
    const processOne = async (item) => {
      // extract candidate id and submission date from lightweight row
      const rawId = item.__id || item._id || item.id || item.instanceId || item.uuid;
      const normalizedId = rawId ? normalizeInstanceId(rawId) : null;
      const listedAt = getRemoteUpdatedAtFromListItem(item) || null;
      if (since && listedAt && listedAt <= since) return false;

      if (listedAt && (!maxSeen || listedAt > maxSeen)) maxSeen = listedAt;

      // Differential mode: if we already have this instanceId in Mongo and the remote updatedAt
      // (or submissionDate) hasn't changed, skip the expensive per-instance fetch + hydration.
      if (opts.diff !== false && !opts.dryRun && normalizedId && listedAt) {
        try {
          const existing = await getSubmission(formId, normalizedId);
          const storedAt = getStoredUpdatedAtFromMongo(existing);
          if (storedAt && storedAt.getTime() === listedAt.getTime()) {
            if (listedAt && (!maxSeen || listedAt > maxSeen)) maxSeen = listedAt;
            logger.debug({ formId, instanceId: normalizedId, listedAt: listedAt.toISOString() }, 'diff skip (unchanged)');
            return false;
          }
        } catch (err) {
          logger.debug({ err, formId, instanceId: normalizedId }, 'diff check failed, continuing');
        }
      }

      // fetch full detail per-instance (with $expand) to get attachments and nested repeats
      let record = item;
      if (normalizedId && expand) {
        const encodedId = encodeInstanceIdOnce(normalizedId);
        const perQ = `('${encodedId}')?${`$expand=${encodeURIComponent(expand)}`}`;
        try {
          const detail = await odk.fetchSubmissions(projectId, formId, perQ);
          if (detail && Array.isArray(detail)) record = detail[0] || record;
          else if (detail && detail.value && Array.isArray(detail.value)) record = detail.value[0] || record;
          else if (detail && typeof detail === 'object') record = detail;
        } catch (err) {
          logger.warn({ err, rawId, normalizedId, perQ }, 'failed fetching per-instance detail, falling back to list item');
        }
      }

      if (normalizedId && !expand) {
        try {
          const filterExpr = `__id eq '${escapeODataStringLiteral(normalizedId)}'`;
          const q = `?$filter=${encodeURIComponent(filterExpr)}`;
          const detail = await odk.fetchSubmissions(projectId, formId, q);
          if (detail && Array.isArray(detail)) record = detail[0] || record;
          else if (detail && detail.value && Array.isArray(detail.value)) record = detail.value[0] || record;
          else if (detail && typeof detail === 'object') record = detail;
        } catch (err) {
          logger.debug({ err, rawId }, 'per-instance fetch with filter failed, will fallback');
        }
      }

      // Determine submittedAt from the detailed record if possible
      let submittedAt = null;
      if (record && record.__system) submittedAt = record.__system.submissionDate || record.__system.createdAt;
      if (!submittedAt) submittedAt = record && (record.submittedAt || record.createdAt || record._submittedAt);
      submittedAt = submittedAt ? new Date(submittedAt) : new Date();
      if (since && submittedAt <= since) return false;
      if (!maxSeen || submittedAt > maxSeen) maxSeen = submittedAt;

      // Skip test submissions but still advance maxSeen so sync_state progresses.
      if (shouldExcludeTests() && isTestSubmission(record)) {
        logger.info({ formId, instanceId: normalizedId || rawId || null }, 'skipping test submission (type_donnee=test/tests)');
        return false;
      }

      // If record looks lightweight, try one more direct per-instance fetch
      function isLightweight(rec) {
        if (!rec || typeof rec !== 'object') return false;
        const keys = Object.keys(rec).filter(k => k !== '__system' && k !== '__id' && k !== '_id');
        return keys.length === 0 && rec.__system;
      }
      if (rawId && isLightweight(record)) {
        try {
          const filterExpr = `__id eq '${escapeODataStringLiteral(normalizedId || rawId)}'`;
          const q = `?$filter=${encodeURIComponent(filterExpr)}`;
          const detail = await odk.fetchSubmissions(projectId, formId, q);
          if (detail && Array.isArray(detail)) record = detail[0] || record;
          else if (detail && detail.value && Array.isArray(detail.value)) record = detail.value[0] || record;
          else if (detail && typeof detail === 'object') record = detail;
        } catch (err) {
          logger.debug({ err, rawId }, 'final per-instance fetch fallback failed');
        }
      }

      // NEW: recursively hydrate @odata.navigationLink at any depth (segments, repeats)
      if (opts.hydrateNav !== false) {
        try {
          await hydrateNavigationLinks(record, odk, {
            maxDepth: opts.navDepth || 4,
            maxRequests: opts.navMaxRequests || 250,
            concurrency: opts.navConcurrency || 6,
            resolveLink: resolveNavLink,
            requestTimeoutMs: opts.navTimeoutMs || 60000,
            timeBudgetMs: opts.navBudgetMs || 120000,
          });
        } catch (err) {
          logger.warn({ err, rawId }, 'recursive navigationLink hydration failed');
        }
      }

      await processSubmission(odk, s3client, s3bucket, gridfsBucket, projectId, formId, record, { skipMedia: opts.skipMedia, dryRun: opts.dryRun, mediaConcurrency: opts.mediaConcurrency });
      return true;
    };

    if (hardLimit) {
      for (const item of items) {
        if (processed >= hardLimit) {
          more = false;
          break;
        }
        try {
          const did = await processOne(item);
          if (did) processed += 1;
        } catch (err) {
          logger.error({ err }, 'processing submission failed');
        }
      }
      // If we hit the hard limit, stop paging
      if (!more) break;
    } else {
      const limit = pLimit(4);
      await Promise.all(items.map(item => limit(async () => {
        try {
          await processOne(item);
        } catch (err) {
          logger.error({ err }, 'processing submission failed');
        }
      })));
    }

    if (items.length < pageSize) more = false; else skip += pageSize;
  }

  if (maxSeen && maxSeen.getTime() > 0) {
    await setSyncState(formId, maxSeen.toISOString());
    logger.info({ lastSyncAt: maxSeen.toISOString() }, 'updated sync_state');
  } else {
    logger.info({ formId }, 'no submissions seen; sync_state not updated');
  }
}

async function runAll() {
  const projectId = opts.project;
  const odk = createOdkClient({ baseUrl: process.env.ODK_BASE_URL, loginUrl: process.env.ODK_LOGIN_URL, email: process.env.ODK_EMAIL, pass: process.env.ODK_PASS, mediaTemplate: process.env.MEDIA_URL_TEMPLATE, submissionsTemplate: process.env.ODK_SUBMISSIONS_URL_TEMPLATE || process.env.ODK_SUBMISSIONS_URL });
  await odk.login();
  let forms;
  try {
    forms = await odk.fetchForms(projectId);
  } catch (err) {
    logger.error({ err }, 'failed fetching forms list');
    throw err;
  }
  const list = Array.isArray(forms) ? forms : (forms && forms.value) ? forms.value : [];
  for (const f of list) {
    // attempt to extract a sensible formId
    const formId = f.xmlFormId || f.formId || f.id || f.xformId || f.name || f.title;
    if (!formId) {
      logger.warn({ f }, 'unable to determine form id for entry, skipping');
      continue;
    }
    logger.info({ formId }, 'starting runOnce for form');
    // set opts.form so runOnce uses it
    opts.form = formId;
    try {
      await runOnce();
    } catch (err) {
      logger.error({ err, formId }, 'runOnce failed for form');
    }
  }
}

async function main() {
  if (opts.once && opts.all) {
    await runAll();
    process.exit(0);
  }
  if (opts.once) {
    await runOnce();
    process.exit(0);
  }
  if (opts.daemon && opts.all) {
    while (true) {
      try {
        await runAll();
      } catch (err) {
        logger.error({ err }, 'runAll failed in daemon');
      }
      await new Promise(r => setTimeout(r, 60 * 1000));
    }
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
