<?php
// Run on a PHP CLI against the generated theme; no WordPress runtime or records needed.
define('ABSPATH', __DIR__);
function add_action($hook, $callback, $priority = 10) {}
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
$_SERVER['REQUEST_URI'] = '/login/';
require (isset($argv[1]) ? $argv[1] : dirname(__DIR__) . '/wordpress/yes-frontend-theme/functions.php');
$analytics = array(
    '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST"></script>',
    '<script>gtag("config", "G-TEST");</script>',
    '<script src="https://www.google-analytics.com/analytics.js"></script>',
    '<script src="https://connect.facebook.net/en_US/fbevents.js"></script>',
    '<script>fbq("track", "PageView");</script>',
    '<script src="https://www.clarity.ms/tag/test"></script>',
    '<script src="https://plausible.io/js/script.js"></script>',
    '<script src="https://analytics.example.org/matomo.js"></script>',
    '<script>_paq.push(["trackPageView"]);</script>',
    '<script src="https://static.hotjar.com/c/hotjar-123.js"></script>'
);
$necessary = array(
    '<script src="https://www.google.com/recaptcha/api.js"></script>',
    '<script src="https://www.gstatic.com/recaptcha/releases/test/recaptcha__en.js"></script>',
    '<script src="https://maps.googleapis.com/maps/api/js"></script>',
    '<script src="/wp-content/plugins/forminator/assets/js/front/front.multi.min.js"></script>',
    '<script>window.forminatorFront = {nonce: "test"};</script>',
    '<script src="/wp-content/plugins/ultimate-member/assets/js/um.min.js"></script>',
    '<script src="/wp-includes/js/jquery/jquery.min.js"></script>',
    '<script src="https://connect.facebook.net/en_US/sdk.js"></script>'
);
foreach ($analytics as $script) {
    if (yes_frontend_integrations($script, true) !== '') { throw new RuntimeException('Analytics retained on native form page: ' . $script); }
    if (yes_frontend_integrations($script, false) !== $script) { throw new RuntimeException('Marketing analytics lost: ' . $script); }
}
foreach ($necessary as $script) {
    if (yes_frontend_integrations($script, true) !== $script) { throw new RuntimeException('Required native script removed: ' . $script); }
    if (yes_frontend_integrations($script, false) !== '') { throw new RuntimeException('Legacy page script retained on marketing page: ' . $script); }
}
$legacy = array(
    '<link id="elementor-frontend-css" rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/frontend.min.css">',
    '<link id="hello-elementor-css" rel="stylesheet" href="/wp-content/themes/hello-elementor/style.css">',
    '<style id="wp-custom-css">h1,p { display:none; }</style>',
    '<style id="global-styles-inline-css">nav { display:block; }</style>',
    '<script src="/wp-content/plugins/elementor/assets/js/frontend.min.js"></script>',
    '<script src="//cdn.shareaholic.net/assets/pub/shareaholic.js"></script>',
    '<script>window.Tynt = {}; Tynt.push("legacy");</script>',
    '<script>function send_wabaconnect_template() { $args = array("timeout" => 20); }</script>'
);
foreach ($legacy as $tag) {
    if (yes_frontend_integrations($tag, true) !== '') { throw new RuntimeException('Legacy global asset retained on native page: ' . $tag); }
}
$nativeStyles = array(
    '<link id="yes-native-portal-css" rel="stylesheet" href="/wp-content/plugins/yes-native-portal/assets/portal.css">',
    '<link id="forminator-module-css" rel="stylesheet" href="/wp-content/plugins/forminator/assets/css/forminator.min.css">',
    '<link id="um-default-css" rel="stylesheet" href="/wp-content/plugins/ultimate-member/assets/css/um.css">'
);
foreach ($nativeStyles as $tag) {
    if (yes_frontend_integrations($tag, true) !== $tag) { throw new RuntimeException('Native form stylesheet lost: ' . $tag); }
}
$style = '<style>.forminator-ui { color: purple; }</style>';
if (yes_frontend_integrations($style, true) !== $style) { throw new RuntimeException('Native form style lost.'); }
$_SERVER['REQUEST_URI'] = '/schools/register/';
$umAssets = array(
    '<script src="/wp-content/plugins/ultimate-member/assets/libs/select2/select2.full.min.js" id="select2-js"></script>',
    '<link href="/wp-content/plugins/ultimate-member/assets/libs/select2/select2.min.css" id="select2-css" rel="stylesheet">',
    '<script id="um_scripts-js-extra">var um_scripts = {nonce: "test"};</script>'
);
foreach ($umAssets as $tag) {
    if (yes_frontend_integrations($tag, true) !== '') { throw new RuntimeException('UM asset retained on Forminator registration route: ' . $tag); }
}
$forminatorSelect2 = '<script src="/wp-content/plugins/forminator/assets/forminator-ui/js/select2.full.min.js" id="forminator-select2-js"></script>';
if (yes_frontend_integrations($forminatorSelect2, true) !== $forminatorSelect2) { throw new RuntimeException('Forminator Select2 lost on registration route.'); }
$_SERVER['REQUEST_URI'] = '/login/';
foreach ($umAssets as $tag) {
    if (yes_frontend_integrations($tag, true) !== $tag) { throw new RuntimeException('UM asset lost on login route: ' . $tag); }
}
echo "PASS: Native tracking/global assets removed; Forminator/OTP dependencies retained; UM/Select2 are route-specific.\n";

