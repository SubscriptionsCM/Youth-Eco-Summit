<?php
/** Distinct competition details and registration routes; no placeholder entry loop. */
if (!defined('ABSPATH')) { exit; }

function yes_native_entry_registration_context($source = null, $prefix = '') {
    $source = is_array($source) ? $source : $_GET;
    $read = function ($key) use ($source, $prefix) {
        return isset($source[$prefix . $key]) && is_string($source[$prefix . $key]) ? sanitize_text_field(wp_unslash($source[$prefix . $key])) : '';
    };
    $school = yes_native_find_school_by_id($read('school_id'));
    $mode = $read('entry_type');
    $size = $mode === 'individual' ? 1 : yes_native_entry_count($read('team_size'));
    if (!$school || !in_array($mode, array('individual', 'team'), true) || !$size) { return array(); }
    $context = array('entry_type' => $mode, 'school_id' => $school['reference']);
    $role = $read('submitter');
    $context['submitter'] = in_array($role,array('student','educator'),true) ? $role : 'student';
    if ($mode === 'team') { $context['team_size'] = $size; }
    $slug = sanitize_key($read('competition'));
    if ($slug !== '') {
        $form_id = yes_native_config()['entry_forms'][$slug] ?? 0;
        $competition = $form_id ? yes_native_entry_competition($form_id) : null;
        if (!$competition || yes_native_entry_team_error($competition, $mode, $size) !== '') { return array(); }
        $context['competition'] = $slug;
    }
    $draft = $read('draft');
    if ($draft && preg_match('/^[a-z0-9]{8,64}$/D',$draft) && !ctype_digit($draft)) {
        $saved = new Forminator_Form_Entry_Model($draft);
        if ($saved->status === 'draft' && hash_equals((string)$saved->draft_id,$draft) && !empty($context['competition']) && (int)$saved->form_id === (int)(yes_native_config()['entry_forms'][$context['competition']] ?? 0)) { $context['draft'] = $draft; }
    }
    return $context;
}
function yes_native_entry_context_link($path, $context) {
    return add_query_arg(array_intersect_key($context, array_flip(array('entry_type', 'team_size', 'school_id', 'competition','submitter','draft'))), home_url($path));
}
function yes_native_entry_selection_summary($school, $context, $competition = null) {
    $location = implode(', ', array_filter(array($school['city'] ?? '', $school['state'] ?? '')));
    return '<div class="yes-entry-selection"><p><strong>School verified: ' . esc_html($school['name']) . '</strong>' . ($location ? '<span>' . esc_html($location) . '</span>' : '') . '</p><p>School ID: <strong>' . esc_html($school['reference']) . '</strong><span>' . ($context['entry_type'] === 'team' ? 'Team entry · ' . (int) $context['team_size'] . ' students' : 'Individual entry') . ($competition ? ' · ' . esc_html($competition['title']) : '') . '</span></p></div>';
}
function yes_native_entry_selected_page($competition, $school, $context, $open) {
    $educator = ($context['submitter'] ?? '') === 'educator';
    $register = yes_native_entry_context_link($educator ? '/teachers/register/' : '/register/', $context);
    $login = yes_native_entry_context_link('/login/', $context);
    $another = yes_native_entry_context_link('/competitions/enter/', array_diff_key($context, array('competition' => 1)));
    $progress = '<ol class="yes-entry-progress" aria-label="Participation steps"><li><strong>1. School confirmed</strong><span>Completed</span></li><li aria-current="step"><strong>2. Your account</strong><span>Create or access your account</span></li><li><strong>3. Upload your work</strong><span>' . ($open ? 'After signing in' : 'Not available yet') . '</span></li></ol>' . yes_native_entry_selection_summary($school, $context, $competition);
    $body = '<section class="yes-native__card yes-entry-next"><h2>' . (is_user_logged_in() ? 'Your next step' : 'Create an account or sign in') . '</h2>';
    if (is_user_logged_in()) {
        $body .= '<p>You are signed in. If you have already completed student registration, you do not need to register again.</p><div class="yes-native__actions"><a href="' . esc_url(home_url('/dashboard/')) . '">Go to my account</a><a class="secondary" href="' . esc_url($register) . '">Register another student</a></div>';
    } else {
        if ($open) { $body .= '<p>Create an account once to save and submit your work. If you already have an account, sign in.</p>'; }
        $body .= '<div class="yes-native__actions"><a href="' . esc_url($register) . '">Create ' . ($educator ? 'an educator' : 'a student') . ' account</a><a class="secondary" href="' . esc_url($login) . '">Sign in to my account</a></div><p class="yes-entry-help">Your chosen school and competition will carry through to registration.</p>';
    }
    if (!$open) { $body .= '<p class="yes-entry-availability"><strong>Student registration is open. Competition uploads are not available yet.</strong><br>Registration creates your account; it does not submit your competition work.</p>'; }
    $body .= '</section>' . $progress . '<section class="yes-native__card yes-entry-guidelines"><h2>' . esc_html($competition['title']) . ' requirements</h2><p>' . esc_html($competition['description']) . '</p><dl class="yes-entry-facts"><div><dt>Classes</dt><dd>' . esc_html($competition['classLabel']) . '</dd></div><div><dt>Entry type</dt><dd>' . esc_html($competition['participationLabel'] ?? ($competition['team']['allowed'] ? 'Individual or team' : 'Individual')) . '</dd></div>';
    if (!empty($competition['wordRange'])) { $body .= '<div><dt>Length</dt><dd>' . (int) $competition['wordRange']['min'] . '–' . (int) $competition['wordRange']['max'] . ' words</dd></div>'; }
    if (!empty($competition['languages'])) { $body .= '<div><dt>Languages</dt><dd>' . esc_html(implode(' / ', $competition['languages'])) . '</dd></div>'; }
    $body .= '</dl>';
    foreach ((array) ($competition['classTopics'] ?? array()) as $band) {
        foreach ((array) ($band['topics'] ?? array()) as $topic) { $body .= '<h3>' . esc_html($topic['title']) . '</h3><p>' . esc_html($topic['prompt']) . '</p>'; }
    }
    $body .= '<h3>Files to prepare</h3><ul>';
    foreach ((array) $competition['fileRequirements'] as $file) { $body .= '<li>' . esc_html($file['title'] . ': ' . $file['fileLabel']) . '</li>'; }
    $body .= '</ul><p>AI-generated submission content receives a 15-point deduction. Credit your sources.</p><p>A school can submit multiple entries to the same competition.</p></section><div class="yes-native__actions"><a class="secondary" href="' . esc_url(remove_query_arg(array('entry_type','team_size','draft'),$another)) . '">Choose another competition</a><a class="secondary" href="' . esc_url(home_url('/competitions/#challenges')) . '">All competition guidelines</a></div>';
    return yes_native_page($competition['title'], $competition['classLabel'] . ' · ' . ($context['entry_type'] === 'team' ? 'Team entry' : 'Individual entry'), $body);
}
function yes_native_entry_registration_page() {
    $context = yes_native_entry_registration_context();
    $school = yes_native_find_school_by_id($context['school_id']);
    $competition = !empty($context['competition']) ? yes_native_entry_competition(yes_native_config()['entry_forms'][$context['competition']]) : null;
    wp_enqueue_style('yes-native-portal-entry-ux', plugins_url('../assets/entry-participation.css', __FILE__), array('yes-native-portal'), YES_NATIVE_VERSION);
    $educator = ($context['submitter'] ?? '') === 'educator';
    $body = yes_native_entry_selection_summary($school, $context, $competition) . '<p>Create your ' . ($educator ? 'educator' : 'student') . ' account. Your competition work is submitted separately.</p><p><a href="' . esc_url(yes_native_entry_context_link('/login/', $context)) . '">Have an account? Sign in</a></p>' . yes_native_notice() . yes_native_form_markup((int) yes_native_config()[$educator ? 'teacher' : 'student']);
    return yes_native_page($educator ? 'Educator registration' : 'Student registration', ($competition ? 'Your chosen competition: '.$competition['title'].'. ' : '') . ($educator ? 'Create your account to submit students’ work on behalf of your school.' : 'Student registrations close 5 November 2026, 11:59 p.m. IST.'), $body);
}
function yes_native_entry_registration_school_markup($html, $field, $renderer) {
    if (!in_array((int)($renderer->model->id ?? 0),array((int)yes_native_config()['student'],(int)yes_native_config()['teacher']),true) || !in_array($field['element_id'] ?? '',array('select-2','select-3'),true) || yes_native_entry_query('draft') !== '') { return $html; }
    $context = yes_native_entry_registration_context();
    if (!$context) { return $html; }
    $school = yes_native_find_school_by_id($context['school_id']);
    $target = '';
    foreach ((array) ($field['options'] ?? array()) as $option) {
        if (strcasecmp(yes_native_school_text($option['label'] ?? ''), yes_native_school_text($school['name'])) === 0) { $target = (string) $option['value']; break; }
    }
    if ($target === '') { return $html; }
    $tag = new WP_HTML_Tag_Processor($html);
    while ($tag->next_tag()) {
        if ($tag->get_tag() === 'SELECT') { $tag->set_attribute('data-default-value', $target); }
        if ($tag->get_tag() === 'OPTION') {
            $tag->remove_attribute('selected');
            if ((string) $tag->get_attribute('value') === $target) { $tag->set_attribute('selected', true); }
        }
    }
    return $tag->get_updated_html();
}
add_filter('forminator_field_markup', 'yes_native_entry_registration_school_markup', 40, 3);

function yes_native_entry_registration_form_context($html, $fields, $type, $settings, $design, $render_id) {
    $tag = new WP_HTML_Tag_Processor($html);
    if (!$tag->next_tag('FORM') || !in_array($tag->get_attribute('id'),array('forminator-module-'.(int)yes_native_config()['student'],'forminator-module-'.(int)yes_native_config()['teacher']),true)) { return $html; }
    $context = yes_native_entry_registration_context();
    if (!$context) { return $html; }
    $hidden = '';
    foreach ($context as $key => $value) { $hidden .= '<input type="hidden" name="yes_entry_' . esc_attr($key) . '" value="' . esc_attr($value) . '">'; }
    return preg_replace_callback('/<form\b[^>]*>/i', function ($match) use ($hidden) { return $match[0] . $hidden; }, $html, 1);
}
add_filter('forminator_render_form_markup', 'yes_native_entry_registration_form_context', 40, 6);

function yes_native_entry_registration_success($response, $form_id) {
    $c = yes_native_config();
    if (!in_array((int) $form_id, array((int) $c['student'], (int) $c['teacher']), true) || empty($response['success']) || !empty($response['draft_id']) || ($response['type'] ?? '') === 'save_draft' || filter_var($_POST['save_draft'] ?? false, FILTER_VALIDATE_BOOLEAN)) { return $response; }
    $response['message'] = yes_native_registration_next_message((int) $form_id, yes_native_entry_registration_context($_POST, 'yes_entry_'));
    return $response;
}
add_filter('forminator_form_ajax_submit_response', 'yes_native_entry_registration_success', 110, 2);

function yes_native_entry_login_page() {
    $context = yes_native_entry_registration_context();
    $saved = yes_native_entry_query('saved') === '1';
    $return = $context ? yes_native_entry_context_link('/competitions/enter/', $context) : home_url($saved ? '/dashboard/' : '/competitions/enter/');
    $educator = ($context['submitter'] ?? '') === 'educator';
    $register_path = $educator ? '/teachers/register/' : '/register/';
    if (is_user_logged_in()) { return yes_native_page('You’re signed in', $context ? 'Continue with the school and competition you selected.' : 'Choose a challenge and start your entry.', '<div class="yes-native__actions"><a href="' . esc_url($return) . '">Continue to my competition</a><a class="secondary" href="' . esc_url(home_url('/dashboard/')) . '">Go to my account</a></div>'); }
    $id = yes_native_config()['login'];
    $login = $id ? do_shortcode('[ultimatemember form_id="' . (int) $id . '"]') : wp_login_form(array('echo' => false, 'redirect' => $return));
    $tag = new WP_HTML_Tag_Processor($login);
    $found = false;
    while ($tag->next_tag('INPUT')) {
        if ($tag->get_attribute('name') === 'redirect_to') { $tag->set_attribute('value', $return); $found = true; }
    }
    $login = $tag->get_updated_html();
    if (!$found) { $login = preg_replace('/<\/form>/i', '<input type="hidden" name="redirect_to" value="' . esc_attr($return) . '"></form>', $login, 1); }
    $tag = new WP_HTML_Tag_Processor($login);
    while ($tag->next_tag('A')) {
        if (rtrim((string) wp_parse_url((string) $tag->get_attribute('href'), PHP_URL_PATH), '/') === '/login-for-all') { $tag->set_attribute('href', yes_native_entry_context_link($register_path, $context)); }
    }
    $login = $tag->get_updated_html();
    $forgot = strpos($login, '/password-reset') !== false ? '' : '<p><a href="' . esc_url(wp_lostpassword_url(yes_native_entry_context_link('/login/', $context))) . '">Forgot your password?</a></p>';
    return yes_native_page($saved ? 'Continue your saved entry' : 'Sign in to continue', $context ? 'Sign in with your Youth Eco Summit account. Your school and competition selection will be kept.' : 'Use your existing Youth Eco Summit account to choose a challenge or continue a saved entry.', '<div class="yes-native__card">' . $login . $forgot . '</div><div class="yes-native__actions"><a class="secondary" href="' . esc_url(yes_native_entry_context_link($register_path, $context)) . '">Create ' . ($educator ? 'an educator' : 'a student') . ' account</a></div>');
}
