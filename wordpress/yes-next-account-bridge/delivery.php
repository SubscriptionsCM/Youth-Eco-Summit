<?php
/** Private CLI delivery of a freshly verified native notification plan. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

function yes_bridge_delivery_canonical($value) {
    if (!is_array($value)) { return $value; }
    if ($value !== array_values($value)) { ksort($value, SORT_STRING); }
    foreach ($value as $key => $item) { $value[$key] = yes_bridge_delivery_canonical($item); }
    return $value;
}

function yes_bridge_delivery_same($first, $second) {
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
    return hash_equals(hash('sha256', json_encode(yes_bridge_delivery_canonical($first), $flags)),
        hash('sha256', json_encode(yes_bridge_delivery_canonical($second), $flags)));
}

function yes_bridge_delivery_path($path) {
    $normalized = str_replace('\\', '/', rtrim($path, '/\\'));
    return PHP_OS_FAMILY === 'Windows' ? strtolower($normalized) : $normalized;
}

function yes_bridge_delivery_attachments($context, $packet, $provided) {
    $fields = $packet['attachmentFieldIds'];
    if (!is_array($provided) || count($provided) !== count($fields) || count(array_unique($fields)) !== count($fields)) { throw new RuntimeException(); }
    if (!$fields) { return array(); }
    $configured_root = (string) getenv('WORDPRESS_MAIL_TEMP_ROOT');
    $root = realpath($configured_root);
    if (!$root || !is_dir($root) || is_link($configured_root)) { throw new RuntimeException(); }
    $prefix = yes_bridge_delivery_path($root) . '/';
    $attachments = array();
    $total = 0;
    foreach ($fields as $field) {
        $descriptors = array_values(array_filter($context['verifiedFileDescriptors'], function ($file) use ($field) { return ($file['fieldId'] ?? null) === $field; }));
        $matches = array_values(array_filter($provided, function ($file) use ($field) { return is_array($file) && ($file['fieldId'] ?? null) === $field; }));
        if (count($descriptors) !== 1 || count($matches) !== 1) { throw new RuntimeException(); }
        $descriptor = $descriptors[0];
        $file = $matches[0];
        $path = $file['path'] ?? null;
        unset($file['path']);
        if (!yes_bridge_delivery_same($file, $descriptor) || !is_string($path) || strpos($path, "\0") !== false) { throw new RuntimeException(); }
        $canonical = realpath($path);
        if (!$canonical || !is_file($canonical) || is_link($path) || yes_bridge_delivery_path($canonical) !== yes_bridge_delivery_path($path)
            || strpos(yes_bridge_delivery_path($canonical), $prefix) !== 0) { throw new RuntimeException(); }
        $segments = explode('/', substr(yes_bridge_delivery_path($canonical), strlen($prefix)));
        if (count($segments) !== 3 || !preg_match('/^mail-[a-z0-9]{6}$/iD', $segments[0])
            || $segments[1] !== strtolower($descriptor['fileId']) || $segments[2] !== 'retained-file'
            || is_link(dirname($path)) || is_link(dirname(dirname($path)))) { throw new RuntimeException(); }
        if (PHP_OS_FAMILY !== 'Windows' && ((fileperms($canonical) & 0077) !== 0 || (fileperms(dirname($canonical)) & 0077) !== 0)) { throw new RuntimeException(); }
        $size = $descriptor['byteSize'];
        $filename = $descriptor['filename'];
        if (!is_int($size) || $size < 1 || !is_string($filename) || $filename === '' || strlen($filename) > 1020
            || preg_match('/[\\\\\/\x00-\x1f\x7f]/', $filename) || !preg_match('/^[a-f0-9]{64}$/D', $descriptor['checksum'])) { throw new RuntimeException(); }
        $total += $size;
        if ($total >= 15 * 1024 * 1024 || filesize($canonical) !== $size || !hash_equals($descriptor['checksum'], hash_file('sha256', $canonical) ?: '')) { throw new RuntimeException(); }
        $attachments[$canonical] = $filename;
    }
    return $attachments;
}

function yes_bridge_notification_mail($input) {
    if (!is_array($input) || !isset($input['ordinal'], $input['notificationSlug'], $input['payload'])
        || !is_int($input['ordinal']) || $input['ordinal'] < 1 || $input['ordinal'] > 100 || !is_array($input['payload'])) { throw new RuntimeException(); }
    $context = array_intersect_key($input, array_flip(array('formId', 'recordId', 'reference', 'submittedAt', 'normalizedAnswers', 'portalOrigin', 'verifiedFileDescriptors')));
    $plan = yes_bridge_notification_plan($context);
    $packet = $plan[$input['ordinal'] - 1] ?? null;
    if (!is_array($packet) || ($packet['notificationSlug'] ?? null) !== $input['notificationSlug']
        || !yes_bridge_delivery_same($packet, $input['payload'])) { throw new RuntimeException(); }
    $attachments = yes_bridge_delivery_attachments($context, $packet, $input['attachments'] ?? array());
    if (!wp_mail($packet['recipients'], $packet['subject'], $packet['body'], $packet['headers'], $attachments)) { throw new RuntimeException(); }
    return array('sent' => true);
}
