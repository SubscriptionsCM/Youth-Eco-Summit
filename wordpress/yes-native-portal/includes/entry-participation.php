<?php
if (!defined('ABSPATH')) { exit; }

function yes_native_entry_competition($form_id) {
    $slug = array_search((int) $form_id, array_map('intval', (array) yes_native_config()['entry_forms']), true);
    if ($slug === false) { return null; }
    foreach ((array) (yes_native_guidelines()['competitions'] ?? array()) as $item) {
        if ($item['slug'] === $slug) { return $item; }
    }
    return null;
}
function yes_native_entry_values($fields) {
    $values = array();
    foreach ((array) $fields as $field) {
        if (is_array($field) && is_string($field['name'] ?? null) && is_scalar($field['value'] ?? null)) {
            $values[$field['name']] = trim((string) $field['value']);
        }
    }
    return $values;
}
function yes_native_entry_count($value) {
    if (!is_scalar($value)) { return 0; }
    $value = trim((string) $value);
    // PHP integer range is a technical bound, not an invented competition limit.
    if (!preg_match('/^[1-9][0-9]*$/D', $value)) { return 0; }
    $integer = filter_var($value, FILTER_VALIDATE_INT);
    return $integer !== false && $integer >= 2 ? $integer : 0;
}
function yes_native_entry_allows_team($competition) {
    return !empty($competition['team']['allowed']) || get_option('yes_native_entry_team_policy', 'guidelines') === 'all';
}
function yes_native_entry_team_error($competition, $mode, $count) {
    if ($mode !== 'team') { return ''; }
    if ($count < 2) { return 'Enter the number of students in the team, using a whole number of at least 2.'; }
    $team = $competition['team'] ?? array();
    if (!yes_native_entry_allows_team($competition)) { return 'This competition accepts individual entries only. Choose Individual or a competition that allows teams.'; }
    $max = !empty($team['allowed']) ? (int) ($team['maxMembers'] ?? 0) : 0;
    if ($max > 1 && $count > $max) { return 'This competition allows up to ' . $max . ' students per team.'; }
    return '';
}
function yes_native_entry_valid_draft($form_id) {
    return wp_doing_ajax() && isset($_POST['action'], $_POST['save_draft'], $_POST['forminator_nonce']) &&
        is_string($_POST['action']) && is_string($_POST['save_draft']) && is_string($_POST['forminator_nonce']) &&
        wp_unslash($_POST['action']) === 'forminator_submit_form_custom-forms' &&
        filter_var(wp_unslash($_POST['save_draft']), FILTER_VALIDATE_BOOLEAN) &&
        wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['forminator_nonce'])), 'forminator_submit_form' . (int) $form_id);
}
function yes_native_entry_errors($errors, $form_id, $fields) {
    $competition = yes_native_entry_competition($form_id);
    if (!$competition || yes_native_entry_valid_draft($form_id)) { return $errors; }
    $values = yes_native_entry_values($fields);
    $mode = $values['radio-yes-entry-mode'] ?? '';
    if (!in_array($mode, array('individual', 'team'), true)) {
        $errors[] = array('radio-yes-entry-mode' => 'Choose whether you are submitting individually or as a team.');
    } else {
        $team_error = yes_native_entry_team_error($competition, $mode, yes_native_entry_count($values['number-yes-team-size'] ?? ''));
        if ($team_error !== '') { $errors[] = array('number-yes-team-size' => $team_error); }
    }
    $school = yes_native_find_school_by_id($values['text-yes-school-id'] ?? '');
    if (!$school) {
        $errors[] = array('text-yes-school-id' => 'Enter a valid registered school ID. Your school must be registered before you can submit a competition entry.');
    }
    // There is intentionally no quota or duplicate check keyed on school + competition.
    return $errors;
}
add_filter('forminator_custom_form_submit_errors', 'yes_native_entry_errors', 21, 3);

function yes_native_entry_store_identity($fields, $form_id) {
    if (!yes_native_entry_competition($form_id)) { return $fields; }
    $values = yes_native_entry_values($fields);
    $mode = $values['radio-yes-entry-mode'] ?? '';
    $school = yes_native_find_school_by_id($values['text-yes-school-id'] ?? '');
    $meta = array('_yes_entry_mode', '_yes_team_size', '_yes_verified_school_id', '_yes_verified_school_name');
    $fields = array_values(array_filter($fields, function ($field) use ($meta) { return !in_array($field['name'] ?? '', $meta, true); }));
    if (in_array($mode, array('individual', 'team'), true)) {
        $count = $mode === 'individual' ? 1 : yes_native_entry_count($values['number-yes-team-size'] ?? '');
        $fields[] = array('name' => '_yes_entry_mode', 'value' => $mode);
        if ($count) { $fields[] = array('name' => '_yes_team_size', 'value' => $count); }
    }
    if ($school) {
        foreach ($fields as &$field) {
            if (($field['name'] ?? '') === 'text-yes-school-id') { $field['value'] = $school['reference']; }
            if (($field['name'] ?? '') === 'text-yes-school') { $field['value'] = $school['name']; }
        } unset($field);
        $fields[] = array('name' => '_yes_verified_school_id', 'value' => $school['reference']);
        $fields[] = array('name' => '_yes_verified_school_name', 'value' => $school['name']);
    }
    return $fields;
}
add_filter('forminator_custom_form_submit_field_data', 'yes_native_entry_store_identity', 21, 2);

function yes_native_entry_draft_context($stored) {
    $meta = (array) $stored->meta_data;
    $mapping = array('entry_type' => 'radio-yes-entry-mode', 'team_size' => 'number-yes-team-size', 'school_id' => 'text-yes-school-id', 'submitter' => '_yes_entry_submitter_role');
    $context = array();
    foreach ($mapping as $query => $field) {
        $value = $meta[$field]['value'] ?? '';
        if (is_scalar($value) && (string) $value !== '') { $context[$query] = sanitize_text_field((string) $value); }
    }
    return $context;
}
function yes_native_entry_query($name) {
    return isset($_GET[$name]) && is_string($_GET[$name]) ? sanitize_text_field(wp_unslash($_GET[$name])) : '';
}
function yes_native_entry_hidden($context) {
    $html = '';
    foreach ($context as $key => $value) { $html .= '<input type="hidden" name="' . esc_attr($key) . '" value="' . esc_attr($value) . '">'; }
    return $html;
}
function yes_native_entry_hub_details() {
    wp_enqueue_style('yes-entry-participation', plugins_url('../assets/entry-participation.css', __FILE__), array('yes-native-portal'), YES_NATIVE_VERSION);
    $c = yes_native_config();
    $slug = sanitize_key(yes_native_entry_query('competition'));
    $competition = $slug && !empty($c['entry_forms'][$slug]) ? yes_native_entry_competition($c['entry_forms'][$slug]) : null;
    $individual_only = $competition && !yes_native_entry_allows_team($competition);
    $mode = $individual_only ? 'individual' : yes_native_entry_query('entry_type');
    $size = $individual_only ? '' : yes_native_entry_query('team_size');
    if ($individual_only) { $_GET['entry_type'] = 'individual'; unset($_GET['team_size']); }
    $max_members = $competition && !empty($competition['team']['allowed']) ? (int) ($competition['team']['maxMembers'] ?? 0) : 0;
    $school_id = yes_native_entry_query('school_id');
    $context = $slug ? array('competition' => $slug) : array();
    $context['submitter'] = yes_native_entry_role();
    if ($school_id !== '' && ($selected_school = yes_native_find_school_by_id($school_id))) { $context['school_id'] = $selected_school['reference']; }
    $draft = yes_native_entry_query('draft');
    if ($draft !== '') { $context['draft'] = $draft; }
    $base = home_url('/competitions/enter/');
    $valid_mode = in_array($mode, array('individual', 'team'), true);
    $count = $mode === 'individual' ? 1 : yes_native_entry_count($size);
    $mode_error = $competition && $valid_mode ? yes_native_entry_team_error($competition, $mode, $count) : '';
    if (!$valid_mode || !$count || $mode_error !== '') {
        wp_enqueue_script('yes-entry-participation', plugins_url('../assets/entry-participation.js', __FILE__), array(), YES_NATIVE_VERSION, true);
        $error = $mode_error !== '' ? '<div class="yes-native__error" role="alert">' . esc_html($mode_error) . '</div>' : ($valid_mode && !$count ? '<div class="yes-native__error" role="alert">Enter a whole number of at least 2 students for a team.</div>' : '');
        $form = '<form method="get" class="yes-native__card yes-entry-start" action="' . esc_url($base) . '">' . yes_native_entry_hidden($context) .
            '<fieldset><legend>Are you submitting individually or as a team?</legend>' .
            '<p><label><input type="radio" name="entry_type" value="individual" required ' . checked($mode, 'individual', false) . '> Individual</label></p>' .
            '<p><label><input type="radio" name="entry_type" value="team" required ' . checked($mode, 'team', false) . '> Team</label></p></fieldset>' .
            '<div class="yes-entry-team-size"><label for="yes-entry-team-size">Number of students in the team</label>' .
            '<input id="yes-entry-team-size" type="number" name="team_size" min="2"' . ($max_members > 1 ? ' max="' . $max_members . '"' : '') . ' step="1" value="' . esc_attr($size) . '" inputmode="numeric"><p>Include every student contributing to this entry.</p></div>' .
            '<div class="yes-native__actions"><button class="yes-native__button" type="submit">Continue</button></div></form>';
        return yes_native_page($competition ? $competition['title'] . ' entry' : 'Submit your competition work', 'Choose the entry type for this competition. Your school must be registered.', $error . $form);
    }
    $context['entry_type'] = $mode;
    if ($mode === 'team') { $context['team_size'] = $count; }
    $school = $school_id !== '' ? yes_native_find_school_by_id($school_id) : null;
    $summary = '<div class="yes-native__notice"><p>' . esc_html(yes_native_entry_role_label($context['submitter'])) . '</p><p><strong>' . ($mode === 'team' ? 'Team entry · ' . $count . ' students' : 'Individual entry') . '</strong></p></div>';
    $change = $individual_only ? '' : '<a class="secondary" href="' . esc_url(add_query_arg(array_diff_key($context, array('entry_type'=>1,'team_size'=>1,'draft'=>1)), $base)) . '">Change entry type</a>';
    if (!$school) {
        $error = $school_id !== '' ? '<div class="yes-native__error" role="alert"><p>We could not find a registered school with that ID. Check the ID or ask your school to register first.</p></div>' : '';
        $gate = '<form method="get" class="yes-native__school-search" action="' . esc_url($base) . '">' . yes_native_entry_hidden($context) .
            '<label for="yes-entry-school-id">Registered school ID</label><input id="yes-entry-school-id" name="school_id" value="' . esc_attr($school_id) . '" placeholder="Type your school name or ID" data-yes-school-search required autocomplete="off">' .
            '<button class="yes-native__button" type="submit">Check school ID</button></form><div class="yes-native__actions">' . $change .
            '<a class="secondary" href="' . esc_url(home_url('/schools/')) . '">Find your school</a><a class="secondary" href="' . esc_url(home_url('/schools/register/')) . '">Register a school</a></div>';
        return yes_native_page('Confirm your school', 'School not registered? Ask your educator to register it first, or use Register a school below. Then return with your school ID.', $summary . $error . $gate);
    }
    $context['school_id'] = $school['reference'];
    $verified = $summary . '<div class="yes-native__notice"><p><strong>School verified: ' . esc_html($school['name']) . '</strong></p><p>School ID: ' . esc_html($school['reference']) . '</p><p>A school can submit multiple entries to the same competition.</p></div>';
    if ($competition) {
        $error = yes_native_entry_team_error($competition, $mode, $count);
        if ($error !== '') { return yes_native_page($competition['title'], '', $verified . '<div class="yes-native__error" role="alert"><p>' . esc_html($error) . '</p></div><div class="yes-native__actions">' . $change . '<a class="secondary" href="' . esc_url(add_query_arg(array_diff_key($context, array('competition' => 1, 'draft' => 1)), $base)) . '">Choose another competition</a></div>'); }
        if (is_user_logged_in() && empty($c['entries_enabled']) && get_post_status((int) $c['entry_forms'][$slug]) === 'publish') { return yes_native_entry_draft_page($competition, $school, $context); }
        if (!empty($c['entries_enabled']) && get_post_status((int) $c['entry_forms'][$slug]) === 'publish') {
            if (!is_user_logged_in()) { return yes_native_entry_selected_page($competition, $school, $context, true); }
            // Only verified context is supplied to native field prefill.
            $_REQUEST['submitter'] = $context['submitter'];
            $_REQUEST['entry_type'] = $mode;
            $_REQUEST['team_size'] = $mode === 'team' ? (string) $count : '';
            $_REQUEST['school_id'] = $school['reference'];
            return yes_native_page($competition['title'] . ' entry', $competition['classLabel'], $verified . yes_native_notice() . yes_native_form_markup((int) $c['entry_forms'][$slug]));
        }
        return yes_native_entry_selected_page($competition, $school, $context, false);
    }
    $body = $verified;
    if (empty($c['entries_enabled'])) { $body .= '<div class="yes-native__notice"><p><strong>Student registration is open. Competition uploads are not available yet.</strong></p><p>Choose a competition below to see its requirements and register as a student.</p></div>'; }
    $body .= '<div class="yes-native__actions"><a href="' . esc_url(add_query_arg(array_diff_key($context, array('draft' => 1)), home_url('/register/'))) . '">Register as a student</a>' . $change . '</div><h2>Choose your competition</h2><div class="yes-native__grid">';
    foreach ((array) (yes_native_guidelines()['competitions'] ?? array()) as $item) {
        if (empty($c['entry_forms'][$item['slug']]) || yes_native_entry_team_error($item, $mode, $count) !== '') { continue; }
        $link = array_merge(array_diff_key($context, array('draft' => 1)), array('competition' => $item['slug']));
        $body .= '<article><h3>' . esc_html($item['title']) . '</h3><p>' . esc_html($item['classLabel']) . '</p><a href="' . esc_url(add_query_arg($link, $base)) . '">Choose ' . esc_html($item['title']) . '</a></article>';
    }
    $body .= '</div>';
    if ($competition && current_user_can('manage_options')) { $body .= '<div class="yes-native__actions"><a class="secondary" href="' . esc_url(admin_url('admin.php?page=forminator-cform-wizard&id=' . (int) $c['entry_forms'][$slug])) . '">Review prepared form in WordPress</a></div>'; }
    return yes_native_page('Competition entries', 'Choose a competition for your individual or team entry.', $body);
}

/** Explicit form update: preserves post status, uploads, notifications and accounts. */
function yes_native_prepare_entry_participation() {
    $results = array();
    foreach ((array) yes_native_config()['entry_forms'] as $slug => $form_id) {
        $model = Forminator_API::get_form((int) $form_id);
        if (is_wp_error($model)) { return $model; }
        $fields = array_filter($model->get_fields_as_array(), function ($field) {
            return !in_array($field['element_id'], array('radio-yes-entry-mode', 'number-yes-team-size', 'page-break-yes-participants', 'html-yes-team'), true);
        });
        $start = array(
            yes_native_field('radio-yes-entry-mode', 'radio', 'Are you submitting individually or as a team?', array('prefill' => 'entry_type', 'options' => yes_native_options(array('individual' => 'Individual', 'team' => 'Team')))),
            yes_native_field('number-yes-team-size', 'number', 'Number of students in the team', array('prefill' => 'team_size', 'limit_min' => '2', 'limit_max' => '', 'description' => 'Include every student contributing to this entry. Team limits depend on the competition.', 'conditions' => array(array('element_id' => 'radio-yes-entry-mode', 'rule' => 'is', 'value' => 'team')))),
            yes_native_break('page-break-yes-participants'),
        );
        foreach ($fields as &$field) {
            if ($field['element_id'] === 'text-yes-school-id') {
                $field['required'] = 'true';
                $field['prefill'] = 'school_id';
                $field['field_label'] = 'Registered school ID';
                $field['description'] = 'Your school must be registered. Ask your school coordinator for the ID or find it in the school directory.';
            }
            if ($field['element_id'] === 'text-yes-name') { $field['field_label'] = 'Student or team representative name'; }
            if ($field['element_id'] === 'html-yes-approval') {
                $field['variations'] = '<p>Final competition submissions are not enabled yet. Remaining consent and upload settings are being reviewed. Your entry must be linked to a registered school ID. A school may submit multiple entries to the same competition.</p>';
            }
        } unset($field);
        yes_native_model_fields($model, array_merge($start, array_values($fields)));
        $pagination = (array) ($model->settings['paginationData'] ?? array());
        $pagination['pagination-labels'] = 'custom';
        $pagination['pagination-header'] = 'nav';
        $pagination['pagination-header-design'] = 'show';
        $pagination['last-steps'] = 'Review';
        $pagination['last-previous'] = 'Previous';
        foreach (array('page-break-yes-participants' => 'Entry type', 'page-break-yes-work' => 'Student and school', 'page-break-yes-upload' => 'Your work', 'page-break-yes-confirm' => 'Uploads') as $id => $label) {
            $pagination[$id . '-steps'] = $label;
            $pagination[$id . '-previous'] = 'Previous';
            $pagination[$id . '-next'] = 'Next';
        }
        $model->settings['paginationData'] = $pagination;
        $result = $model->save();
        if (is_wp_error($result)) { return $result; }
        $results[$slug] = (int) $result;
    }
    return yes_native_prepare_entry_mode_options();
}

/** Update only entry-mode options; retain consent, uploads, notifications and status. */
function yes_native_prepare_entry_mode_options() {
    $results = array();
    foreach (yes_native_config()['entry_forms'] as $slug => $id) {
        $model = Forminator_API::get_form((int) $id);
        if (is_wp_error($model)) { return $model; }
        $item = yes_native_entry_competition((int) $id);
        $allowed = yes_native_entry_allows_team($item);
        $fields = $model->get_fields_as_array();
        foreach ($fields as &$field) {
            if ($field['element_id'] === 'radio-yes-entry-mode') {
                $field['options'] = yes_native_options($allowed ? array('individual' => 'Individual', 'team' => 'Team') : array('individual' => 'Individual'));
                $field['field_label'] = $allowed ? 'Are you submitting individually or as a team?' : 'Entry type';
                if (!$allowed) { $field['options'][0]['default'] = 'true'; }
            }
            if ($field['element_id'] === 'number-yes-team-size') {
                $max = !empty($item['team']['allowed']) ? (int) ($item['team']['maxMembers'] ?? 0) : 0;
                $field['limit_min'] = '2';
                $field['limit_max'] = $max > 1 ? (string) $max : '';
                $field['description'] = $max > 1 ? 'Include every student contributing to this entry. Up to ' . $max . ' students per team.' : 'Include every student contributing to this entry.';
            }
        } unset($field);
        yes_native_model_fields($model, $fields);
        $result = $model->save();
        if (is_wp_error($result)) { return $result; }
        $results[$slug] = (int) $id;
    }
    return $results;
}

/** Older saved drafts cannot reintroduce a team option to individual-only forms. */
function yes_native_entry_individual_markup($html, $field, $renderer) {
    $item = yes_native_entry_competition((int) ($renderer->model->id ?? 0));
    if (!$item || yes_native_entry_allows_team($item) || ($field['element_id'] ?? '') !== 'radio-yes-entry-mode') { return $html; }
    $tag = new WP_HTML_Tag_Processor($html);
    while ($tag->next_tag('INPUT')) {
        if ($tag->get_attribute('name') === 'radio-yes-entry-mode' && $tag->get_attribute('value') === 'individual') { $tag->set_attribute('checked', true); }
    }
    return $tag->get_updated_html();
}
add_filter('forminator_field_markup', 'yes_native_entry_individual_markup', 50, 3);
