import { cp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(project, '.wordpress-build');
const theme = join(project, 'wordpress/yes-frontend-theme');
const origin = process.env.YES_WORDPRESS_ORIGIN || 'https://youthecosummit.com';
if (!/^https:\/\/[^/?#]+$/.test(origin)) throw new Error('YES_WORDPRESS_ORIGIN must be an HTTPS origin without a path.');
const nativeRoutes = ['login', 'register', 'schools', 'schools/nominate', 'schools/register', 'teachers/register', 'dashboard', 'schools/dashboard', 'partners/enquire', 'partner-enquiry', 'competitions/enter'];
const removedRoutes = ['api', 'admin', 'judge', 'entries', 'teams', 'invite', 'recover', 'competitions/[id]'];
const publicExtensions = new Set(['.png','.jpg','.jpeg','.webp','.gif','.avif','.ico','.pdf','.woff','.woff2','.ttf','.mp4','.webm']);
async function filesBelow(dir) {
  const files=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if(entry.isSymbolicLink()) continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory()) files.push(...await filesBelow(path));
    else if(entry.isFile()) files.push(path);
  }
  return files;
}
function required(source,needle,replacement,label) {
  if(!source.includes(needle)) throw new Error(`WordPress staging transform no longer matches ${label}.`);
  return source.replace(needle,replacement);
}
async function run(command,args,cwd,env=process.env) {
  await new Promise((done,fail)=>{
    const child=spawn(command,args,{cwd,env,stdio:'inherit'});
    child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error(`${command} failed (${code}).`)));
  });
}
// Only disposable builder-owned paths are replaced; the Next/PostgreSQL app is unchanged.
await rm(staging,{recursive:true,force:true});
await mkdir(join(staging,'src'),{recursive:true});
for(const directory of ['app','components','data']) await cp(join(project,'src',directory),join(staging,'src',directory),{recursive:true});
for(const route of removedRoutes) await rm(join(staging,'src/app',route),{recursive:true,force:true});
for(const route of nativeRoutes) {
  const directory=join(staging,'src/app',route);await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'page.tsx'),`// WordPress renders the live native form into this page's main element.\nexport const metadata = { robots: { index: false, follow: false } };\nexport default function Page() { return <div id="yes-native-slot" />; }\n`);
}
await mkdir(join(staging,'public'),{recursive:true});
for(const file of await filesBelow(join(project,'public'))) {
  if(!publicExtensions.has(extname(file).toLowerCase())) continue;
  const target=join(staging,'public',relative(join(project,'public'),file));await mkdir(dirname(target),{recursive:true});await cp(file,target);
}
// Use full document navigations: WordPress must render its current nonce and native forms.
await writeFile(join(staging,'src/components/wordpress-link.tsx'),`import type { ComponentProps } from 'react';\nexport default function Link(props: ComponentProps<'a'>) { return <a {...props} />; }\n`);
for(const file of await filesBelow(join(staging,'src'))) {
  if(!/\.tsx?$/.test(file)) continue;
  let source=await readFile(file,'utf8');
  source=source.replace(/from ['"]next\/link['"]/g,"from '@/components/wordpress-link'");
  await writeFile(file,source);
}
// WordPress registration is live while its competition entry forms are still drafts.
// Keep these labels scoped to this disposable export; the Next/PostgreSQL programme
// retains its independent status and the confirmed combined deadline is unchanged.
const participationFile=join(staging,'src/data/participation-window.ts');
let participation=await readFile(participationFile,'utf8');
participation=required(participation,'Student registration & competition submissions open 1 October 2026','Student registration opens 1 October 2026','WordPress upcoming registration label');
participation=required(participation,'Student registration & competition submissions closed','Student registration closed','WordPress closed registration label');
participation=required(participation,'Student registration & competition submissions open','Student registration open','WordPress open registration label');
await writeFile(participationFile,participation);
const apiFile=join(staging,'src/components/api.ts');
let api=await readFile(apiFile,'utf8');
api=required(api,'const response = await fetch(path,',`const runtime = typeof window !== 'undefined' ? (window as Window & { YES_WORDPRESS?: { restRoot: string; nonce?: string } }).YES_WORDPRESS : undefined;\n  const target = path.startsWith('/api/') ? (runtime?.restRoot || '/wp-json/yes/v1/').replace(/\\/$/, '') + path.slice(4) : path;\n  const response = await fetch(target,`,'API fetch transport');
api=required(api,"headers: { ...(options.body ?", "headers: { ...(runtime?.nonce ? { 'X-WP-Nonce': runtime.nonce } : {}), ...(options.body ?",'WordPress REST nonce');
await writeFile(apiFile,api);
// Staff work stays in WordPress admin, and the frontend directory directs nominations to
// the existing school registration workflow instead of inventing another records store.
const shellFile=join(staging,'src/components/site-shell.tsx');
let shell=await readFile(shellFile,'utf8');
shell=shell.replace("import { dashboardLabel, dashboardPath } from './auth-navigation';","import { dashboardLabel } from './auth-navigation';\nconst dashboardPath = (role: string) => ['admin', 'owner'].includes(role) ? '/wp-admin/' : '/dashboard';");
shell=shell.replace("{['admin', 'owner'].includes(actor.role) && <Link href=\"/judge\">Assigned judging</Link>}",'');
await writeFile(shellFile,shell);
const schoolFile=join(staging,'src/components/registration.tsx');
let schools=await readFile(schoolFile,'utf8');
schools=required(schools,'<p>Nominate your school for review. A nomination does not register or approve the school.</p><NominationForm />','<p>An authorized teacher or school contact can register the school.</p><Link className="button" href="/schools/register">Register your school</Link>','school directory nomination');
await writeFile(schoolFile,schools);
for(const name of ['robots.ts','sitemap.ts']) {
  const file=join(staging,'src/app',name);let source=await readFile(file,'utf8');
  source="export const dynamic = 'force-static';\n"+source;
  await writeFile(file,source);
}
await writeFile(join(staging,'next.config.ts'),`import type { NextConfig } from 'next';\nconst config: NextConfig = { output: 'export', trailingSlash: true, images: { unoptimized: true }, poweredByHeader: false, experimental: { cpus: 1 } };\nexport default config;\n`);
const originalPackage=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
await writeFile(join(staging,'package.json'),JSON.stringify({name:'youth-eco-summit-wordpress-frontend',private:true,type:'module',dependencies:Object.fromEntries(['next','react','react-dom','gsap','@noble/hashes'].map(name=>[name,originalPackage.dependencies[name]])),devDependencies:Object.fromEntries(['typescript','@types/node','@types/react','@types/react-dom'].map(name=>[name,originalPackage.devDependencies[name]]))},null,2));
await writeFile(join(staging,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,isolatedModules:true,jsx:'react-jsx',incremental:true,plugins:[{name:'next'}],paths:{'@/*':['./src/*']}},include:['next-env.d.ts','src/**/*.ts','src/**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']},null,2));
await symlink(join(project,'node_modules'),join(staging,'node_modules'),'dir');
const environment=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','SystemRoot','SYSTEMROOT','LANG'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
Object.assign(environment,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',APP_ORIGIN:origin});
await run(process.execPath,[join(project,'node_modules/next/dist/bin/next'),'build','--webpack'],staging,environment);
await rm(theme,{recursive:true,force:true});await mkdir(theme,{recursive:true});
await cp(join(staging,'out'),join(theme,'frontend'),{recursive:true});
await writeFile(join(theme,'style.css'),`/*\nTheme Name: Youth Eco Summit\nDescription: Youth Eco Summit frontend with WordPress registration and administration.\nVersion: 2026.10.06\nAuthor: Compactum Media\nRequires at least: 6.4\nRequires PHP: 8.0\n*/\n`);
await writeFile(join(theme,'index.php'),`<?php\n// Frontend requests are handled by template_redirect in functions.php.\nif (!defined('ABSPATH')) { exit; }\nget_header();\nif (have_posts()) { while (have_posts()) { the_post(); the_content(); } }\nget_footer();\n`);
await writeFile(join(theme,'functions.php'),`<?php
if (!defined('ABSPATH')) { exit; }
add_action('after_setup_theme', static function () { add_theme_support('title-tag'); });
/** Same-origin assets can be copied to public_html for direct server delivery; this is
 * a fallback for installations that retain all assets inside the theme directory. */
function yes_frontend_asset($path) {
    if (!preg_match('#^/(?:_next/static/|images/|documents/)#', $path)) { return false; }
    $base = realpath(__DIR__ . '/frontend');
    $file = realpath($base . $path);
    if (!$file || strpos($file, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) { return false; }
    $types = array('js'=>'application/javascript','css'=>'text/css','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp','gif'=>'image/gif','avif'=>'image/avif','ico'=>'image/x-icon','pdf'=>'application/pdf','woff'=>'font/woff','woff2'=>'font/woff2','ttf'=>'font/ttf','mp4'=>'video/mp4','webm'=>'video/webm');
    $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if (!isset($types[$extension])) { return false; }
    status_header(200);
    header('Content-Type: ' . $types[$extension]);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=' . (strpos($path, '/_next/static/') === 0 ? '31536000, immutable' : '86400'));
    readfile($file); exit;
}
function yes_frontend_is_analytics($script) {
    // Deliberately exclude Google API/reCAPTCHA and Facebook login SDK domains.
    return (bool) preg_match('#googletagmanager\\.com|google-analytics\\.com|gtag\\s*\\(|gtm\\.start|GTM-[A-Z0-9]+|fbq\\s*\\(|_fbq\\b|connect\\.facebook\\.net/[^<>]*fbevents\\.js|clarity\\.ms/(?:tag|collect)/|clarity\\s*\\(|plausible\\.io|plausible\\s*\\(|matomo(?:\\.min)?\\.js|_paq\\s*\\.\\s*push|(?:static|script)\\.hotjar\\.com|hjid|hjsv|hj\\s*\\(#i', $script);
}
function yes_frontend_is_native_asset($tag) {
    $end = strpos($tag, '>');
    $opening = strtolower($end === false ? $tag : substr($tag, 0, $end + 1));
    if (preg_match('#elementor|hello-theme|hello-elementor|wp-custom-css|global-styles|classic-theme-styles#i', $opening)) { return false; }
    $path = '/' . trim((string) wp_parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
    $um_route = (bool) preg_match('#^/(?:login|dashboard|schools/dashboard|account|user|password-reset)(?:/|$)#', $path);
    // UM bundles its own Select2. Registration uses Forminator's version exclusively.
    if (preg_match('#ultimate-member|ultimatemember|(?:^|[^a-z])um[-_]#i', $opening)) { return $um_route; }
    if (!preg_match('#\\b(?:src|href)\\s*=#i', $opening) && preg_match('#(?:^|[^a-z])um_scripts|um_frontend|um_ajax|UM\\.#i', $tag)) { return $um_route; }
    // Only assets belonging to the active form/account handlers and their dependencies.
    if (preg_match('#forminator|ultimate-member|ultimatemember|yes-native-portal|(?:^|[^a-z])um[-_]|jquery|wp-(?:util|hooks|i18n|a11y|polyfill|dom-ready|escape-html|element|url|api-fetch)|underscore|backbone|regenerator-runtime|select2|intl-tel|intlTel|otp-verification|miniorange|mo-otp|mootp|movalidation|mo_forms|recaptcha|hcaptcha|challenges\\.cloudflare\\.com|maps\\.googleapis\\.com|connect\\.facebook\\.net/[^<>]*sdk\\.js#i', $opening)) { return true; }
    // Forminator and UM can print their initializer without a script/style handle.
    if (!preg_match('#\\b(?:src|href)\\s*=#i', $opening) && preg_match('#forminator|YESNative|(?:^|[^a-z])um_scripts|um_frontend|um_ajax|UM\\.|moValidation|mo_forms|mootp|g-recaptcha|grecaptcha|hcaptcha#i', $tag)) { return true; }
    return false;
}
function yes_frontend_integrations($html, $native) {
    if ($native) {
        // A draft URL contains a private resume token. Referrer headers alone do not
        // stop analytics SDKs from reading the browser URL and recording that token.
        return preg_replace_callback('#<(?:script|style)\\b[^>]*>.*?</(?:script|style)>|<link\\b[^>]*>#is', static function ($match) {
            return !yes_frontend_is_analytics($match[0]) && yes_frontend_is_native_asset($match[0]) ? $match[0] : '';
        }, $html);
    }
    // Keep established marketing analytics, without the old page builder's CSS/JS.
    preg_match_all('#<script\\b[^>]*>.*?</script>#is', $html, $scripts);
    $kept = array();
    foreach ($scripts[0] as $script) {
        if (yes_frontend_is_analytics($script)) { $kept[] = $script; }
    }
    return implode("\\n", $kept);
}
function yes_frontend_wp_assets($native) {
    ob_start(); wp_head(); $head = ob_get_clean();
    // The exported page supplies its own titles, canonical and social metadata.
    preg_match_all('#<(?:script|style)\\b[^>]*>.*?</(?:script|style)>|<link\\b[^>]*rel=["\\\']stylesheet["\\\'][^>]*>#is', $head, $matches);
    return yes_frontend_integrations(implode("\\n", $matches[0]), $native);
}
add_action('template_redirect', static function () {
    if (is_admin() || (defined('REST_REQUEST') && REST_REQUEST) || wp_doing_ajax() || wp_doing_cron()) { return; }
    $path = rawurldecode((string) wp_parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    if (!$path || strpos($path, "\\0") !== false || strpos($path, '..') !== false) { return; }
    $path = '/' . trim($path, '/');
    if ($path === '/wp-admin' || strpos($path, '/wp-json/') === 0 || strpos($path, '/wp-login.php') === 0) { return; }
    $aliases = array(
        '/about-us' => '/about/',
        '/contact-us' => '/contact/',
        '/participate' => '/how-to-participate/',
        '/gallery' => '/showcase/',
        '/school-registration' => '/schools/register/',
        '/partner-with-us' => '/partners/enquire/',
        '/2026-27-youth-eco-summit-student-registration' => '/register/',
        '/youth-eco-summit-registration-student' => '/register/',
        '/2026-27-youth-eco-summit-educator-registration' => '/teachers/register/',
        '/youth-eco-summit-registration-educator' => '/teachers/register/',
        '/2026-27-homepage' => '/'
    );
    if (isset($aliases[$path])) {
        $target = home_url($aliases[$path]);
        // Preserve campaign and native Forminator draft-resume query parameters.
        $query = (string) wp_parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY);
        if ($query !== '') { $target .= '?' . $query; }
        header('Referrer-Policy: no-referrer');
        wp_safe_redirect($target, 301); exit;
    }
    if (yes_frontend_asset($path)) { return; }
    if ($path === '/admin' || strpos($path, '/admin/') === 0 || $path === '/judge' || strpos($path, '/judge/') === 0) {
        wp_safe_redirect(admin_url()); exit;
    }
    if (strpos($path, '/entries/') === 0 || strpos($path, '/teams/') === 0) {
        wp_safe_redirect(home_url('/competitions/enter/')); exit;
    }
    if ($path === '/invite' || $path === '/recover') { wp_safe_redirect(home_url('/login/')); exit; }
    if ($path === '/robots.txt' || $path === '/sitemap.xml') {
        $file = __DIR__ . '/frontend' . $path;
        if (is_file($file)) { status_header(200); header('Content-Type: ' . ($path === '/robots.txt' ? 'text/plain' : 'application/xml') . '; charset=UTF-8'); readfile($file); exit; }
    }
    $native_paths = array('/login','/register','/schools','/schools/nominate','/schools/register','/teachers/register','/dashboard','/schools/dashboard','/partners/enquire','/partner-enquiry','/competitions/enter');
    $is_native = in_array($path, $native_paths, true);
    $file = __DIR__ . '/frontend' . ($path === '/' ? '' : $path) . '/index.html';
    if (!is_file($file)) { return; } // Existing WordPress pages and integrations remain reachable.
    $html = file_get_contents($file);
    if ($is_native) {
        if (!function_exists('yes_native_render_page')) { status_header(503); wp_die('Registration is temporarily unavailable. Please try again shortly.', 'Youth Eco Summit', array('response'=>503)); }
        $content = yes_native_render_page($path);
        if ($content === null) { status_header(503); wp_die('Registration is temporarily unavailable. Please try again shortly.', 'Youth Eco Summit', array('response'=>503)); }
        if (function_exists('yes_native_enqueue_assets')) { yes_native_enqueue_assets(); }
        $html = preg_replace_callback('#(<main\\b[^>]*id="main"[^>]*>).*?(</main>)#s', static function ($match) use ($content) { return $match[1] . $content . $match[2]; }, $html, 1);
        if (preg_match('#<h1\\b[^>]*>(.*?)</h1>#is', $content, $title)) {
            $page_title = esc_html(wp_strip_all_tags($title[1])) . ' | Youth Eco Summit';
            $html = preg_replace_callback('#<title>.*?</title>#is', static function () use ($page_title) { return '<title>' . $page_title . '</title>'; }, $html, 1);
        }
        // Native WordPress forms own their DOM, scripts and account state.
        $html = preg_replace('#<script\\b(?![^>]*type="application/ld\\+json")[^>]*>.*?</script>#is', '', $html);
        $html = preg_replace('#<link\\b[^>]*(?:rel="preload"[^>]*as="script"|rel="modulepreload")[^>]*>#i', '', $html);
    }
    $runtime = array('restRoot'=>rest_url('yes/v1/'),'nonce'=>is_user_logged_in() ? wp_create_nonce('wp_rest') : '', 'baseUrl'=>home_url('/'));
    $bootstrap = '<script>window.YES_WORDPRESS=' . wp_json_encode($runtime, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>';
    $head = yes_frontend_wp_assets($is_native);
    ob_start(); wp_footer(); $footer = yes_frontend_integrations(ob_get_clean(), $is_native);
    if ($is_native) { $footer .= '<script src="' . esc_url(get_stylesheet_directory_uri() . '/native-navigation.js') . '" defer></script>'; }
    $html = str_replace('</head>', $bootstrap . $head . '</head>', $html);
    $html = str_replace('</body>', $footer . '</body>', $html);
    status_header(200); nocache_headers(); header('Content-Type: text/html; charset=UTF-8');
    header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: ' . ($is_native ? 'no-referrer' : 'same-origin')); echo $html; exit;
}, 0);
`);
await writeFile(join(theme,'native-navigation.js'),`(() => { const button=document.querySelector('.yes-menu-toggle'); const menu=document.getElementById('mobile-menu'); if(!button||!menu)return; const set=open=>{button.setAttribute('aria-expanded',String(open));menu.hidden=!open;button.innerHTML=(open?'Close':'Menu')+' <span aria-hidden="true">'+(open?'×':'+')+'</span>';};button.addEventListener('click',()=>set(button.getAttribute('aria-expanded')!=='true'));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&button.getAttribute('aria-expanded')==='true'){set(false);button.focus();}}); })();\n`);
const files=await filesBelow(join(theme,'frontend'));
const errors=[];
for(const file of files) {
  const name=relative(join(theme,'frontend'),file);
  if(/(?:^|\/)(?:\.env[^/]*|\.local|src|scripts|node_modules|api|admin|judge|entries)(?:\/|$)/.test(name)||/\.(?:map|zip|sql|pem|key)$/.test(name)) errors.push(`Unexpected output file: ${name}`);
  if(!/\.(?:html|css)$/.test(name)) continue;
  const text=await readFile(file,'utf8');
  if(text.includes('Frontend approval preview')||text.includes('Local test environment')) errors.push(`Preview notice in ${name}`);
  if(name.endsWith('.html')&&!/^(?:404(?:\/index)?|_not-found\/index)\.html$/.test(name)&&!nativeRoutes.some(route=>name===route+'/index.html')&&/<meta name="robots" content="noindex/.test(text)) errors.push(`Marketing page noindex: ${name}`);
  for(const match of text.matchAll(/(?:src|href)="([^"#]+)"|url\(["']?([^\s)"']+)/g)) {
    let ref=match[1]||match[2];if(!ref.startsWith('/')||ref.startsWith('//'))continue;
    const path=decodeURIComponent(ref.split(/[?#]/)[0]);
    if(path.startsWith('/wp-')||path.startsWith('/api/')||path.startsWith('/competitions/')||path.startsWith('/entries/')||path.startsWith('/teams/')||path.startsWith('/admin/')||['/judge','/admin','/invite','/recover'].includes(path))continue;
    const target=join(theme,'frontend',path.replace(/^\//,''));let found=false;
    for(const candidate of [target,join(target,'index.html'),target+'.html']) { try { if((await stat(candidate)).isFile()){found=true;break;} }catch{} }
    if(!found)errors.push(`Missing asset or public route in ${name}: ${path}`);
  }
}
if(!/fetch\(target/.test(await readFile(apiFile,'utf8'))) errors.push('WordPress API transport missing.');
if(errors.length)throw new Error('WordPress export audit failed:\n'+[...new Set(errors)].join('\n'));
const report={origin,theme,files:files.length,htmlPages:files.filter(file=>file.endsWith('.html')).length,apiNamespace:'/wp-json/yes/v1/',liveApiTransport:true,nativeRoutes,participationStatusScope:'student-registration',nativeFormsHydratedByNext:false,publicAssetsAudited:true};
await writeFile(join(staging,'wordpress-export-report.json'),JSON.stringify(report,null,2));
await writeFile(join(theme,'deployment.json'),JSON.stringify(report,null,2));
await rm(join(project,'wordpress/yes-frontend-theme.zip'),{force:true});
await run('zip',['-q','-r','yes-frontend-theme.zip','yes-frontend-theme'],join(project,'wordpress'));
console.log(JSON.stringify(report,null,2));
