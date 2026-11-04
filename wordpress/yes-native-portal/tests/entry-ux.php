<?php
/** wp eval-file: rendering/validation only, without submitting registrations. */
$passed = 0;
$assert = function ($ok, $label) use (&$passed) { if (!$ok) { throw new RuntimeException($label); } $passed++; };
$saved_get = $_GET; $saved_post = $_POST; $saved_user = get_current_user_id();
$config_before = yes_native_config();
$school = yes_native_find_school_by_id('YES-SCH-458BA6D2');
$assert((bool) $school, 'Reported school should exist');
try {
    wp_set_current_user(0);
    $_GET = array('submitter'=>'student','entry_type' => 'individual', 'school_id' => $school['reference'], 'competition' => 'open-letter');
    $context = yes_native_entry_registration_context();
    $assert($context['school_id'] === $school['reference'], 'Verified ID preserved');
    $assert($context['competition'] === 'open-letter', 'Chosen competition preserved');
    $assert(!yes_native_entry_registration_context(array_merge($_GET, array('school_id' => 'YES-SCH-INVALID'))), 'Unknown school rejected');
    $assert(!yes_native_entry_registration_context(array_merge($_GET, array('entry_type' => 'other'))), 'Invalid mode rejected');
    $assert(!yes_native_entry_registration_context(array_merge($_GET, array('competition' => 'invalid'))), 'Unknown competition rejected');
    $assert(!yes_native_entry_registration_context(array_merge($_GET, array('entry_type' => 'team', 'team_size' => '100'))), 'Category team limits retained');
    $link = yes_native_entry_context_link('/login/', array_merge($context, array('redirect_to' => 'https://example.com')));
    $assert(strpos($link, 'example.com') === false, 'No arbitrary redirect leakage');
    foreach ($config_before['entry_forms'] as $slug => $id) {
        $_GET['competition'] = $slug;
        $html = yes_native_entry_hub();
        $competition = yes_native_entry_competition($id);
        $assert(strpos($html, '<h1>' . esc_html($competition['title']) . '</h1>') !== false, $slug . ': specific selected page');
        $assert(strpos($html, 'View entry') === false && strpos($html, 'Choose your competition</h2>') === false, $slug . ': no self-link chooser loop');
        $assert(strpos($html, 'Create a student account') !== false && strpos($html, 'Sign in to my account') !== false, $slug . ': obvious real next actions');
        $assert(!empty($config_before['entries_enabled']) || strpos($html, 'Competition uploads are not available yet') !== false, $slug . ': honest disabled state');
    }
    $_GET['competition'] = 'open-letter';
    $renderer = (object) array('model' => (object) array('id' => $config_before['student']));
    $field = array('element_id' => 'select-2', 'options' => array(array('label' => $school['name'], 'value' => 'native-name-value')));
    $markup = '<select name="select-2"><option value="" selected>Select</option><option value="native-name-value">Amity</option></select>';
    $prefilled = yes_native_entry_registration_school_markup($markup, $field, $renderer);
    $assert(strpos($prefilled, 'data-default-value="native-name-value"') !== false, 'Select2 default set');
    $tag = new WP_HTML_Tag_Processor($prefilled); $selected = false;
    while ($tag->next_tag('OPTION')) { if ($tag->get_attribute('value') === 'native-name-value' && $tag->get_attribute('selected') !== null) { $selected = true; } }
    $assert($selected, 'Existing native option preselected');
    $_GET['draft'] = 'a-private-existing-draft';
    $assert(yes_native_entry_registration_school_markup($markup, $field, $renderer) === $markup, 'Saved draft choice never overwritten');
    unset($_GET['draft']);
    $form = '<form id="forminator-module-' . $config_before['student'] . '"></form>';
    $with_context = yes_native_entry_registration_form_context($form, array(), '', array(), array(), 0);
    $assert(strpos($with_context, 'name="yes_entry_school_id"') !== false && strpos($with_context, 'name="yes_entry_competition"') !== false, 'Real Forminator render ID zero supported');
    $other = '<form id="forminator-module-9188"></form>';
    $assert(yes_native_entry_registration_form_context($other, array(), '', array(), array(), 0) === $other, 'Other forms untouched');
    $_POST = array(); foreach ($context as $key => $value) { $_POST['yes_entry_' . $key] = $value; }
    $failure = array('success' => false, 'message' => 'OTP required');
    $assert(yes_native_entry_registration_success($failure, $config_before['student']) === $failure, 'Registration failures preserved');
    $success = yes_native_entry_registration_success(array('success' => true, 'message' => 'Original'), $config_before['student']);
    $assert(strpos($success['message'], 'Continue to my entry') !== false && strpos($success['message'], 'competition=open-letter') !== false, 'Successful registration retains competition link');
    $_POST['save_draft'] = 'true';
    $draft = array('success' => true, 'message' => 'Draft saved');
    $assert(yes_native_entry_registration_success($draft, $config_before['student']) === $draft, 'Draft save never described as registered');
    $assert(yes_native_config() === $config_before, 'Form activation settings unchanged');
} finally { $_GET = $saved_get; $_POST = $saved_post; wp_set_current_user($saved_user); }
echo wp_json_encode(array('passed' => $passed, 'forms_submitted' => 0, 'records_created' => 0, 'messages_sent' => 0)) . "\n";
