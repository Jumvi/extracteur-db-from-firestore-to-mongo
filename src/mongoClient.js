const { MongoClient, GridFSBucket } = require('mongodb');
const pino = require('pino');
const { buildSegmentDocs } = require('./materializers/segmentsMaterializer');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let client;
let db;
let segmentsIndexesEnsured = false;

async function connect() {
  if (db) return { db, client };
  const uri = process.env.MONGODB_URI;
  const name = process.env.MONGODB_DATABASE;
  if (!uri) throw new Error('MONGODB_URI not set');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(name);
  logger.info({ msg: 'Connected to Mongo', db: name });
  return { db, client };
}

async function ensureSegmentsIndexes() {
  await connect();
  if (segmentsIndexesEnsured) return;
  const col = db.collection('odk_segments');
  await Promise.all([
    col.createIndex({ formId: 1, submissionDate: -1 }),
    col.createIndex({ formId: 1, agent_id: 1, submissionDate: -1 }),
    col.createIndex({ formId: 1, axe_ref: 1, submissionDate: -1 }),
    col.createIndex({ formId: 1, troncon: 1, submissionDate: -1 }),
    col.createIndex({ formId: 1, instanceId: 1 }),
  ]);
  segmentsIndexesEnsured = true;
  logger.info('Ensured indexes for odk_segments');
}

async function materializeSegmentsFromSubmission({ formId, projectId, submission }) {
  await connect();
  await ensureSegmentsIndexes();

  if (!submission || typeof submission !== 'object') return { deleted: 0, inserted: 0 };
  const instanceId = submission.instanceId ? String(submission.instanceId) : null;
  if (!instanceId) return { deleted: 0, inserted: 0 };

  const docs = buildSegmentDocs({ formId, projectId, submission });
  const col = db.collection('odk_segments');

  const delRes = await col.deleteMany({ formId, instanceId });
  if (!docs.length) {
    return { deleted: delRes.deletedCount || 0, inserted: 0 };
  }

  const insRes = await col.insertMany(docs, { ordered: false });
  const inserted = insRes && insRes.insertedCount ? insRes.insertedCount : docs.length;
  return { deleted: delRes.deletedCount || 0, inserted };
}

function getBucket() {
  if (!db) throw new Error('Mongo not connected');
  return new GridFSBucket(db, { bucketName: 'odk_media' });
}

async function upsertSubmission(formId, instanceId, doc) {
  await connect();
  const col = db.collection(`odk_submissions_${formId}`);
  // Use replaceOne to avoid Mongo "path conflict" errors when doc contains
  // nested objects whose structure may differ from existing documents.
  // We expect `doc` to contain a stable `instanceId` field already.
  await col.replaceOne({ instanceId }, doc, { upsert: true });
}

async function getSubmission(formId, instanceId) {
  await connect();
  const col = db.collection(`odk_submissions_${formId}`);
  const doc = await col.findOne({ instanceId });
  return doc || null;
}

async function getSyncState(formId) {
  await connect();
  const col = db.collection('sync_state');
  const doc = await col.findOne({ formId });
  return doc || null;
}

async function setSyncState(formId, lastSyncAt) {
  await connect();
  const col = db.collection('sync_state');
  await col.updateOne({ formId }, { $set: { formId, lastSyncAt, updatedAt: new Date() } }, { upsert: true });
}

async function clearSyncState(formId) {
  await connect();
  const col = db.collection('sync_state');
  await col.deleteOne({ formId });
}

module.exports = {
  connect,
  getBucket,
  upsertSubmission,
  getSubmission,
  getSyncState,
  setSyncState,
  clearSyncState,
  ensureSegmentsIndexes,
  materializeSegmentsFromSubmission,
};
