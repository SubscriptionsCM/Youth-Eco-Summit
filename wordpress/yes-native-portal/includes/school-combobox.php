<?php
/** Search registered schools while preserving the stored school-ID field. */
if (!defined('ABSPATH')) { exit; }

function yes_native_school_combobox_markup($html, $field, $renderer) {
    $form_id = (int) ($renderer->model->id ?? 0);
    if (!yes_native_entry_competition($form_id)) { return $html; }
    $name = $field['element_id'] ?? '';
    if ($name === 'text-yes-school') {
        $tag = new WP_HTML_Tag_Processor($html);
        while ($tag->next_tag('INPUT')) {
            if ($tag->get_attribute('name') === 'text-yes-school') {
                $tag->set_attribute('readonly', true);
                $tag->set_attribute('placeholder', 'Filled from your selected school ID');
                break;
            }
        }
        return $tag->get_updated_html();
    }
    if ($name !== 'text-yes-school-id') { return $html; }
    $tag = new WP_HTML_Tag_Processor($html);
    while ($tag->next_tag('INPUT')) {
        if ($tag->get_attribute('name') !== 'text-yes-school-id') { continue; }
        $tag->set_attribute('data-yes-school-search', '');
        $tag->set_attribute('data-yes-school-name-field', 'text-yes-school');
        $tag->set_attribute('placeholder', 'Type your school name or ID');
        $tag->set_attribute('autocomplete', 'off');
        break;
    }
    return $tag->get_updated_html();
}
add_filter('forminator_field_markup', 'yes_native_school_combobox_markup', 35, 3);
