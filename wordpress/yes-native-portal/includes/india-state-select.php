<?php
/** Searchable Indian State/UT controls without changing stored address keys. */
if (!defined('ABSPATH')) { exit; }
function yes_native_india_states() {
    return array(
        'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
        'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
        'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
        'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
        'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    );
}
function yes_native_india_state_match($value) {
    $value = strtolower(trim(str_replace('&', 'and', $value)));
    foreach (yes_native_india_states() as $state) {
        if (strtolower($state) === $value) { return $state; }
    }
    return '';
}
function yes_native_india_state_markup($html, $field, $renderer) {
    $form_id = isset($renderer->model->id) ? (int) $renderer->model->id : 0;
    if (!in_array($form_id, yes_native_form_ids(), true) || ($field['type'] ?? '') !== 'address') { return $html; }
    $name = ($field['element_id'] ?? '') . '-state';
    return preg_replace_callback('/<input\b[^>]*>/i', function ($match) use ($name) {
        $tag = new WP_HTML_Tag_Processor($match[0]);
        if (!$tag->next_tag('INPUT') || $tag->get_attribute('name') !== $name) { return $match[0]; }
        $id = (string) $tag->get_attribute('id');
        $saved = (string) $tag->get_attribute('value');
        $value = yes_native_india_state_match($saved);
        $attributes = array(
            'id' => $id, 'name' => $name,
            'class' => 'forminator-select--field forminator-select2 forminator-select2-multiple yes-native-india-state',
            'data-placeholder' => 'Type or select your state / union territory',
            'data-search' => 'true', 'data-search-placeholder' => 'Search states and union territories',
            'data-checkbox' => 'false', 'data-allow-clear' => 'false',
            'data-default-value' => $value ?: $saved,
            'aria-labelledby' => $id . '-label',
        );
        foreach (array('data-required', 'aria-required', 'aria-describedby', 'autocomplete') as $attribute) {
            $original = $tag->get_attribute($attribute);
            if ($original !== null) { $attributes[$attribute] = $original; }
        }
        $select = '<select';
        foreach ($attributes as $attribute => $content) { $select .= ' ' . $attribute . '="' . esc_attr($content) . '"'; }
        $select .= '><option value="">Type or select your state / union territory</option>';
        // Preserve older free-text draft answers visibly; final validation asks
        // the user to select a valid option rather than silently discarding it.
        if ($saved !== '' && $value === '') { $select .= '<option value="' . esc_attr($saved) . '" selected>' . esc_html('Previous entry: ' . $saved . ' — please choose a state / UT') . '</option>'; }
        foreach (yes_native_india_states() as $state) {
            $select .= '<option value="' . esc_attr($state) . '"' . selected($value, $state, false) . '>' . esc_html($state) . '</option>';
        }
        return $select . '</select>';
    }, $html);
}
function yes_native_india_state_errors($errors, $form_id, $fields) {
    if (!in_array((int) $form_id, yes_native_form_ids(), true)) { return $errors; }
    // Partial drafts stay savable even while a previous free-text answer is corrected.
    if (wp_doing_ajax() && isset($_POST['action'], $_POST['save_draft'], $_POST['forminator_nonce']) && is_string($_POST['action']) && is_string($_POST['save_draft']) && is_string($_POST['forminator_nonce']) && wp_unslash($_POST['action']) === 'forminator_submit_form_custom-forms' && filter_var(wp_unslash($_POST['save_draft']), FILTER_VALIDATE_BOOLEAN) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['forminator_nonce'])), 'forminator_submit_form' . (int) $form_id)) { return $errors; }
    foreach ($fields as $item) {
        if (empty($item['name']) || !is_array($item['value'] ?? null) || !isset($item['value']['state']) || !is_string($item['value']['state']) || trim($item['value']['state']) === '') { continue; }
        $model = Forminator_API::get_form_field((int) $form_id, $item['name'], true);
        if (!is_wp_error($model) && ($model['type'] ?? '') === 'address' && !yes_native_india_state_match($item['value']['state'])) {
            $errors[] = array($item['name'] . '-state' => 'Select a state or union territory from the dropdown.');
        }
    }
    return $errors;
}
add_filter('forminator_field_markup', 'yes_native_india_state_markup', 30, 3);
add_filter('forminator_custom_form_submit_errors', 'yes_native_india_state_errors', 25, 3);
