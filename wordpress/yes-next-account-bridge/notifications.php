<?php
/** Read-only Forminator notification planning. Load after the private CLI bridge loads WordPress. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

/** Metadata-only files let the native attachment policy run without materializing uploads. */
class YES_Bridge_Notification_Stat {
    public $context;
    public static $files = array();

    public function url_stat($path, $flags) {
        if (!isset(self::$files[$path])) { return false; }
        $size = self::$files[$path]['byteSize'];
        return array(0, 0, 0100400, 1, 0, 0, 0, $size, 0, 0, 0, -1, -1,
            'mode' => 0100400, 'size' => $size, 'nlink' => 1, 'uid' => 0, 'gid' => 0,
            'atime' => 0, 'mtime' => 0, 'ctime' => 0, 'blksize' => -1, 'blocks' => -1);
    }

    public function stream_open($path, $mode, $options, &$opened_path) { return false; }
}

if (class_exists('Forminator_CForm_Front_Mail')) {
    class YES_Bridge_Notification_Capture extends Forminator_CForm_Front_Mail {
        public $packets = array();
        private $notification_slug;

        public function set_pdfs($notification) {
            $this->notification_slug = $notification['slug'];
            parent::set_pdfs($notification);
        }

        public function set_attachment($attachment, $custom_form = null, $entry = null) {
            foreach ($attachment as $path) {
                if (!isset(YES_Bridge_Notification_Stat::$files[$path])) { throw new RuntimeException('Unverified notification attachment.'); }
            }
            // Native uploads confinement excludes our non-readable metadata URIs.
            // Restore only these exact verified references after that filter.
            $restore = function ($filtered) use ($attachment) {
                return array_values(array_unique(array_merge($filtered, $attachment)));
            };
            add_filter('forminator_custom_form_mail_attachment', $restore, PHP_INT_MAX, 1);
            try { parent::set_attachment($attachment, $custom_form, $entry); }
            finally { remove_filter('forminator_custom_form_mail_attachment', $restore, PHP_INT_MAX); }
        }

        public function send_multiple() {
            $headers = $this->get_headers();
            if (empty($this->recipients) || empty($this->subject) || empty($this->message)) { return false; }
            // Match native send_multiple's final cleanup and header ordering,
            // replacing only its wp_mail call with capture.
            $clean = new ReflectionMethod('Forminator_Mail', 'clean');
            $clean->setAccessible(true);
            $clean->invoke($this);
            // Native upload captions use basename(URL). Preserve its generated
            // links while identifying private portal files by verified filename.
            foreach (YES_Bridge_Notification_Stat::$files as $file) {
                $pattern = '~(<a\b[^>]*\bhref=(["\x27])' . preg_quote(esc_url($file['portalUrl']), '~') . '\\2[^>]*>).*?(</a>)~is';
                $this->message = preg_replace_callback($pattern, function ($match) use ($file) {
                    return $match[1] . esc_html($file['filename']) . $match[3];
                }, $this->message);
            }
            if (!is_array($headers) || !is_array($this->recipients)) { throw new RuntimeException('Unsupported notification envelope.'); }
            foreach ($headers as $header) {
                if (!is_string($header) || preg_match('/[\r\n]/', $header) || !preg_match('/^[A-Za-z0-9-]+:/D', $header)) {
                    throw new RuntimeException('Unsupported notification header.');
                }
            }
            foreach ($this->recipients as $recipient) {
                if (!is_string($recipient) || !is_email($recipient)) { throw new RuntimeException('Unsupported notification recipient.'); }
            }
            $fields = array();
            foreach ($this->attachment as $path) {
                if (!isset(YES_Bridge_Notification_Stat::$files[$path])) { throw new RuntimeException('Unverified notification attachment.'); }
                $fields[] = YES_Bridge_Notification_Stat::$files[$path]['fieldId'];
            }
            $packet = array('notificationSlug' => $this->notification_slug, 'recipients' => array_values($this->recipients),
                'subject' => $this->subject, 'body' => $this->message, 'headers' => array_values($headers),
                'attachmentFieldIds' => array_values(array_unique($fields)));
            if (preg_match('/[\r\n]/', $packet['subject']) || strpos(json_encode($packet), 'yes-next-notification:') !== false) {
                throw new RuntimeException('Notification contains private rendering metadata.');
            }
            $this->packets[] = $packet;
            return true;
        }
    }
}

function yes_bridge_notification_renderer_guard() {
    if (!defined('FORMINATOR_VERSION') || FORMINATOR_VERSION !== '1.53.1' || !class_exists('YES_Bridge_Notification_Capture')) {
        throw new RuntimeException('Unsupported native notification renderer.');
    }
    $signatures = array(
        array('Forminator_CForm_Front_Mail', 'process_mail', 2, 3, false),
        array('Forminator_Mail', 'send_multiple', 0, 0, false),
        array('Forminator_Mail', 'get_headers', 0, 0, false),
        array('Forminator_Mail', 'clean', 0, 0, true),
        array('Forminator_Mail', 'set_pdfs', 1, 1, false),
        array('Forminator_Mail', 'set_attachment', 1, 3, false),
    );
    foreach ($signatures as $signature) {
        $method = new ReflectionMethod($signature[0], $signature[1]);
        if ($method->isStatic() || $method->getNumberOfRequiredParameters() !== $signature[2]
            || $method->getNumberOfParameters() !== $signature[3] || $method->isPrivate() !== $signature[4]
            || (!$signature[4] && !$method->isPublic())) {
            throw new RuntimeException('Native notification method contract changed.');
        }
    }
    foreach (array('recipients', 'subject', 'message', 'attachment') as $name) {
        $property = new ReflectionProperty('Forminator_Mail', $name);
        if (!$property->isProtected() || $property->isStatic()) { throw new RuntimeException('Native notification envelope contract changed.'); }
    }
    $visibility = new ReflectionMethod('Forminator_Field', 'is_hidden');
    $hide = new ReflectionMethod('Forminator_CForm_Front_Action', 'update_hidden_fields_array');
    if (!$visibility->isPublic() || !$visibility->isStatic() || $visibility->getNumberOfRequiredParameters() !== 1
        || $visibility->getNumberOfParameters() !== 3 || !$hide->isPrivate() || !$hide->isStatic()
        || $hide->getNumberOfRequiredParameters() !== 3 || $hide->getNumberOfParameters() !== 3) {
        throw new RuntimeException('Native notification visibility contract changed.');
    }
}

function yes_bridge_notification_input($input) {
    $required = array('formId', 'recordId', 'reference', 'submittedAt', 'normalizedAnswers', 'portalOrigin');
    if (!is_array($input) || array_diff($required, array_keys($input))
        || array_diff(array_keys($input), array_merge($required, array('verifiedFileDescriptors')))
        || !is_int($input['formId']) || $input['formId'] < 1
        || !is_string($input['recordId']) || !preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D', $input['recordId'])
        || !is_string($input['reference']) || !preg_match('/^[A-Za-z0-9_-]{1,160}$/D', $input['reference'])
        || !is_array($input['normalizedAnswers'])
        || !is_string($input['submittedAt']) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D', $input['submittedAt'])
        || !is_string($input['portalOrigin'])) {
        throw new RuntimeException('Invalid notification plan context.');
    }
    $origin = parse_url($input['portalOrigin']);
    if (!$origin || ($origin['scheme'] ?? '') !== 'https' || empty($origin['host'])
        || !filter_var($origin['host'], FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)
        || isset($origin['user']) || isset($origin['pass'])
        || isset($origin['query']) || isset($origin['fragment']) || !in_array($origin['path'] ?? '', array('', '/'), true)) {
        throw new RuntimeException('Invalid notification portal origin.');
    }
    $date = new DateTimeImmutable($input['submittedAt']);
    $errors = DateTimeImmutable::getLastErrors();
    if (is_array($errors) && ($errors['warning_count'] || $errors['error_count'])) { throw new RuntimeException('Invalid notification submission date.'); }
    $input['date'] = $date->setTimezone(wp_timezone());
    $input['portalOrigin'] = rtrim($input['portalOrigin'], '/');
    $input['verifiedFileDescriptors'] = $input['verifiedFileDescriptors'] ?? array();
    if (!is_array($input['verifiedFileDescriptors'])) { throw new RuntimeException('Invalid verified notification files.'); }
    if (count($input['normalizedAnswers']) > 512 || strlen(json_encode($input['normalizedAnswers'], JSON_THROW_ON_ERROR)) > 262144) {
        throw new RuntimeException('Notification answers exceed the supported size.');
    }
    return $input;
}

/** Adapt app address aliases for native formatting without changing the retained answers. */
function yes_bridge_native_field_value($field, $value) {
    if (($field['type'] ?? '') !== 'address' || !is_array($value)) { return $value; }
    foreach (array('city', 'state', 'zip', 'country') as $key) {
        $alias = 'address_' . $key;
        if (!array_key_exists($alias, $value)) { continue; }
        if (array_key_exists($key, $value) && $value[$key] !== $value[$alias]) {
            throw new RuntimeException('Conflicting native address aliases.');
        }
        $value[$key] = $value[$alias];
        unset($value[$alias]);
    }
    return $value;
}

/** Return native envelopes only. This function never delivers or persists them. */
function yes_bridge_notification_plan($input) {
    yes_bridge_notification_renderer_guard();
    $input = yes_bridge_notification_input($input);
    $source = Forminator_API::get_form($input['formId']);
    if (is_wp_error($source) || !is_object($source) || (int) $source->id !== $input['formId'] || !is_array($source->notifications)) {
        throw new RuntimeException('Native notification form is unavailable.');
    }
    $model = clone $source;
    $slugs = array();
    foreach ($model->notifications as $notification) {
        if (!is_array($notification) || !is_string($notification['slug'] ?? null) || $notification['slug'] === ''
            || isset($slugs[$notification['slug']]) || !empty($notification['email-pdfs'])) {
            throw new RuntimeException('Unsupported native notification configuration.');
        }
        $slugs[$notification['slug']] = true;
    }
    $fields = array();
    foreach ($model->get_fields() as $field) { $fields[$field->slug] = $field->to_formatted_array(); }
    $entry = new Forminator_Form_Entry_Model();
    $entry->entry_id = $input['reference'];
    $entry->entry_type = 'custom-forms';
    $entry->form_id = $input['formId'];
    $entry->date_created_sql = $input['date']->format('Y-m-d H:i:s');
    $entry->date_created = $input['date']->format('j M Y');
    $entry->time_created = $input['date']->format('M j Y @ g:i A');
    $hidden = array();
    $choice_values = array();
    foreach ($fields as $field_id => $field) {
        if (in_array($field['type'], array('password', 'captcha', 'recaptcha'), true)) { $hidden[] = $field_id; continue; }
        if ($field['type'] !== 'upload' && array_key_exists($field_id, $input['normalizedAnswers'])) {
            $entry->meta_data[$field_id] = array('value' => yes_bridge_native_field_value($field, $input['normalizedAnswers'][$field_id]));
            if (in_array($field['type'], array('select', 'radio', 'checkbox'), true)) {
                $choice_values[$field_id] = $input['normalizedAnswers'][$field_id];
            }
        }
    }
    $entry->meta_data['_forminator_choice_values'] = array('value' => $choice_values);
    $virtual_files = array();
    $file_fields = array();
    foreach ($input['verifiedFileDescriptors'] as $file) {
        $keys = array('fieldId', 'fileId', 'filename', 'byteSize', 'checksum', 'mimeType');
        if (!is_array($file) || array_diff($keys, array_keys($file)) || array_diff(array_keys($file), $keys)
            || !is_string($file['fieldId']) || ($fields[$file['fieldId']]['type'] ?? '') !== 'upload' || isset($file_fields[$file['fieldId']])
            || !is_string($file['fileId']) || !preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D', $file['fileId'])
            || !is_string($file['filename']) || $file['filename'] === '' || strlen($file['filename']) > 1020
            || preg_match('//u', $file['filename']) !== 1 || preg_match_all('/./us', $file['filename']) > 255
            || preg_match('/[\x00-\x1f\x7f\/\\\\]/', $file['filename'])
            || !is_int($file['byteSize']) || $file['byteSize'] < 1 || $file['byteSize'] > 9007199254740991
            || !is_string($file['checksum']) || !preg_match('/^[a-f0-9]{64}$/D', $file['checksum'])
            || !is_string($file['mimeType']) || !preg_match('/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/D', $file['mimeType'])) {
            throw new RuntimeException('Invalid verified notification file.');
        }
        $uri = 'yes-next-notification://' . $input['recordId'] . '/' . $file['fileId'];
        if (isset($virtual_files[$uri])) { throw new RuntimeException('Duplicate verified notification file.'); }
        $virtual_files[$uri] = $file;
        $file_fields[$file['fieldId']] = true;
        $virtual_files[$uri]['portalUrl'] = $input['portalOrigin'] . '/files/' . $file['fileId'];
        $entry->meta_data[$file['fieldId']] = array('value' => array('file' => array(
            'file_path' => array($uri), 'file_url' => array($virtual_files[$uri]['portalUrl']),
            'file_name' => array($file['filename']))));
    }
    $scoped_hooks = array('forminator_custom_form_mail_before_send_mail', 'forminator_custom_form_mail_after_send_mail',
        'forminator_custom_form_mail_admin_sent', 'pre_wp_mail', 'wp_mail', 'forminator_custom_form_mail_attachment',
        'forminator_formatted_repeated_field_values', 'forminator_replace_custom_form_data');
    $saved_hooks = array();
    $saved_actions = array();
    foreach ($scoped_hooks as $hook) {
        if (isset($GLOBALS['wp_filter'][$hook])) { $saved_hooks[$hook] = $GLOBALS['wp_filter'][$hook]; }
        if (isset($GLOBALS['wp_actions'][$hook])) { $saved_actions[$hook] = $GLOBALS['wp_actions'][$hook]; }
    }
    $prepared = Forminator_CForm_Front_Action::$prepared_data;
    $hidden_fields = Forminator_CForm_Front_Action::$hidden_fields;
    $module = Forminator_Front_Action::$module_object;
    $module_id = Forminator_Front_Action::$module_id;
    $replace_to_zero = Forminator_CForm_Front_Action::$replace_to_zero;
    $email_context = new ReflectionProperty('Forminator_Mail', 'is_email_context');
    $email_context->setAccessible(true);
    $saved_email_context = $email_context->getValue();
    $registered = false;
    try {
        foreach ($saved_hooks as $hook => $callbacks) {
            if (is_object($callbacks)) { $GLOBALS['wp_filter'][$hook] = clone $callbacks; }
        }
        foreach (array_slice($scoped_hooks, 0, 3) as $hook) { unset($GLOBALS['wp_filter'][$hook]); }
        // Remove transport interceptors before installing the hard mail block.
        // Otherwise a pre_wp_mail provider could deliver before our callback.
        unset($GLOBALS['wp_filter']['pre_wp_mail'], $GLOBALS['wp_filter']['wp_mail']);
        add_filter('pre_wp_mail', function () { throw new RuntimeException('Direct mail is forbidden while planning notifications.'); }, PHP_INT_MAX, 0);
        add_filter('forminator_replace_custom_form_data', function ($content) use ($input) {
            $source_url = admin_url('admin.php?page=forminator-entries&form_type=forminator_forms&form_id=' . $input['formId'] . '&entry_id=' . $input['reference']);
            return str_replace(esc_url($source_url), esc_url($input['portalOrigin'] . '/dashboard'), $content);
        }, PHP_INT_MAX, 1);
        Forminator_Front_Action::$module_object = $model;
        Forminator_Front_Action::$module_id = $input['formId'];
        Forminator_CForm_Front_Action::$prepared_data = recreate_prepared_data($model, $entry);
        // Match the native frontend's field-specific sanitization contract.
        // Validation, entry persistence and account workflows remain upstream.
        foreach ($fields as $field_id => $field) {
            if ($field['type'] === 'upload' || !isset($entry->meta_data[$field_id])) { continue; }
            $field_object = Forminator_Core::get_field_object($field['type']);
            if (!is_object($field_object) || !method_exists($field_object, 'sanitize')) {
                throw new RuntimeException('Native notification field sanitizer is unavailable.');
            }
            $sanitize = new ReflectionMethod($field_object, 'sanitize');
            if (!$sanitize->isPublic() || $sanitize->isStatic() || $sanitize->getNumberOfRequiredParameters() > 2 || $sanitize->getNumberOfParameters() < 2) {
                throw new RuntimeException('Native notification field sanitizer contract changed.');
            }
            $entry->meta_data[$field_id]['value'] = $field_object->sanitize($field, $entry->meta_data[$field_id]['value']);
        }
        Forminator_CForm_Front_Action::$prepared_data = recreate_prepared_data($model, $entry);
        Forminator_CForm_Front_Action::$prepared_data['action'] = 'forminator_submit_form_custom-forms';
        Forminator_CForm_Front_Action::$prepared_data['current_url'] = $input['portalOrigin'] . '/dashboard';
        Forminator_CForm_Front_Action::$hidden_fields = $hidden;
        Forminator_CForm_Front_Action::$replace_to_zero = array();
        $hide = new ReflectionMethod('Forminator_CForm_Front_Action', 'update_hidden_fields_array');
        $hide->setAccessible(true);
        foreach ($fields as $field_id => $field) {
            if (Forminator_Field::is_hidden($field)) { $hide->invoke(null, $field_id, '', $field); }
        }
        if (in_array('yes-next-notification', stream_get_wrappers(), true)) { throw new RuntimeException('Notification planning is already active.'); }
        YES_Bridge_Notification_Stat::$files = $virtual_files;
        $registered = stream_wrapper_register('yes-next-notification', 'YES_Bridge_Notification_Stat');
        if (!$registered) { throw new RuntimeException('Notification metadata inspection is unavailable.'); }
        foreach ($virtual_files as $uri => $file) { clearstatcache(true, $uri); }
        $mailer = new YES_Bridge_Notification_Capture();
        $mailer->process_mail($model, $entry);
        return $mailer->packets;
    } finally {
        foreach ($virtual_files as $uri => $file) { clearstatcache(true, $uri); }
        if ($registered) { stream_wrapper_unregister('yes-next-notification'); YES_Bridge_Notification_Stat::$files = array(); }
        Forminator_CForm_Front_Action::$prepared_data = $prepared;
        Forminator_CForm_Front_Action::$hidden_fields = $hidden_fields;
        Forminator_Front_Action::$module_object = $module;
        Forminator_Front_Action::$module_id = $module_id;
        Forminator_CForm_Front_Action::$replace_to_zero = $replace_to_zero;
        $email_context->setValue($saved_email_context);
        foreach ($scoped_hooks as $hook) {
            if (array_key_exists($hook, $saved_hooks)) { $GLOBALS['wp_filter'][$hook] = $saved_hooks[$hook]; }
            else { unset($GLOBALS['wp_filter'][$hook]); }
            if (array_key_exists($hook, $saved_actions)) { $GLOBALS['wp_actions'][$hook] = $saved_actions[$hook]; }
            else { unset($GLOBALS['wp_actions'][$hook]); }
        }
    }
}
