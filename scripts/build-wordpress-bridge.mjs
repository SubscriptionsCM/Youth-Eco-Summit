import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginName = 'yes-participation-bridge';
const plugin = join(root, 'wordpress', pluginName);
const archive = join(plugin, `${pluginName}.zip`);
const evaluate = `
import { guidelines2027Source, competitionGuidelines2027, guidelineClassesLabel, guidelineFileLabel } from './src/data/guidelines-2027.ts';
import { participationWindow, participationWindowStatus } from './src/data/participation-window.ts';
const opensAt = Date.parse(participationWindow.opensAt), closesAt = Date.parse(participationWindow.closesAt);
const window = {
  ...participationWindow,
  opensAtEpoch: Math.floor(opensAt / 1000), closesAtEpoch: Math.floor(closesAt / 1000),
  statuses: {
    upcoming: participationWindowStatus(opensAt - 1),
    open: participationWindowStatus(opensAt),
    closed: participationWindowStatus(closesAt),
  },
};
const competitions = competitionGuidelines2027.map(item => ({
  ...item,
  classLabel: guidelineClassesLabel(item),
  participationLabel: item.team.allowed ? 'Individual entry or a team of up to ' + item.team.maxMembers : 'Individual entry',
  classTopics: item.classTopics.map(group => ({ ...group, classLabel: guidelineClassesLabel({ classes: group.classes, eligibilityPending: item.eligibilityPending }) })),
  fileRequirements: item.fileRequirements.map(file => ({ ...file, fileLabel: guidelineFileLabel(file) })),
}));
process.stdout.write(JSON.stringify({ schemaVersion: 1, source: guidelines2027Source, participationWindow: window, competitions }));
`;
const payload = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', evaluate], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
assert(payload.competitions.length > 0, 'No canonical guidelines found');
assert.equal(new Set(payload.competitions.map(item => item.slug)).size, payload.competitions.length, 'Duplicate guideline slugs');
assert(payload.competitions.every(item => item.title && item.classLabel && item.fileRequirements.length), 'Incomplete guideline export');
assert(Number.isInteger(payload.participationWindow.opensAtEpoch) && Number.isInteger(payload.participationWindow.closesAtEpoch) && payload.participationWindow.opensAtEpoch < payload.participationWindow.closesAtEpoch, 'Invalid canonical participation window');
assert.equal(payload.participationWindow.scope, 'student-registration-and-competition-submissions', 'The deadline must not apply to school or teacher registration');
for (const state of ['upcoming', 'open', 'closed']) assert.equal(payload.participationWindow.statuses[state].state, state, `Invalid canonical ${state} status`);
assert.equal(payload.source.aiPolicy?.treatment, 'deduction', 'Expected the confirmed AI deduction policy');
assert.equal(payload.source.aiPolicy.penaltyPoints, 15);
assert.equal(payload.source.aiPolicy.scope, 'ai-generated-submission-content');
assert.equal(payload.source.aiPolicy.researchReferenceAllowed, true);
assert.equal(payload.source.clarificationItems.find(item => item.key === 'ai-penalty')?.resolved, true, 'AI judging must appear as a confirmed decision');
for (const competition of payload.competitions) {
  const deductions = competition.rubric.penalties.filter(item => /AI-generated(?: or copied)? submission content/i.test(item.title));
  assert.equal(deductions.length, 1, `Expected one confirmed AI deduction for ${competition.slug}`);
  assert.equal(deductions[0].marks, -15, `Incorrect AI deduction for ${competition.slug}`);
}
assert(payload.source.href.startsWith('/documents/'), 'Expected a local guidelines PDF');
const pdfPath = resolve(root, 'public', `.${payload.source.href}`);
assert(pdfPath.startsWith(join(root, 'public', 'documents') + '/'), 'Guidelines PDF escapes documents directory');
const pdf = await readFile(pdfPath);
assert(pdf.subarray(0, 5).toString() === '%PDF-', 'Guidelines file is not a PDF');
payload.source.pdfAsset = 'assets/guidelines-2027.pdf';
payload.source.pdfSha256 = createHash('sha256').update(pdf).digest('hex');
await mkdir(join(plugin, 'data'), { recursive: true });
await mkdir(join(plugin, 'assets'), { recursive: true });
await writeFile(join(plugin, 'data', 'guidelines-2027.json'), JSON.stringify(payload, null, 2) + '\n');
await writeFile(join(plugin, 'assets', 'guidelines-2027.pdf'), pdf);

const source = await readFile(join(plugin, `${pluginName}.php`), 'utf8');
for (const required of ["defined('ABSPATH')", "current_user_can('manage_options')", "settings_fields('yes_pb_settings')", "'sanitize_callback' => 'yes_pb_sanitize_origin'", "add_shortcode('yes_participation'", "add_shortcode('yes_guidelines'"]) {
  assert(source.includes(required), `Missing plugin guard: ${required}`);
}
assert(!/\b(?:wp_remote_\w+|curl_exec|register_rest_route|wp_insert_user|wp_create_user)\s*\(/.test(source), 'Bridge must not make remote calls or create a separate identity system');
assert(!/<iframe\b|<script\b|fetch\s*\(/i.test(source), 'Bridge must use top-level links only');
for (const route of ['/register', '/teachers/register', '/schools/register', '/dashboard']) assert(source.includes(`'${route}'`), `Missing portal route ${route}`);
const php = spawnSync('php', ['-l', join(plugin, `${pluginName}.php`)], { encoding: 'utf8' });
if (php.error?.code === 'ENOENT') {
  console.warn('PHP CLI unavailable: PHP syntax and WordPress activation remain unverified. Static guard checks passed.');
} else {
  assert.equal(php.status, 0, `PHP syntax check failed: ${php.stdout || ''}${php.stderr || ''}`);
  console.log(php.stdout.trim());
}

const temporary = await mkdtemp(join(tmpdir(), 'yes-wordpress-bridge-'));
try {
  const staged = join(temporary, pluginName);
  await mkdir(staged);
  const files = [`${pluginName}.php`, 'readme.txt', 'assets/bridge.css', 'assets/guidelines-2027.pdf', 'data/guidelines-2027.json'];
  for (const file of files) {
    const destination = join(staged, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(plugin, file), destination);
  }
  await rm(archive, { force: true });
  execFileSync('zip', ['-q', '-r', archive, pluginName], { cwd: temporary });
  execFileSync('unzip', ['-t', archive], { encoding: 'utf8' });
  const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n').filter(path => !path.endsWith('/'));
  assert.deepEqual(entries.sort(), files.map(file => `${pluginName}/${file}`).sort(), 'Unexpected archive contents');
  const packaged = JSON.parse(execFileSync('unzip', ['-p', archive, `${pluginName}/data/guidelines-2027.json`], { encoding: 'utf8' }));
  assert.deepEqual(packaged, payload, 'Packaged guidelines differ from canonical export');
  const packagedPdf = execFileSync('unzip', ['-p', archive, `${pluginName}/assets/guidelines-2027.pdf`], { maxBuffer: pdf.length + 1024 });
  assert.equal(createHash('sha256').update(packagedPdf).digest('hex'), payload.source.pdfSha256, 'Packaged PDF differs from supplied source');
  console.log(`Packaged ${payload.competitions.length} competition guidelines and the supplied PDF.`);
  console.log(`Participation deadline: ${payload.participationWindow.deadlineLabel}; status is calculated at WordPress render time from UTC epoch boundaries.`);
  console.log(`Verified ${entries.length} package files; no application source, configuration, credentials or participant records included.`);
  console.log(`Installable ZIP: ${archive}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
