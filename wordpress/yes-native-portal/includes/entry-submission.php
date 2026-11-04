<?php
/** Native competition submissions with private files and server-side guideline checks. */
if (!defined('ABSPATH')) { exit; }

function yes_native_entry_upload_request() {
    $id = isset($_POST['form_id']) && is_scalar($_POST['form_id']) ? absint($_POST['form_id']) : 0;
    $nonce = isset($_POST['forminator_nonce']) && is_string($_POST['forminator_nonce']) ? sanitize_text_field(wp_unslash($_POST['forminator_nonce'])) : '';
    return $id && yes_native_entry_competition($id) && is_user_logged_in() && wp_verify_nonce($nonce, 'forminator_submit_form' . $id) ? $id : 0;
}
function yes_native_entry_private_root() {
    $root = realpath((string) get_option('yes_native_private_upload_root', ''));
    $web = realpath(ABSPATH);
    return $root && $web && strpos($root . '/', $web . '/') !== 0 && is_dir($root) && is_writable($root) ? $root : false;
}
function yes_native_entry_upload_directory($dir) {
    if (!yes_native_entry_upload_request()) { return $dir; }
    $root = yes_native_entry_private_root();
    if (!$root) { $dir['error'] = 'Private competition file storage is unavailable.'; return $dir; }
    $owner = get_current_user_id();
    $dir['basedir'] = $root . '/' . $owner;
    $dir['baseurl'] = home_url('/yes-entry-files/' . $owner);
    $dir['path'] = $dir['basedir']; $dir['url'] = $dir['baseurl']; $dir['subdir'] = '';
    return $dir;
}
add_filter('upload_dir', 'yes_native_entry_upload_directory', 30);

function yes_native_entry_file_access($owner, $viewer = null) {
    $viewer = $viewer === null ? get_current_user_id() : (int) $viewer;
    return $viewer > 0 && ($viewer === (int) $owner || user_can($viewer, 'manage_options'));
}
function yes_native_entry_download() {
    $path = rawurldecode((string) wp_parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH));
    if (strpos($path, '/yes-entry-files/') !== 0) { return; }
    nocache_headers(); header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: no-referrer');
    if (!preg_match('#^/yes-entry-files/([1-9][0-9]*)/(forminator/[^\x00]+)$#D', $path, $match) || strpos($path, '..') !== false || !yes_native_entry_file_access((int) $match[1])) { status_header(403); exit('Sign in with the account that submitted this file.'); }
    $root = yes_native_entry_private_root();
    $base = $root ? realpath($root . '/' . (int) $match[1]) : false;
    $file = $base ? realpath($base . '/' . $match[2]) : false;
    $types = array('pdf' => 'application/pdf', 'mp4' => 'video/mp4', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg');
    $extension = $file ? strtolower(pathinfo($file, PATHINFO_EXTENSION)) : '';
    if (!$file || strpos($file, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($file) || !isset($types[$extension])) { status_header(404); exit('File not found.'); }
    status_header(200); header('Content-Type: ' . $types[$extension]); header('Content-Length: ' . filesize($file));
    header('Content-Disposition: attachment; filename="' . sanitize_file_name(basename($file)) . '"');
    readfile($file); exit;
}
add_action('template_redirect', 'yes_native_entry_download', -20);

function yes_native_entry_validate_file($file, $rule, $competition) {
    $path = $file['tmp_name'] ?? '';
    if (!$path || !is_file($path) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { return 'Attach a readable file.'; }
    $size = filesize($path);
    if (!$size || $size > (int) $rule['maxBytes']) { return 'This file must match the size limit: ' . $rule['fileLabel'] . '.'; }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    if (!in_array($mime, $rule['types'], true)) { return 'Use the required format: ' . $rule['fileLabel'] . '.'; }
    if ($mime === 'image/jpeg') {
        $image = @getimagesize($path);
        if (!$image || ($image[2] ?? 0) !== IMAGETYPE_JPEG) { return 'Attach a valid JPG/JPEG image.'; }
        if (($rule['orientation'] ?? '') === 'landscape' && $image[0] < $image[1]) { return 'Use a landscape image.'; }
        if (!empty($rule['maxHeight']) && $image[1] > (int) $rule['maxHeight']) { return 'Image height must be no more than ' . (int) $rule['maxHeight'] . ' pixels.'; }
    }
    if ($mime === 'video/mp4') {
        require_once ABSPATH . WPINC . '/ID3/getid3.php';
        $info = (new getID3())->analyze($path);
        if (!empty($info['error']) || empty($info['playtime_seconds']) || empty($info['video']['resolution_x']) || empty($info['video']['resolution_y'])) { return 'Attach a readable MP4 video with a video track.'; }
        if (!empty($rule['duration']['maxSeconds']) && $info['playtime_seconds'] > (int) $rule['duration']['maxSeconds'] + 0.1) { return 'Video duration must be no more than ' . (int) $rule['duration']['maxSeconds'] . ' seconds.'; }
        if (($rule['orientation'] ?? '') === 'landscape' && $info['video']['resolution_x'] < $info['video']['resolution_y']) { return 'Use a landscape video.'; }
        if (!empty($rule['maxHeight']) && $info['video']['resolution_y'] > (int) $rule['maxHeight']) { return 'Video height must be no more than ' . (int) $rule['maxHeight'] . ' pixels.'; }
    }
    if ($mime === 'application/pdf' && !empty($competition['wordRange']) && ($rule['role'] ?? '') === 'written-piece') {
        try {
            require_once __DIR__ . '/../lib/pdf-library/vendor/autoload.php';
            $config = new \Smalot\PdfParser\Config();
            $config->setRetainImageContent(false); $config->setDecodeMemoryLimit(10000000);
            $text = (new \Smalot\PdfParser\Parser(array(), $config))->parseFile($path)->getText();
            $words = preg_split('/\s+/u', trim($text), -1, PREG_SPLIT_NO_EMPTY);
            $count = count(array_filter($words ?: array(), function ($word) { return preg_match('/[\p{L}\p{N}]/u', $word); }));
            if (!$count) { return 'Use a PDF with selectable text so its word count can be checked. Scanned images cannot be counted automatically.'; }
            if ($count < (int) $competition['wordRange']['min'] || $count > (int) $competition['wordRange']['max']) { return 'The PDF contains ' . $count . ' words. This competition requires ' . (int) $competition['wordRange']['min'] . '–' . (int) $competition['wordRange']['max'] . ' words.'; }
        } catch (Throwable $e) { return 'The PDF could not be read. Export an unlocked PDF with selectable text and try again.'; }
    }
    return '';
}

function yes_native_entry_submission_checks($errors, $form_id, $fields) {
    $item = yes_native_entry_competition((int) $form_id);
    if (!$item || yes_native_entry_valid_draft((int) $form_id)) { return $errors; }
    if (!is_user_logged_in()) { $errors[] = array('yes-entry-account' => 'Sign in with your registered account before submitting an entry.'); }
    if (!yes_native_entry_private_root()) { $errors[] = array('yes-entry-storage' => 'File storage is temporarily unavailable. Save your progress and try again later.'); }
    $values = yes_native_entry_values($fields);
    $class = $values['select-yes-class'] ?? '';
    if (!ctype_digit($class) || !in_array((int) $class, $item['classes'], true)) { $errors[] = array('select-yes-class' => 'Choose a class eligible for this competition.'); }
    $topics = array(); foreach ($item['classTopics'] as $band) { if (in_array((int) $class, $band['classes'], true)) { foreach ($band['topics'] as $topic) { $topics[] = $topic['title']; } } }
    if (!in_array($values['select-yes-topic'] ?? '', $topics, true)) { $errors[] = array('select-yes-topic' => 'Choose the published topic for your class.'); }
    if (!empty($item['languages']) && !in_array($values['select-yes-language'] ?? '', $item['languages'], true)) { $errors[] = array('select-yes-language' => 'Choose an allowed language.'); }
    if (!preg_match('/^[\p{L}\p{N}]+(?:_[\p{L}\p{N}]+)+$/uD', $values['text-yes-title'] ?? '')) { $errors[] = array('text-yes-title' => 'Use underscores in the title: SchoolName_Class_Category_ProjectTitle_Authors.'); }
    if (($values['radio-yes-entry-mode'] ?? '') === 'team' && !isset($values['hidden-yes-submitter'])) {
        $names = preg_split('/\R/u', trim($values['textarea-yes-members'] ?? ''), -1, PREG_SPLIT_NO_EMPTY);
        $names = array_map('trim', $names ?: array());
        if (count($names) !== yes_native_entry_count($values['number-yes-team-size'] ?? '') || count(array_unique(array_map('mb_strtolower', $names))) !== count($names)) { $errors[] = array('textarea-yes-members' => 'List each team student once, on a separate line. The number of names must match your team size.'); }
    }
    foreach ($item['fileRequirements'] as $i => $rule) {
        $key = 'upload-yes-' . ($i + 1); $file = $_FILES[$key] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) { if ($rule['required']) { $errors[] = array($key => 'Attach ' . $rule['title'] . '.'); } continue; }
        // The upload is moved between Forminator's two validation passes.
        $validation_key = (int) $form_id . ':' . $key . ':' . ($file['tmp_name'] ?? '');
        $error = !is_file($file['tmp_name'] ?? '') && !empty($GLOBALS['yes_native_validated_files'][$validation_key]) ? '' : yes_native_entry_validate_file($file, $rule, $item);
        if ($error === '') { $GLOBALS['yes_native_validated_files'][$validation_key] = true; }
        if ($error !== '') { $errors[] = array($key => $error); }
    }
    return $errors;
}
add_filter('forminator_custom_form_submit_errors', 'yes_native_entry_submission_checks', 23, 3);

function yes_native_entry_final_upload_guard($allow, $field_name) {
    if (strpos((string) $field_name, 'upload-yes-') !== 0) { return $allow; }
    return $allow && !empty(yes_native_config()['entries_enabled']) && yes_native_entry_upload_request() && yes_native_entry_private_root() && yes_native_window_open();
}
add_filter('forminator_file_upload_allow', 'yes_native_entry_final_upload_guard', 40, 2);

function yes_native_entry_review_meta($fields, $form_id) {
    if (!yes_native_entry_competition($form_id)) { return $fields; }
    $fields[] = array('name' => '_yes_entry_account_id', 'value' => get_current_user_id());
    $fields[] = array('name' => '_yes_entry_review_status', 'value' => yes_native_entry_valid_draft($form_id) ? 'draft' : 'received-for-review');
    $fields[] = array('name' => '_yes_manual_review_required', 'value' => 'Originality, citations, captions where required, content and judging criteria require organizer review.');
    return $fields;
}
add_filter('forminator_custom_form_submit_field_data', 'yes_native_entry_review_meta', 24, 2);

function yes_native_entry_receipt($entry) {
    if (yes_native_entry_competition((int) $entry->form_id) && empty($entry->draft_id)) { $GLOBALS['yes_native_entry_receipt'] = (int) $entry->entry_id; }
}
add_action('forminator_after_handle_form', 'yes_native_entry_receipt');
function yes_native_entry_submission_response($response, $form_id) {
    if (!yes_native_entry_competition($form_id) || empty($response['success']) || !empty($response['draft_id']) || ($response['type'] ?? '') === 'save_draft') { return $response; }
    $receipt = $GLOBALS['yes_native_entry_receipt'] ?? 0;
    $response['message'] = '<p><strong>Your competition entry has been received for review.</strong></p>' . ($receipt ? '<p>Entry reference: YES-ENTRY-' . (int) $receipt . '. Keep this reference.</p>' : '') . '<p>You can enter another eligible competition; your school may have multiple entries.</p><div class="yes-native__actions"><a href="' . esc_url(home_url('/competitions/#challenges')) . '">Choose another challenge</a><a class="secondary" href="' . esc_url(home_url('/dashboard/')) . '">Go to my account</a></div>';
    return $response;
}
add_filter('forminator_form_ajax_submit_response', 'yes_native_entry_submission_response', 120, 2);

function yes_native_prepare_entry_launch() {
    $consent = null;
    $source = Forminator_API::get_form((int) yes_native_config()['student']);
    foreach ($source->get_fields_as_array() as $field) { if (($field['type'] ?? '') === 'consent') { $consent = $field; break; } }
    if (!$consent || empty($consent['consent_description']) || !yes_native_entry_private_root() || !is_file(__DIR__ . '/../lib/pdf-library/vendor/autoload.php')) { return new WP_Error('yes_entry_launch', 'Consent, private storage or PDF validation is missing.'); }
    $result = array();
    foreach (yes_native_config()['entry_forms'] as $slug => $id) {
        $model = Forminator_API::get_form((int) $id); $fields = array();
        foreach ($model->get_fields_as_array() as $field) {
            if (in_array($field['element_id'], array('html-yes-approval', 'consent-yes-registration', 'textarea-yes-members'), true)) { continue; }
            if ($field['element_id'] === 'page-break-yes-work') {
                $fields[] = yes_native_field('textarea-yes-members', 'textarea', 'Names of all team students', array('description' => 'One student per line, including the representative. Every student must belong to the registered school confirmed for this entry.', 'conditions' => array(array('element_id' => 'radio-yes-entry-mode', 'rule' => 'is', 'value' => 'team'))));
            }
            $fields[] = $field;
        }
        $fields[] = yes_native_field('consent-yes-registration', 'consent', $consent['field_label'] ?? 'Consent', array('consent_description' => $consent['consent_description']));
        yes_native_model_fields($model, $fields);
        $model->settings['formName'] = '2027 ' . yes_native_entry_competition((int) $id)['title'] . ' entry';
        $model->settings['thankyou-message'] = '<p>Your competition entry has been received for review.</p>';
        $model->settings['store_submissions'] = '1';
        $model->save(); $result[] = (int) $id;
    }
    return $result;
}

function yes_native_entry_account_list() {
    if (!is_user_logged_in()) { return ''; }
    global $wpdb;
    $entries = Forminator_Database_Tables::get_table_name(Forminator_Database_Tables::FORM_ENTRY);
    $meta = Forminator_Database_Tables::get_table_name(Forminator_Database_Tables::FORM_ENTRY_META);
    $ids = array_map('intval', array_values(yes_native_config()['entry_forms']));
    if (!$ids) { return ''; }
    $rows = $wpdb->get_results($wpdb->prepare("SELECT DISTINCT e.entry_id,e.form_id,e.draft_id,e.date_created FROM {$entries} e JOIN {$meta} m ON m.entry_id=e.entry_id WHERE m.meta_key='_yes_entry_account_id' AND m.meta_value=%s AND e.form_id IN (" . implode(',', $ids) . ") AND e.is_spam=0 ORDER BY e.entry_id DESC LIMIT 30", (string) get_current_user_id()), ARRAY_A);
    $html = '<section class="yes-native__card"><h2>My competition entries</h2><p><a href="' . esc_url(home_url('/competitions/#challenges')) . '">Choose a challenge and start an entry</a></p>';
    if (!$rows) { return $html . '<p>No entry drafts or submissions yet.</p></section>'; }
    $html .= '<ul>';
    foreach ($rows as $row) {
        $item = yes_native_entry_competition((int) $row['form_id']);
        $entry = new Forminator_Form_Entry_Model((int) $row['entry_id']);
        $role = $entry->meta_data['_yes_entry_submitter_role']['value'] ?? 'student';
        $draft = !empty($row['draft_id']);
        $html .= '<li><strong>' . esc_html($item['title']) . '</strong> — ' . ($draft ? 'Saved draft' : 'Received for review · YES-ENTRY-' . (int) $row['entry_id']);
        if ($draft) {
            $entry = new Forminator_Form_Entry_Model((int) $row['entry_id']);
            $query = array_merge(yes_native_entry_draft_context($entry), array('competition' => $item['slug'], 'draft' => $row['draft_id']));
            $html .= ' · <a href="' . esc_url(add_query_arg($query, home_url('/competitions/enter/'))) . '">Continue this entry</a>';
        }
        $html .= '<span class="yes-entry-submission-by">' . esc_html(yes_native_entry_role_label($role)) . '</span></li>';
    }
    return $html . '</ul></section>';
}
