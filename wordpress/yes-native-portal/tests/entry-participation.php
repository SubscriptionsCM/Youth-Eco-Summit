<?php
/** Run with wp eval-file: validation only; no registration, upload or notification. */
if (!defined('WP_CLI') || !WP_CLI) { exit; }
if (!function_exists('yes_native_entry_errors')) { throw new RuntimeException('Entry participation module must be loaded.'); }
$passed = 0;
$assert = function ($ok, $message) use (&$passed) { if (!$ok) { throw new RuntimeException($message); } $passed++; };
$catalog = yes_native_school_choices();
$assert(!empty($catalog), 'A registered school is needed for this read-only test');
$school = $catalog[0];
$saved_post = $_POST;
$saved_get = $_GET;
$ajax = function () { return true; };
add_filter('wp_doing_ajax', $ajax);
$fields = function ($mode, $size, $id) { return array(array('name'=>'radio-yes-entry-mode','value'=>$mode),array('name'=>'number-yes-team-size','value'=>$size),array('name'=>'text-yes-school-id','value'=>$id),array('name'=>'text-yes-school','value'=>'Untrusted submitted name')); };
try {
    $_POST = array();
    foreach ((array) yes_native_config()['entry_forms'] as $slug => $id) {
        $item = yes_native_entry_competition($id);
        $good = $fields('individual', '', $school['reference']);
        $assert(yes_native_entry_errors(array(), $id, $good) === array(), $slug . ': individual with valid school should pass');
        $assert(yes_native_entry_errors(array(), $id, $good) === array(), $slug . ': repeated school/competition must still pass');
        $assert(yes_native_entry_errors(array(), $id, $fields('individual', '', '')) !== array(), $slug . ': blank school must fail');
        $assert(yes_native_entry_errors(array(), $id, $fields('individual', '', 'YES-SCH-UNREGISTERED')) !== array(), $slug . ': unknown school must fail');
        $assert(yes_native_entry_errors(array(), $id, $fields('', '', $school['reference'])) !== array(), $slug . ': missing entry type must fail');
        $assert(yes_native_entry_errors(array(), $id, $fields('invalid', '', $school['reference'])) !== array(), $slug . ': invalid entry type must fail');
        foreach (array('', '1', '2.5', '-2', 'abc') as $size) { $assert(yes_native_entry_errors(array(), $id, $fields('team', $size, $school['reference'])) !== array(), $slug . ': invalid team size must fail'); }
        $allowed = !empty($item['team']['allowed']) || get_option('yes_native_entry_team_policy', 'guidelines') === 'all';
        $assert((yes_native_entry_errors(array(), $id, $fields('team', '2', $school['reference'])) === array()) === $allowed, $slug . ': category team rule mismatch');
        if (!empty($item['team']['allowed'])) {
            $assert(yes_native_entry_errors(array(), $id, $fields('team', (string) ((int) $item['team']['maxMembers'] + 1), $school['reference'])) !== array(), $slug . ': category team limit must apply');
        }
        $stored = yes_native_entry_values(yes_native_entry_store_identity($good, $id));
        $assert($stored['_yes_entry_mode'] === 'individual' && $stored['_yes_team_size'] === '1', $slug . ': individual metadata missing');
        $assert($stored['_yes_verified_school_id'] === $school['reference'] && $stored['text-yes-school'] === $school['name'], $slug . ': canonical school identity missing');
        $_POST = array('action'=>'forminator_submit_form_custom-forms','save_draft'=>'true','forminator_nonce'=>wp_create_nonce('forminator_submit_form'.$id));
        $assert(yes_native_entry_errors(array(), $id, array()) === array(), $slug . ': valid partial draft should be savable');
        $_POST['forminator_nonce'] = 'invalid';
        $assert(yes_native_entry_errors(array(), $id, array()) !== array(), $slug . ': invalid draft nonce must not bypass rules');
        $_POST = array();
    }
    $id = (int) array_values(yes_native_config()['entry_forms'])[0];
    $scalar_attack = $fields('individual', '', $school['reference']);
    $scalar_attack[2]['value'] = array($school['reference']);
    $assert(yes_native_entry_errors(array(), $id, $scalar_attack) !== array(), 'Array-shaped school ID must fail');
    $assert(yes_native_entry_errors(array(), 9188, array()) === array(), 'School registration should remain unaffected');
    $_GET = array('submitter'=>'student','competition'=>'short-film-making');
    $hub = yes_native_entry_hub();
    $assert(strpos($hub, 'Are you submitting individually or as a team?') !== false && strpos($hub, 'name="school_id"') === false, 'Entry type must be asked before school ID');
    $_GET = array('submitter'=>'student','competition'=>'short-film-making','entry_type'=>'team','team_size'=>'3');
    $hub = yes_native_entry_hub();
    $assert(strpos($hub, 'name="school_id"') !== false && strpos($hub, 'name="competition" value="short-film-making"') !== false, 'School step must preserve selected competition');
    $_GET['school_id'] = 'YES-SCH-UNREGISTERED';
    $assert(strpos(yes_native_entry_hub(), 'We could not find a registered school') !== false, 'Unregistered school should be blocked in visible flow');
    $_GET['school_id'] = $school['reference'];
    $hub = yes_native_entry_hub();
    $assert(strpos($hub, 'School verified:') !== false && strpos($hub, 'multiple entries to the same competition') !== false, 'Verified school and multiple-entry policy should be visible');
    $draft = new stdClass();
    $draft->meta_data = array('radio-yes-entry-mode'=>array('value'=>'team'),'number-yes-team-size'=>array('value'=>'3'),'text-yes-school-id'=>array('value'=>$school['reference']));
    $context = yes_native_entry_draft_context($draft);
    $assert($context['entry_type'] === 'team' && $context['team_size'] === '3' && $context['school_id'] === $school['reference'], 'Saved link must preserve entry type, count and school');
} finally { $_POST = $saved_post; $_GET = $saved_get; remove_filter('wp_doing_ajax', $ajax); }
echo wp_json_encode(array('passed'=>$passed,'forms_submitted'=>0,'records_created'=>0,'messages_sent'=>0)) . "\n";
