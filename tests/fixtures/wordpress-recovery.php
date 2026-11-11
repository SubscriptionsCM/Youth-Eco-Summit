<?php
// Isolated contract fixture: no WordPress installation, network or actual mail.
$scenario = json_decode(stream_get_contents(STDIN), true)['scenario'];
$hooks = array(); $mail = null; $reset_count = 0; $key_checks = 0; $validated = false; $valid_key = true; $cached_valid_key = null; $member_validation = false; $member_notice = 0; $member_meta = array('password_rst_attempts'=>2,'um_set_password_required'=>true);
$_POST = array('unrelated' => 'preserve'); $original_post = $_POST;
class YES_Bridge_Reset extends RuntimeException {}
class YES_Bridge_Password extends RuntimeException {}
class WP_Error {
 private $codes = array();
 public function __construct($code = '', $message = '') { if ($code) { $this->codes[] = $code; } }
 public function add($code, $message) { $this->codes[] = $code; }
 public function has_errors() { return (bool) $this->codes; }
 public function get_error_codes() { return $this->codes; }
}
class WP_User { public $ID = 123; public $user_login = 'fixture-user'; public $user_email = 'synthetic@example.org'; public $user_pass = 'fixture hash'; }
function is_wp_error($value) { return $value instanceof WP_Error; }
function add_filter($name, $callback, $priority = 10, $count = 1) { global $hooks; $hooks[$name][$priority][] = array($callback, $count); }
function remove_filter($name, $callback, $priority = 10) { global $hooks; foreach ($hooks[$name][$priority] ?? array() as $index => $entry) { if ($entry[0] === $callback) { unset($hooks[$name][$priority][$index]); } } if (empty($hooks[$name][$priority])) { unset($hooks[$name][$priority]); } if (empty($hooks[$name])) { unset($hooks[$name]); } }
function apply_filters($name, $value, ...$args) { global $hooks; $groups = $hooks[$name] ?? array(); ksort($groups); foreach ($groups as $group) { foreach ($group as $entry) { $value = $entry[0](...array_slice(array_merge(array($value), $args), 0, $entry[1])); } } return $value; }
function do_action($name, ...$args) {
 global $scenario, $validated, $member_validation;
 if ($name === 'validate_password_reset') { $validated = isset($_POST['pass1'], $_POST['pass2']) && $_POST['pass1'] === $_POST['pass2']; if ($scenario === 'blocked-password') { $args[0]->add('blocked', 'private password policy'); } }
 if ($name === 'um_change_password_errors_hook') { $member_validation = true; if ($scenario !== 'policy-valid') { UM()->form()->errors = array('user_password' => 'private native validation message'); } }
 if ($name === 'um_reset_password_errors_hook' && $scenario === 'policy-limit') { UM()->form()->errors = array('username_b' => 'private limit message'); }
 if ($name === 'um_reset_password_errors_hook' && $scenario === 'policy-alias-limit' && $args[0]['username_b'] === 'actual@example.org') { UM()->form()->errors = array('username_b' => 'private canonical-user limit'); }
}
function retrieve_password($contact) {
 global $scenario, $mail;
 if ($scenario === 'unknown') { return new WP_Error('invalidcombo', 'private account detail'); }
 $user = get_userdata(123); $errors = new WP_Error();
 $user = apply_filters('lostpassword_user_data', $user, $errors);
 if (!$user || $errors->has_errors()) { return $errors; }
 $mail = apply_filters('retrieve_password_notification_email', array('to' => $user->user_email, 'subject' => 'Native title', 'message' => 'Native message', 'headers' => ''), 'FixtureNativeKey12345', $user->user_login, $user);
 return $scenario === 'mail-failure' ? new WP_Error('retrieve_password_email_failure', 'private SMTP detail') : true;
}
function check_password_reset_key($key, $login) {
 global $scenario, $key_checks, $valid_key, $cached_valid_key; $key_checks++;
 if ($cached_valid_key === null) { $cached_valid_key = $valid_key; }
 if (!$cached_valid_key || in_array($scenario, array('invalid', 'expired'), true) || $key !== 'FixtureNativeKey12345' || $login !== 'fixture-user') { return new WP_Error('invalid_key', 'private key'); }
 return new WP_User();
}
function yes_bridge_identity($user) { global $scenario; if ($scenario === 'blocked-account') { throw new YES_Bridge_Reset(); } return array('sourceUserId' => (string) $user->ID); }
function reset_password($user, $password) { global $reset_count, $valid_key; if ($password !== 'SyntheticChosenPass9!') { throw new RuntimeException(); } $reset_count++; $valid_key = false; }
function clean_user_cache($id) { global $cached_valid_key; $cached_valid_key = null; }
function get_userdata($id) { global $scenario; $user = new WP_User(); if (strpos($scenario, 'policy-alias-') === 0) { $user->user_login = 'login@example.org'; $user->user_email = 'actual@example.org'; } return $user; }
function wp_check_password($password, $hash, $id) { global $reset_count; return $reset_count > 0 && $password === 'SyntheticChosenPass9!'; }
function sanitize_text_field($value) { return $value; }
function wp_slash($value) { return $value; }
$_COOKIE = array('unrelated' => 'preserve'); $original_cookies = $_COOKIE;
if (strpos($scenario, 'policy-') === 0) {
 define('COOKIEHASH', 'synthetic');
 $member_form = (object) array('errors'=>array('original'=>'preserve'),'post_form'=>array('original'=>'preserve'));
 $original_member_form = clone $member_form; $member_user_id = 0;
 class YES_Member_Options { public function get($key) { return $key === 'only_approved_user_reset_password'; } }
 class YES_Member_Users { public function has_status($id, $status) { global $scenario; return !in_array($scenario, array('policy-unapproved','policy-alias-unapproved'), true); } }
 class YES_Member_Common { public function users() { return new YES_Member_Users(); } }
 class YES_Member { public $honeypot = 'fixture_honeypot'; public function form() { global $member_form; return $member_form; } public function options() { return new YES_Member_Options(); } public function common() { return new YES_Member_Common(); } public function password() { return $this; } public function um_change_password_errors_hook($args) {} public function um_reset_password_errors_hook($args) {} public function user() { return $this; } public function password_changed($id) { global $member_notice; $member_notice++; } }
 function UM() { static $member; return $member ??= new YES_Member(); }
 function um_user($key) { global $member_user_id; return $member_user_id; }
 function um_fetch_user($id) { global $member_user_id; $member_user_id = $id; }
 function um_reset_user() { global $member_user_id; $member_user_id = 0; }
 function get_user_by($field, $contact) { global $scenario; if (strpos($scenario,'policy-alias-')===0 && $field==='email' && $contact==='login@example.org') { return false; } $user=get_userdata(123);if($scenario==='policy-ambiguous-email'&&$field==='email'){$user->ID=999;}return $user; }
 function is_email($value) { return filter_var($value, FILTER_VALIDATE_EMAIL); }
 function get_user_meta($id, $key, $single) { global $member_meta; return $member_meta[$key] ?? ''; }
 function update_user_meta($id, $key, $value) { global $member_meta; $member_meta[$key] = $value; }
 function delete_user_meta($id, $key) { global $member_meta; unset($member_meta[$key]); }
}
class YES_Recovery_DB {
 public $users = 'wp_users';
 public function prepare($sql, ...$args) { return $sql; }
 public function get_var($sql) { global $scenario, $valid_key; if ($scenario === 'changed-key' && strpos($sql, 'GET_LOCK') !== false) { $valid_key = false; } return $scenario === 'lock-failure' ? '0' : '1'; }
}
$wpdb = new YES_Recovery_DB(); define('DB_NAME', 'synthetic');
$unrelated = function ($email) { return $email; }; add_filter('retrieve_password_notification_email', $unrelated, 20, 4); $original_hooks = $hooks;
require __DIR__ . '/../../wordpress/yes-next-account-bridge/recovery.php';
$ok = false; $result = null; $replay_accepted = null;
try {
 if (in_array($scenario, array('mail','unknown','mail-failure','policy-limit','policy-unapproved','policy-mail','policy-alias-limit','policy-alias-unapproved','policy-ambiguous-email'), true)) { $result = yes_bridge_recovery(strpos($scenario,'policy-alias-')===0?'login@example.org':'fixture-user'); }
 else {
  $input = array('login'=>'fixture-user','key'=>'FixtureNativeKey12345','password'=>'SyntheticChosenPass9!');
  $result = yes_bridge_reset($input);
  try { yes_bridge_reset($input); $replay_accepted = true; } catch (Throwable $error) { $replay_accepted = false; }
 }
 $ok = true;
} catch (Throwable $error) {}
echo json_encode(array('ok'=>$ok,'result'=>$result,'mail'=>$mail,'hooksRestored'=>$hooks===$original_hooks,'postRestored'=>$_POST===$original_post,'resetCount'=>$reset_count,'keyChecks'=>$key_checks,'validated'=>$validated,'replayAccepted'=>$replay_accepted,'memberValidation'=>$member_validation,'memberNotice'=>$member_notice,'requestCounter'=>$member_meta['password_rst_attempts'],'passwordRequired'=>isset($member_meta['um_set_password_required']),'memberStateRestored'=>!function_exists('UM')||($member_form==$original_member_form&&$member_user_id===0&&$_COOKIE===$original_cookies)));
