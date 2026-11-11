<?php
/** Private recovery adapter, loaded after WordPress by the CLI bridge. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

function yes_bridge_recovery_origin() {
    $origin = (string) getenv('YES_APP_ORIGIN');
    $parts = parse_url($origin);
    if (!filter_var($origin, FILTER_VALIDATE_URL) || !is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
        || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['path'])
        || isset($parts['query']) || isset($parts['fragment'])) { throw new RuntimeException(); }
    return $origin;
}

/** Run the source member-plugin validators without redirecting or leaking form state. */
function yes_bridge_member_validation($hook, $args, $user = null, $key = null) {
    if (!function_exists('UM')) { return true; }
    // The service is lazy-loaded in CLI requests; instantiate it to register its validators.
    $passwords = UM()->password();
    if (!is_callable(array($passwords, 'um_change_password_errors_hook')) || !is_callable(array($passwords, 'um_reset_password_errors_hook'))) { throw new RuntimeException(); }
    $form = UM()->form();
    $saved = get_object_vars($form);
    $saved_cookies = $_COOKIE;
    $saved_user = um_user('ID');
    try {
        unset($form->errors);
        $form->post_form = $args;
        if ($user) {
            um_fetch_user($user->ID);
            if ($key !== null) { $_COOKIE['wp-resetpass-' . COOKIEHASH] = wp_slash($user->user_login . ':' . $key); }
        }
        do_action($hook, $args);
        return !isset($form->errors);
    } finally {
        foreach (array('errors', 'post_form') as $name) {
            if (array_key_exists($name, $saved)) { $form->$name = $saved[$name]; } else { unset($form->$name); }
        }
        $_COOKIE = $saved_cookies;
        if ($saved_user) { um_fetch_user($saved_user); } else { um_reset_user(); }
    }
}

function yes_bridge_recovery($contact) {
    global $wpdb;
    $origin = yes_bridge_recovery_origin();
    $render = static function ($email, $key, $login, $user) use ($origin) {
        if (!is_array($email) || !is_string($key) || !preg_match('/^[a-z0-9]{1,256}$/Di', $key)
            || !is_string($login) || $login === '' || strlen($login) > 60) { throw new RuntimeException(); }
        $url = $origin . '/reset-password#' . http_build_query(array('key' => $key, 'login' => $login), '', '&', PHP_QUERY_RFC3986);
        $escaped = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $email['message'] = '<!doctype html><html><body><h1>Reset your Youth Eco Summit password</h1>'
            . '<p>Use the link below to choose a new password on the Youth Eco Summit website.</p>'
            . '<p><a href="' . $escaped . '">Reset your password</a></p>'
            . '<p>If the link does not open, copy and paste this complete address into your browser:</p>'
            . '<p><a href="' . $escaped . '">' . $escaped . '</a></p>'
            . '<p>If you did not request this, ignore this email. Your password will remain unchanged.</p></body></html>';
        $email['headers'] = array('Content-Type: text/html; charset=UTF-8');
        return $email;
    };
    $lock = null;
    $policy = static function ($user, $errors) use (&$lock, $wpdb) {
        if (!function_exists('UM') || !($user instanceof WP_User)) { return $user; }
        if ($lock !== null) { throw new RuntimeException(); }
        $lock = 'yes-next-reset-' . substr(hash('sha256', DB_NAME . ':' . $wpdb->users . ':' . $user->ID), 0, 32);
        if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,8)', $lock)) !== '1') { $lock = null; throw new RuntimeException(); }
        clean_user_cache($user->ID);
        $user = get_userdata($user->ID);
        $allowed = $user && (!UM()->options()->get('only_approved_user_reset_password') || UM()->common()->users()->has_status($user->ID, 'approved'));
        $member_principal = $allowed ? get_user_by('email', $user->user_email) : false;
        $allowed = $allowed && $member_principal && (int) $member_principal->ID === (int) $user->ID;
        // Native WordPress has already resolved email/username aliases. Give the
        // member validator this exact user's canonical email, avoiding a second resolver.
        if ($allowed) { $allowed = yes_bridge_member_validation('um_reset_password_errors_hook', array('username_b' => $user->user_email, UM()->honeypot => '')); }
        if (!$allowed) { $errors->add('invalidcombo', 'Recovery request is unavailable.'); return false; }
        return $user;
    };
    try {
        add_filter('lostpassword_user_data', $policy, PHP_INT_MAX, 2);
        add_filter('retrieve_password_notification_email', $render, PHP_INT_MAX, 4);
        $result = retrieve_password($contact);
        // Missing identities share the same confirmation. Actual delivery failures do not.
        if (is_wp_error($result) && array_intersect($result->get_error_codes(), array('retrieve_password_email_failure', 'retrieve_password_key_failure'))) { throw new RuntimeException(); }
    } finally {
        remove_filter('retrieve_password_notification_email', $render, PHP_INT_MAX);
        remove_filter('lostpassword_user_data', $policy, PHP_INT_MAX);
        if ($lock !== null) { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)); }
    }
    return array('sent' => true);
}

function yes_bridge_reset($input) {
    global $wpdb;
    $login = $input['login'] ?? null; $key = $input['key'] ?? null; $password = $input['password'] ?? null;
    if (!is_string($login) || $login === '' || strlen($login) > 60 || !is_string($key) || !preg_match('/^[a-z0-9]{1,256}$/Di', $key)
        || !is_string($password) || $password === '' || strlen($password) > 4096) { throw new YES_Bridge_Reset(); }
    $user = check_password_reset_key($key, $login);
    if (is_wp_error($user)) { throw new YES_Bridge_Reset(); }
    try { yes_bridge_identity($user); } catch (Throwable $error) { throw new YES_Bridge_Reset(); }
    $lock = 'yes-next-reset-' . substr(hash('sha256', DB_NAME . ':' . $wpdb->users . ':' . $user->ID), 0, 32);
    if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,8)', $lock)) !== '1') { throw new RuntimeException(); }
    $saved_post = $_POST;
    try {
        // A competing reset may have consumed the native key while the lock was pending.
        clean_user_cache($user->ID);
        $user = check_password_reset_key($key, $login);
        if (is_wp_error($user)) { throw new YES_Bridge_Reset(); }
        try { yes_bridge_identity($user); } catch (Throwable $error) { throw new YES_Bridge_Reset(); }
        if (function_exists('UM')) {
            $args = array('user_password' => wp_slash($password), 'confirm_user_password' => wp_slash($password), '_um_password_change' => 1, 'rp_key' => $key, UM()->honeypot => '');
            if (!yes_bridge_member_validation('um_change_password_errors_hook', $args, $user, $key)) { throw new YES_Bridge_Password(); }
        }
        $_POST['pass1'] = wp_slash($password); $_POST['pass2'] = wp_slash($password);
        $errors = new WP_Error();
        do_action('validate_password_reset', $errors, $user);
        if ($errors->has_errors()) { throw new YES_Bridge_Password(); }
        reset_password($user, $password);
        clean_user_cache($user->ID);
        $changed = get_userdata($user->ID);
        if (!$changed || !wp_check_password($password, $changed->user_pass, $changed->ID)
            || !is_wp_error(check_password_reset_key($key, $login))) { throw new RuntimeException(); }
        if (function_exists('UM')) {
            UM()->user()->password_changed($changed->ID);
            if (get_user_meta($changed->ID, 'password_rst_attempts', true)) { update_user_meta($changed->ID, 'password_rst_attempts', 0); }
            if (get_user_meta($changed->ID, 'um_set_password_required', true)) { delete_user_meta($changed->ID, 'um_set_password_required'); }
            do_action('um_after_changing_user_password', $changed->ID);
        }
        return yes_bridge_identity($changed);
    } finally {
        $_POST = $saved_post;
        $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
    }
}
