<?php
/** Run with wp eval-file. SMTP is captured in memory; no email or forms are sent. */
if (!defined('WP_CLI') || !WP_CLI) { exit; }
if (!function_exists('yes_email_deliver_challenge')) {
    require dirname(__DIR__) . '/yes-registration-email.php';
}
define('YES_EMAIL_SMTP_HOST', 'smtp.example.org');
define('YES_EMAIL_SMTP_PORT', 587);
define('YES_EMAIL_SMTP_USER', 'verification@youthecosummit.com');
define('YES_EMAIL_SMTP_PASSWORD', 'test-only-not-a-real-password');
define('YES_EMAIL_SMTP_ENCRYPTION', 'tls');
yes_email_new_mailer();
class YES_TestEmailMailer extends PHPMailer\PHPMailer\PHPMailer {
    public static $messages = array();
    public static $fail = false;
    public function send() {
        self::$messages[] = array('from' => $this->From, 'name' => $this->FromName, 'subject' => $this->Subject, 'html' => $this->Body, 'text' => $this->AltBody, 'to' => $this->getToAddresses(), 'mailer' => $this->Mailer, 'auth' => $this->SMTPAuth, 'secure' => $this->SMTPSecure);
        if (self::$fail) { throw new RuntimeException('Simulated SMTP failure'); }
        return true;
    }
}
class YES_TestJsonComplete extends RuntimeException {}
$captured_mailer = function () { return new YES_TestEmailMailer(true); };
$smtp_mode = function () { return 'smtp'; };
$ajax_mode = function () { return true; };
$die_handler = function () { return function () { throw new YES_TestJsonComplete(); }; };
$deny_http = function () { throw new RuntimeException('Unexpected network request during email tests'); };
add_filter('yes_registration_email_mailer', $captured_mailer);
add_filter('pre_option_yes_registration_email_delivery', $smtp_mode);
add_filter('wp_doing_ajax', $ajax_mode);
add_filter('wp_die_ajax_handler', $die_handler);
add_filter('pre_http_request', $deny_http);
$saved_post = $_POST;
$saved_request = $_REQUEST;
$saved_cookie = $_COOKIE;
$saved_server = $_SERVER;
$_SERVER['REMOTE_ADDR'] = '192.0.2.248';
$form = (int) yes_native_config()['student'];
$other_form = (int) yes_native_config()['teacher'];
$email = 'yes-otp-test-' . bin2hex(random_bytes(8)) . '@example.org';
$_COOKIE[yes_email_cookie_name($form)] = bin2hex(random_bytes(32));
$key = yes_email_browser_key($form);
$recipient_key = 'yes_email_recipient_' . yes_email_fingerprint($email);
$ip_key = 'yes_email_ip_' . hash_hmac('sha256', $_SERVER['REMOTE_ADDR'], wp_salt('auth'));
$passed = 0;
$assert = function ($condition, $message) use (&$passed) {
    if (!$condition) { throw new RuntimeException($message); }
    $passed++;
};
$request = function ($handler, $overrides = array()) use ($form, $email) {
    $_POST = array_merge(array('form_id' => $form, 'email' => $email, 'security' => wp_create_nonce('yes_registration_email')), $overrides);
    $_REQUEST = $_POST;
    ob_start();
    try { call_user_func($handler); } catch (YES_TestJsonComplete $e) {}
    $output = ob_get_clean();
    $result = json_decode($output, true);
    if (!is_array($result)) { throw new RuntimeException('Expected JSON response from email handler'); }
    return $result;
};
try {
    $assert(yes_email_delivery_ready() === true, 'SMTP should be independent of miniOrange');
    $result = $request('yes_email_send', array('security' => 'invalid'));
    $assert(empty($result['success']) && count(YES_TestEmailMailer::$messages) === 0, 'Invalid nonce must not send email');
    $result = $request('yes_email_send');
    $assert(!empty($result['success']) && count(YES_TestEmailMailer::$messages) === 1, 'A valid request should send exactly one branded email');
    $message = YES_TestEmailMailer::$messages[0];
    preg_match('/\n\n([0-9]{6})\n\n/', $message['text'], $matches);
    $code = $matches[1] ?? '';
    $assert(strlen($code) === 6, 'Email must contain a six-digit code');
    $assert($message['name'] === 'Youth Eco Summit' && $message['from'] === 'verification@youthecosummit.com', 'Branded sender missing');
    $assert($message['subject'] === 'Your Youth Eco Summit verification code', 'Branded subject missing');
    $assert(!preg_match('/miniorange|xecurify|transaction|WP OTP/i', $message['html'] . $message['text']), 'Third-party or transaction wording remains');
    $assert($message['mailer'] === 'smtp' && $message['auth'] && $message['secure'] === 'tls', 'SMTP must use authentication and encryption');
    $state = get_transient($key);
    $assert(isset($state['code_hash']) && !isset($state['code']) && !isset($state['tx']) && !in_array($code, $state, true), 'Plaintext OTP must not be stored');
    $assert(yes_email_challenge_code_matches($state, $key, $code), 'Code should match its original challenge');
    $assert(!yes_email_challenge_code_matches($state, $key . '-different', $code), 'Code must be bound to its browser');
    $assert(!yes_email_challenge_matches($state, $other_form, $email), 'Code must be bound to its form');
    $assert(!yes_email_challenge_matches($state, $form, 'changed@example.org'), 'Code must be bound to its email');
    $result = $request('yes_email_send');
    $assert(empty($result['success']) && count(YES_TestEmailMailer::$messages) === 1, 'Resend cooldown must prevent another email');
    $wrong = $code === '123456' ? '654321' : '123456';
    $result = $request('yes_email_verify', array('code' => $wrong));
    $assert(empty($result['success']) && get_transient($key)['attempts'] === 1, 'Incorrect code must consume an attempt');
    $result = $request('yes_email_verify', array('code' => $code));
    $proof = get_transient($key);
    $assert(!empty($result['success']) && !empty($proof['verified']) && !isset($proof['code_hash']), 'Successful verification must consume the code');
    $result = $request('yes_email_verify', array('code' => $code));
    $assert(empty($result['success']), 'Verified code must not be replayed');
    $_POST = array();
    $assert(yes_email_submission_errors(array(), $form, array(array('name' => 'email-1', 'value' => $email))) === array(), 'Valid proof should allow matching registration');
    $assert(count(yes_email_submission_errors(array(), $form, array(array('name' => 'email-1', 'value' => 'changed@example.org')))) === 1, 'Changing email must block submission');
    yes_email_submission_response(array('success' => true), $form);
    $assert(get_transient($key) === false, 'Successful final submission must consume proof');
    $expired = $state;
    $expired['expires'] = time() - 1;
    set_transient($key, $expired, 60);
    $result = $request('yes_email_verify', array('code' => $code));
    $assert(empty($result['success']), 'Expired code must fail');
    set_transient($key, $state, 600);
    for ($attempt = 0; $attempt < 5; $attempt++) { $request('yes_email_verify', array('code' => $wrong)); }
    $assert(get_transient($key)['attempts'] === 5, 'Five incorrect codes should exhaust attempts');
    $result = $request('yes_email_verify', array('code' => $code));
    $assert(empty($result['success']), 'Correct code must fail after attempt limit');
    $_POST = array('action' => 'forminator_submit_form_custom-forms', 'save_draft' => 'true', 'forminator_nonce' => wp_create_nonce('forminator_submit_form' . $form));
    $assert(yes_email_submission_errors(array(), $form, array()) === array(), 'A valid saved draft must not require email proof');
    $_POST['forminator_nonce'] = 'invalid';
    $assert(count(yes_email_submission_errors(array(), $form, array())) === 1, 'Invalid draft nonce must not bypass proof');
    delete_transient($recipient_key);
    YES_TestEmailMailer::$fail = true;
    set_transient($key, $proof, 600);
    $result = $request('yes_email_send');
    $assert(empty($result['success']) && get_transient($key) === false, 'Failed resend must not leave a usable previous code or proof');
    $assert(strpos(wp_json_encode($result), 'test-only') === false, 'SMTP errors must not expose credentials');
    $assert(yes_email_submission_errors(array(), 9188, array()) === array(), 'School SMS flow must remain outside email verification');
} finally {
    foreach (array($key, $recipient_key, $ip_key) as $cleanup) {
        delete_transient($cleanup);
        delete_option('yes_email_lock_' . hash('sha256', $cleanup));
    }
    $_POST = $saved_post;
    $_REQUEST = $saved_request;
    $_COOKIE = $saved_cookie;
    $_SERVER = $saved_server;
    remove_filter('yes_registration_email_mailer', $captured_mailer);
    remove_filter('pre_option_yes_registration_email_delivery', $smtp_mode);
    remove_filter('wp_doing_ajax', $ajax_mode);
    remove_filter('wp_die_ajax_handler', $die_handler);
    remove_filter('pre_http_request', $deny_http);
}
echo wp_json_encode(array('passed' => $passed, 'messages_delivered' => 0, 'form_entries_created' => 0, 'test_state_cleaned' => true)) . "\n";
