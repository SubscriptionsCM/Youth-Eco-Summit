<?php
/**
 * wp eval-file regression checks after yes_native_prepare_entry_mode_options().
 * Read-only: this file never prepares forms, submits entries or sends messages.
 */
if (!defined('WP_CLI') || !WP_CLI) { exit; }
if (!function_exists('yes_native_entry_allows_team') || !function_exists('yes_native_prepare_entry_mode_options')) {
    throw new RuntimeException('Entry mode helpers must be loaded.');
}

$passed = 0;
$assert = function ($ok, $message) use (&$passed) {
    if (!$ok) { throw new RuntimeException($message); }
    $passed++;
};
$inputs = function ($html, $type, $name) {
    $matches = array();
    $tags = new WP_HTML_Tag_Processor($html);
    while ($tags->next_tag('INPUT')) {
        if ($tags->get_attribute('type') === $type && $tags->get_attribute('name') === $name) {
            $matches[] = array(
                'value' => $tags->get_attribute('value'),
                'min' => $tags->get_attribute('min'),
                'max' => $tags->get_attribute('max'),
            );
        }
    }
    return $matches;
};
$registration_links = function ($html) {
    $contexts = array();
    $tags = new WP_HTML_Tag_Processor($html);
    while ($tags->next_tag('A')) {
        $href = $tags->get_attribute('href');
        if (!is_string($href)) { continue; }
        $url = wp_parse_url($href);
        if (!in_array(rtrim($url['path'] ?? '', '/'), array('/register', '/login'), true)) { continue; }
        $query = array();
        parse_str($url['query'] ?? '', $query);
        $contexts[] = $query;
    }
    return $contexts;
};
$config = yes_native_config();
$policy = get_option('yes_native_entry_team_policy', 'guidelines');
$all_teams = $policy === 'all';
$school = yes_native_find_school_by_id('YES-SCH-458BA6D2');
$assert((bool) $school, 'Reported registered school must exist');
$assert(count((array) $config['entry_forms']) === 10, 'All ten entry forms must be configured');
$saved_get = $_GET;
$saved_post = $_POST;
$saved_request = $_REQUEST;
$saved_user = get_current_user_id();
$persisted = array();

try {
    // Signed-out rendering cannot open an actual entry form or draft.
    wp_set_current_user(0);
    $_POST = array();
    $_REQUEST = array();

    foreach (array(
        array('team' => array('allowed' => false, 'maxMembers' => 1)),
        array('team' => array('allowed' => true, 'maxMembers' => 3)),
        array(),
    ) as $index => $fixture) {
        $expected = !empty($fixture['team']['allowed']) || $all_teams;
        $assert(yes_native_entry_allows_team($fixture) === $expected, 'Team policy helper fixture ' . $index);
        $assert((yes_native_entry_team_error($fixture, 'team', 2) === '') === $expected, 'Team helper agrees with validation fixture ' . $index);
    }

    foreach ((array) $config['entry_forms'] as $slug => $id) {
        $item = yes_native_entry_competition($id);
        $assert((bool) $item, $slug . ': guideline competition exists');
        $allows_team = !empty($item['team']['allowed']) || $all_teams;
        $assert(yes_native_entry_allows_team($item) === $allows_team, $slug . ': active policy determines team support');
        $assert((yes_native_entry_team_error($item, 'team', 2) === '') === $allows_team, $slug . ': picker policy agrees with submission validation');
        $assert(yes_native_entry_team_error($item, 'team', 1) !== '', $slug . ': team minimum remains two');
        $assert(yes_native_entry_team_error($item, 'individual', 1) === '', $slug . ': individual remains valid');
        if (!empty($item['team']['allowed']) && (int) ($item['team']['maxMembers'] ?? 0) > 1) {
            $assert(yes_native_entry_team_error($item, 'team', (int) $item['team']['maxMembers'] + 1) !== '', $slug . ': guideline team maximum remains enforced');
        }

        $model = Forminator_API::get_form((int) $id);
        $assert(!is_wp_error($model), $slug . ': stored form is readable');
        $fields = array_column($model->get_fields_as_array(), null, 'element_id');
        $assert(isset($fields['radio-yes-entry-mode'], $fields['number-yes-team-size']), $slug . ': existing participation fields retained');
        $mode = $fields['radio-yes-entry-mode'];
        $size = $fields['number-yes-team-size'];
        $options = array_values((array) ($mode['options'] ?? array()));
        $expected_values = $allows_team ? array('individual', 'team') : array('individual');
        $expected_labels = $allows_team ? array('Individual', 'Team') : array('Individual');
        $assert(array_column($options, 'value') === $expected_values, $slug . ': stored radio offers exactly the permitted modes');
        $assert(array_column($options, 'label') === $expected_labels, $slug . ': stored mode labels remain clear');
        $assert((string) ($size['limit_min'] ?? '') === '2', $slug . ': stored team size minimum is two');
        $max = !empty($item['team']['allowed']) && (int) ($item['team']['maxMembers'] ?? 0) > 1 ? (string) (int) $item['team']['maxMembers'] : '';
        $assert((string) ($size['limit_max'] ?? '') === $max, $slug . ': stored team size maximum matches the guideline');
        if (!$allows_team) {
            $assert(($mode['field_label'] ?? '') === 'Entry type', $slug . ': individual-only form uses a direct label');
            $assert(($options[0]['default'] ?? '') === 'true', $slug . ': individual option selected by default');
        }
        $persisted[$slug] = array('status' => get_post_status((int) $id), 'meta' => get_post_meta((int) $id, 'forminator_form_meta', true));
    }

    $blog = yes_native_entry_competition($config['entry_forms']['blog-writing']);
    $blog_allows_team = yes_native_entry_allows_team($blog);
    $_GET = array('submitter'=>'student','competition' => 'blog-writing');
    $html = yes_native_entry_hub();
    if (!$blog_allows_team) {
        $assert(strpos($html, '<h1>Confirm your school</h1>') !== false, 'Blog without entry type goes directly to school confirmation');
        $assert($inputs($html, 'radio', 'entry_type') === array(), 'Individual-only Blog has no entry-type radios');
        $assert(array_column($inputs($html, 'hidden', 'entry_type'), 'value') === array('individual'), 'Blog school confirmation carries the automatic individual mode');
        $assert(array_column($inputs($html, 'hidden', 'competition'), 'value') === array('blog-writing'), 'Blog school confirmation retains its selected competition');
    } else {
        $assert(array_column($inputs($html, 'radio', 'entry_type'), 'value') === array('individual', 'team'), 'All-team policy keeps both Blog entry options');
    }

    foreach (array(
        array('competition' => 'blog-writing', 'school_id' => $school['reference']),
        array('competition' => 'blog-writing', 'entry_type' => 'team', 'team_size' => '4', 'school_id' => $school['reference']),
    ) as $index => $query) {
        $_GET = array_merge($query,array('submitter'=>'student'));
        $html = yes_native_entry_hub();
        if ($blog_allows_team && $index === 0) {
            $assert(array_column($inputs($html, 'radio', 'entry_type'), 'value') === array('individual', 'team'), 'All-team Blog asks for a mode even with a school supplied');
            continue;
        }
        $assert(strpos($html, 'School verified:') !== false && strpos($html, $school['reference']) !== false, 'Blog ' . $index . ': registered school confirmation is shown');
        $assert(strpos($html, 'class="yes-native__error"') === false, 'Blog ' . $index . ': no late entry-mode error after school confirmation');
        $assert($inputs($html, 'radio', 'entry_type') === array(), 'Blog ' . $index . ': no redundant entry-mode picker after confirmation');
        $assert(strpos($html, 'forminator-module-') === false, 'Blog ' . $index . ': public render does not open an actual form');
        $expected_mode = $blog_allows_team ? 'team' : 'individual';
        $assert(strpos($html, $expected_mode === 'team' ? 'Team entry' : 'Individual entry') !== false, 'Blog ' . $index . ': selected mode summary is correct');
        $links = $registration_links($html);
        $assert(count($links) >= 2, 'Blog ' . $index . ': registration and login actions remain available');
        foreach ($links as $link) {
            $assert(($link['entry_type'] ?? '') === $expected_mode && ($link['school_id'] ?? '') === $school['reference'] && ($link['competition'] ?? '') === 'blog-writing', 'Blog ' . $index . ': next action carries normalized mode, verified school and competition');
            $assert($expected_mode === 'team' ? ($link['team_size'] ?? '') === '4' : !isset($link['team_size']), 'Blog ' . $index . ': obsolete team size cannot follow an individual entry');
        }
    }

    foreach (array('short-film-making', 'case-study') as $slug) {
        foreach (array(array('competition' => $slug), array('competition' => $slug, 'school_id' => $school['reference'])) as $query) {
            $_GET = array_merge($query,array('submitter'=>'student'));
            $html = yes_native_entry_hub();
            $assert(array_column($inputs($html, 'radio', 'entry_type'), 'value') === array('individual', 'team'), $slug . ': no mode selected shows both radios');
            $assert(strpos($html, 'Are you submitting individually or as a team?') !== false, $slug . ': entry mode remains an explicit choice');
            $size = $inputs($html, 'number', 'team_size');
            $assert(count($size) === 1 && $size[0]['min'] === '2', $slug . ': public team size minimum is two');
            $assert(array_column($inputs($html, 'hidden', 'competition'), 'value') === array($slug), $slug . ': mode picker retains selected competition');
            if (isset($query['school_id'])) {
                $assert(array_column($inputs($html, 'hidden', 'school_id'), 'value') === array($school['reference']), $slug . ': mode picker retains the verified school');
            }
        }
    }

    foreach ((array) $config['entry_forms'] as $slug => $id) {
        $assert(get_post_status((int) $id) === $persisted[$slug]['status'], $slug . ': rendering leaves form status unchanged');
        $assert(get_post_meta((int) $id, 'forminator_form_meta', true) === $persisted[$slug]['meta'], $slug . ': rendering leaves fields, settings and notifications unchanged');
    }
    $assert(yes_native_config() === $config, 'Activation and configuration settings remain unchanged');
    $assert(get_option('yes_native_entry_team_policy', 'guidelines') === $policy, 'Existing team policy remains unchanged');
} finally {
    $_GET = $saved_get;
    $_POST = $saved_post;
    $_REQUEST = $saved_request;
    wp_set_current_user($saved_user);
}

echo wp_json_encode(array('passed' => $passed, 'forms_checked' => count($persisted), 'forms_submitted' => 0, 'records_created' => 0, 'messages_sent' => 0)) . "\n";
