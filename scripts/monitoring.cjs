// Operator-only. Inspect by default. Applying enables email alerts explicitly.
const { loadContext } = require('./firebase-context.cjs');
const ALERT_EMAIL = 'fatihfidanogl@gmail.com';
function errorPolicy(projectId, channel) {
  return {
    displayName: 'Sofra server errors', enabled: true, combiner: 'OR',
    notificationChannels: [channel],
    documentation: { mimeType: 'text/markdown', content: 'Sofra sunucu hatası. Cloud Logging içindeki operation/requestId ile incele. Token, yorum içeriği veya anahtar paylaşma. docs/OPERATIONS.md prosedürünü uygula.' },
    conditions: [{ displayName: 'Runtime ERROR or controlled release test', conditionMatchedLog: {
      filter: `(resource.type="cloud_run_revision" AND severity>=ERROR) OR (logName="projects/${projectId}/logs/sofra-release-test" AND severity=ERROR)`
    } }],
    alertStrategy: { notificationRateLimit: { period: '3600s' }, autoClose: '1800s' }
  };
}
async function main() {
  const action = process.argv[2] || '--inspect';
  if (!['--inspect', '--apply', '--test-alert'].includes(action)) throw new Error('UNKNOWN_MONITORING_ACTION');
  const { api, projectId } = await loadContext();
  const monitor = new api.Client({ urlPrefix: 'https://monitoring.googleapis.com', auth: true });
  const base = `/v3/projects/${projectId}`;
  if (action !== '--inspect' && process.env.SOFRA_APPROVE_ALERT_EMAIL !== 'true') throw new Error('EXPLICIT_ALERT_EMAIL_APPROVAL_REQUIRED');
  if (action === '--apply') {
    const channels = (await monitor.get(`${base}/notificationChannels`)).body.notificationChannels || [];
    let channel = channels.find(c => c.type === 'email' && c.labels?.email_address === ALERT_EMAIL);
    if (!channel) channel = (await monitor.post(`${base}/notificationChannels`, { type: 'email', displayName: 'Sofra owner alerts', labels: { email_address: ALERT_EMAIL }, enabled: true })).body;
    const checks = (await monitor.get(`${base}/uptimeCheckConfigs`)).body.uptimeCheckConfigs || [];
    let check = checks.find(c => c.displayName === 'Sofra public homepage');
    if (!check) check = (await monitor.post(`${base}/uptimeCheckConfigs`, {
      displayName: 'Sofra public homepage', timeout: '10s', period: '300s',
      selectedRegions: ['EUROPE', 'USA', 'ASIA_PACIFIC'],
      monitoredResource: { type: 'uptime_url', labels: { project_id: projectId, host: 'sofra-art.netlify.app' } },
      httpCheck: { path: '/', port: 443, useSsl: true, validateSsl: true, requestMethod: 'GET', acceptedResponseStatusCodes: [{ statusValue: 200 }] },
      contentMatchers: [{ content: 'Sofra Art', matcher: 'CONTAINS_STRING' }]
    })).body;
    const policies = (await monitor.get(`${base}/alertPolicies`)).body.alertPolicies || [];
    if (!policies.some(p => p.displayName === 'Sofra server errors')) await monitor.post(`${base}/alertPolicies`, errorPolicy(projectId, channel.name));
    if (!policies.some(p => p.displayName === 'Sofra website unavailable')) {
      const checkId = check.name.split('/').at(-1);
      await monitor.post(`${base}/alertPolicies`, {
        displayName: 'Sofra website unavailable', enabled: true, combiner: 'OR', notificationChannels: [channel.name],
        documentation: { mimeType: 'text/markdown', content: 'Sofra 2 veya daha fazla konumda en az 10 dakikadır erişilemiyor. Netlify durumunu ve son deployu incele. docs/OPERATIONS.md prosedürünü uygula.' },
        conditions: [{ displayName: 'Two checkers failing for 10 minutes', conditionThreshold: {
          filter: `resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="${checkId}"`,
          comparison: 'COMPARISON_LT', thresholdValue: 1, duration: '600s', trigger: { count: 2 },
          aggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_FRACTION_TRUE' }]
        } }], alertStrategy: { autoClose: '1800s' }
      });
    }
  }
  if (action === '--test-alert') {
    const policies = (await monitor.get(`${base}/alertPolicies`)).body.alertPolicies || [];
    if (!policies.some(p => p.displayName === 'Sofra server errors' && p.enabled && p.notificationChannels?.length)) throw new Error('ALERT_POLICY_NOT_READY');
    const log = new api.Client({ urlPrefix: 'https://logging.googleapis.com', auth: true });
    await log.post('/v2/entries:write', { entries: [{
      logName: `projects/${projectId}/logs/sofra-release-test`, resource: { type: 'global', labels: { project_id: projectId } },
      severity: 'ERROR', jsonPayload: { event: 'sofra-controlled-alert-test', containsUserData: false }, timestamp: new Date().toISOString()
    }] });
    console.log(JSON.stringify({ testAlert: 'submitted', delivery: 'recipient confirmation required' }));
  }
  const [policies, checks, channels] = await Promise.all(['alertPolicies', 'uptimeCheckConfigs', 'notificationChannels'].map(path => monitor.get(`${base}/${path}`)));
  console.log(JSON.stringify({ policies: (policies.body.alertPolicies || []).map(p => ({ name: p.displayName, enabled: p.enabled, channelCount: p.notificationChannels?.length || 0 })),
    uptime: (checks.body.uptimeCheckConfigs || []).map(c => ({ name: c.displayName, period: c.period, ssl: c.httpCheck?.validateSsl })),
    emailChannelEnabled: (channels.body.notificationChannels || []).some(c => c.type === 'email' && c.labels?.email_address === ALERT_EMAIL && c.enabled) }));
}
if (require.main === module) main().catch(error => { console.error('MONITORING_OPERATION_FAILED', error.status || 'UNAVAILABLE', /^[A-Z_]+$/.test(error.message) ? error.message : 'SEE_PROVIDER_RESPONSE');process.exitCode = 1; });
module.exports = { errorPolicy };
