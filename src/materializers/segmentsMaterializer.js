function get(obj, path) {
  if (!obj) return undefined;
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function extractSegmentsFromSubmission(submission) {
  // Current known location for the form we tested: etat_troncon.segments
  const direct = get(submission, 'etat_troncon.segments');
  if (Array.isArray(direct)) return direct;

  // Fallback: scan for any array property literally named "segments".
  const results = [];
  const seen = new WeakSet();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const it of node) walk(it);
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === 'segments' && Array.isArray(v)) {
        results.push(...v);
      }
      if (v && typeof v === 'object') walk(v);
    }
  }

  walk(submission);
  return results;
}

function buildSegmentDocs({ formId, projectId, submission }) {
  const instanceId = submission && submission.instanceId ? String(submission.instanceId) : null;
  if (!instanceId) return [];

  const agent_id = submission.agent_id || null;
  const axe_ref = get(submission, 'admin_conformite.info_generales_01.axe_ref') || null;
  const troncon = get(submission, 'admin_conformite.info_generales_01.troncon') || null;
  const troncon_nom_ref = get(submission, 'admin_conformite.info_generales_01.troncon_nom_ref') || null;

  const submissionDate = toDateOrNull(get(submission, '__system.submissionDate'));
  const updatedAt = toDateOrNull(get(submission, '__system.updatedAt')) || submissionDate;

  const segments = extractSegmentsFromSubmission(submission);
  if (!Array.isArray(segments) || segments.length === 0) return [];

  return segments.map((segment, idx) => ({
    _id: `${formId}:${instanceId}:seg:${idx}`,
    formId,
    projectId: projectId != null ? String(projectId) : null,
    instanceId,
    segmentIndex: idx,
    agent_id,
    axe_ref,
    troncon,
    troncon_nom_ref,
    submissionDate,
    updatedAt,
    segment,
    source: {
      formId,
      instanceId,
    },
    materializedAt: new Date(),
  }));
}

module.exports = {
  buildSegmentDocs,
  extractSegmentsFromSubmission,
};
