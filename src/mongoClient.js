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
  await col.updateOne({ instanceId }, { $set: doc }, { upsert: true });
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

module.exports = { connect, getBucket, upsertSubmission, getSyncState, setSyncState };
