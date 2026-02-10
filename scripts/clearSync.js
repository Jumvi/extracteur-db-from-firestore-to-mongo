const mc = require('../src/mongoClient');

(async () => {
  try {
    const { db, client } = await mc.connect();
    const formId = process.argv[2] || 'audit_chantier_routier_ouvrage_v1';
    const col = db.collection('sync_state');
    const res = await col.deleteOne({ formId });
    console.log('deleteOne result:', res.result || res);
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('error clearing sync_state', err);
    process.exit(2);
  }
})();
