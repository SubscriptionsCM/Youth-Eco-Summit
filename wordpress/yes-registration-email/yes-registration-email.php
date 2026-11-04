<?php
/**
 * Plugin Name: Youth Eco Summit Registration Email Verification
 * Description: Youth Eco Summit email verification for native student and educator registration.
 * Version: 1.1.0
 */
if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/branded-email.php';

function yes_email_forms() {
    if (!function_exists('yes_native_config') || !get_option('yes_registration_email_enabled', false)) { return array(); }
    $c = yes_native_config();
    return array((int) $c['student'] => 'email-1', (int) $c['teacher'] => 'email-1');
}
function yes_email_cookie_name($form_id) { return 'yes_email_otp_' . (int) $form_id; }
function yes_email_browser_key($form_id, $create = false) {
    $name = yes_email_cookie_name($form_id);
    $token = isset($_COOKIE[$name]) && is_string($_COOKIE[$name]) ? $_COOKIE[$name] : '';
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
        if (!$create || headers_sent()) { return ''; }
        $token = bin2hex(random_bytes(32));
        setcookie($name, $token, array('expires' => time() + HOUR_IN_SECONDS, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
        $_COOKIE[$name] = $token;
    }
    return 'yes_email_' . hash_hmac('sha256', (int) $form_id . ':' . $token, wp_salt('auth'));
}
function yes_email_fingerprint($email) {
    return hash_hmac('sha256', strtolower(trim($email)), wp_salt('auth'));
}
function yes_email_lock($key) {
    // add_option is atomic across PHP workers. Remove only expired locks.
    $name = 'yes_email_lock_' . hash('sha256', $key);
    $expiry = (int) get_option($name, 0);
    if ($expiry && $expiry < time()) { delete_option($name); }
    return add_option($name, time() + 60, '', false) ? $name : false;
}
function yes_email_provider() {
    if (!class_exists('OTP\\Helper\\GatewayFunctions') || !function_exists('get_mo_option') || (defined('MO_TEST_MODE') && MO_TEST_MODE) || !get_mo_option('admin_customer_key') || !get_mo_option('admin_api_key')) {
        return new WP_Error('provider', 'Email verification is temporarily unavailable. Save your progress and try again later.');
    }
    return OTP\Helper\GatewayFunctions::instance();
}
function yes_email_request() {
    if (!check_ajax_referer('yes_registration_email', 'security', false)) { wp_send_json_error(array('message' => 'This page has expired. Reload the form and try again.'), 403); }
    $form_id = isset($_POST['form_id']) && is_scalar($_POST['form_id']) ? absint($_POST['form_id']) : 0;
    $forms = yes_email_forms();
    if (!isset($forms[$form_id]) || get_post_status($form_id) !== 'publish') { wp_send_json_error(array('message' => 'This registration form is unavailable.'), 400); }
    $raw = isset($_POST['email']) && is_string($_POST['email']) ? trim(wp_unslash($_POST['email'])) : '';
    $email = strtolower(sanitize_email($raw));
    if (!$email || !is_email($email) || strcasecmp($raw, $email) !== 0) { wp_send_json_error(array('message' => 'Enter a valid email address first.'), 400); }
    $key = yes_email_browser_key($form_id, true);
    if (!$key) { wp_send_json_error(array('message' => 'Enable cookies, reload the form and try again.'), 400); }
    return array($form_id, $email, $key);
}
function yes_email_send() {
    list($form_id, $email, $key) = yes_email_request();
    $recipient = yes_email_fingerprint($email);
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $ip_key = 'yes_email_ip_' . hash_hmac('sha256', $ip, wp_salt('auth'));
    $recipient_key = 'yes_email_recipient_' . $recipient;
    $lock = yes_email_lock($recipient_key);
    $ip_lock = $lock ? yes_email_lock($ip_key) : false;
    if (!$lock || !$ip_lock) {
        if ($lock) { delete_option($lock); }
        wp_send_json_error(array('message' => 'A code request is already in progress. Please try again shortly.'), 429);
    }
    $response = null;
    $error = '';
    $status = 400;
    try {
        $recent = get_transient($recipient_key);
        $ip_count = (int) get_transient($ip_key);
        if (is_array($recent) && time() - (int) $recent['last'] < 60) {
            $error = 'Please wait 60 seconds before requesting another email code.';
            $status = 429;
        } elseif ((is_array($recent) && (int) $recent['count'] >= 5) || $ip_count >= 100) {
            $error = 'Too many code requests. Save your progress and try again in an hour.';
            $status = 429;
        } else {
            $ready = yes_email_delivery_ready();
            if (is_wp_error($ready)) { $error = $ready->get_error_message(); $status = 503; }
            else {
                // Count attempts even when the provider fails, to prevent quota abuse.
                $window_end = is_array($recent) ? (int) $recent['until'] : time() + HOUR_IN_SECONDS;
                set_transient($recipient_key, array('last' => time(), 'count' => is_array($recent) ? (int) $recent['count'] + 1 : 1, 'until' => $window_end), max(60, $window_end - time()));
                set_transient($ip_key, $ip_count + 1, HOUR_IN_SECONDS);
                $state_lock = yes_email_lock($key);
                if (!$state_lock) { $error = 'Verification is in progress. Please try again shortly.'; $status = 429; }
                else {
                    try {
                        // A resend invalidates the previous code and any previous proof.
                        delete_transient($key);
                        $state = yes_email_deliver_challenge($form_id, $email, $key);
                        if (!is_wp_error($state)) {
                            set_transient($key, $state, 10 * MINUTE_IN_SECONDS);
                            $response = array('message' => 'Email code sent. Check your inbox and spam folder.', 'retry_after' => 60);
                        } else { $error = 'The email code could not be sent. Save your progress and try again later.'; $status = 503; }
                    } finally { delete_option($state_lock); }
                }
            }
        }
    } catch (Throwable $e) { $error = 'Email verification is temporarily unavailable. Please try again later.'; $status = 503; }
    finally { delete_option($ip_lock); delete_option($lock); }
    if ($response !== null) { wp_send_json_success($response); }
    wp_send_json_error(array('message' => $error), $status);
}
function yes_email_verify() {
    list($form_id, $email, $key) = yes_email_request();
    $code = isset($_POST['code']) && is_string($_POST['code']) ? trim(wp_unslash($_POST['code'])) : '';
    if (!preg_match('/^[0-9]{4,12}$/D', $code)) { wp_send_json_error(array('message' => 'Enter the verification code from your email.'), 400); }
    $lock = yes_email_lock($key);
    if (!$lock) { wp_send_json_error(array('message' => 'Verification is in progress. Please try again shortly.'), 429); }
    $success = false;
    $error = 'This code has expired. Request a new email code.';
    try {
        $state = get_transient($key);
        if (yes_email_challenge_matches($state, $form_id, $email)) {
            $state['attempts']++;
            // Save the attempt before checking either a local or legacy code.
            set_transient($key, $state, max(1, $state['expires'] - time()));
            if (yes_email_challenge_code_matches($state, $key, $code)) {
                $state['verified'] = true;
                $state['expires'] = time() + 30 * MINUTE_IN_SECONDS;
                unset($state['tx'], $state['code_hash']);
                set_transient($key, $state, 30 * MINUTE_IN_SECONDS);
                $success = true;
            } else { $error = $state['attempts'] >= 5 ? 'Too many incorrect codes. Request a new email code.' : 'That code is incorrect or expired. Check it and try again.'; }
        }
    } catch (Throwable $e) { $error = 'Email verification is temporarily unavailable. Please try again later.'; }
    finally { delete_option($lock); }
    if ($success) { wp_send_json_success(array('message' => 'Email verified.')); }
    wp_send_json_error(array('message' => $error), 400);
}
function yes_email_validated_draft($form_id) {
    return wp_doing_ajax() && isset($_POST['action'], $_POST['save_draft'], $_POST['forminator_nonce']) && is_string($_POST['action']) && is_string($_POST['save_draft']) && is_string($_POST['forminator_nonce']) && wp_unslash($_POST['action']) === 'forminator_submit_form_custom-forms' && filter_var(wp_unslash($_POST['save_draft']), FILTER_VALIDATE_BOOLEAN) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['forminator_nonce'])), 'forminator_submit_form' . (int) $form_id);
}
function yes_email_submission_errors($errors, $form_id, $fields) {
    $forms = yes_email_forms();
    $form_id = (int) $form_id;
    if (!isset($forms[$form_id]) || yes_email_validated_draft($form_id)) { return $errors; }
    $email = '';
    foreach ($fields as $field) {
        if (($field['name'] ?? '') === $forms[$form_id] && is_string($field['value'] ?? null)) { $email = strtolower(sanitize_email($field['value'])); break; }
    }
    $key = yes_email_browser_key($form_id);
    $state = $key ? get_transient($key) : false;
    if (!$email || !is_array($state) || (int) $state['form'] !== $form_id || empty($state['verified']) || (int) $state['expires'] <= time() || !hash_equals($state['recipient'], yes_email_fingerprint($email))) {
        $errors[] = array($forms[$form_id] => 'Verify this email address with the emailed code before completing registration. You can still save your progress.');
    }
    return $errors;
}
function yes_email_submission_response($response, $form_id) {
    if (isset(yes_email_forms()[(int) $form_id]) && !empty($response['success']) && !yes_email_validated_draft($form_id)) {
        $key = yes_email_browser_key($form_id);
        if ($key) { delete_transient($key); }
    }
    return $response;
}
function yes_email_enqueue() {
    $forms = yes_email_forms();
    if (!$forms) { return; }
    wp_enqueue_script('yes-registration-email', plugins_url('email-verification.js', __FILE__), array('jquery'), '1.0.0', true);
    wp_enqueue_style('yes-registration-email', plugins_url('email-verification.css', __FILE__), array(), '1.0.0');
    wp_localize_script('yes-registration-email', 'YESRegistrationEmail', array('forms' => $forms, 'url' => admin_url('admin-ajax.php'), 'nonce' => wp_create_nonce('yes_registration_email')));
}
add_action('wp_enqueue_scripts', 'yes_email_enqueue', 30);
foreach (array('yes_registration_email_send' => 'yes_email_send', 'yes_registration_email_verify' => 'yes_email_verify') as $action => $handler) {
    add_action('wp_ajax_' . $action, $handler);
    add_action('wp_ajax_nopriv_' . $action, $handler);
}
add_filter('forminator_custom_form_submit_errors', 'yes_email_submission_errors', 2, 3);
add_filter('forminator_form_ajax_submit_response', 'yes_email_submission_response', 110, 2);
