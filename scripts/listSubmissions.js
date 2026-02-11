#!/usr/bin/env node
require('dotenv').config();
const { connect } = require('../src/mongoClient');

async function main() {
  const form = process.argv[2];
  if (!form) {
    console.error('Usage: node scripts/listSubmissions.js <formId>');
    process.exit(2);
  }
  const { db } = await connect();
  const colName = `odk_submissions_${form}`;
  const col = db.collection(colName);
  const total = await col.countDocuments();
  console.log(`Collection ${colName}: ${total} documents`);
  const docs = await col.find({}).limit(10).toArray();
  for (const d of docs) {
    console.log('---');
    console.log(JSON.stringify(d, null, 2));
  }
  process.exit(0);
}

main();
