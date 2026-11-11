<?php
/** Private CLI adapter. Deploy outside every public web root. Never install as a REST endpoint. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0');
ini_set('log_errors', '0');
$yes_bridge_sent = false;
ob_start();
class YES_Bridge_Credentials extends RuntimeException {}
class YES_Bridge_Conflict extends RuntimeException {}
function yes_bridge_reply($data = null, $error = null) {
    global $yes_bridge_sent;
    $yes_bridge_sent = true;
    while (ob_get_level()) { ob_end_clean(); }
    echo json_encode($error === null ? array('ok' => true, 'data' => $data) : array('ok' => false, 'error' => $error), JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
register_shutdown_function(function () {
    global $yes_bridge_sent;
    if (!$yes_bridge_sent) { yes_bridge_reply(null, 'unavailable'); }
});
function yes_bridge_identity($user) {
    if (!($user instanceof WP_User) || !$user->exists() || (int) $user->user_status !== 0 || !empty($user->spam) || !empty($user->deleted) || !is_email($user->user_email)) { throw new YES_Bridge_Credentials(); }
    $status = (string) get_user_meta($user->ID, 'account_status', true);
    if ($status !== '' && $status !== 'approved') { throw new YES_Bridge_Credentials(); }
    return array(
        'source' => untrailingslashit(home_url()),
        'sourceUserId' => (string) $user->ID,
        'email' => strtolower(trim($user->user_email)),
        'username' => $user->user_login,
        'name' => $user->display_name,
        'credentialFingerprint' => hash_hmac('sha256', (string) $user->ID . "\0" . $user->user_pass, wp_salt('auth')),
    );
}
function yes_bridge_create($input) {
    global $wpdb;
    $username = $input['username'] ?? null;
    $email = $input['email'] ?? null;
    $password = $input['password'] ?? null;
    $nonce = $input['registrationNonce'] ?? null;
    $form_key = $input['formKey'] ?? null;
    if (!is_string($username) || trim($username) !== $username || strlen($username) > 60 || !validate_username($username) || sanitize_user($username, true) !== $username
        || !is_string($email) || !is_email($email) || strlen($email) > 254 || strtolower(trim($email)) !== $email
        || !is_string($password) || $password === '' || strlen($password) > 4096
        || !is_string($nonce) || !preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D', $nonce)
        || !in_array($form_key, array('student', 'teacher'), true)) { throw new YES_Bridge_Conflict(); }
    if (!function_exists('yes_native_config') || !class_exists('Forminator_API') || is_multisite()) { throw new RuntimeException(); }
    $config = yes_native_config();
    $model = Forminator_API::get_form((int) ($config[$form_key] ?? 0));
    if (is_wp_error($model) || !is_object($model) || !isset($model->settings) || get_post_status((int) ($config[$form_key] ?? 0)) !== 'publish') { throw new RuntimeException(); }
    // Re-read native account policy. Multisite site-creation roles are never used.
    $required = array('form-type' => 'registration', 'registration-username-field' => 'text-1', 'registration-email-field' => 'email-1',
        'registration-password-field' => 'password-1', 'registration-first-name-field' => 'text-1', 'registration-user-role' => 'fixed', 'registration-role-field' => 'subscriber',
        'activation-method' => 'default');
    foreach ($required as $key => $value) { if (($model->settings[$key] ?? null) !== $value) { throw new RuntimeException(); } }
    $subscriber = get_role('subscriber');
    if (!$subscriber) { throw new RuntimeException(); }
    foreach ((array) $subscriber->capabilities as $capability => $enabled) {
        if ($enabled && $capability !== 'read' && $capability !== 'level_0') { throw new RuntimeException(); }
    }
    $engines = $wpdb->get_col($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s,%s)', $wpdb->users, $wpdb->usermeta));
    if (count($engines) !== 2 || count(array_filter($engines, function ($engine) { return strtoupper($engine) === 'INNODB'; })) !== 2) { throw new RuntimeException(); }
    $lock = 'yes-next-register-' . substr(hash('sha256', DB_NAME . ':' . $wpdb->users), 0, 32);
    if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,8)', $lock)) !== '1') { throw new RuntimeException(); }
    $created_id = 0;
    try {
        if ($wpdb->query('START TRANSACTION') === false) { throw new RuntimeException(); }
        if ($wpdb->query('SAVEPOINT yes_next_registration') === false) { throw new RuntimeException(); }
        $matches = $wpdb->get_col($wpdb->prepare("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key=%s AND meta_value=%s LIMIT 2 FOR UPDATE", '_yes_next_registration_nonce', $nonce));
        if (count($matches) > 1) { throw new YES_Bridge_Conflict(); }
        if ($matches) {
            clean_user_cache((int) $matches[0]);
            $user = get_userdata((int) $matches[0]);
            if (!$user || $user->user_login !== $username || strtolower($user->user_email) !== $email || count($user->roles) !== 1 || !in_array('subscriber', $user->roles, true)
                || !wp_check_password($password, $user->user_pass, $user->ID)) { throw new YES_Bridge_Conflict(); }
        } else {
            if (username_exists($username) || email_exists($email)) { throw new YES_Bridge_Conflict(); }
            $created_id = wp_insert_user(array('user_login' => $username, 'user_email' => $email, 'user_pass' => $password,
                'display_name' => $username, 'first_name' => $username, 'role' => 'subscriber', 'meta_input' => array('_yes_next_registration_nonce' => $nonce)));
            if (is_wp_error($created_id)) { $created_id = 0; throw new YES_Bridge_Conflict(); }
            clean_user_cache($created_id);
            $user = get_userdata($created_id);
            if (!$user || $user->user_login !== $username || strtolower($user->user_email) !== $email || count($user->roles) !== 1 || !in_array('subscriber', $user->roles, true)
                || !hash_equals($nonce, (string) get_user_meta($created_id, '_yes_next_registration_nonce', true))) { throw new RuntimeException(); }
        }
        // Never force approval. Native hooks must leave the account eligible.
        $identity = yes_bridge_identity($user);
        // Detect native hooks that ended our transaction before returning.
        if ($wpdb->query('RELEASE SAVEPOINT yes_next_registration') === false) { throw new RuntimeException(); }
        if ($wpdb->query('COMMIT') === false) { throw new RuntimeException(); }
        clean_user_cache($user->ID);
        return $identity;
    } catch (Throwable $error) {
        $wpdb->query('ROLLBACK');
        if ($created_id) { clean_user_cache($created_id); }
        throw $error;
    } finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)); }
}
function yes_bridge_request_dispatcher() {
    $raw = stream_get_contents(STDIN, 1048577);
    $request = json_decode($raw, true);
    if (strlen($raw) > 1048576 || !is_array($request) || !isset($request['action'], $request['input']) || !is_string($request['action']) || !is_array($request['input'])) { yes_bridge_reply(null, 'unavailable'); }
    $notification = in_array($request['action'], array('notification-plan', 'notification-mail'), true);
    if (!$notification && strlen($raw) > 32768) { yes_bridge_reply(null, 'unavailable'); }
    if (!in_array($request['action'], array('login', 'status', 'mail', 'recovery', 'create', 'notification-plan', 'notification-mail'), true)) { yes_bridge_reply(null, 'unavailable'); }
    // Capture by value before WordPress/plugins populate the global scope.
    return static function () use ($request) {
        $action = $request['action'];
        $input = $request['input'];
        if ($action === 'notification-plan' || $action === 'notification-mail') {
            require __DIR__ . '/notifications.php';
            if ($action === 'notification-plan') { yes_bridge_reply(yes_bridge_notification_plan($input)); }
            require __DIR__ . '/delivery.php';
            yes_bridge_reply(yes_bridge_notification_mail($input));
        }
        if ($action === 'create') { yes_bridge_reply(yes_bridge_create($input)); }
        if ($action === 'login') {
            $contact = $input['contact'] ?? null;
            $password = $input['password'] ?? null;
            if (!is_string($contact) || $contact === '' || strlen($contact) > 254 || !is_string($password) || $password === '' || strlen($password) > 4096) { yes_bridge_reply(null, 'credentials'); }
            $user = wp_authenticate($contact, $password);
            if (is_wp_error($user)) { yes_bridge_reply(null, 'credentials'); }
            clean_user_cache($user->ID);
            yes_bridge_reply(yes_bridge_identity(get_userdata($user->ID)));
        }
        if ($action === 'status') {
            $source_id = $input['sourceUserId'] ?? null;
            if (!is_string($source_id) || !preg_match('/^[1-9][0-9]{0,19}$/D', $source_id)) { yes_bridge_reply(null, 'credentials'); }
            yes_bridge_reply(yes_bridge_identity(get_userdata((int) $source_id)));
        }
        if ($action === 'recovery') {
            $contact = $input['contact'] ?? null;
            if (!is_string($contact) || $contact === '' || strlen($contact) > 254) { yes_bridge_reply(null, 'credentials'); }
            // Keep account existence and native reset tokens out of the response.
            retrieve_password($contact);
            yes_bridge_reply(array('sent' => true));
        }
        if ($action === 'mail') {
            $to = $input['to'] ?? null;
            $subject = $input['subject'] ?? null;
            $body = $input['body'] ?? null;
            if (!is_string($to) || !is_email($to) || strlen($to) > 254 || !is_string($subject) || strlen($subject) > 250 || preg_match('/[\r\n]/', $subject) || !is_string($body) || strlen($body) > 12000) { yes_bridge_reply(null, 'unavailable'); }
            if (!wp_mail($to, $subject, $body)) { yes_bridge_reply(null, 'unavailable'); }
            yes_bridge_reply(array('sent' => true));
        }
    };
}
try {
    $yes_bridge_dispatch = yes_bridge_request_dispatcher();
    $yes_bridge_root = realpath((string) getenv('WORDPRESS_ROOT'));
    if (!$yes_bridge_root || !is_file($yes_bridge_root . '/wp-load.php') || !is_readable($yes_bridge_root . '/wp-load.php')) { yes_bridge_reply(null, 'unavailable'); }
    $yes_bridge_origin = rtrim((string) getenv('WORDPRESS_ORIGIN'), '/');
    $yes_bridge_origin_parts = parse_url($yes_bridge_origin);
    if (!filter_var($yes_bridge_origin, FILTER_VALIDATE_URL) || !is_array($yes_bridge_origin_parts) || ($yes_bridge_origin_parts['scheme'] ?? '') !== 'https'
        || empty($yes_bridge_origin_parts['host']) || isset($yes_bridge_origin_parts['user']) || isset($yes_bridge_origin_parts['pass'])
        || isset($yes_bridge_origin_parts['path']) || isset($yes_bridge_origin_parts['query']) || isset($yes_bridge_origin_parts['fragment'])) { yes_bridge_reply(null, 'unavailable'); }
    $_SERVER['HTTPS'] = 'on';
    $_SERVER['HTTP_HOST'] = $yes_bridge_origin_parts['host'] . (isset($yes_bridge_origin_parts['port']) ? ':' . $yes_bridge_origin_parts['port'] : '');
    $_SERVER['SERVER_NAME'] = $yes_bridge_origin_parts['host'];
    $_SERVER['SERVER_PORT'] = (string) ($yes_bridge_origin_parts['port'] ?? 443);
    define('WP_USE_THEMES', false);
    // WordPress relies on globally initialized variables. Only dispatch is isolated.
    require $yes_bridge_root . '/wp-load.php';
    ini_set('display_errors', '0');
    ini_set('log_errors', '0');
    if (untrailingslashit(home_url()) !== rtrim((string) getenv('WORDPRESS_ORIGIN'), '/')) { yes_bridge_reply(null, 'unavailable'); }
    $yes_bridge_dispatch();
} catch (Throwable $error) { yes_bridge_reply(null, $error instanceof YES_Bridge_Credentials ? 'credentials' : ($error instanceof YES_Bridge_Conflict ? 'conflict' : 'unavailable')); }
