<?php
if (!defined('ABSPATH')) { exit; }

function yes_native_field($slug, $type, $label, $extra = array()) {
    $wrapper = 'wrapper-yes-' . sanitize_key($slug);
    return array_merge(array('id' => $slug, 'element_id' => $slug, 'form_id' => $wrapper, 'wrapper_id' => $wrapper, 'parent_group' => '', 'type' => $type, 'field_label' => $label, 'cols' => '12', 'required' => 'true', 'conditions' => array(), 'options' => array()), $extra);
}
function yes_native_break($slug) {
    return yes_native_field($slug, 'page-break', '', array('required' => '', 'btn_left' => 'Previous', 'btn_right' => 'Next'));
}
/** Forminator 1.53.1 renders labels/buttons from settings.paginationData,
 * not the legacy page-break btn_left/btn_right properties. */
function yes_native_set_pagination($model, $page_labels, $last_label, $submit_label = '') {
    $pagination = (array) ($model->settings['paginationData'] ?? array());
    $pagination['pagination-labels'] = 'custom';
    $pagination['pagination-header'] = 'nav';
    $pagination['pagination-header-design'] = 'show';
    $pagination['last-steps'] = $last_label;
    $pagination['last-previous'] = 'Previous';
    foreach ($page_labels as $break => $label) {
        $pagination[$break . '-steps'] = $label;
        $pagination[$break . '-previous'] = 'Previous';
        $pagination[$break . '-next'] = 'Next';
    }
    $model->settings['paginationData'] = $pagination;
    if ($submit_label) {
        $submit = (array) ($model->settings['submitData'] ?? array());
        $submit['custom-submit-text'] = $submit_label;
        $model->settings['submitData'] = $submit;
    }
    return $model->save();
}
function yes_native_model_fields($model, $arrays) {
    $model->clear_fields();
    foreach ($arrays as $array) {
        $field = new Forminator_Form_Field_Model(); $field->import($array); $model->add_field($field);
    }
}
function yes_native_options($values) {
    $options = array(); foreach ($values as $key => $value) { $options[] = array('key' => 'yes-' . $key, 'label' => (string) $value, 'value' => (string) $key, 'default' => '', 'error' => ''); }
    return $options;
}

/** Explicit deployment operation, never run implicitly on every page or activation. */
function yes_native_prepare_forms() {
    if (!class_exists('Forminator_API')) { return new WP_Error('yes_forminator_missing', 'Forminator is required.'); }
    $schema = yes_native_ensure_draft_schema();
    if (is_wp_error($schema)) { return $schema; }
    $config = yes_native_config(); $data = yes_native_guidelines(); $results = array();
    $results['draft_storage'] = $schema;
    $models = array(); foreach (array('student', 'teacher', 'school') as $kind) {
        $models[$kind] = Forminator_API::get_form((int) $config[$kind]);
        if (is_wp_error($models[$kind])) { return $models[$kind]; }
    }
    // Existing registrations show a chosen-password field, so honor it rather
    // than Forminator's previous automatic-password setting. No user is created
    // or changed by preparation; final registration still follows native OTP.
    foreach (array('student', 'teacher') as $kind) {
        $model = $models[$kind];
        $password_fields = array_filter($model->get_fields_as_array(), function ($field) { return ($field['element_id'] ?? '') === 'password-1' && ($field['type'] ?? '') === 'password'; });
        if (($model->settings['form-type'] ?? '') !== 'registration' || !$password_fields) { return new WP_Error('yes_registration_password_field', 'The ' . $kind . ' registration is missing its expected password field; password mapping was not changed.'); }
        $changed = ($model->settings['registration-password-field'] ?? '') !== 'password-1';
        if ($changed) {
            $model->settings['registration-password-field'] = 'password-1';
            $saved = $model->save();
            if (is_wp_error($saved)) { return $saved; }
        }
        $results[$kind . '_password_mapping'] = array('field' => 'password-1', 'changed' => $changed);
    }
    $school_selectors = array('student' => 'select-2', 'teacher' => 'select-3', 'school' => 'select-1', 'nomination' => 'select-1');
    foreach ($school_selectors as $kind => $selector) {
        $model = isset($models[$kind]) ? $models[$kind] : Forminator_API::get_form((int) $config[$kind]);
        if (is_wp_error($model)) { return $model; }
        $arrays = $model->get_fields_as_array(); $removed = 0;
        foreach ($arrays as &$field) {
            if ($field['element_id'] !== $selector) { continue; }
            $before = count((array) $field['options']);
            $field['options'] = array_values(array_filter((array) $field['options'], function ($option) { return yes_native_school_label_safe($option['label'] ?? ''); }));
            $removed = $before - count($field['options']);
            $field['options_bulk_editor'] = implode("\n", array_column($field['options'], 'label'));
            $field['search_status'] = 'enable';
            $field['description'] = $kind === 'student' ? 'Choose your school and confirm the branch with your coordinator. If your school is not listed, nominate it first; student registration can be completed after it is added.' : 'Choose your school and confirm the correct branch with your coordinator. If it is not listed, choose Other and enter the full school name and branch.';
        } unset($field);
        yes_native_model_fields($model, $arrays); $saved = $model->save(); if (is_wp_error($saved)) { return $saved; }
        $results[$kind . '_contact_rows_removed'] = $removed;
    }
    // Preserve original account, OTP, consent and notification mappings except
    // the explicit chosen-password correction above.
    $student = $models['student']; $fields = $student->get_fields_as_array();
    if (!array_filter($fields, function ($field) { return $field['element_id'] === 'select-yes-class'; })) {
        $next = array(); foreach ($fields as $field) {
            if ($field['element_id'] === 'text-4') { $field['required'] = 'true'; }
            if ($field['element_id'] === 'page-break-3') {
                $labels = array(); foreach (range(5, 12) as $class) { $labels[$class] = 'Class ' . $class; }
                $next[] = yes_native_field('select-yes-class', 'select', 'Student class', array('options' => yes_native_options($labels), 'value_type' => 'single', 'placeholder' => 'Select class', 'description' => 'Competition categories use the class bands 5–6, 7–8, 9–10 and 11–12.'));
            }
            if ($field['type'] === 'page-break') { $field['btn_left'] = 'Previous'; $field['btn_right'] = 'Next'; }
            $next[] = $field;
        }
        yes_native_model_fields($student, $next); $saved = $student->save();
        if (is_wp_error($saved)) { return $saved; } $results['student_class'] = $saved;
    }
    $teacher = $models['teacher']; $fields = $teacher->get_fields_as_array();
    $labels = array(); foreach ((array) ($data['competitions'] ?? array()) as $item) { $labels[$item['slug']] = $item['title'] . ' — ' . $item['classLabel']; }
    foreach ($fields as &$field) {
        if ($field['element_id'] === 'text-10') { $field['required'] = 'true'; }
        if ($field['element_id'] === 'select-1') { $field['options'] = yes_native_options($labels); $field['options_bulk_editor'] = implode("\n", array_values($labels)); $field['field_label'] = 'Which 2027 competitions is your school interested in?'; }
        if ($field['type'] === 'page-break') { $field['btn_left'] = 'Previous'; $field['btn_right'] = 'Next'; }
    } unset($field);
    yes_native_model_fields($teacher, $fields); $saved = $teacher->save(); if (is_wp_error($saved)) { return $saved; } $results['teacher_competitions'] = $saved;

    $school = $models['school']; $fields = $school->get_fields_as_array();
    if (!array_filter($fields, function ($field) { return $field['element_id'] === 'page-break-yes-location'; })) {
        $student_options = Forminator_API::get_form_field((int) $config['student'], 'select-2', true);
        $next = array();
        foreach ($fields as $field) {
            if ($field['element_id'] === 'text-1') { $field['required'] = 'true'; }
            if ($field['element_id'] === 'select-1' && is_array($student_options)) {
                // Keep the existing "Others" value and its conditional other-school field.
                $other = array_values(array_filter((array) $field['options'], function ($option) { return $option['value'] === 'Others'; }));
                $names = array_values(array_filter((array) $student_options['options'], function ($option) { return !preg_match('/^other\b/i', $option['label']); }));
                $field['options'] = array_merge($other, $names);
                $field['search_status'] = 'enable';
                $field['options_bulk_editor'] = implode("\n", array_column($field['options'], 'label'));
            }
            $next[] = $field;
            if ($field['element_id'] === 'text-1') { $next[] = yes_native_break('page-break-yes-location'); }
            if ($field['element_id'] === 'address-1') { $next[] = yes_native_break('page-break-yes-contact'); }
            if ($field['element_id'] === 'email-1') {
                $next[] = yes_native_break('page-break-yes-review');
                $next[] = yes_native_field('html-yes-review', 'html', 'Review your school details', array('required' => '', 'variations' => '<h2>Ready to register your school?</h2><p>Use Previous to check your school name, location and coordinator contact details. Your registration goes to the existing Youth Eco Summit WordPress team for review.</p>'));
            }
        }
        yes_native_model_fields($school, $next); $saved = $school->save(); if (is_wp_error($saved)) { return $saved; } $results['school_steps'] = $saved;
    }
    // Always update existing models too. Earlier deployments already added the
    // page-break fields, so pagination settings must live outside those guards.
    $pagination_updates = array(
        'student' => array(array('page-break-3' => 'Student and school', 'page-break-2' => 'Parent contact'), 'Location and consent', 'Register student'),
        'teacher' => array(array('page-break-1' => 'School', 'page-break-3' => 'Educator', 'page-break-4' => 'Competitions'), 'Review', 'Register teacher'),
        'school' => array(array('page-break-yes-location' => 'School', 'page-break-yes-contact' => 'Location', 'page-break-yes-review' => 'Contact'), 'Review', 'Register school'),
    );
    foreach ($pagination_updates as $kind => $labels) {
        $saved = yes_native_set_pagination($models[$kind], $labels[0], $labels[1], $labels[2]);
        if (is_wp_error($saved)) { return $saved; }
        $results[$kind . '_pagination_labels'] = $saved;
    }
    // Prepared forms are draft posts and hard gated at final submission. No 2026
    // guardian wording is copied into them and no cross-school team policy is invented.
    $entry_forms = (array) $config['entry_forms'];
    foreach ((array) ($data['competitions'] ?? array()) as $item) {
        if (!empty($entry_forms[$item['slug']]) && get_post((int) $entry_forms[$item['slug']])) { continue; }
        $arrays = yes_native_entry_fields($item);
        $wrappers = array(); foreach ($arrays as $field) { $wrappers[] = array('wrapper_id' => $field['wrapper_id'], 'fields' => array($field)); }
        $settings = array('formName' => '2027 ' . $item['title'] . ' entry — pending approval', 'form-type' => 'default', 'enable-ajax' => 'true', 'store_submissions' => '1', 'form-expire' => 'no_expire', 'submission-behaviour' => 'behaviour-thankyou', 'thankyou-message' => '<p>Your entry has been received.</p>', 'form-style' => 'default', 'pagination-header' => 'nav', 'use_save_and_continue' => 'true', 'sc_permission' => 'registered', 'logged-users' => 'true', 'submitData' => array('custom-submit-text' => 'Submit entry'));
        $id = Forminator_API::add_form('2027 ' . $item['title'] . ' entry — pending approval', $wrappers, $settings, 'draft');
        if (is_wp_error($id)) { return $id; }
        update_post_meta($id, '_yes_guideline_slug', $item['slug']);
        update_post_meta($id, '_yes_guideline_revision', 4);
        update_post_meta($id, '_yes_file_requirements', $item['fileRequirements']);
        update_post_meta($id, '_yes_scoring_policy', $item['rubric']);
        $entry_forms[$item['slug']] = (int) $id;
        // Persist each created draft so interruption/retry cannot duplicate it.
        $config['entry_forms'] = $entry_forms; $config['entries_enabled'] = false;
        update_option('yes_native_portal', $config, false);
    }
    $results['prepared_entry_forms'] = $entry_forms;
    return $results;
}

function yes_native_entry_fields($item) {
    $class_labels = array(); foreach ($item['classes'] as $class) { $class_labels[$class] = 'Class ' . $class; }
    $topics = array(); foreach ($item['classTopics'] as $band) { foreach ($band['topics'] as $topic) { $topics[$topic['title']] = $topic['title']; } }
    $fields = array(
        yes_native_field('html-yes-guidance', 'html', '', array('required' => '', 'variations' => '<h2>' . esc_html($item['title']) . '</h2><p>' . esc_html($item['description']) . '</p><p>' . esc_html($item['classLabel']) . '. AI-generated submission content incurs a 15-point deduction. AI research or reference is allowed with cited sources.</p>')),
        yes_native_field('text-yes-name', 'text', 'Student name'),
        yes_native_field('text-yes-school', 'text', 'School name and branch'),
        yes_native_field('text-yes-school-id', 'text', 'School ID supplied by your school'),
        yes_native_field('select-yes-class', 'select', 'Student class', array('value_type' => 'single', 'options' => yes_native_options($class_labels))),
        yes_native_break('page-break-yes-work'),
        yes_native_field('text-yes-title', 'text', 'Submission title', array('description' => 'SchoolName_Class_Category_ProjectTitle_Authors')),
        yes_native_field('select-yes-topic', 'select', 'Choose your topic', array('value_type' => 'single', 'options' => yes_native_options($topics))),
    );
    if (!empty($item['languages'])) { $languages = array(); foreach ($item['languages'] as $language) { $languages[$language] = $language; } $fields[] = yes_native_field('select-yes-language', 'select', 'Language', array('value_type' => 'single', 'options' => yes_native_options($languages))); }
    if (!empty($item['team']['allowed'])) { $fields[] = yes_native_field('html-yes-team', 'html', '', array('required' => '', 'variations' => '<p>This category supports teams of up to ' . (int) $item['team']['maxMembers'] . '. Team school/class eligibility is awaiting confirmation; team fields will be enabled after approval.</p>')); }
    if (!empty($item['wordRange'])) { $fields[] = yes_native_field('number-yes-word-count', 'number', 'Word count', array('limit_min' => (string) $item['wordRange']['min'], 'limit_max' => (string) $item['wordRange']['max'], 'description' => $item['wordRange']['min'] . '–' . $item['wordRange']['max'] . ' words; the uploaded PDF must match.')); }
    $fields[] = yes_native_break('page-break-yes-upload');
    foreach ($item['fileRequirements'] as $index => $file) {
        $extensions = in_array('application/pdf', $file['types'], true) ? array('pdf') : (in_array('video/mp4', $file['types'], true) ? array('mp4') : array('jpg', 'jpeg'));
        $fields[] = yes_native_field('upload-yes-' . ($index + 1), 'upload', $file['title'], array('required' => $file['required'] ? 'true' : '', 'custom-files' => 'true', 'filetypes' => $extensions, 'file-type' => 'single', 'upload-limit' => $file['maxBytes'] / (1024 * 1024), 'filesize' => 'MB', 'description' => $file['fileLabel'], 'file-limit' => 'custom', 'file-limit-input' => '1'));
    }
    $fields[] = yes_native_break('page-break-yes-confirm');
    $fields[] = yes_native_field('consent-yes-originality', 'consent', 'Original work and AI policy', array('consent_description' => 'I take responsibility for this submission, have credited sources, and understand that AI-generated submission content receives a 15-point deduction.'));
    $fields[] = yes_native_field('html-yes-approval', 'html', '', array('required' => '', 'variations' => '<p>Final submission is disabled until the team approves the remaining parent/guardian consent, school ID and team eligibility settings. This prepared form does not reuse last year’s consent.</p>'));
    return $fields;
}
