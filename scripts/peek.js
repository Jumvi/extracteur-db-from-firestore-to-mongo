const { connect } = require('../src/mongoClient');

async function peek() {
  const { db } = await connect();
  const col = db.collection('odk_submissions_audit_chantier_routier_ouvrage_v1');
  const docs = await col.find({}).limit(3).toArray();
  console.log(JSON.stringify(docs, null, 2));
  process.exit(0);
}

peek().catch(err => { console.error(err); process.exit(1); });