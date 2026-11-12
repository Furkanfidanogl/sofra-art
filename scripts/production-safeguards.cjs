// Existing trusted operator session. Inspect by default; never exports user data.
const { loadContext } = require('./firebase-context.cjs');
const TTL_COLLECTIONS = ['commentFingerprints', 'editorialDrafts', 'accountDeletions', 'requestLimits'];

async function main() {
  const action = process.argv[2] || '--inspect';
  if (!['--inspect', '--apply'].includes(action)) throw new Error('UNKNOWN_SAFEGUARD_ACTION');
  const { api, projectId } = await loadContext();
  const client = new api.Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true });
  const base = `/v1/projects/${projectId}/databases/(default)`;
  if (action === '--apply') {
    if (process.env.SOFRA_APPLY_SAFEGUARDS !== 'true') throw new Error('EXPLICIT_SAFEGUARD_APPLY_REQUIRED');
    const schedules = (await client.get(`${base}/backupSchedules`)).body.backupSchedules || [];
    if (!schedules.some(s => s.dailyRecurrence)) {
      await client.post(`${base}/backupSchedules`, { retention: '604800s', dailyRecurrence: {} });
      console.log(JSON.stringify({ dailyBackup: 'configured', retentionDays: 7 }));
    }
    for (const collection of TTL_COLLECTIONS) {
      const name = `${base}/collectionGroups/${collection}/fields/expiresAt`;
      const field = (await client.get(name)).body;
      if (!['ACTIVE', 'CREATING'].includes(field.ttlConfig?.state)) {
        await client.patch(name, { ttlConfig: {} }, { queryParams: { updateMask: 'ttlConfig' } });
        console.log(JSON.stringify({ ttlRequested: collection }));
      }
    }
  }
  const database = (await client.get(base)).body;
  const schedules = (await client.get(`${base}/backupSchedules`)).body.backupSchedules || [];
  const fields = await Promise.all(TTL_COLLECTIONS.map(async collection => {
    const value = (await client.get(`${base}/collectionGroups/${collection}/fields/expiresAt`)).body;
    return { collection, state: value.ttlConfig?.state || 'DISABLED' };
  }));
  console.log(JSON.stringify({ projectId, deleteProtection: database.deleteProtectionState,
    backups: schedules.map(s => ({ daily: Boolean(s.dailyRecurrence), retention: s.retention })), ttl: fields }));
}
if (require.main === module) main().catch(error => {
  console.error('SAFEGUARD_CHECK_FAILED', error.status || 'UNAVAILABLE', /^[A-Z_]+$/.test(error.message) ? error.message : 'SEE_OPERATOR_PERMISSIONS');
  process.exitCode = 1;
});
module.exports = { TTL_COLLECTIONS };
