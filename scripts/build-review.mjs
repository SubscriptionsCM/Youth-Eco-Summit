import { cp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(project, '.review-build');
const output = join(staging, 'out');
const basePath = '/youthecosummit/home';
const previewOrigin = `https://compactummedia.com${basePath}`;
const removedRoutes = ['api', 'admin', 'judge', 'dashboard', 'entries', 'teams', 'invite', 'recover', 'competitions/[id]'];
const publicAssetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.mp4', '.webm']);

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
function replaceRequired(source, find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Review staging transform no longer matches ${label}; review the source before rebuilding.`);
  return source.replace(find, replacement);
}
async function transform(path, change) {
  const fullPath = join(staging, path);
  await writeFile(fullPath, change(await readFile(fullPath, 'utf8')));
}

// Only this disposable, script-owned directory is replaced. Runtime source is untouched.
if (staging !== join(project, '.review-build')) throw new Error('Invalid review staging directory.');
await rm(staging, { recursive: true, force: true });
await mkdir(join(staging, 'src'), { recursive: true });
for (const directory of ['app', 'components', 'data']) {
  await cp(join(project, 'src', directory), join(staging, 'src', directory), {
    recursive: true,
    filter: path => !/(?:^|\/)\.(?:env|local|git)(?:[./]|$)/.test(path),
  });
}
for (const route of removedRoutes) await rm(join(staging, 'src/app', route), { recursive: true, force: true });
await rm(join(staging, 'src/app/sitemap.ts'), { force: true });
await mkdir(join(staging, 'public'), { recursive: true });
for (const file of await filesBelow(join(project, 'public'))) {
  if (!publicAssetExtensions.has(extname(file).toLowerCase())) continue;
  const destination = join(staging, 'public', relative(join(project, 'public'), file));
  await mkdir(dirname(destination), { recursive: true });
  await cp(file, destination);
}

// next/link handles the basePath itself. Raw asset URLs and native PDF links do not.
for (const file of await filesBelow(join(staging, 'src'))) {
  if (!/\.(?:tsx?|css)$/.test(file)) continue;
  let source = await readFile(file, 'utf8');
  source = source.replace(/(["'`])\/(images|documents)\//g, `$1${basePath}/$2/`);
  source = source.replace(/url\(\/(images|documents)\//g, `url(${basePath}/$1/`);
  // Keep visible review navigation inside the exported public pages.
  source = source.replace(/(["'`])\/dashboard(?=["'`?])/g, '$1/how-to-participate');
  source = source.replace(/href="\/recover"/g, 'href="/login"');
  await writeFile(file, source);
}

const originalApi = await readFile(join(project, 'src/components/api.ts'), 'utf8');
const apiHeader = originalApi.slice(0, originalApi.indexOf('export async function api'));
const apiHelpers = originalApi.slice(originalApi.indexOf('export const json'));
if (!apiHeader.includes('class ApiError') || !apiHelpers.startsWith('export const json')) throw new Error('API helper structure changed; inspect before exporting.');
await writeFile(join(staging, 'src/components/api.ts'), apiHeader + `
// Frontend approval preview: no network transport, accounts or saved records.
export async function api<T = Row>(path: string, options: RequestInit = {}): Promise<T> {
  if ((options.method || 'GET').toUpperCase() !== 'GET') throw new ApiError('This is a frontend approval preview. Forms do not submit, sign in or save information.');
  const pathname = path.split('?')[0];
  if (pathname === '/api/public/config') return { configured: false, editions: [], competitions: [], content: [] } as T;
  if (pathname === '/api/auth/session') return { actor: null } as T;
  if (pathname === '/api/public/showcase') return { items: [] } as T;
  if (pathname === '/api/public/schools') return { items: [], total: 0, page: 1, pageSize: 25 } as T;
  throw new ApiError('This feature is not connected in the frontend approval preview.');
}
` + apiHelpers);

await transform('src/components/site-shell.tsx', source => {
  source = replaceRequired(source, "import '../app/account-navigation.css';", "import '../app/account-navigation.css';\nimport '../app/review-preview.css';", 'site shell imports');
  return replaceRequired(source, '{children}</main>', `{['/login', '/register', '/schools', '/schools/register', '/teachers/register', '/partners/enquire'].includes(pathname) && <aside className="review-preview-notice" aria-label="Frontend approval preview"><strong>Frontend approval preview</strong><span>Forms do not submit, sign in or save information.</span></aside>}{children}</main>`, 'site shell main content');
});
await writeFile(join(staging, 'src/app/review-preview.css'), '.review-preview-notice{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding:12px 16px;border:1px solid #d8d0e3;border-radius:6px;background:#f5f1f8;color:#4d3f7f;font-size:.875rem;line-height:1.6}.review-preview-notice strong{white-space:nowrap}@media(max-width:600px){.review-preview-notice{display:block}.review-preview-notice strong{display:block;margin-bottom:3px}}\n');
await transform('src/app/layout.tsx', source => replaceRequired(source, 'export const metadata: Metadata = {', 'export const metadata: Metadata = {\n  robots: { index: false, follow: false },', 'layout metadata'));
await transform('src/app/page.tsx', source => {
  source = replaceRequired(source, "canonical: '/'", `canonical: '${basePath}/'`, 'homepage canonical');
  return replaceRequired(source, "(process.env.APP_ORIGIN || 'https://youthecosummit.com').replace(/\\/$/, '')", `'${previewOrigin}'`, 'homepage structured data origin');
});
await writeFile(join(staging, 'src/app/robots.ts'), "import type { MetadataRoute } from 'next';\nexport const dynamic = 'force-static';\nexport default function robots(): MetadataRoute.Robots { return { rules: { userAgent: '*', disallow: '/' } }; }\n");
await writeFile(join(staging, 'next.config.ts'), `import type { NextConfig } from 'next';
const config: NextConfig = { output: 'export', basePath: '${basePath}', trailingSlash: true, images: { unoptimized: true }, poweredByHeader: false, experimental: { cpus: 1 } };
export default config;
`);
const originalPackage = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
await writeFile(join(staging, 'package.json'), JSON.stringify({ name: 'youth-eco-summit-approval-preview', private: true, type: 'module', scripts: { build: 'next build --webpack' }, dependencies: Object.fromEntries(['next', 'react', 'react-dom', 'gsap'].map(name => [name, originalPackage.dependencies[name]])), devDependencies: Object.fromEntries(['typescript', '@types/node', '@types/react', '@types/react-dom'].map(name => [name, originalPackage.devDependencies[name]])) }, null, 2));
await writeFile(join(staging, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] } }, include: ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }, null, 2));
await symlink(join(project, 'node_modules'), join(staging, 'node_modules'), 'dir');

// Do not inherit application/DB/storage/provider credentials into the preview build.
const environment = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(environment, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', APP_ORIGIN: new URL(previewOrigin).origin });
await new Promise((resolveBuild, reject) => {
  const child = spawn(process.execPath, [join(project, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], { cwd: staging, env: environment, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolveBuild() : reject(new Error(`Review build failed (${code}).`)));
});

await writeFile(join(output, '.htaccess'), `Options -Indexes\nDirectoryIndex index.html\n<IfModule mod_headers.c>\n  Header always set X-Robots-Tag "noindex, nofollow, noarchive"\n  Header always set X-Content-Type-Options "nosniff"\n  Header always set Content-Security-Policy "form-action 'none'; upgrade-insecure-requests"\n</IfModule>\n`);
const exported = await filesBelow(output);
const errors = [];
for (const file of exported) {
  const name = relative(output, file);
  if (/(?:^|\/)(?:\.env[^/]*|\.local|src|scripts|node_modules|api|admin|judge|dashboard|entries|teams|invite|recover)(?:\/|$)/.test(name) || /\.(?:map|zip|sql|pem|key)$/.test(name)) errors.push(`Unexpected output file: ${name}`);
  if (!/\.(?:html|css)$/.test(name)) continue;
  const text = await readFile(file, 'utf8');
  if (name.endsWith('.html') && !/<meta name="robots" content="noindex, nofollow"/.test(text)) errors.push(`No noindex metadata: ${name}`);
  const references = [...text.matchAll(/(?:src|href)="([^"#]+)"|url\(["']?([^\s)"']+)/g)].map(match => match[1] || match[2]);
  references.push(...[...text.matchAll(/<meta\b[^>]*\bcontent="(https:\/\/compactummedia\.com\/[^"#]+)"/g)].map(match => match[1]));
  for (let reference of references) {
    if (reference.startsWith('https://compactummedia.com/')) reference = new URL(reference).pathname;
    if (!reference.startsWith('/') || reference.startsWith('//')) continue;
    const rawPath = reference.split(/[?#]/)[0];
    if (rawPath !== basePath && !rawPath.startsWith(basePath + '/')) { errors.push(`Unprefixed internal URL in ${name}: ${rawPath}`); continue; }
    const local = decodeURIComponent(rawPath.slice(basePath.length)).replace(/^\//, '');
    const target = join(output, local);
    const candidates = [target, join(target, 'index.html'), `${target}.html`];
    let found = false;
    for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) { found = true; break; } } catch {} }
    if (!found) errors.push(`Missing internal target in ${name}: ${rawPath}`);
  }
}
const stagedApi = await readFile(join(staging, 'src/components/api.ts'), 'utf8');
if (/\bfetch\s*\(/.test(stagedApi)) errors.push('Review API contains a network transport.');
if (errors.length) throw new Error(`Review export audit failed:\n${[...new Set(errors)].join('\n')}`);
const summary = { url: previewOrigin + '/', output, files: exported.length, htmlPages: exported.filter(file => file.endsWith('.html')).length, backendRoutes: false, liveApiTransport: false, noindex: true, auditedInternalAssetsAndLinks: true };
await writeFile(join(staging, 'review-export-report.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
