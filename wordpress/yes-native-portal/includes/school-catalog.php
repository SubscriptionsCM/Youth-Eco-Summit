<?php

if (!defined('ABSPATH') && PHP_SAPI !== 'cli') { exit; }

function yes_native_school_text($value) {
    $value = function_exists('wp_strip_all_tags') ? wp_strip_all_tags((string) $value) : strip_tags((string) $value);
    return trim((string) preg_replace('/\s+/u', ' ', $value));
}

function yes_native_school_key($school) {
    $parts = array();
    foreach (array('name', 'city', 'state') as $field) {
        $value = yes_native_school_text(isset($school[$field]) ? $school[$field] : '');
        $parts[] = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    }
    return implode('|', $parts);
}

function yes_native_school_is_public($school) {
    $name = yes_native_school_text(isset($school['name']) ? $school['name'] : '');
    if ($name === '' || preg_match('/^(?:test|yes website test)(?:\b|\s)/i', $name)) { return false; }
    if (function_exists('yes_native_school_label_safe') && !yes_native_school_label_safe($name)) { return false; }
    return true;
}

function yes_native_merge_school_catalog($registrations, $imported) {
    $merged = array();
    $names = array();
    // Imported records include branch location and stable legacy IDs, so they win
    // when a current registration describes the same school and branch.
    foreach (array_merge((array) $imported, (array) $registrations) as $school) {
        if (!is_array($school) || !yes_native_school_is_public($school)) { continue; }
        $school = array_merge(array('id'=>'','name'=>'','reference'=>'','address'=>'','city'=>'','state'=>'','postal_code'=>'','legacy_ids'=>array()), $school);
        $school['name'] = yes_native_school_text($school['name']);
        $school['city'] = yes_native_school_text($school['city']);
        $school['state'] = yes_native_school_text($school['state']);
        $school['reference'] = strtoupper(yes_native_school_text($school['reference'] ?: $school['id']));
        $school['id'] = $school['reference'];
        $school['legacy_ids'] = array_values(array_unique(array_filter(array_map('strtoupper', (array) $school['legacy_ids']))));
        $key = yes_native_school_key($school);
        $name_key = function_exists('mb_strtolower') ? mb_strtolower($school['name'], 'UTF-8') : strtolower($school['name']);
        $location_missing = $school['city'] === '' && $school['state'] === '';
        if (isset($merged[$key]) || ($location_missing && isset($names[$name_key]))) { continue; }
        $merged[$key] = $school;
        $names[$name_key] = true;
    }
    $merged = array_values($merged);
    usort($merged, function ($a, $b) {
        return strcasecmp($a['name'] . '|' . $a['city'] . '|' . $a['state'], $b['name'] . '|' . $b['city'] . '|' . $b['state']);
    });
    return $merged;
}

function yes_native_school_matches($school, $query) {
    $query = yes_native_school_text($query);
    if ($query === '') { return true; }
    if (stripos((string) $school['name'], $query) !== false || stripos((string) $school['reference'], $query) !== false) { return true; }
    foreach ((array) ($school['legacy_ids'] ?? array()) as $legacy_id) {
        if (strcasecmp((string) $legacy_id, $query) === 0 || stripos((string) $legacy_id, $query) !== false) { return true; }
    }
    return false;
}
