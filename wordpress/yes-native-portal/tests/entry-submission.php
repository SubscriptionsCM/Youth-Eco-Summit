<?php
$passed = 0;
$assert = function ($ok, $message) use (&$passed) { if (!$ok) { throw new RuntimeException($message); } $passed++; };
$old_post = $_POST; $old_files = $_FILES; $uid = get_current_user_id();
$fixtures = '/home/u794443438/yes-deploy-backups/challenge-journey-20261009/fixtures/';
$file = function ($name) use ($fixtures) { return array('tmp_name' => $fixtures . $name, 'name' => $name, 'error' => UPLOAD_ERR_OK, 'size' => filesize($fixtures . $name)); };
try {
    $item = yes_native_entry_competition(48542); $rule = $item['fileRequirements'][0];
    $assert(yes_native_entry_validate_file($file('qa-valid.pdf'), $rule, $item) === '', 'Valid 550-word PDF accepted');
    $assert(strpos(yes_native_entry_validate_file($file('qa-short.pdf'), $rule, $item), 'requires 500') !== false, 'PDF content word count enforced');
    $assert(yes_native_entry_validate_file($file('qa-fake.pdf'), $rule, $item) !== '', 'Disguised non-PDF rejected');
    $small = $rule; $small['maxBytes'] = 10;
    $assert(yes_native_entry_validate_file($file('qa-valid.pdf'), $small, $item) !== '', 'File size enforced');
    $art = yes_native_entry_competition(48548);
    $assert(yes_native_entry_validate_file($file('qa-landscape.jpg'), $art['fileRequirements'][0], $art) === '', 'Landscape JPG accepted');
    $assert(yes_native_entry_validate_file($file('qa-portrait.jpg'), $art['fileRequirements'][0], $art) !== '', 'Portrait JPG rejected for landscape requirement');
    $film = yes_native_entry_competition(48546);
    $assert(yes_native_entry_validate_file($file('qa-video.mp4'), $film['fileRequirements'][0], $film) === '', 'Valid MP4 accepted using server metadata');
    $duration = $film['fileRequirements'][0]; $duration['duration']['maxSeconds'] = 1;
    $assert(yes_native_entry_validate_file($file('qa-video.mp4'), $duration, $film) !== '', 'Video duration enforced');
    wp_set_current_user(120);
    $assert(yes_native_entry_file_access(120), 'Uploader authorized');
    $assert(!yes_native_entry_file_access(120, 0), 'Anonymous file access denied');
    $assert(!yes_native_entry_file_access(120, 116), 'Another non-admin account denied');
    $assert(yes_native_entry_file_access(116, 120), 'Admin reviewer authorized');
    $_POST = array('form_id' => '48542', 'forminator_nonce' => wp_create_nonce('forminator_submit_form48542'));
    $dir = yes_native_entry_upload_directory(array('basedir' => ABSPATH . 'wp-content/uploads', 'baseurl' => home_url('/wp-content/uploads'), 'path' => '', 'url' => '', 'error' => false));
    $assert(strpos($dir['basedir'], ABSPATH) === false && strpos($dir['baseurl'], '/yes-entry-files/120') !== false, 'Upload storage outside web root with protected URL');
    $_POST['forminator_nonce'] = 'bad';
    $assert(!yes_native_entry_upload_request(), 'Invalid nonce cannot select private upload context');
    $_POST = array(); $_FILES = array('upload-yes-1' => $file('qa-valid.pdf'));
    $values = array('radio-yes-entry-mode' => 'individual', 'select-yes-class' => '5', 'select-yes-topic' => $item['classTopics'][0]['topics'][0]['title'], 'select-yes-language' => 'English', 'text-yes-title' => 'QA_School_5_OpenLetter_Test_Admin');
    $fields = function ($values) { $rows = array(); foreach ($values as $key => $value) { $rows[] = array('name' => $key, 'value' => $value); } return $rows; };
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($values)) === array(), 'Valid authenticated entry data accepted');
    $moved_key = '48542:upload-yes-1:/tmp/yes-test-moved-upload';
    $GLOBALS['yes_native_validated_files'][$moved_key] = true;
    $_FILES['upload-yes-1']['tmp_name'] = '/tmp/yes-test-moved-upload';
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($values)) === array(), 'Second native validation accepts a file already validated and moved in this request');
    unset($GLOBALS['yes_native_validated_files'][$moved_key]);
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($values)) !== array(), 'Missing unvalidated file remains rejected');
    $_FILES['upload-yes-1'] = $file('qa-valid.pdf');
    $bad = $values; $bad['select-yes-class'] = '12';
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($bad)) !== array(), 'Ineligible class rejected');
    $bad = $values; $bad['select-yes-topic'] = 'Invented topic';
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($bad)) !== array(), 'Unknown topic rejected');
    $bad = $values; $bad['text-yes-title'] = 'title with spaces';
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($bad)) !== array(), 'Title naming requirement enforced');
    $_FILES = array();
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($values)) !== array(), 'Required file enforced');
    wp_set_current_user(0);
    $assert(yes_native_entry_submission_checks(array(), 48542, $fields($values)) !== array(), 'Signed-out final submission rejected');
    foreach (yes_native_config()['entry_forms'] as $slug => $id) {
        $model = Forminator_API::get_form($id); $fields_by_id = array_column($model->get_fields_as_array(), null, 'element_id');
        $assert(isset($fields_by_id['consent-yes-registration']) && $fields_by_id['consent-yes-registration']['required'] === 'true', 'Approved existing consent required: ' . $slug);
        $assert(!isset($fields_by_id['html-yes-approval']), 'Obsolete disabled copy removed: ' . $slug);
    }
} finally { $_POST = $old_post; $_FILES = $old_files; wp_set_current_user($uid); }
echo wp_json_encode(array('passed' => $passed, 'forms_submitted' => 0, 'messages_sent' => 0)) . "\n";
