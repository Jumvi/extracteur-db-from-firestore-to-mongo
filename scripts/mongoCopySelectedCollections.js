#!/usr/bin/env node
require('dotenv').config();

const { program } = require('commander');
const { MongoClient } = require('mongodb');

function parseCsvList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function redactMongoUri(uri) {
  if (!uri) return '';
  const s = String(uri);
  // Best-effort redaction: remove credentials if present.
  return s.replace(/(mongodb(?:\+srv)?:\/\/)([^@/]+)@/i, '$1<redacted>@');
}

async function getDb({ uri, dbName, appName }) {
  if (!uri) throw new Error('Mongo URI is missing');
  if (!dbName) throw new Error('Mongo database name is missing');
  const client = new MongoClient(uri, {
    appName,
    serverSelectionTimeoutMS: 15000,
  });
  await client.connect();
  const db = client.db(dbName);
  return { client, db };
}

async function listCollectionNames(db) {
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  return cols.map((c) => c.name).filter(Boolean).sort();
}

async function ensureCollectionExists(db, name) {
  const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing && existing.length) return false;
  await db.createCollection(name);
  return true;
}

async function copyCollectionByReplaceOne({ sourceDb, targetDb, collectionName, batchSize, dryRun }) {
  const sourceCol = sourceDb.collection(collectionName);
  const targetCol = targetDb.collection(collectionName);

  if (dryRun) {
    // In dry-run mode, don't iterate documents (can be slow and some tiers disallow certain cursor options).
    return { processed: 0, dryRunSkipped: true };
  }

  const cursor = sourceCol.find({}).batchSize(batchSize);
  let ops = [];
  let processed = 0;

  // eslint-disable-next-line no-restricted-syntax
  for await (const doc of cursor) {
    ops.push({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    });
    processed += 1;

    if (ops.length >= batchSize) {
      if (!dryRun) await targetCol.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }

  if (ops.length) {
    if (!dryRun) await targetCol.bulkWrite(ops, { ordered: false });
  }

  return { processed };
}

async function main() {
  program
    .option('--include <names>', 'CSV list of collections to copy (data)', 'Utilisateur,otpCodes')
    .option('--batch-size <n>', 'bulkWrite batch size', (v) => Number.parseInt(String(v), 10), Number.parseInt(process.env.BATCH_SIZE || '500', 10) || 500)
    .option('--dry-run', 'connect + inspect + print actions but do not write', false)
    .option('--empty-others', 'ensure all other collections exist in target and are empty', false)
    .option('--force', 'required when using --empty-others (deletes data in target other collections)', false)
    .parse(process.argv);

  const opts = program.opts();
  const include = new Set(parseCsvList(opts.include));
  const batchSize = Number.isFinite(opts.batchSize) && opts.batchSize > 0 ? opts.batchSize : 500;
  const dryRun = !!opts.dryRun;

  const sourceUri = process.env.MONGODB_URI;
  const sourceDbName = process.env.MONGODB_DATABASE;

  const targetUri = process.env.MONGO_URI;
  const targetDbName = process.env.MONGO_DATABASE;

  if (!sourceUri || !sourceDbName) {
    throw new Error('Source Mongo is not configured: expected MONGODB_URI and MONGODB_DATABASE in .env');
  }
  if (!targetUri || !targetDbName) {
    throw new Error('Target Mongo is not configured: expected MONGO_URI and MONGO_DATABASE in .env');
  }

  if (opts.emptyOthers && !opts.force) {
    throw new Error('Refusing to run --empty-others without --force (this would delete data in target)');
  }

  const { client: sourceClient, db: sourceDb } = await getDb({ uri: sourceUri, dbName: sourceDbName, appName: 'mongo-copy-source' });
  const { client: targetClient, db: targetDb } = await getDb({ uri: targetUri, dbName: targetDbName, appName: 'mongo-copy-target' });

  try {
    const sourceCollections = await listCollectionNames(sourceDb);
    const targetCollections = await listCollectionNames(targetDb);

    console.log('Source DB:', sourceDbName);
    console.log('Target DB:', targetDbName);
    console.log('Include (data copy):', Array.from(include).join(', ') || '(none)');
    console.log('Batch size:', batchSize);
    console.log('Dry run:', dryRun);
    console.log('');

    console.log(`Found ${sourceCollections.length} collection(s) in source.`);
    console.log('Source collections:', sourceCollections.join(', ') || '(none)');

    const includeList = Array.from(include);
    const includePresent = includeList.filter((c) => sourceCollections.includes(c));
    const includeMissing = includeList.filter((c) => !sourceCollections.includes(c));
    console.log('');
    console.log('Include present in source:', includePresent.join(', ') || '(none)');
    if (includeMissing.length) {
      console.log('⚠️ Include missing in source:', includeMissing.join(', '));
      console.log('   Tip: re-run with --include "<realName1>,<realName2>"');
    }

    const missingInTarget = sourceCollections.filter((c) => !targetCollections.includes(c));
    if (missingInTarget.length) {
      console.log(`Target is missing ${missingInTarget.length} collection(s). They will be created empty.`);
    }

    // Ensure target has all collections (empty creation only).
    for (const name of sourceCollections) {
      const created = dryRun ? false : await ensureCollectionExists(targetDb, name);
      if (created) console.log(`Created empty collection in target: ${name}`);
    }

    // Copy included collections.
    for (const name of sourceCollections) {
      if (!include.has(name)) continue;
      console.log(`\nCopying data for collection: ${name}`);
      if (dryRun) {
        console.log('- Dry-run: skipping counts (some Mongo tiers disallow certain cursor flags)');
      } else {
        try {
          const sourceCount = await sourceDb.collection(name).estimatedDocumentCount();
          console.log(`- Source estimated count: ${sourceCount}`);
        } catch (countErr) {
          console.log(`- Source estimated count: (skipped) ${countErr && countErr.message ? countErr.message : String(countErr)}`);
        }
      }
      const { processed, dryRunSkipped } = await copyCollectionByReplaceOne({
        sourceDb,
        targetDb,
        collectionName: name,
        batchSize,
        dryRun,
      });
      if (dryRunSkipped) {
        console.log('- Dry-run: would upsert/replace all source documents into target');
      } else {
        console.log(`- Processed: ${processed}`);
      }
    }

    // Empty non-included collections if requested.
    if (opts.emptyOthers) {
      console.log('\nEmptying non-included collections in target (deleteMany({}))');
      for (const name of sourceCollections) {
        if (include.has(name)) continue;
        if (dryRun) {
          console.log(`- Would empty: ${name}`);
          continue;
        }
        const res = await targetDb.collection(name).deleteMany({});
        console.log(`- Emptied: ${name} (deleted ${res.deletedCount || 0})`);
      }
    }

    console.log('\nDone.');
  } catch (err) {
    const safe = new Error(String(err && err.message ? err.message : err));
    safe.stack = err && err.stack ? err.stack : safe.stack;
    console.error('\n❌ Migration error:', safe.message);
    console.error('Source URI (redacted):', redactMongoUri(sourceUri));
    console.error('Target URI (redacted):', redactMongoUri(targetUri));
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([sourceClient.close(), targetClient.close()]);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Fatal:', err && err.message ? err.message : err);
    process.exit(1);
  });
}
