<?php
/** Connect registration, the public programme and saved competition drafts. */
if (!defined('ABSPATH')) { exit; }

function yes_native_registration_next_message($form_id, $context = array()) {
    $student = (int) $form_id === (int) yes_native_config()['student'];
    $target = home_url('/competitions/#challenges');
    $label = 'Choose your challenge';
    if (!empty($context['competition'])) {
        $target = yes_native_entry_context_link('/competitions/enter/', $context);
        $label = 'Continue to my entry';
    }
    return '<p><strong>' . ($student ? 'Student registration successful.' : 'Educator registration successful.') . '</strong></p><p>Next, choose a competition and start your entry. Each challenge has its own Start entry button. You do not need to register again.</p><div class="yes-native__actions"><a href="' . esc_url($target) . '">' . esc_html($label) . '</a><a class="secondary" href="' . esc_url(home_url('/dashboard/')) . '">Go to my account</a></div>';
}

function yes_native_registered_next_page() {
    $context = yes_native_entry_registration_context();
    $target = !empty($context['competition']) ? yes_native_entry_context_link('/competitions/enter/', $context) : home_url('/competitions/#challenges');
    return yes_native_page('You’re already signed in', 'Continue with your entry. You do not need to register again.', '<div class="yes-native__actions"><a href="' . esc_url($target) . '">' . (!empty($context['competition']) ? 'Continue to my entry' : 'Choose your challenge') . '</a><a class="secondary" href="' . esc_url(home_url('/dashboard/')) . '">Go to my account</a></div>');
}

/** Update confirmation only; leave account, verification and notification mappings intact. */
function yes_native_prepare_registration_next_steps() {
    $result = array();
    foreach (array(yes_native_config()['student'], yes_native_config()['teacher']) as $id) {
        $meta = get_post_meta((int) $id, 'forminator_form_meta', true);
        if (!is_array($meta) || empty($meta['settings'])) { return new WP_Error('yes_registration_model', 'Registration form settings were not found.'); }
        $message = yes_native_registration_next_message((int) $id);
        $meta['settings']['thankyou-message'] = $message;
        foreach ($meta['behaviors'] ?? array() as $index => $behavior) {
            if (($behavior['submission-behaviour'] ?? '') === 'behaviour-thankyou') { $meta['behaviors'][$index]['thankyou-message'] = $message; }
        }
        update_post_meta((int) $id, 'forminator_form_meta', $meta);
        clean_post_cache((int) $id);
        $result[] = (int) $id;
    }
    return $result;
}

function yes_native_entry_draft_page($competition, $school, $context) {
    $_REQUEST['entry_type'] = $context['entry_type'];
    $_REQUEST['team_size'] = (string) ($context['team_size'] ?? '');
    $_REQUEST['school_id'] = $school['reference'];
    $notice = '<div class="yes-native__notice" id="yes-entry-draft-only"><p><strong>Start your entry and save your progress.</strong></p><p>Your details, topic and title can be saved in your account now. File uploads and final submission are not available yet. A saved draft is not a submitted entry.</p></div>';
    $body = $notice . yes_native_entry_selection_summary($school, $context, $competition) . yes_native_form_markup((int) yes_native_config()['entry_forms'][$competition['slug']]);
    $body .= '<div class="yes-native__actions"><a class="secondary" href="' . esc_url(home_url('/competitions/#challenges')) . '">Choose another challenge</a><a class="secondary" href="' . esc_url(home_url('/dashboard/')) . '">Go to my account</a></div>';
    return yes_native_page($competition['title'] . ' entry draft', $competition['classLabel'] . ' · ' . ($context['entry_type'] === 'team' ? 'Team entry' : 'Individual entry'), $body);
}

/** Do not expose upload controls while final uploads remain disabled. */
function yes_native_entry_draft_field($html, $field, $renderer) {
    $competition = yes_native_entry_competition((int) ($renderer->model->id ?? 0));
    if (!$competition) { return $html; }
    if (empty(yes_native_config()['entries_enabled']) && ($field['type'] ?? '') === 'upload') {
        return '<div class="yes-native__notice"><p><strong>' . esc_html($field['field_label'] ?? 'Your file') . '</strong></p><p>' . esc_html($field['description'] ?? '') . '</p><p>Prepare this file on your device. Uploading is not available yet; you can save the other entry details now.</p></div>';
    }
    if (empty(yes_native_config()['entries_enabled']) && ($field['element_id'] ?? '') === 'html-yes-approval') {
        return '<p><strong>Save your entry draft below.</strong> Final submission is not available yet.</p>';
    }
    if (yes_native_entry_query('draft') === '' && in_array($field['element_id'] ?? '', array('text-yes-school', 'text-yes-name'), true)) {
        $context = yes_native_entry_registration_context();
        $school = $context ? yes_native_find_school_by_id($context['school_id']) : null;
        $value = ($field['element_id'] ?? '') === 'text-yes-school' ? ($school['name'] ?? '') : (is_user_logged_in() && yes_native_entry_role() !== 'educator' ? wp_get_current_user()->display_name : '');
        if ($value !== '') {
            $tag = new WP_HTML_Tag_Processor($html);
            while ($tag->next_tag('INPUT')) { $tag->set_attribute('value', $value); }
            return $tag->get_updated_html();
        }
    }
    return $html;
}
add_filter('forminator_field_markup', 'yes_native_entry_draft_field', 45, 3);

function yes_native_entry_draft_markup($html) {
    $tag = new WP_HTML_Tag_Processor($html);
    if (!$tag->next_tag('FORM') || !preg_match('/^forminator-module-(\d+)$/D', (string) $tag->get_attribute('id'), $match) || !yes_native_entry_competition((int) $match[1]) || !empty(yes_native_config()['entries_enabled'])) { return $html; }
    while ($tag->next_tag()) {
        if ($tag->get_tag() === 'BUTTON' && $tag->has_class('forminator-button-submit')) {
            $tag->set_attribute('disabled', true);
            $tag->set_attribute('aria-describedby', 'yes-entry-draft-only');
        }
    }
    return $tag->get_updated_html();
}
add_filter('forminator_render_form_markup', 'yes_native_entry_draft_markup', 45, 1);

function yes_native_entry_upload_gate($allow, $field_name) {
    if (strpos((string) $field_name, 'upload-yes-') === 0 && empty(yes_native_config()['entries_enabled'])) { return false; }
    return $allow;
}
add_filter('forminator_file_upload_allow', 'yes_native_entry_upload_gate', 30, 2);

function yes_native_challenge_guidelines($item) {
    $html = '<details class="yes-challenge-rules"><summary>Topics &amp; guidelines</summary><div>';
    if (!empty($item['wordRange'])) { $html .= '<p><strong>Length:</strong> ' . (int) $item['wordRange']['min'] . '–' . (int) $item['wordRange']['max'] . ' words.</p>'; }
    if (!empty($item['languages'])) { $html .= '<p><strong>Languages:</strong> ' . esc_html(implode(' / ', $item['languages'])) . '.</p>'; }
    foreach ($item['classTopics'] ?? array() as $band) {
        if (!empty($band['classes'])) { $html .= '<p><strong>Classes ' . (int) reset($band['classes']) . '–' . (int) end($band['classes']) . '</strong></p>'; }
        foreach ($band['topics'] ?? array() as $topic) {
            $html .= '<h4>' . esc_html($topic['title']) . '</h4><p>' . esc_html($topic['prompt']) . '</p>';
            foreach ($topic['references'] ?? array() as $ref) { $html .= '<p><a href="' . esc_url($ref['url']) . '" target="_blank" rel="noopener noreferrer">' . esc_html($ref['title']) . '</a></p>'; }
        }
    }
    $html .= '<h4>Files to prepare</h4><ul>';
    foreach ($item['fileRequirements'] as $file) {
        $html .= '<li>' . esc_html($file['title'] . ': ' . $file['fileLabel']) . (!empty($file['orientation']) ? ' · ' . esc_html($file['orientation']) : '') . (!empty($file['captionsRequired']) ? ' · closed captions required' : '') . '</li>';
    }
    foreach ($item['notes'] ?? array() as $note) { $html .= '<li>' . esc_html($note) . '</li>'; }
    $html .= '</ul><p>AI-generated submission content receives a 15-point deduction. Credit your sources.</p></div></details>';
    return $html;
}

function yes_native_public_challenges() {
    $open = !empty(yes_native_config()['entries_enabled']) && yes_native_window_open();
    $visuals = array(
        'open-letter' => array('gallery-p2175892.jpg', 'Students in the summit audience'),
        'case-study' => array('gallery-p2176488.jpg', 'Students exploring a reuse and recycling display'),
        'spoken-word' => array('gallery-_mai0896.jpg', 'A student speaking into a microphone'),
        'painting' => array('gallery-p2176237.jpg', 'A young participant painting at the summit'),
        'waste-to-art' => array('gallery-p2176389.jpg', 'Students working with materials at a summit workshop'),
        'eco-business-model' => array('gallery-p2176488.jpg', 'Students beside recycling displays'),
    );
    $html = '<section class="editorial-container catalogue-body" id="challenges" aria-labelledby="competition-programme-title"><div class="catalogue-section-heading"><div><p class="editorial-eyebrow">2027 competition lineup</p><h2 id="competition-programme-title">Pick your challenge.</h2></div><div><p>Choose a format below, then select <strong>Start entry</strong>. Follow the entry requirements and confirm your registered school ID.</p><p class="competition-programme-note">Already registered? You do not need to register again. Sign in when prompted to save your entry.</p></div></div><div class="yes-challenge-status">' . ($open ? '<strong>Competition entries are open.</strong> Save your progress at each step. Submit by 5 November 2026, 11:59 p.m. IST.' : '<strong>Start an entry draft now.</strong> File uploads and final submission are not available yet.') . '</div><div class="competition-programme"><div class="competition-programme-grid">';
    foreach (yes_native_guidelines()['competitions'] ?? array() as $index => $item) {
        $slug = $item['slug'];
        $html .= '<article class="competition-programme-card" id="guidelines-' . esc_attr($slug) . '"><div class="competition-programme-photo">';
        if (isset($visuals[$slug])) {
            $html .= '<img src="' . esc_url(home_url('/images/summit/' . $visuals[$slug][0])) . '" alt="' . esc_attr($visuals[$slug][1]) . '" loading="lazy" width="640" height="480">';
        } else {
            $html .= '<div class="yes-challenge-art yes-challenge-art--' . esc_attr($slug) . '" aria-hidden="true"><b>' . esc_html(array('short-film-making' => 'REC', 'blog-writing' => 'POST', 'digital-art' => 'ART', 'article-writing' => 'Aa')[$slug] ?? 'YES') . '</b><span>' . esc_html($item['category']) . '</span></div>';
        }
        $html .= '<span aria-hidden="true">' . sprintf('%02d', $index + 1) . '</span></div><div class="competition-programme-copy"><p>' . esc_html($item['category']) . '</p><h3>' . esc_html($item['title']) . '</h3><p class="competition-programme-description">' . esc_html($item['description']) . '</p><p class="yes-challenge-eligibility">' . esc_html($item['classLabel']) . ' · ' . esc_html($item['participationLabel'] ?? ($item['team']['allowed'] ? 'Individual or team' : 'Individual')) . '</p><a class="yes-challenge-start" href="' . esc_url(add_query_arg('competition', $slug, home_url('/competitions/enter/'))) . '" aria-label="Start entry: ' . esc_attr($item['title']) . '">Start entry</a>' . yes_native_challenge_guidelines($item) . '</div></article>';
    }
    $html .= '</div><div class="competition-programme-footer"><p>Photographs from previous summits.</p><a class="text-link" href="' . esc_url(home_url(yes_native_guidelines()['source']['href'])) . '" target="_blank" rel="noopener noreferrer">Download 2027 guidelines (PDF)</a></div></div></section>';
    return $html;
}

/** Replace just the obsolete programme; preserve the current live hero and visuals. */
function yes_native_public_challenge_page($html, $path) {
    if ($path !== '/competitions') { return $html; }
    // Exported Next pages stream the real content outside <main> and use a
    // script to reveal it. Resolve that boundary before serving it without React.
    if (strpos($html, 'id="S:0"') !== false) {
        $doc = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors(); libxml_use_internal_errors($previous);
        $main = $doc->getElementById('main'); $stream = $doc->getElementById('S:0');
        if ($main && $stream) {
            while ($main->firstChild) { $main->removeChild($main->firstChild); }
            foreach (iterator_to_array($stream->childNodes) as $child) { $main->appendChild($child->cloneNode(true)); }
            $stream->parentNode->removeChild($stream);
            $html = preg_replace('/<\?xml[^>]*>/', '', $doc->saveHTML(), 1);
        }
    }
    $html = preg_replace_callback('#<section\b[^>]*\bid="challenges"[^>]*>.*?</section>#s', function () { return yes_native_public_challenges(); }, $html, 1, $replaced);
    if (!$replaced) { return $html; }
    // This route is rendered by WordPress. An obsolete Next hydration payload
    // must not replace the live cards or attach the old navigation again.
    $html = preg_replace('#<script\b(?![^>]*type="application/ld\+json")[^>]*>.*?</script>#is', '', $html);
    $html = preg_replace('#<link\b[^>]*(?:rel="preload"[^>]*as="script"|rel="modulepreload")[^>]*>#i', '', $html);
    $css = '<link rel="stylesheet" href="' . esc_url(plugins_url('../assets/challenge-journey.css', __FILE__) . '?ver=' . YES_NATIVE_VERSION) . '">';
    $js = '<script src="' . esc_url(get_stylesheet_directory_uri() . '/native-navigation.js') . '" defer></script><script src="' . esc_url(plugins_url('../assets/challenge-journey.js', __FILE__) . '?ver=' . YES_NATIVE_VERSION) . '" defer></script>';
    return str_replace(array('</head>', '</body>'), array($css . '</head>', $js . '</body>'), $html);
}
add_filter('yes_frontend_page_html', 'yes_native_public_challenge_page', 20, 2);
