<?php
/** Read-only regression checks for the public and signed-in entry journey. */
$passed = 0;
$assert = function ($ok, $label) use (&$passed) { if (!$ok) { throw new RuntimeException($label); } $passed++; };
$config = yes_native_config(); $saved_get = $_GET; $saved_post = $_POST; $user = get_current_user_id();
try {
    $_POST = array(); $_GET = array();
    foreach (array($config['student'], $config['teacher']) as $id) {
        $response = yes_native_entry_registration_success(array('success' => true, 'message' => 'Old message'), $id);
        $assert(strpos($response['message'], 'Choose your challenge') !== false, 'General registration points to challenge choice');
        $assert(strpos($response['message'], '/competitions/#challenges') !== false, 'General registration has actual challenge URL');
        $assert(strpos($response['message'], 'early access') === false, 'No stale early-access response');
        $meta = get_post_meta($id, 'forminator_form_meta', true);
        $assert(strpos($meta['behaviors'][0]['thankyou-message'], 'Choose your challenge') !== false, 'Stored behavior has next action');
        $draft = array('success' => true, 'type' => 'save_draft', 'message' => 'Saved');
        $assert(yes_native_entry_registration_success($draft, $id) === $draft, 'Save draft is not registration success');
        $failed = array('success' => false, 'message' => 'OTP required');
        $assert(yes_native_entry_registration_success($failed, $id) === $failed, 'OTP failures unaffected');
    }
    $catalogue = yes_native_public_challenges();
    $assert(substr_count($catalogue, 'class="yes-challenge-start"') === 10, 'All ten challenges have entry actions');
    $assert(strpos($catalogue, 'Planned formats') === false && strpos($catalogue, 'Eight ways') === false, 'No obsolete eight-format copy');
    foreach (yes_native_guidelines()['competitions'] as $item) {
        $assert(strpos($catalogue, 'competition=' . $item['slug']) !== false, 'Dedicated action: ' . $item['slug']);
        $assert(strpos($catalogue, 'id="guidelines-' . $item['slug'] . '"') !== false, 'Guidelines anchored: ' . $item['slug']);
    }
    $sample = '<html><head><script src="/_next/static/old.js"></script></head><body><main><section id="challenges">Old programme</section></main><footer>Keep current footer</footer><script>self.__next_f=[];</script></body></html>';
    $patched = yes_native_public_challenge_page($sample, '/competitions');
    $assert(strpos($patched, 'Old programme') === false, 'Only old programme replaced');
    $assert(strpos($patched, 'Keep current footer') !== false, 'Live surrounding design retained');
    $assert(strpos($patched, 'old.js') === false && strpos($patched, '__next_f') === false, 'Obsolete hydration cannot undo the change');
    $assert(strpos($patched, 'native-navigation.js') !== false, 'Mobile navigation retained');
    $assert(yes_native_public_challenge_page($sample, '/about') === $sample, 'Other live pages untouched');
    $streamed = '<html><head></head><body><main id="main">Loading page</main><div hidden id="S:0"><section id="challenges">Old programme</section></div></body></html>';
    $resolved = yes_native_public_challenge_page($streamed, '/competitions');
    $assert(strpos($resolved, 'Loading page') === false && strpos($resolved, 'yes-challenge-start') !== false && strpos($resolved, 'id="S:0"') === false, 'Streamed Next content visible without legacy hydration');
    wp_set_current_user(120);
    $assert(is_user_logged_in(), 'Existing admin identity usable for render checks');
    $school = yes_native_find_school_by_id('YES-SCH-458BA6D2');
    foreach ($config['entry_forms'] as $slug => $id) {
        $_GET = array('submitter'=>'student','entry_type' => 'individual', 'school_id' => $school['reference'], 'competition' => $slug);
        $html = yes_native_entry_hub();
        $assert(strpos($html, 'forminator-module-' . $id) !== false, 'Real entry form reachable: ' . $slug);
        $assert(strpos($html, !empty($config['entries_enabled']) ? ' entry</h1>' : 'entry draft</h1>') !== false, 'Draft state explicit: ' . $slug);
        $assert(!empty($config['entries_enabled']) ? strpos($html, 'type="file"') !== false : strpos($html, 'type="file"') === false, 'Unavailable upload controls absent: ' . $slug);
        $assert(strpos($html, 'forminator-save-draft-link') !== false, 'Save action available: ' . $slug);
    }
    $assert(strpos(yes_native_render_page('/register'), 'You’re already signed in') !== false, 'Signed-in registration no dead end');
    $_GET = array('competition' => 'open-letter', 'school_id' => $school['reference']);
    $begin = yes_native_entry_hub();
    $assert(strpos($begin, 'Who is submitting?') !== false, 'Submitter role requested first');
    $assert(strpos($begin, 'school_id=' . $school['reference']) !== false, 'Verified school retained through role choice');
    $assert(yes_native_entry_upload_gate(true, 'upload-yes-1') === !empty($config['entries_enabled']), 'Closed competition upload handler blocked');
    $assert(yes_native_entry_upload_gate(true, 'upload-1') === true, 'Existing unrelated uploads untouched');
    $markup = '<form id="forminator-module-' . $config['entry_forms']['open-letter'] . '"><button class="forminator-button-submit">Submit</button></form>';
    $assert(!empty($config['entries_enabled']) ? yes_native_entry_draft_markup($markup) === $markup : strpos(yes_native_entry_draft_markup($markup), 'disabled') !== false, 'Final submit disabled in draft-only form');
    $assert(yes_native_config() === $config, 'Activation setting unchanged');
} finally { $_GET = $saved_get; $_POST = $saved_post; wp_set_current_user($user); }
echo wp_json_encode(array('passed' => $passed, 'forms_submitted' => 0, 'messages_sent' => 0, 'accounts_created' => 0)) . "\n";
