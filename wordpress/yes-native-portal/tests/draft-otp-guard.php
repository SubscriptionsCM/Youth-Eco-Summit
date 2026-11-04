<?php
/** Run with wp eval-file. This tests hook selection only: it does not submit
 * forms, invoke OTP callbacks, send messages or create account/draft records. */
if (!defined('WP_CLI') || !WP_CLI) { exit; }
if (!function_exists('yes_native_draft_otp_guard')) { throw new RuntimeException('Native portal must be active.'); }
global $wp_filter;
$tag = 'forminator_custom_form_submit_errors';
$callbacks = isset($wp_filter[$tag]->callbacks[1]) ? $wp_filter[$tag]->callbacks[1] : array();
$otp = array();
foreach ($callbacks as $key => $registered) {
    $callback = $registered['function'];
    if (is_array($callback) && count($callback) === 2 && is_object($callback[0]) && get_class($callback[0]) === 'OTP\\Handler\\Forms\\ForminatorForm' && $callback[1] === 'forminator_custom_form_submit_errors') {
        $otp[$key] = $registered;
    }
}
if (!$otp) { throw new RuntimeException('Expected native miniOrange OTP filter was not registered.'); }
$original_post = $_POST;
$force_ajax = function () { return true; };
add_filter('wp_doing_ajax', $force_ajax, 999);
$student = (int) yes_native_config()['student'];
$nonce = wp_create_nonce('forminator_submit_form' . $student);
$baseline = $wp_filter[$tag]->callbacks;
$passed = 0;
try {
    if (has_action('forminator_form_before_save_entry', 'yes_native_draft_otp_guard') !== false) { throw new RuntimeException('Guard must not be registered on final submission.'); }
    $passed++;
    $cases = array(
        array($student, 'false', 'forminator_submit_form_custom-forms', $nonce),
        array($student, 'true', 'forminator_submit_form_custom-forms', 'invalid-test-nonce'),
        array(99999999, 'true', 'forminator_submit_form_custom-forms', $nonce),
        array($student, 'true', 'unrelated_action', $nonce),
    );
    foreach ($cases as $case) {
        $_POST = array('action' => $case[2], 'save_draft' => $case[1], 'forminator_nonce' => $case[3]);
        yes_native_draft_otp_guard($case[0]);
        if ($wp_filter[$tag]->callbacks !== $baseline) { throw new RuntimeException('OTP callbacks changed for a non-draft/invalid request.'); }
        $passed++;
    }
    $_POST = array('action' => 'forminator_submit_form_custom-forms', 'save_draft' => 'true', 'forminator_nonce' => $nonce);
    yes_native_draft_otp_guard($student);
    $expected = $baseline;
    foreach (array_keys($otp) as $key) { unset($expected[1][$key]); }
    if (!$expected[1]) { unset($expected[1]); }
    if ($wp_filter[$tag]->callbacks !== $expected) { throw new RuntimeException('Draft exemption changed filters other than the exact OTP callback.'); }
    $passed++;
} finally {
    foreach ($otp as $registered) { add_filter($tag, $registered['function'], 1, $registered['accepted_args']); }
    remove_filter('wp_doing_ajax', $force_ajax, 999);
    $_POST = $original_post;
}
foreach ($otp as $registered) {
    if (has_filter($tag, $registered['function']) !== 1) { throw new RuntimeException('OTP filter restoration failed.'); }
}
echo wp_json_encode(array('passed' => $passed, 'otp_filter_restored' => true, 'forms_submitted' => 0, 'messages_sent' => 0, 'records_created' => 0)) . "\n";
