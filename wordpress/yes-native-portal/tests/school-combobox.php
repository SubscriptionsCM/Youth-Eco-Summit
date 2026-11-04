<?php
// Run with wp eval-file. No registrations, drafts or messages are created.
$checks = 0;
$check = function ($condition, $label) use (&$checks) {
    if (!$condition) { throw new RuntimeException($label); }
    $checks++;
};
$sample = array('name' => 'Example Branch School', 'reference' => 'YES-SCH-ABC12345', 'legacy_ids' => array('EDU-54321'));
$check(yes_native_school_matches($sample, 'example branch'), 'Case-insensitive school-name search');
$check(yes_native_school_matches($sample, 'yes-sch-abc'), 'Partial canonical-ID search');
$check(yes_native_school_matches($sample, 'EDU-543'), 'Partial legacy-ID search');
$check(!yes_native_school_matches($sample, 'unrelated'), 'Unrelated query excluded');
$original = '<label for="school-id">Registered school ID</label><input id="school-id" name="text-yes-school-id" value="YES-SCH-ABC12345" required class="forminator-input">';
foreach (yes_native_config()['entry_forms'] as $id) {
    $renderer = (object) array('model' => (object) array('id' => $id));
    $html = apply_filters('forminator_field_markup', $original, array('element_id' => 'text-yes-school-id', 'type' => 'text'), $renderer);
    $tag = new WP_HTML_Tag_Processor($html);
    $check($tag->next_tag('INPUT'), 'School input retained');
    $check($tag->get_attribute('data-yes-school-search') !== null, 'Searchable picker attached');
    $check($tag->get_attribute('name') === 'text-yes-school-id', 'Stored field name preserved');
    $check($tag->get_attribute('value') === 'YES-SCH-ABC12345', 'Saved/prefilled ID preserved');
    $check($tag->get_attribute('required') === true, 'Required status preserved');
    $check($tag->get_attribute('data-yes-school-name-field') === 'text-yes-school', 'Picker links to its school name field');
    $name_html = yes_native_school_combobox_markup('<input name="text-yes-school" value="Saved School" required>', array('element_id' => 'text-yes-school'), $renderer);
    $name_tag = new WP_HTML_Tag_Processor($name_html); $name_tag->next_tag('INPUT');
    $check($name_tag->get_attribute('readonly') === true && $name_tag->get_attribute('value') === 'Saved School', 'Derived name is read-only and saved text is retained until lookup');
}
$renderer = (object) array('model' => (object) array('id' => yes_native_config()['school']));
$check(yes_native_school_combobox_markup($original, array('element_id' => 'text-yes-school-id'), $renderer) === $original, 'School registration fields untouched');
$check(!yes_native_find_school_by_id('Example Branch School'), 'A school name alone is not a valid ID');
$check(!yes_native_find_school_by_id('YES-SCH-NOTREAL'), 'Unknown school ID rejected');
echo wp_json_encode(array('passed' => $checks, 'forms_submitted' => 0, 'records_created' => 0, 'messages_sent' => 0)) . "\n";
