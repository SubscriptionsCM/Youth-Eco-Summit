<?php
/** Offline native-renderer contract fixture. Never loads WordPress or sends mail. */
define('FORMINATOR_VERSION', '1.53.1');
define('MB_IN_BYTES', 1048576);
$wp_filter = array();
$wp_actions = array();
$source_writes = 0;
$mail_attempts = 0;
$renderer_failure = false;
$native_source = getenv('YES_FORMINATOR_SOURCE');
if ($native_source) { define('ABSPATH', __DIR__ . '/'); }
function add_filter($name, $callback, $priority = 10, $arguments = 1) {
    $GLOBALS['wp_filter'][$name][$priority][] = array($callback, $arguments);
}
function remove_filter($name, $callback, $priority = 10) {
    foreach ($GLOBALS['wp_filter'][$name][$priority] ?? array() as $key => $entry) {
        if ($entry[0] === $callback) { unset($GLOBALS['wp_filter'][$name][$priority][$key]); }
    }
}
function apply_filters($name, $value, ...$arguments) {
    $hooks = $GLOBALS['wp_filter'][$name] ?? array();
    ksort($hooks);
    foreach ($hooks as $callbacks) {
        foreach ($callbacks as $entry) { $value = call_user_func_array($entry[0], array_slice(array_merge(array($value), $arguments), 0, $entry[1])); }
    }
    return $value;
}
function do_action($name, ...$arguments) {
    $GLOBALS['wp_actions'][$name] = ($GLOBALS['wp_actions'][$name] ?? 0) + 1;
    apply_filters($name, null, ...$arguments);
}
function wp_mail(...$arguments) {
    $arguments = apply_filters('wp_mail', $arguments);
    $pre = apply_filters('pre_wp_mail', null, $arguments);
    if ($pre !== null) { return $pre; }
    ++$GLOBALS['mail_attempts'];
    throw new RuntimeException('Fixture mail must never be invoked.');
}
function is_email($value) { return filter_var($value, FILTER_VALIDATE_EMAIL); }
function is_wp_error($value) { return false; }
function wp_timezone() { return new DateTimeZone('Asia/Kolkata'); }
function esc_html($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function esc_url($value) { return $value; }
function admin_url($path) { return 'https://source.example.org/wp-admin/' . $path; }
function esc_html__($value, $domain = '') { return $value; }
function get_global_sender_email_address() { return 'sender@source.example.org'; }
function get_global_sender_name() { return 'Native Sender'; }
function get_the_title($id = null) { return ''; }
function forminator_get_current_url() { return 'https://portal.example.org/dashboard'; }
function site_url() { return 'https://source.example.org'; }
function is_user_logged_in() { return false; }
function forminator_set_message_vars(...$arguments) { return array(); }
function forminator_addons_disabled() { return true; }
function wp_strip_all_tags($value) { return trim(strip_tags($value)); }
function wpautop($value) { return $value; }
function make_clickable($value) { return $value; }
function yes_test_answer_text($entry) {
    $values = array();
    foreach (array('text-1', 'name-1', 'textarea-1', 'address-1') as $id) {
        if (!isset($entry->meta_data[$id])) { continue; }
        $value = $entry->meta_data[$id]['value'];
        if (is_array($value)) { array_walk_recursive($value, function ($part) use (&$values) { $values[] = $part; }); }
        else { $values[] = $value; }
    }
    return implode('|', $values);
}
function forminator_replace_form_data($value, $model, $entry = null, $full = false) {
    if ($GLOBALS['renderer_failure']) { throw new RuntimeException('Injected native renderer failure.'); }
    if (array_key_exists('password-1', Forminator_CForm_Front_Action::$prepared_data)) { throw new RuntimeException('Password leaked into native prepared data.'); }
    $value = str_replace('{email-1}', Forminator_CForm_Front_Action::$prepared_data['email-1'] ?? '', $value);
    if (strpos($value, 'Current source template') === 0) {
        $url = $entry->meta_data['upload-1']['value']['file']['file_url'][0] ?? '';
        return 'NATIVE:' . $value . ':<a href="' . $url . '">native-file-caption</a>' . yes_test_answer_text($entry);
    }
    return $value;
}
function forminator_replace_variables($value, $id = false, $entry = null) { return $value; }
function forminator_replace_custom_form_data($value, $model, $entry, $excluded = array()) {
    return apply_filters('forminator_replace_custom_form_data', $value, $model, Forminator_CForm_Front_Action::$prepared_data, $entry, $excluded, array());
}
function forminator_old_field($id, $fields, $form_id) { return false; }
function wp_unslash($value) { return $value; }
if ($native_source) {
    require $native_source . '/library/abstracts/abstract-class-field.php';
    foreach (array('text', 'name', 'textarea', 'address', 'consent', 'email', 'radio', 'select') as $type) {
        require $native_source . '/library/fields/' . $type . '.php';
    }
} else {
class Forminator_Field {
    public static function is_condition_matched($condition) {
        return (Forminator_CForm_Front_Action::$prepared_data[$condition['element_id']] ?? null) === $condition['value'];
    }
    public static function is_hidden($field_settings, $extra_conditions = array(), $group_suffix = '') {
        foreach ($field_settings['conditions'] ?? array() as $condition) {
            if (!self::is_condition_matched($condition)) { return true; }
        }
        return false;
    }
}
}
function wp_upload_dir() { return array('basedir' => '/source/uploads'); }
function recreate_prepared_data($model, $entry) {
    $data = array();
    foreach ($entry->meta_data as $field => $meta) {
        $data[$field] = $meta['value'];
        if (is_array($meta['value'])) {
            foreach ($meta['value'] as $part => $value) { $data[$field . '-' . $part] = $value; }
        }
    }
    $data['form_id'] = $entry->form_id;
    return $data;
}
class Forminator_Front_Action {
    public static $prepared_data = array('original' => 'prepared');
    public static $hidden_fields = array('original-hidden');
    public static $module_object = 'original-module';
    public static $module_id = 1;
}
if ($native_source) {
    require $native_source . '/library/modules/custom-forms/front/front-action.php';
} else {
class Forminator_CForm_Front_Action extends Forminator_Front_Action {
    public static $replace_to_zero = array();
    private static function update_hidden_fields_array($field_id, $group_prefix, $field_settings) {
        self::$hidden_fields[] = $field_id;
        if ($field_settings['type'] === 'group') {
            foreach (self::$module_object->get_grouped_fields($field_id) as $field) {
                self::update_hidden_fields_array($field->slug, '', $field->to_formatted_array());
            }
        }
        unset(self::$prepared_data[$field_id]);
    }
}
}
class Forminator_Database_Tables {
    const FORM_ENTRY = 'entries';
    const FORM_ENTRY_META = 'entry_meta';
    public static function get_table_name($table) { return 'fixture_' . $table; }
}
if ($native_source) {
    require $native_source . '/library/model/class-form-entry-model.php';
} else {
class Forminator_Form_Entry_Model {
    public $entry_id = 0;
    public $form_id;
    public $entry_type;
    public $meta_data = array();
    public $date_created_sql;
    public $date_created;
    public $time_created;
    public function __construct($entry_id = 0) { if ($entry_id) { throw new RuntimeException('Must construct an unsaved entry.'); } }
}
}
class YES_Notification_Test_Field {
    public $slug;
    public $type;
    public $parent_group = '';
    public $conditions = array();
    public $settings = array();
    public function __construct($slug, $type) { $this->slug = $slug; $this->type = $type; }
    public function to_formatted_array() { return array_merge($this->settings, array('type' => $this->type, 'element_id' => $this->slug, 'conditions' => $this->conditions, 'parent_group' => $this->parent_group)); }
}
class YES_Notification_Test_Model {
    public $id = 48542;
    public $notifications = array();
    public $fields = array();
    public function get_fields() { return $this->fields; }
    public function get_field($id, $formatted = true) {
        foreach ($this->fields as $field) { if ($field->slug === $id) { return $formatted ? $field->to_formatted_array() : $field; } }
        return null;
    }
    public function get_grouped_fields($id) { return array_filter($this->fields, function ($field) use ($id) { return $field->parent_group === $id; }); }
}
class Forminator_API {
    public static $model;
    public static function get_form($id) { return $id === self::$model->id ? self::$model : null; }
}
class YES_Notification_Test_Sanitizer {
    public function sanitize($field, $data) {
        if (in_array($field['type'], array('text', 'name', 'textarea', 'address'), true)) {
            if (is_array($data)) {
                foreach ($data as $key => $value) { $data[$key] = $this->sanitize($field, $value); }
                return $data;
            }
            return strip_tags($data);
        }
        return $data;
    }
}
class Forminator_Core {
    public static function get_field_object($type) {
        if (in_array($type, array('password', 'captcha', 'recaptcha'), true)) { throw new RuntimeException('Sensitive fields must not reach the mail sanitizer.'); }
        if ($GLOBALS['native_source']) {
            // Exercise installed sanitizers without constructor admin-init hooks.
            return (new ReflectionClass('Forminator_' . ucfirst($type)))->newInstanceWithoutConstructor();
        }
        return new YES_Notification_Test_Sanitizer();
    }
}
if ($native_source) {
    require $native_source . '/library/abstracts/abstract-class-mail.php';
    require $native_source . '/library/modules/custom-forms/front/front-mail.php';
} else {
class Forminator_Mail {
    protected static $is_email_context = false;
    protected $recipients = array();
    protected $subject = '';
    protected $message = '';
    protected $attachment = array();
    protected $pdfs = array();
    public function get_headers() { return array('From: Native Sender <sender@source.example.org>', 'Content-Type: text/html; charset=UTF-8', 'X-Native-Renderer: fixture'); }
    private function clean() { $this->subject = trim($this->subject); $this->message .= '|native-clean'; }
    public function set_pdfs($notification) { $this->pdfs = $notification['email-pdfs'] ?? array(); }
    public function set_attachment($attachment, $model = null, $entry = null) {
        $attachment = array_filter($attachment, function ($path) { return strpos($path, '/source/uploads') === 0; });
        $this->attachment = apply_filters('forminator_custom_form_mail_attachment', $attachment, $model, $entry, $this->pdfs);
    }
    public function send_multiple() { return wp_mail($this->recipients, $this->subject, $this->message, $this->get_headers(), $this->attachment); }
}
class Forminator_CForm_Front_Mail extends Forminator_Mail {
    public function process_mail($model, Forminator_Form_Entry_Model $entry, $submitted_data = array()) {
        apply_filters('forminator_custom_form_mail_data', Forminator_CForm_Front_Action::$prepared_data, $model, $entry);
        do_action('forminator_custom_form_mail_before_send_mail', $this, $model, Forminator_CForm_Front_Action::$prepared_data, $entry);
        if ($GLOBALS['renderer_failure']) { throw new RuntimeException('Injected native renderer failure.'); }
        foreach ($model->notifications as $notification) {
            if ($notification['type'] === 'save_draft') { continue; }
            if (!empty($notification['conditions']) && Forminator_CForm_Front_Action::$prepared_data['radio-1'] !== 'educator') { continue; }
            $this->recipients = array(str_replace('{email-1}', Forminator_CForm_Front_Action::$prepared_data['email-1'], $notification['recipients']));
            $this->subject = $notification['email-subject'];
            $files = array();
            foreach ($entry->meta_data as $field => $meta) {
                if (!in_array($field, Forminator_CForm_Front_Action::$hidden_fields, true) && isset($meta['value']['file']['file_path'])) {
                    $files = array_merge($files, (array) $meta['value']['file']['file_path']);
                }
            }
            $bytes = 0;
            foreach ($files as $file) { if (file_exists($file)) { $bytes += filesize($file); } }
            $url = $entry->meta_data['upload-1']['value']['file']['file_url'][0] ?? '';
            $this->message = 'NATIVE:' . $notification['email-editor'] . ':<a href="' . $url . '">native-file-caption</a>' . yes_test_answer_text($entry);
            if ($bytes >= 15 * MB_IN_BYTES && $notification['email-attachment'] === 'true') {
                $this->message .= 'Note: Attachments were not included due to size limits.';
            }
            $this->set_pdfs($notification);
            $this->set_attachment($bytes < 15 * MB_IN_BYTES && $notification['email-attachment'] === 'true' ? $files : array(), $model, $entry);
            $this->send_multiple();
            do_action('forminator_custom_form_mail_admin_sent', $this, $model, array(), $entry, $this->recipients);
        }
        do_action('forminator_custom_form_mail_after_send_mail', $this, $model, array());
    }
}
}
$adapter = dirname(__DIR__) . '/notifications.php';
if (is_file($adapter)) { require $adapter; }
function check($condition, $message) { if (!$condition) { throw new RuntimeException($message); } }
check(function_exists('yes_bridge_notification_plan'), 'The native notification plan adapter must exist.');
$model = new YES_Notification_Test_Model();
$model->fields = array(new YES_Notification_Test_Field('email-1', 'email'), new YES_Notification_Test_Field('radio-1', 'radio'), new YES_Notification_Test_Field('upload-1', 'upload'), new YES_Notification_Test_Field('password-1', 'password'));
$notification = array('slug' => 'notification-native', 'type' => 'default', 'recipients' => '{email-1}', 'email-subject' => ' Native subject ', 'email-editor' => 'Current source template', 'email-attachment' => 'true');
$model->notifications = array($notification);
Forminator_API::$model = $model;
$input = array('formId' => 48542, 'recordId' => '10000000-0000-4000-8000-000000000001', 'reference' => 'YES-FIXTURE-1', 'submittedAt' => '2026-11-10T12:00:00.000Z', 'portalOrigin' => 'https://portal.example.org', 'normalizedAnswers' => array('email-1' => 'fixture@example.org', 'radio-1' => 'student', 'password-1' => 'must-stay-secret'), 'verifiedFileDescriptors' => array(array('fieldId' => 'upload-1', 'fileId' => '20000000-0000-4000-8000-000000000001', 'filename' => 'work.pdf', 'byteSize' => 1024, 'checksum' => str_repeat('a', 64), 'mimeType' => 'application/pdf')));
if ($native_source) {
    add_filter('forminator_email_message', function ($message) { return $message . '|native-clean'; });
    add_filter('forminator_mailer_headers', function ($headers) { $headers[] = 'X-Native-Renderer: fixture'; return $headers; });
}
add_filter('pre_wp_mail', function ($value) { ++$GLOBALS['mail_attempts']; return true; });
foreach (array('forminator_custom_form_mail_before_send_mail', 'forminator_custom_form_mail_after_send_mail', 'forminator_custom_form_mail_admin_sent') as $hook) {
    add_filter($hook, function ($value) { ++$GLOBALS['source_writes']; return $value; });
    $wp_actions[$hook] = 7;
}
$original_hooks = $wp_filter;
$original_actions = $wp_actions;
Forminator_CForm_Front_Action::$hidden_fields = array('original-hidden');
$email_context = new ReflectionProperty('Forminator_Mail', 'is_email_context');
$email_context->setAccessible(true);
$email_context->setValue(true);
$plan = yes_bridge_notification_plan($input);
check(count($plan) === 1, 'Capture one native notification.');
check($plan[0]['recipients'] === array('fixture@example.org'), 'Resolve native recipient placeholders.');
check($plan[0]['subject'] === 'Native subject', 'Use native subject cleaning.');
check(strpos($plan[0]['body'], 'NATIVE:Current source template:') === 0 && substr($plan[0]['body'], -13) === '|native-clean', 'Use native body rendering and cleaning.');
check($plan[0]['headers'] === array('From: Native Sender <sender@source.example.org>', 'Content-Type: text/html; charset=UTF-8', 'X-Native-Renderer: fixture'), 'Preserve native headers.');
check($plan[0]['attachmentFieldIds'] === array('upload-1'), 'Return declarative source-selected attachment fields.');
check(strpos($plan[0]['body'], '>work.pdf</a>') !== false, 'Identify private portal upload links using verified filenames.');
$html_input = $input;
$html_value = 'Authorized QA test & <script>fixture</script>';
$model->fields[] = new YES_Notification_Test_Field('text-1', 'text');
$model->fields[] = new YES_Notification_Test_Field('name-1', 'name');
$model->fields[] = new YES_Notification_Test_Field('textarea-1', 'textarea');
$model->fields[] = new YES_Notification_Test_Field('address-1', 'address');
$model->fields[] = new YES_Notification_Test_Field('consent-1', 'consent');
$html_input['normalizedAnswers']['text-1'] = $html_value;
$html_input['normalizedAnswers']['name-1'] = array('first-name' => $html_value, 'last-name' => 'Student');
$html_input['normalizedAnswers']['textarea-1'] = $html_value;
$html_input['normalizedAnswers']['address-1'] = array('street_address' => $html_value, 'address_city' => 'Delhi');
$html_input['normalizedAnswers']['consent-1'] = true;
$sanitized_values = null;
$inspect_sanitized = function ($data, $form, $entry) use (&$sanitized_values) {
    $sanitized_values = array('data' => $data, 'meta' => $entry->meta_data);
    return $data;
};
add_filter('forminator_custom_form_mail_data', $inspect_sanitized, 10, 3);
$html_plan = yes_bridge_notification_plan($html_input);
unset($wp_filter['forminator_custom_form_mail_data']);
check(stripos($html_plan[0]['body'], '<script>') === false, 'Native notification text, name, textarea and address values must be field-sanitized before rendering.');
check(strpos($html_plan[0]['body'], 'Authorized QA test & ') !== false, 'Retain ordinary text and ampersands during native field sanitization.');
check(array_keys($sanitized_values['meta']['name-1']['value']) === array('first-name', 'last-name'), 'Preserve native structured name values.');
check(array_keys($sanitized_values['meta']['address-1']['value']) === array('street_address', 'address_city'), 'Preserve native structured address values.');
check($sanitized_values['meta']['consent-1']['value'] === true && $sanitized_values['data']['radio-1'] === 'student', 'Preserve consent and source choice-condition values.');
check(!isset($sanitized_values['meta']['password-1'], $sanitized_values['data']['password-1']), 'Keep passwords out of native sanitized mail data.');
$unicode_input = $input;
$unicode_name = str_repeat("\u{540D}", 200) . '.pdf';
$unicode_input['verifiedFileDescriptors'][0]['filename'] = $unicode_name;
$unicode_plan = yes_bridge_notification_plan($unicode_input);
check(strpos($unicode_plan[0]['body'], '>' . $unicode_name . '</a>') !== false, 'Preserve a valid 200-character CJK filename in the native notification.');
foreach (array(str_repeat("\u{540D}", 252) . '.pdf', "\xC3\x28.pdf") as $invalid_name) {
    $unicode_input['verifiedFileDescriptors'][0]['filename'] = $invalid_name;
    try { yes_bridge_notification_plan($unicode_input); throw new RuntimeException('Invalid filename was accepted.'); }
    catch (RuntimeException $error) { check($error->getMessage() === 'Invalid verified notification file.', 'Reject oversized or invalid UTF-8 display filenames.'); }
}
check(strpos(json_encode($plan), 'yes-next-notification:') === false, 'Virtual upload paths must stay private.');
check($mail_attempts === 0 && $source_writes === 0, 'Capture must not send mail or invoke source mutation actions.');
check($wp_filter === $original_hooks && $wp_actions === $original_actions, 'Restore hooks and action counts after capture.');
check(Forminator_CForm_Front_Action::$prepared_data === array('original' => 'prepared') && Forminator_Front_Action::$module_object === 'original-module', 'Restore native renderer globals.');
check($email_context->getValue() === true, 'Restore the prior native email context.');
$input['verifiedFileDescriptors'][0]['byteSize'] = 15 * MB_IN_BYTES;
$plan = yes_bridge_notification_plan($input);
check($plan[0]['attachmentFieldIds'] === array() && strpos($plan[0]['body'], 'Attachments were not included due to size limits.') !== false, 'Run native attachment size policy at the inclusive 15 MiB boundary.');
$model->notifications[0]['conditions'] = array(array('element_id' => 'radio-1', 'rule' => 'is', 'value' => 'educator'));
check(yes_bridge_notification_plan($input) === array(), 'Preserve native conditional notification exclusion.');
$input['normalizedAnswers']['radio-1'] = 'educator';
check(count(yes_bridge_notification_plan($input)) === 1, 'Preserve native conditional notification inclusion.');
$model->fields[2]->conditions = array(array('element_id' => 'radio-1', 'rule' => 'is', 'value' => 'student'));
$input['verifiedFileDescriptors'][0]['byteSize'] = 1024;
check(yes_bridge_notification_plan($input)[0]['attachmentFieldIds'] === array(), 'Preserve native conditional upload visibility.');
$model->fields[2]->conditions = array();
$group = new YES_Notification_Test_Field('group-1', 'group');
$group->conditions = array(array('element_id' => 'radio-1', 'rule' => 'is', 'value' => 'student'));
$model->fields[] = $group;
$model->fields[2]->parent_group = 'group-1';
check(yes_bridge_notification_plan($input)[0]['attachmentFieldIds'] === array(), 'Preserve native group-child upload visibility.');
array_pop($model->fields);
$model->fields[2]->parent_group = '';
$unexpected_mail = function ($data) { wp_mail('fixture@example.org', 'Forbidden', 'Must not be delivered'); return $data; };
add_filter('forminator_custom_form_mail_data', $unexpected_mail);
try { yes_bridge_notification_plan($input); throw new RuntimeException('Unexpected mail was not blocked.'); }
catch (RuntimeException $error) { check($error->getMessage() === 'Direct mail is forbidden while planning notifications.', 'Block mail before existing source transport interceptors.'); }
unset($wp_filter['forminator_custom_form_mail_data']);
$renderer_failure = true;
try { yes_bridge_notification_plan($input); throw new RuntimeException('Failure was not propagated.'); }
catch (RuntimeException $error) { check($error->getMessage() === 'Injected native renderer failure.', 'Propagate native rendering failures.'); }
check($wp_filter === $original_hooks && $wp_actions === $original_actions, 'Restore hooks after native failure.');
check(!in_array('yes-next-notification', stream_get_wrappers(), true), 'Remove the private stat wrapper after failure.');
check($mail_attempts === 0 && $source_writes === 0, 'All fixtures remain read-only.');
echo "Native notification capture fixture passed.\n";
