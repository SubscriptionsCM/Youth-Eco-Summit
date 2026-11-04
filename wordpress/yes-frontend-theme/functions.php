<?php
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
    return (bool) preg_match('#googletagmanager\.com|google-analytics\.com|gtag\s*\(|gtm\.start|GTM-[A-Z0-9]+|fbq\s*\(|_fbq\b|connect\.facebook\.net/[^<>]*fbevents\.js|clarity\.ms/(?:tag|collect)/|clarity\s*\(|plausible\.io|plausible\s*\(|matomo(?:\.min)?\.js|_paq\s*\.\s*push|(?:static|script)\.hotjar\.com|hjid|hjsv|hj\s*\(#i', $script);
}
function yes_frontend_is_native_asset($tag) {
    $end = strpos($tag, '>');
    $opening = strtolower($end === false ? $tag : substr($tag, 0, $end + 1));
    if (preg_match('#elementor|hello-theme|hello-elementor|wp-custom-css|global-styles|classic-theme-styles#i', $opening)) { return false; }
    $path = '/' . trim((string) wp_parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
    $um_route = (bool) preg_match('#^/(?:login|dashboard|schools/dashboard|account|user|password-reset)(?:/|$)#', $path);
    // UM bundles its own Select2. Registration uses Forminator's version exclusively.
    if (preg_match('#ultimate-member|ultimatemember|(?:^|[^a-z])um[-_]#i', $opening)) { return $um_route; }
    if (!preg_match('#\b(?:src|href)\s*=#i', $opening) && preg_match('#(?:^|[^a-z])um_scripts|um_frontend|um_ajax|UM\.#i', $tag)) { return $um_route; }
    // Only assets belonging to the active form/account handlers and their dependencies.
    if (preg_match('#forminator|ultimate-member|ultimatemember|yes-native-portal|yes-registration-email|(?:^|[^a-z])um[-_]|jquery|wp-(?:util|hooks|i18n|a11y|polyfill|dom-ready|escape-html|element|url|api-fetch)|underscore|backbone|regenerator-runtime|select2|intl-tel|intlTel|otp-verification|miniorange|mo-otp|mootp|movalidation|mo_forms|recaptcha|hcaptcha|challenges\.cloudflare\.com|maps\.googleapis\.com|connect\.facebook\.net/[^<>]*sdk\.js#i', $opening)) { return true; }
    // Forminator and UM can print their initializer without a script/style handle.
    if (!preg_match('#\b(?:src|href)\s*=#i', $opening) && preg_match('#forminator|YESNative|(?:^|[^a-z])um_scripts|um_frontend|um_ajax|UM\.|moValidation|mo_forms|mootp|g-recaptcha|grecaptcha|hcaptcha#i', $tag)) { return true; }
    return false;
}
function yes_frontend_integrations($html, $native) {
    if ($native) {
        // A draft URL contains a private resume token. Referrer headers alone do not
        // stop analytics SDKs from reading the browser URL and recording that token.
        return preg_replace_callback('#<(?:script|style)\b[^>]*>.*?</(?:script|style)>|<link\b[^>]*>#is', static function ($match) {
            return !yes_frontend_is_analytics($match[0]) && yes_frontend_is_native_asset($match[0]) ? $match[0] : '';
        }, $html);
    }
    // Keep established marketing analytics, without the old page builder's CSS/JS.
    preg_match_all('#<script\b[^>]*>.*?</script>#is', $html, $scripts);
    $kept = array();
    foreach ($scripts[0] as $script) {
        if (yes_frontend_is_analytics($script)) { $kept[] = $script; }
    }
    return implode("\n", $kept);
}
function yes_frontend_wp_assets($native) {
    ob_start(); wp_head(); $head = ob_get_clean();
    // The exported page supplies its own titles, canonical and social metadata.
    preg_match_all('#<(?:script|style)\b[^>]*>.*?</(?:script|style)>|<link\b[^>]*rel=["\']stylesheet["\'][^>]*>#is', $head, $matches);
    return yes_frontend_integrations(implode("\n", $matches[0]), $native);
}
add_action('template_redirect', static function () {
    if (is_admin() || (defined('REST_REQUEST') && REST_REQUEST) || wp_doing_ajax() || wp_doing_cron()) { return; }
    $path = rawurldecode((string) wp_parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    if (!$path || strpos($path, "\0") !== false || strpos($path, '..') !== false) { return; }
    $path = '/' . trim($path, '/');
    if ($path === '/wp-admin' || strpos($path, '/wp-json/') === 0 || strpos($path, '/wp-login.php') === 0) { return; }
    // This router normally runs before plugin redirects so canonical WordPress
    // pages cannot replace the exported routes. Login POSTs are the exception:
    // let Ultimate Member authenticate the submitted form before rendering.
    if ($path === '/login' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && function_exists('UM')) {
        UM()->form()->form_init();
    }
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
    // Some native WordPress form routes do not have their own static export.
    // They can safely reuse the registration shell because the main content and
    // scripts are replaced below before the response is sent.
    if ($is_native && !is_file($file)) { $file = __DIR__ . '/frontend/register/index.html'; }
    if (!is_file($file)) { return; } // Existing WordPress pages and integrations remain reachable.
    $html = file_get_contents($file);
    if ($is_native) {
        if (!function_exists('yes_native_render_page')) { status_header(503); wp_die('Registration is temporarily unavailable. Please try again shortly.', 'Youth Eco Summit', array('response'=>503)); }
        $content = yes_native_render_page($path);
        if ($content === null) { status_header(503); wp_die('Registration is temporarily unavailable. Please try again shortly.', 'Youth Eco Summit', array('response'=>503)); }
        if (function_exists('yes_native_enqueue_assets')) { yes_native_enqueue_assets(); }
        $html = preg_replace_callback('#(<main\b[^>]*id="main"[^>]*>).*?(</main>)#s', static function ($match) use ($content) { return $match[1] . $content . $match[2]; }, $html, 1);
        if (preg_match('#<h1\b[^>]*>(.*?)</h1>#is', $content, $title)) {
            $page_title = esc_html(wp_strip_all_tags($title[1])) . ' | Youth Eco Summit';
            $html = preg_replace_callback('#<title>.*?</title>#is', static function () use ($page_title) { return '<title>' . $page_title . '</title>'; }, $html, 1);
        }
        // Native WordPress forms own their DOM, scripts and account state.
        $html = preg_replace('#<script\b(?![^>]*type="application/ld\+json")[^>]*>.*?</script>#is', '', $html);
        $html = preg_replace('#<link\b[^>]*(?:rel="preload"[^>]*as="script"|rel="modulepreload")[^>]*>#i', '', $html);
    }
    $current_user = wp_get_current_user();
    $runtime_actor = $current_user->exists() ? array(
        'id' => (string) $current_user->ID,
        'role' => current_user_can('manage_options') ? 'admin' : 'participant',
        'name' => $current_user->display_name,
    ) : null;
    $html = apply_filters('yes_frontend_page_html', $html, $path, $is_native);
    $runtime = array('restRoot'=>rest_url('yes/v1/'),'nonce'=>$current_user->exists() ? wp_create_nonce('wp_rest') : '', 'baseUrl'=>home_url('/'), 'actor'=>$runtime_actor);
    $bootstrap = '<script>window.YES_WORDPRESS=' . wp_json_encode($runtime, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>';
    $head = yes_frontend_wp_assets($is_native);
    ob_start(); wp_footer(); $footer = yes_frontend_integrations(ob_get_clean(), $is_native);
    if ($is_native) { $footer .= '<script src="' . esc_url(get_stylesheet_directory_uri() . '/native-navigation.js') . '" defer></script>'; }
    $updates_version = max((int) @filemtime(__DIR__ . '/site-updates.css'), (int) @filemtime(__DIR__ . '/site-updates.js'));
    $updates_head = '<link rel="stylesheet" href="' . esc_url(get_stylesheet_directory_uri() . '/site-updates.css?ver=' . $updates_version) . '">';
    $updates_footer = '<script src="' . esc_url(get_stylesheet_directory_uri() . '/site-updates.js?ver=' . $updates_version) . '" defer></script>';
    $html = str_replace('</head>', $bootstrap . $updates_head . $head . '</head>', $html);
    $html = str_replace('</body>', $footer . $updates_footer . '</body>', $html);
    status_header(200); nocache_headers(); header('Content-Type: text/html; charset=UTF-8');
    header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: ' . ($is_native ? 'no-referrer' : 'same-origin')); echo $html; exit;
}, 0);
