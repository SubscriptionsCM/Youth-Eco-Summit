<?php
/**
 * Plugin Name: Youth Eco Summit WordPress Portal
 * Description: Connects the Youth Eco Summit frontend to the existing WordPress accounts and Forminator registrations, with saved steps and programme guidance.
 * Version: 1.4.1
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Compactum Media
 */
if (!defined('ABSPATH')) { exit; }
define('YES_NATIVE_VERSION', '1.4.1');
require_once __DIR__ . '/includes/school-catalog.php';
require_once __DIR__ . '/includes/entry-participation.php';
require_once __DIR__ . '/includes/school-combobox.php';
require_once __DIR__ . '/includes/entry-ux.php';
require_once __DIR__ . '/includes/challenge-journey.php';
require_once __DIR__ . '/includes/entry-submission.php';
require_once __DIR__ . '/includes/entry-role-flow.php';

/** Forminator 1.53.1 creates draft_id as VARCHAR(12). Extend only this
 * supported column, preserving existing rows and indexes, before long tokens
 * are used. Deployment/activation invokes this, never a public request. */
function yes_native_ensure_draft_schema() {
    global $wpdb;
    if (!class_exists('Forminator_Database_Tables')) { return new WP_Error('yes_forminator_missing', 'Forminator must be active before preparing saved forms.'); }
    $table = Forminator_Database_Tables::get_table_name(Forminator_Database_Tables::FORM_ENTRY);
    if (!$table || !preg_match('/^[A-Za-z0-9_]+$/', $table)) { return new WP_Error('yes_draft_table', 'Unable to verify the Forminator draft table.'); }
    $column = $wpdb->get_row("SHOW FULL COLUMNS FROM `{$table}` LIKE 'draft_id'", ARRAY_A);
    if (!$column || !preg_match('/^varchar\((\d+)\)$/i', $column['Type'], $match)) { return new WP_Error('yes_draft_schema', 'The draft ID column uses an unsupported schema; no change was made.'); }
    if ((int) $match[1] >= 64) { return array('changed' => false, 'length' => (int) $match[1]); }
    if ($column['Null'] !== 'YES' || $column['Default'] !== null || !empty($column['Extra'])) { return new WP_Error('yes_draft_schema', 'The draft ID column has unexpected constraints; no change was made.'); }
    $collation = !empty($column['Collation']) && preg_match('/^[A-Za-z0-9_]+$/', $column['Collation']) ? ' COLLATE ' . $column['Collation'] : '';
    $result = $wpdb->query("ALTER TABLE `{$table}` MODIFY COLUMN `draft_id` VARCHAR(64){$collation} NULL DEFAULT NULL");
    if ($result === false) { return new WP_Error('yes_draft_upgrade', 'Unable to extend draft ID storage. Saved forms must not be enabled until this is resolved.'); }
    $verified = $wpdb->get_row("SHOW COLUMNS FROM `{$table}` LIKE 'draft_id'", ARRAY_A);
    if (!$verified || !preg_match('/^varchar\((\d+)\)$/i', $verified['Type'], $checked) || (int) $checked[1] < 64) { return new WP_Error('yes_draft_upgrade', 'The draft ID storage upgrade could not be verified.'); }
    update_option('yes_native_draft_schema', 64, false);
    return array('changed' => true, 'length' => (int) $checked[1]);
}
function yes_native_activate() {
    $result = yes_native_ensure_draft_schema();
    if (is_wp_error($result)) { wp_die(esc_html($result->get_error_message())); }
}
register_activation_hook(__FILE__, 'yes_native_activate');

function yes_native_config() {
    return array_merge(array(
        'student' => 48441, 'teacher' => 48437, 'school' => 9188,
        'partner' => 9213, 'nomination' => 8916,
        'login' => 0, 'account' => 0, 'privacy' => 0, 'terms' => 0, 'contact' => 0,
        'entry_forms' => array(), 'entries_enabled' => false,
    ), (array) get_option('yes_native_portal', array()));
}

function yes_native_guidelines() {
    static $data;
    if ($data === null) {
        $path = __DIR__ . '/data/guidelines-2027.json';
        $data = is_readable($path) ? json_decode(file_get_contents($path), true) : array();
        if (!is_array($data)) { $data = array(); }
    }
    return $data;
}

function yes_native_form_ids() {
    $c = yes_native_config();
    return array_values(array_unique(array_filter(array_merge(array_map('intval', array($c['student'], $c['teacher'], $c['school'], $c['partner'], $c['nomination'])), array_map('intval', (array) $c['entry_forms'])))));
}

/** These are Forminator's own documented draft settings; account/OTP settings are untouched. */
function yes_native_form_settings($settings, $model) {
    if (!in_array((int) $model->id, yes_native_form_ids(), true)) { return $settings; }
    $settings['use_save_and_continue'] = 'true';
    $c = yes_native_config();
    $settings['sc_permission'] = in_array((int) $model->id, array_map('intval', (array) $c['entry_forms']), true) ? 'registered' : 'public';
    $settings['sc_link_text'] = 'Save and continue later';
    $settings['sc_draft_retention'] = '60';
    $settings['sc_email_link'] = 'true';
    $settings['sc_message'] = '<p>Your progress is saved for {retention_period} days. Copy the link to continue your form later, or email it to yourself. Keep this link private. Passwords, verification codes, uploads and consent must be entered again when you return.</p>';
    return $settings;
}
add_filter('forminator_form_settings', 'yes_native_form_settings', 20, 2);

/** Plain-language confirmations for Forminator's saved-form email dialog. */
function yes_native_saved_form_wording($translation, $text, $domain) {
    if ($domain !== 'forminator') { return $translation; }
    $messages = array(
        "We've sent the resume form link to your email address. Please check your spam folder if you can't find the link in your inbox." => "We've emailed you a link to continue your form. Check your spam folder if you can't find it in your inbox.",
        "We couldn't send the form resume link to your email at this time. Click on the link below to resend it or manually copy and save the link in a safe place." => "We couldn't email the link to your saved form. Try sending it again, or copy the link and keep it somewhere private."
    );
    return isset($messages[$text]) ? $messages[$text] : $translation;
}
add_filter('gettext_forminator', 'yes_native_saved_form_wording', 20, 3);

/** miniOrange 5.4.9 requires OTP in its errors filter even for partial
 * Forminator drafts. Exempt only the authenticated native draft request;
 * final registration uses the original OTP callback unchanged. */
function yes_native_draft_otp_guard($form_id) {
    $form_id = (int) $form_id;
    if (!in_array($form_id, yes_native_form_ids(), true) || !wp_doing_ajax()) { return; }
    if (!isset($_POST['action'], $_POST['save_draft'], $_POST['forminator_nonce']) || !is_string($_POST['action']) || !is_string($_POST['save_draft']) || !is_string($_POST['forminator_nonce'])) { return; }
    if (wp_unslash($_POST['action']) !== 'forminator_submit_form_custom-forms' || !filter_var(wp_unslash($_POST['save_draft']), FILTER_VALIDATE_BOOLEAN)) { return; }
    if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['forminator_nonce'])), 'forminator_submit_form' . $form_id)) { return; }
    global $wp_filter;
    $tag = 'forminator_custom_form_submit_errors';
    if (empty($wp_filter[$tag]) || !($wp_filter[$tag] instanceof WP_Hook) || empty($wp_filter[$tag]->callbacks[1])) { return; }
    foreach ($wp_filter[$tag]->callbacks[1] as $registered) {
        $callback = $registered['function'];
        if (is_array($callback) && count($callback) === 2 && is_object($callback[0]) && get_class($callback[0]) === 'OTP\\Handler\\Forms\\ForminatorForm' && $callback[1] === 'forminator_custom_form_submit_errors') {
            remove_filter($tag, $callback, 1);
        }
    }
}
// Forminator fires this only after its nonce check, with Save & Continue
// enabled and save_draft=true. The generic/final submit hook is untouched.
add_action('forminator_form_draft_before_save_entry', 'yes_native_draft_otp_guard', 10, 1);

/** Use longer bearer tokens for newly created drafts; existing links stay valid. */
function yes_native_draft_token($token, $form_id) {
    // A guaranteed letter prevents Forminator treating an all-numeric bearer
    // token as a numeric entry ID. Remaining hex digits provide 188 random bits.
    return in_array((int) $form_id, yes_native_form_ids(), true) ? 'a' . substr(bin2hex(random_bytes(24)), 1) : $token;
}
add_filter('forminator_create_draft_id', 'yes_native_draft_token', 10, 2);

/** Native theme routes may not have the old WP page ID. Keep manual/email
 * resume links on the real form route rather than admin-ajax.php. */
function yes_native_draft_response($response, $form_id) {
    if (!in_array((int) $form_id, yes_native_form_ids(), true) || empty($response['draft_id']) || empty($response['message'])) { return $response; }
    $stored = new Forminator_Form_Entry_Model($response['draft_id']);
    if ((int) $stored->form_id !== (int) $form_id || $stored->status !== 'draft' || $stored->draft_id !== $response['draft_id']) {
        // Forminator otherwise wraps this hook's result in an unconditional
        // JSON success, even when its database insert failed. Abort honestly.
        wp_send_json_error(array('success' => false, 'type' => 'save_draft_failed', 'message' => 'Your progress could not be saved. Stay on this page and try saving again. No link to your saved form was created.', 'errors' => array()));
    }
    $c = yes_native_config();
    $paths = array((int) $c['student'] => '/register/', (int) $c['teacher'] => '/teachers/register/', (int) $c['school'] => '/schools/register/', (int) $c['partner'] => '/partners/enquire/', (int) $c['nomination'] => '/schools/nominate/');
    $slug = array_search((int) $form_id, (array) $c['entry_forms'], true);
    $url = $slug !== false ? add_query_arg('competition', $slug, home_url('/competitions/enter/')) : home_url($paths[(int) $form_id] ?? '/register/');
    if ($slug !== false) { $url = add_query_arg(yes_native_entry_draft_context($stored), $url); }
    $url = add_query_arg('draft', $response['draft_id'], $url);
    $escaped = esc_attr($url);
    $response['message'] = preg_replace_callback('/(<input\b[^>]*class="forminator-draft-link"[^>]*value=")[^"]*(")/i', function ($matches) use ($escaped) { return $matches[1] . $escaped . $matches[2]; }, $response['message']);
    $response['message'] = preg_replace_callback('/(<input\b[^>]*name="draft_link"[^>]*value=")[^"]*(")/i', function ($matches) use ($escaped) { return $matches[1] . $escaped . $matches[2]; }, $response['message']);
    return $response;
}
add_filter('forminator_form_save_draft_response', 'yes_native_draft_response', 20, 2);

/** Fresh consent must never be restored as an already agreed draft answer. */
function yes_native_exclude_draft_consent($data, $form_id) {
    if (!in_array((int) $form_id, yes_native_form_ids(), true)) { return $data; }
    $draft = isset($_POST['save_draft']) && filter_var(wp_unslash($_POST['save_draft']), FILTER_VALIDATE_BOOLEAN);
    if ($draft) {
        $data = array_values(array_filter($data, function ($item) { return !isset($item['name']) || !preg_match('/^(consent-|password-)/', $item['name']); }));
    } else {
        $c = yes_native_config();
        if ((int) $form_id === (int) $c['school']) {
            global $yes_native_pending_school_id;
            $yes_native_pending_school_id = 'YES-SCH-' . strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
            $data[] = array('name' => '_yes_school_id', 'value' => $yes_native_pending_school_id);
        }
        if (is_user_logged_in()) { $data[] = array('name' => '_yes_owner_user_id', 'value' => get_current_user_id()); }
    }
    return $data;
}
add_filter('forminator_custom_form_submit_field_data', 'yes_native_exclude_draft_consent', 20, 2);

function yes_native_window_open($now = null) {
    $d = yes_native_guidelines();
    if (empty($d['participationWindow'])) { return false; }
    $w = $d['participationWindow'];
    $now = $now === null ? time() : (int) $now;
    return $now >= (int) $w['opensAtEpoch'] && $now < (int) $w['closesAtEpoch'];
}

/** Enforce the confirmed cutoff at the native backend, including direct AJAX submissions. */
function yes_native_submission_errors($errors, $form_id, $field_data) {
    $c = yes_native_config();
    $form_id = (int) $form_id;
    $draft = isset($_POST['save_draft']) && filter_var(wp_unslash($_POST['save_draft']), FILTER_VALIDATE_BOOLEAN);
    if (in_array($form_id, yes_native_form_ids(), true) && !empty($_POST['previous_draft_id'])) {
        $token = sanitize_text_field(wp_unslash($_POST['previous_draft_id']));
        $previous = new Forminator_Form_Entry_Model($token);
        // Forminator checks twice: after the first check it converts the draft to an active entry.
        $validated_key = $form_id . ':' . $token;
        if (empty($GLOBALS['yes_native_validated_drafts'][$validated_key]) && ((int) $previous->form_id !== $form_id || $previous->status !== 'draft')) {
            $errors[] = array('yes-draft' => 'This saved form has expired or belongs to a different form. Open the link to the correct saved form, or start a new form.');
        } else {
            $GLOBALS['yes_native_validated_drafts'][$validated_key] = true;
        }
    }
    if ($draft) { return $errors; }
    $entry_slug = array_search($form_id, (array) $c['entry_forms'], true);
    if (($form_id === (int) $c['student'] || $entry_slug !== false) && !yes_native_window_open()) {
        $errors[] = array('yes-participation-window' => 'Student registrations and competition entries close on 5 November 2026, 11:59 p.m. IST. School and educator registrations remain available.');
    }
    if ($form_id === (int) $c['student']) {
        $values = array(); foreach ($field_data as $field) { $values[$field['name']] = $field['value']; }
        if (!isset($values['select-yes-class']) || !in_array((int) $values['select-yes-class'], range(5, 12), true)) { $errors[] = array('select-yes-class' => 'Choose a class from 5 to 12.'); }
        if (($values['select-2'] ?? '') === 'Other (Not listed)') { $errors[] = array('select-2' => 'Your school must be nominated and added to the school list before student registration. Ask your school coordinator or use the school nomination page. Your draft can be saved while this is reviewed.'); }
    }
    $other_fields = array((int) $c['student'] => array('select-2', 'text-4', 'Other (Not listed)'), (int) $c['teacher'] => array('select-3', 'text-10', 'Other (Not listed)'), (int) $c['school'] => array('select-1', 'text-1', 'Others'));
    if (isset($other_fields[$form_id])) {
        $values = array(); foreach ($field_data as $field) { $values[$field['name']] = $field['value']; }
        $other = $other_fields[$form_id];
        if (($values[$other[0]] ?? '') === $other[2] && trim((string) ($values[$other[1]] ?? '')) === '') { $errors[] = array($other[1] => 'Enter the full school name and branch when your school is not listed.'); }
    }
    if ($entry_slug !== false) {
        if (!is_user_logged_in()) { $errors[] = array('yes-account' => 'Sign in to your WordPress participant account before submitting an entry.'); }
        if (empty($c['entries_enabled'])) { $errors[] = array('yes-approval' => 'The 2027 entry forms are being prepared for final programme approval. You can save a draft; final submission is not enabled yet.'); }
    }
    return $errors;
}
add_filter('forminator_custom_form_submit_errors', 'yes_native_submission_errors', 20, 3);

/** miniOrange may replace Forminator's message with the first errors item,
 * which can be an array. Normalize it so visitors always receive useful text. */
function yes_native_submission_response($response, $form_id) {
    if (!in_array((int) $form_id, yes_native_form_ids(), true)) { return $response; }
    if (!empty($response['success'])) {
        $c = yes_native_config();
        global $yes_native_pending_school_id;
        if ((int) $form_id === (int) $c['school'] && !empty($yes_native_pending_school_id)) {
            $response['message'] = '<p><strong>School registration received.</strong></p><p>Your permanent school ID is <strong>' . esc_html($yes_native_pending_school_id) . '</strong>. Keep this ID for student registration and competition submissions.</p>';
        }
        return $response;
    }
    if (isset($response['message']) && is_string($response['message']) && trim(wp_strip_all_tags($response['message'])) !== '') {
        return $response;
    }

    $messages = array();
    $collect = function ($value) use (&$collect, &$messages) {
        if (is_string($value)) {
            $text = trim(preg_replace('/\s+/', ' ', wp_strip_all_tags($value)));
            if ($text !== '' && !in_array($text, $messages, true)) { $messages[] = $text; }
            return;
        }
        if (is_array($value)) {
            foreach ($value as $item) { $collect($item); }
        }
    };
    $collect($response['errors'] ?? array());
    $message = implode(' ', array_slice($messages, 0, 4));
    if (preg_match('/(?:email|account|username).*(?:already|exist|registered)|(?:already|exist|registered).*(?:email|account|username)/i', $message)) {
        $message = 'An account already exists with these details. Sign in instead, or register with a different email address and username.';
    }
    $response['message'] = $message !== '' ? $message : 'Registration could not be completed. Check the highlighted fields and verify your mobile number, then try again.';
    return $response;
}
add_filter('forminator_form_ajax_submit_response', 'yes_native_submission_response', 100, 2);
function yes_native_enqueue_assets() {
    wp_enqueue_style('yes-native-portal', plugins_url('assets/portal.css', __FILE__), array(), YES_NATIVE_VERSION);
    wp_enqueue_script('yes-native-school-search', plugins_url('assets/school-search.js', __FILE__), array(), YES_NATIVE_VERSION, true);
    wp_enqueue_style('yes-native-portal-school-combobox', plugins_url('assets/school-combobox.css', __FILE__), array('yes-native-portal'), YES_NATIVE_VERSION);
    wp_enqueue_script('yes-native-portal-school-combobox', plugins_url('assets/school-combobox.js', __FILE__), array('jquery'), YES_NATIVE_VERSION, true);
    wp_localize_script('yes-native-portal-school-combobox', 'YESSchoolPicker', array('url' => rest_url('yes/v1/public/schools')));
    wp_enqueue_script('yes-native-portal', plugins_url('assets/portal.js', __FILE__), array('jquery', 'yes-native-school-search'), YES_NATIVE_VERSION, true);
    wp_localize_script('yes-native-portal', 'YESNative', array(
        'draftExcludeFields' => array('consent-1', 'consent-yes-originality', 'consent-yes-registration', 'password-1'),
        'schoolSearchUrl' => rest_url('yes/v1/public/schools'),
    ));
}

function yes_native_notice($student = false) {
    $start = $student ? '<p><strong>Student registration</strong></p><p>First, check if your school is registered. <a href="' . esc_url(home_url('/schools/')) . '">Find your school and permanent school ID</a>, then complete this registration.</p><p><strong>Student registrations close 5 November 2026, 11:59 p.m. IST.</strong></p>' : '';
    return '<div class="yes-native__notice">' . $start . '<p>Saved at each step. Keep the link to your saved form private.</p><details class="yes-native__returning"><summary>Returning later?</summary><p>Copy the link to your saved form before leaving. Use it to continue your form later. Passwords, uploads, verification codes and consent must be entered again when you return.</p></details></div>';
}
function yes_native_form_markup($id) {
    if (!$id || !class_exists('Forminator_API') || get_post_status((int) $id) !== 'publish') {
        return '<div class="yes-native__notice"><p>This form is temporarily unavailable. Please contact the Youth Eco Summit team.</p></div>';
    }
    $school_class = (int) $id === (int) yes_native_config()['school'] ? ' yes-native__card--school' : '';
    $markup = do_shortcode('[forminator_form id="' . (int) $id . '"]');

    // miniOrange labels the OTP input by its name instead of its generated ID.
    $otp_id = 'mo_verify_otp_phone' . (int) $id;
    $markup = str_replace('for="mo_verify_otp"', 'for="' . esc_attr($otp_id) . '"', $markup);

    // Forminator renders a multi-select group heading as a label for a missing
    // single control. Keep it as the group's accessible aria-labelledby target.
    $markup = preg_replace_callback(
        '~<label\s+for="([^"]+)"\s+id="([^"]+)"\s+class="forminator-label">(.*?)</label>(\s*<div\s+class="forminator-multiselect"\s+aria-labelledby="\2">)~s',
        function ($matches) {
            return '<div id="' . esc_attr($matches[2]) . '" class="forminator-label">' . $matches[3] . '</div>' . $matches[4];
        },
        $markup
    );

    return '<div class="yes-native__card' . $school_class . '">' . $markup . '</div>';
}

function yes_native_page($title, $intro, $body, $eyebrow = 'Youth Eco Summit') {
    return '<section class="yes-native"><p class="yes-native__eyebrow">' . esc_html($eyebrow) . '</p><h1>' . esc_html($title) . '</h1>' . ($intro ? '<p class="yes-native__intro">' . esc_html($intro) . '</p>' : '') . $body . '</section>';
}

/** Imported schools are completed educator registrations from the shared 2027 sheet. */
function yes_native_imported_school_choices() {
    static $schools;
    if ($schools !== null) { return $schools; }
    $path = __DIR__ . '/data/schools-2027.json';
    $schools = is_readable($path) ? json_decode(file_get_contents($path), true) : array();
    return is_array($schools) ? $schools : array();
}

/** Completed school registrations and imported educator registrations are public. */
function yes_native_school_choices() {
    global $wpdb;
    $c = yes_native_config();
    $entries = $wpdb->prefix . 'frmt_form_entry'; $meta = $wpdb->prefix . 'frmt_form_entry_meta';
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT e.entry_id, m.meta_key, m.meta_value FROM {$entries} e LEFT JOIN {$meta} m ON m.entry_id=e.entry_id AND m.meta_key IN ('select-1','text-1','_yes_school_id') WHERE e.form_id=%d AND e.status='active' ORDER BY e.entry_id ASC",
        (int) $c['school']
    ), ARRAY_A);
    $grouped = array();
    foreach ((array) $rows as $row) {
        $entry_id = (int) $row['entry_id'];
        if (!isset($grouped[$entry_id])) { $grouped[$entry_id] = array(); }
        $grouped[$entry_id][$row['meta_key']] = maybe_unserialize($row['meta_value']);
    }
    $out = array();
    foreach ($grouped as $fields) {
        $listed = trim(wp_strip_all_tags((string) ($fields['select-1'] ?? '')));
        $other = trim(wp_strip_all_tags((string) ($fields['text-1'] ?? '')));
        $name = preg_match('/^other/i', $listed) && $other !== '' ? $other : $listed;
        $reference = strtoupper(trim((string) ($fields['_yes_school_id'] ?? '')));
        if ($name === '' || !yes_native_school_label_safe($name) || !preg_match('/^YES-SCH-[A-Z0-9-]{3,20}$/', $reference)) { continue; }
        $out[] = array('id'=>$reference,'name'=>$name,'reference'=>$reference,'address'=>'','city'=>'','state'=>'','postal_code'=>'','legacy_ids'=>array());
    }
    return yes_native_merge_school_catalog($out, yes_native_imported_school_choices());
}
function yes_native_find_school_by_id($school_id) {
    $school_id = strtoupper(trim((string) $school_id));
    if (!preg_match('/^(?:YES-SCH|YEC-EDU)-[A-Z0-9-]{3,20}$/', $school_id)) { return null; }
    foreach (yes_native_school_choices() as $school) {
        if (hash_equals($school['reference'], $school_id)) { return $school; }
        foreach ((array) ($school['legacy_ids'] ?? array()) as $legacy_id) { if (hash_equals($legacy_id, $school_id)) { return $school; } }
    }
    return null;
}
function yes_native_school_label_safe($label) {
    $label = wp_strip_all_tags((string) $label);
    return !preg_match('/(?:\+?\d[\s().-]*){9,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $label) && !preg_match('/^(?:city\s*(?:name|:)|nodal\b|phone\b|mobile\b|शहर\s*का\s*नाम|सिटी\s*नोडल|दूरभाष)/iu', $label);
}

function yes_native_school_directory() {
    $query = isset($_GET['q']) ? sanitize_text_field(wp_unslash($_GET['q'])) : '';
    $choices = yes_native_school_choices();
    if ($query !== '') {
        $needle = strtolower(trim($query));
        $choices = array_values(array_filter($choices, function ($choice) use ($needle) { return yes_native_school_matches($choice, $needle); }));
    }
    $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
    $total = count($choices); $shown = array_slice($choices, ($page - 1) * 30, 30);
    ob_start(); ?>
    <div class="yes-native__notice"><p><strong>Student registration starts here.</strong> First, check if your school is registered and copy its permanent school ID. Then complete the student registration form.</p></div>
    <form method="get" class="yes-native__school-search" data-school-search-form><label for="yes-school-search">School name or permanent school ID</label><div class="yes-native__combobox"><input id="yes-school-search" name="q" value="<?php echo esc_attr($query); ?>" type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="yes-school-suggestions" aria-describedby="yes-school-search-help" data-school-search-input><div id="yes-school-suggestions" class="yes-native__suggestions" role="listbox" hidden data-school-suggestions></div></div><button class="yes-native__button" type="submit">Find school</button><p id="yes-school-search-help" class="yes-native__search-help">Start typing a school name. Choose a suggestion to view its permanent school ID.</p><p class="yes-native__search-status" role="status" aria-live="polite" data-school-search-status></p></form>
    <p><?php echo esc_html($total); ?> registered schools found.</p><?php if ($total === 0) : ?><div class="yes-native__notice"><p>No registered school matched your search. Check the spelling or nominate your school.</p></div><?php else : ?><div class="yes-native__table"><table><thead><tr><th scope="col">School name</th><th scope="col">Location</th><th scope="col">Permanent school ID</th></tr></thead><tbody><?php foreach ($shown as $school) : ?><tr><td><?php echo esc_html($school['name']); ?></td><td><?php echo esc_html(implode(', ', array_filter(array($school['city'], $school['state'])))); ?></td><td><strong><?php echo esc_html($school['reference']); ?></strong></td></tr><?php endforeach; ?></tbody></table></div><?php endif; ?>
    <nav class="yes-native__actions" aria-label="School list pages"><?php if ($page > 1) : ?><a class="secondary" href="<?php echo esc_url(add_query_arg(array('q'=>$query,'page'=>$page-1),home_url('/schools/'))); ?>">Previous</a><?php endif; ?><?php if ($page*30<$total) : ?><a class="secondary" href="<?php echo esc_url(add_query_arg(array('q'=>$query,'page'=>$page+1),home_url('/schools/'))); ?>">Next</a><?php endif; ?></nav>
    <div class="yes-native__actions"><a href="<?php echo esc_url(home_url('/register/')); ?>">Complete student registration</a><a class="secondary" href="<?php echo esc_url(home_url('/schools/register/')); ?>">Register a school</a><a class="secondary" href="<?php echo esc_url(home_url('/schools/nominate/')); ?>">Nominate your school</a></div>
    <?php return ob_get_clean();
}
function yes_native_render_page($path) {
    $path = '/' . trim((string) $path, '/'); $c = yes_native_config();
    $forms = array(
        '/register' => array('student', 'Student registration', 'First, find your registered school and permanent school ID. Then complete the student registration with your guardian’s contact information.'),
        '/teachers/register' => array('teacher', 'Educator registration', 'Create your educator account and share your school’s participation interests.'),
        '/schools/register' => array('school', 'School registration', 'Search the school list first, then provide your school’s location and coordinator details.'),
        '/schools/nominate' => array('nomination', 'Nominate your school', 'Share your school’s details so the Youth Eco Summit team can follow up.'),
        '/partners/enquire' => array('partner', 'Partner with Youth Eco Summit', 'Tell us about your organisation and how you would like to get involved.'),
        '/partner-enquiry' => array('partner', 'Partner with Youth Eco Summit', 'Tell us about your organisation and how you would like to get involved.'),
    );
    if (isset($forms[$path])) {
        $f = $forms[$path]; yes_native_enqueue_assets();
        if (in_array($f[0], array('student', 'teacher'), true) && is_user_logged_in()) { return yes_native_registered_next_page(); }
        if (in_array($f[0], array('student','teacher'), true) && yes_native_entry_registration_context()) { return yes_native_entry_registration_page(); }
        return yes_native_page($f[1], $f[2], yes_native_notice($f[0] === 'student') . yes_native_form_markup((int) $c[$f[0]]));
    }
    if ($path === '/schools') { yes_native_enqueue_assets(); return yes_native_page('Find your school', 'Search names in the existing registration list.', yes_native_school_directory()); }
    if ($path === '/login') {
        yes_native_enqueue_assets();
        return yes_native_entry_login_page();
    }
    if (in_array($path, array('/dashboard', '/schools/dashboard', '/judge', '/admin'), true)) {
        yes_native_enqueue_assets();
        if (!is_user_logged_in()) { return yes_native_page('Your account', 'Sign in to manage your participation.', '<div class="yes-native__actions"><a href="' . esc_url(home_url('/login/')) . '">Sign in</a></div>'); }
        if (current_user_can('manage_options')) { return yes_native_page('Youth Eco Summit administration', 'Registrations remain in the existing WordPress backend.', '<div class="yes-native__actions"><a href="' . esc_url(admin_url('admin.php?page=forminator-entries')) . '">Review registrations and entries</a><a class="secondary" href="' . esc_url(admin_url('users.php')) . '">Manage participant accounts</a><a class="secondary" href="' . esc_url(admin_url('admin.php?page=forminator-cform')) . '">Manage forms</a></div>' . yes_native_entry_account_list()); }
        return yes_native_page('Your Youth Eco Summit account', 'You’re signed in as ' . wp_get_current_user()->display_name . '.', '<div class="yes-native__actions"><a href="' . esc_url(home_url('/competitions/enter/')) . '">Competition entries</a><a class="secondary" href="' . esc_url(home_url('/schools/')) . '">Find your school</a><a class="secondary" href="' . esc_url(wp_logout_url(home_url('/login/'))) . '">Sign out</a></div><p>To continue an unfinished form, use its saved link or select it below.</p>' . yes_native_entry_account_list());
    }
    if ($path === '/competitions/enter' || strpos($path, '/entries/') === 0) {
        yes_native_enqueue_assets(); return yes_native_render_entry_hub();
    }
    return null;
}

function yes_native_render_entry_hub() {
    return yes_native_entry_hub();
}

/** Existing published WP policy content only; no new legal or consent language is invented. */
function yes_native_content($key) {
    $c = yes_native_config(); $post = !empty($c[$key]) ? get_post((int) $c[$key]) : null;
    if (!$post) { $post = get_page_by_path($key === 'privacy' ? 'privacy-policy' : ($key === 'terms' ? 'terms-and-conditions' : 'contact-us')); }
    if (!$post || $post->post_status !== 'publish') { return null; }
    $body = trim(wp_strip_all_tags($post->post_content));
    if (!$body) { return null; }
    return array('key' => $key, 'slug' => $key, 'title' => $post->post_title, 'body' => $body);
}

function yes_native_api_response($route) {
    $route = '/' . trim($route, '/');
    if ($route === '/auth/session') {
        $user = wp_get_current_user();
        return array('actor' => $user->exists() ? array('id' => (string) $user->ID, 'role' => current_user_can('manage_options') ? 'admin' : 'participant', 'name' => $user->display_name) : null);
    }
    if ($route === '/public/config') {
        $content = array(); foreach (array('privacy', 'terms', 'contact') as $key) { $item = yes_native_content($key); if ($item) { $content[] = $item; } }
        return array('configured' => true, 'editions' => array(), 'competitions' => array(), 'content' => $content);
    }
    if ($route === '/public/showcase') { return array('items' => array(), 'total' => 0, 'page' => 1, 'pageSize' => 25); }
    if ($route === '/public/schools') {
        $q = isset($_GET['name']) ? sanitize_text_field(wp_unslash($_GET['name'])) : (isset($_GET['q']) ? sanitize_text_field(wp_unslash($_GET['q'])) : '');
        $schools = yes_native_school_choices(); if ($q) { $schools = array_values(array_filter($schools, function ($school) use ($q) { return yes_native_school_matches($school, $q); })); }
        $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
        $page_size = isset($_GET['limit']) ? min(20, max(1, (int) $_GET['limit'])) : 25;
        return array('items' => array_slice($schools, ($page - 1) * $page_size, $page_size), 'total' => count($schools), 'page' => $page, 'pageSize' => $page_size);
    }
    return null;
}

function yes_native_register_rest() {
    foreach (array('auth/session', 'public/config', 'public/schools', 'public/showcase') as $route) {
        register_rest_route('yes/v1', '/' . $route, array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function ($request) use ($route) { $response = rest_ensure_response(array('data' => yes_native_api_response('/' . $route))); $response->header('Cache-Control', 'private, no-store'); return $response; }));
    }
    register_rest_route('yes/v1', '/auth/logout', array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => function () { wp_logout(); $response = rest_ensure_response(array('data' => array('signedOut' => true))); $response->header('Cache-Control', 'private, no-store'); return $response; }));
}
add_action('rest_api_init', 'yes_native_register_rest');

require_once __DIR__ . '/prepare.php';

require_once __DIR__ . '/includes/india-state-select.php';
