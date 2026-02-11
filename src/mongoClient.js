const { MongoClient, GridFSBucket } = require('mongodb');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let client;
let db;

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

module.exports = { connect, getBucket, upsertSubmission, getSubmission, getSyncState, setSyncState };
