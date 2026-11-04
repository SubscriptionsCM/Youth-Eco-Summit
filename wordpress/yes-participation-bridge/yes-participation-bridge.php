<?php
/**
 * Plugin Name: Youth Eco Summit Participation Bridge
 * Description: Participation portal links and the supplied 2027 competition guidelines. Participant accounts and saved forms stay in the Youth Eco Summit application.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Compactum Media
 * License: GPL-2.0-or-later
 * Text Domain: yes-participation-bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

define('YES_PB_VERSION', '1.0.0');
define('YES_PB_OPTION', 'yes_pb_portal_origin');

/** Accept one HTTPS origin, never a URL containing credentials, paths or tokens. */
function yes_pb_validate_origin($value) {
    if (!is_string($value)) {
        return false;
    }
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    if (preg_match('/[\x00-\x20\x7f\\\\]/', $value)) {
        return false;
    }
    $parts = wp_parse_url($value);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host']) || strtolower($parts['scheme']) !== 'https') {
        return false;
    }
    foreach (array('user', 'pass', 'query', 'fragment') as $key) {
        if (array_key_exists($key, $parts)) {
            return false;
        }
    }
    if (isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/') {
        return false;
    }
    $host = strtolower($parts['host']);
    if (strpos($host, '.') === false || !filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
        return false;
    }
    if (isset($parts['port']) && ($parts['port'] < 1 || $parts['port'] > 65535)) {
        return false;
    }
    return 'https://' . $host . (isset($parts['port']) && $parts['port'] !== 443 ? ':' . $parts['port'] : '');
}

function yes_pb_sanitize_origin($value) {
    $origin = yes_pb_validate_origin($value);
    if ($origin !== false) {
        return $origin;
    }
    add_settings_error(YES_PB_OPTION, 'yes_pb_invalid_origin', 'Enter an HTTPS portal origin only, such as https://participate.example.org. Do not include a path, password, query string or fragment.');
    $previous = yes_pb_validate_origin(get_option(YES_PB_OPTION, ''));
    return $previous === false ? '' : $previous;
}

function yes_pb_register_settings() {
    register_setting('yes_pb_settings', YES_PB_OPTION, array(
        'type' => 'string',
        'sanitize_callback' => 'yes_pb_sanitize_origin',
        'default' => '',
        'show_in_rest' => false,
    ));
}
add_action('admin_init', 'yes_pb_register_settings');

function yes_pb_admin_menu() {
    add_options_page('Youth Eco Summit', 'Youth Eco Summit', 'manage_options', 'yes-participation-bridge', 'yes_pb_settings_page');
}
add_action('admin_menu', 'yes_pb_admin_menu');

function yes_pb_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $origin = yes_pb_validate_origin(get_option(YES_PB_OPTION, ''));
    ?>
    <div class="wrap">
        <h1>Youth Eco Summit participation portal</h1>
        <?php settings_errors(YES_PB_OPTION); ?>
        <p>Use the deployed application’s HTTPS origin. This plugin links to that application; it does not host forms, create participant accounts or store participant records in WordPress.</p>
        <form method="post" action="options.php">
            <?php settings_fields('yes_pb_settings'); ?>
            <table class="form-table" role="presentation"><tr>
                <th scope="row"><label for="yes-pb-portal-origin">Portal HTTPS origin</label></th>
                <td><input type="url" id="yes-pb-portal-origin" name="<?php echo esc_attr(YES_PB_OPTION); ?>" value="<?php echo esc_attr($origin ?: ''); ?>" class="regular-text" placeholder="https://participate.example.org" aria-describedby="yes-pb-origin-help">
                <p class="description" id="yes-pb-origin-help">Origin only; no path, credentials or tokens. Leave empty until the real application is hosted and verified. A static approval preview cannot save forms.</p></td>
            </tr></table>
            <?php submit_button(); ?>
        </form>
        <h2>Page shortcodes</h2>
        <p><code>[yes_participation]</code> shows student, teacher, school and saved-work links.</p>
        <p><code>[yes_participation audience="teacher"]</code> shows one link; supported values: student, teacher, school, dashboard, all.</p>
        <p><code>[yes_guidelines]</code> shows the supplied 2027 guidelines and PDF download. Rebuild the plugin when the canonical guidelines change.</p>
    </div>
    <?php
}

function yes_pb_styles() {
    // Tiny, fully scoped stylesheet; supports shortcodes in page builders as well as post content.
    wp_enqueue_style('yes-participation-bridge', plugins_url('assets/bridge.css', __FILE__), array(), YES_PB_VERSION);
}
add_action('wp_enqueue_scripts', 'yes_pb_styles');

function yes_pb_guidelines_data() {
    static $data = null;
    if ($data === null) {
        $path = __DIR__ . '/data/guidelines-2027.json';
        $decoded = is_readable($path) ? json_decode(file_get_contents($path), true) : null;
        $data = is_array($decoded) && isset($decoded['source'], $decoded['competitions']) ? $decoded : array();
    }
    return $data;
}

function yes_pb_pdf_link() {
    if (!is_readable(__DIR__ . '/assets/guidelines-2027.pdf')) {
        return '';
    }
    return '<a class="yes-bridge__download" href="' . esc_url(plugins_url('assets/guidelines-2027.pdf', __FILE__)) . '">Download the 2027 guidelines (PDF) <span aria-hidden="true">↗</span></a>';
}

/** Compare UTC Unix timestamps, independent of PHP or WordPress timezone settings. */
function yes_pb_window_notice() {
    $data = yes_pb_guidelines_data();
    if (empty($data['participationWindow'])) {
        return '';
    }
    $window = $data['participationWindow'];
    $now = time();
    $state = $now < $window['opensAtEpoch'] ? 'upcoming' : ($now >= $window['closesAtEpoch'] ? 'closed' : 'open');
    $status = $window['statuses'][$state];
    return '<div class="yes-bridge__notice" data-window-state="' . esc_attr($state) . '"><p class="yes-bridge__eyebrow">Student participation dates</p><p><strong>' . esc_html($status['label']) . '</strong><br>' . esc_html($status['detail']) . '</p><p class="yes-bridge__note">This cutoff applies only to student registration and competition submissions. School and teacher registrations remain available beyond this deadline.</p></div>';
}

function yes_pb_participation_shortcode($atts = array()) {
    $atts = shortcode_atts(array('audience' => 'all'), $atts, 'yes_participation');
    $origin = yes_pb_validate_origin(get_option(YES_PB_OPTION, ''));
    $cards = array(
        'student' => array('Students', 'Register a student', 'Create your student registration and continue your saved steps in the participation portal.', '/register'),
        'teacher' => array('Teachers', 'Register as a teacher', 'Register as an educator and manage your school’s participation in the portal.', '/teachers/register'),
        'school' => array('Schools', 'Register your school', 'Start your school registration. Existing schools can continue through the portal.', '/schools/register'),
        'dashboard' => array('Already started?', 'Continue saved work', 'Sign in to return to your saved registration or competition work.', '/dashboard'),
    );
    $audience = is_string($atts['audience']) ? $atts['audience'] : 'all';
    if ($audience !== 'all' && isset($cards[$audience])) {
        $cards = array($audience => $cards[$audience]);
    }
    ob_start();
    ?>
    <section class="yes-bridge" aria-label="Youth Eco Summit participation">
        <?php echo yes_pb_window_notice(); // Escaped canonical schedule; does not imply a portal connection. ?>
        <?php if (!$origin) : ?>
            <p class="yes-bridge__note">Registration links are not connected on this WordPress page yet.</p>
            <?php if (current_user_can('manage_options')) : ?>
                <p class="yes-bridge__admin-note">Administrator: <a href="<?php echo esc_url(admin_url('options-general.php?page=yes-participation-bridge')); ?>">configure the hosted portal origin</a> to enable the links.</p>
            <?php endif; ?>
        <?php else : ?>
            <div class="yes-bridge__grid">
                <?php foreach ($cards as $card) : ?>
                    <article class="yes-bridge__card">
                        <p class="yes-bridge__eyebrow"><?php echo esc_html($card[0]); ?></p>
                        <h3><?php echo esc_html($card[1]); ?></h3>
                        <p><?php echo esc_html($card[2]); ?></p>
                        <a class="yes-bridge__button" href="<?php echo esc_url($origin . $card[3]); ?>"><?php echo esc_html($card[1]); ?> <span aria-hidden="true">↗</span></a>
                    </article>
                <?php endforeach; ?>
            </div>
            <p class="yes-bridge__note">These links open the Youth Eco Summit participation portal. Your account and saved work remain in that portal.</p>
        <?php endif; ?>
        <?php echo yes_pb_pdf_link(); // Fixed, escaped local asset URL; no user-provided HTML. ?>
    </section>
    <?php
    return ob_get_clean();
}

function yes_pb_text_list($items) {
    if (empty($items) || !is_array($items)) {
        return;
    }
    echo '<ul>';
    foreach ($items as $item) {
        echo '<li>' . esc_html($item) . '</li>';
    }
    echo '</ul>';
}

function yes_pb_guidelines_shortcode() {
    $data = yes_pb_guidelines_data();
    if (!$data) {
        return '<p class="yes-bridge">Competition guidelines will be available shortly.</p>';
    }
    $source = $data['source'];
    $pending_clarifications = array_filter($source['clarificationItems'], function ($item) { return empty($item['resolved']); });
    $confirmed_clarifications = array_filter($source['clarificationItems'], function ($item) { return !empty($item['resolved']); });
    ob_start();
    ?>
    <section class="yes-bridge yes-bridge--guidelines" aria-label="2027 competition guidelines">
        <h2><?php echo esc_html($source['title']); ?></h2>
        <p class="yes-bridge__theme"><?php echo esc_html($source['theme']); ?></p>
        <?php echo yes_pb_window_notice(); ?>
        <?php echo yes_pb_pdf_link(); ?>
        <h3>Before you begin</h3>
        <?php yes_pb_text_list($source['generalRules']); ?>
        <p>Submission title: <code><?php echo esc_html($source['titlePattern']); ?></code></p>
        <div class="yes-bridge__guidelines">
            <?php foreach ($data['competitions'] as $competition) : ?>
                <details class="yes-bridge__details">
                    <summary><span><?php echo esc_html($competition['title']); ?></span><small><?php echo esc_html($competition['classLabel']); ?></small></summary>
                    <div class="yes-bridge__details-body">
                        <p><?php echo esc_html($competition['description']); ?></p>
                        <p><?php echo esc_html($competition['participationLabel']); ?><?php if ($competition['languages']) { echo ' · ' . esc_html(implode(' / ', $competition['languages'])); } ?></p>
                        <?php if (isset($competition['wordRange'])) : ?>
                            <p>Word count: <?php echo esc_html($competition['wordRange']['min'] . '–' . $competition['wordRange']['max']); ?></p>
                        <?php endif; ?>
                        <?php foreach ($competition['classTopics'] as $group) : ?>
                            <h4><?php echo esc_html($group['classLabel']); ?> topics</h4>
                            <?php foreach ($group['topics'] as $topic) : ?>
                                <h5><?php echo esc_html($topic['title']); ?></h5><p><?php echo esc_html($topic['prompt']); ?></p>
                                <?php if (!empty($topic['references'])) : ?><ul>
                                    <?php foreach ($topic['references'] as $reference) : ?><li><a href="<?php echo esc_url($reference['url'], array('https', 'http')); ?>"><?php echo esc_html($reference['title']); ?></a></li><?php endforeach; ?>
                                </ul><?php endif; ?>
                            <?php endforeach; ?>
                        <?php endforeach; ?>
                        <h4>What to submit</h4><ul>
                            <?php foreach ($competition['fileRequirements'] as $file) : ?><li><strong><?php echo esc_html($file['title']); ?>:</strong> <?php echo esc_html($file['fileLabel']); ?></li><?php endforeach; ?>
                        </ul>
                        <?php yes_pb_text_list($competition['notes']); ?>
                        <h4>Recognition and opportunities</h4>
                        <?php yes_pb_text_list($competition['rewards']); ?>
                        <h4>Judging criteria</h4><ul>
                            <?php foreach ($competition['rubric']['criteria'] as $criterion) : ?><li><?php echo esc_html($criterion['title'] . ': ' . $criterion['marks'] . ' marks'); ?></li><?php endforeach; ?>
                        </ul>
                        <p>Published criteria total: <?php echo esc_html($competition['rubric']['total']); ?> marks.</p>
                        <?php if ($competition['rubric']['penalties']) : ?><h5>Judging deductions</h5><ul>
                            <?php foreach ($competition['rubric']['penalties'] as $penalty) : ?><li><?php echo esc_html($penalty['title'] . ': ' . $penalty['marks'] . ' marks'); ?></li><?php endforeach; ?>
                        </ul><?php endif; ?>
                        <?php yes_pb_text_list($competition['rubric']['notes']); ?>
                    </div>
                </details>
            <?php endforeach; ?>
        </div>
        <?php if ($confirmed_clarifications) : ?>
            <details class="yes-bridge__details yes-bridge__clarifications"><summary>Confirmed updates to the original PDF</summary><div class="yes-bridge__details-body"><ul>
                <?php foreach ($confirmed_clarifications as $item) : ?><li><?php echo esc_html($item['detail']); ?></li><?php endforeach; ?>
            </ul></div></details>
        <?php endif; ?>
        <?php if ($pending_clarifications) : ?>
            <details class="yes-bridge__details yes-bridge__clarifications"><summary>Points awaiting organiser confirmation</summary><div class="yes-bridge__details-body"><ul>
                <?php foreach ($pending_clarifications as $item) : ?><li><?php echo esc_html($item['detail']); ?></li><?php endforeach; ?>
            </ul></div></details>
        <?php endif; ?>
    </section>
    <?php
    return ob_get_clean();
}

function yes_pb_register_shortcodes() {
    add_shortcode('yes_participation', 'yes_pb_participation_shortcode');
    add_shortcode('yes_guidelines', 'yes_pb_guidelines_shortcode');
}
add_action('init', 'yes_pb_register_shortcodes');
