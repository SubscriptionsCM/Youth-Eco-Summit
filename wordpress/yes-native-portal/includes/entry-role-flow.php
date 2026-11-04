<?php
/** Meeting update: role, challenge, entry type, then school and participant details. */
if (!defined('ABSPATH')) { exit; }

function yes_native_entry_role() {
    $role = yes_native_entry_query('submitter');
    return in_array($role, array('student','educator'), true) ? $role : '';
}
function yes_native_entry_role_label($role) {
    return $role === 'educator' ? 'Submitted by an educator on behalf of the school' : 'Submitted by a student';
}
function yes_native_entry_hub() {
    wp_enqueue_style('yes-entry-participation', plugins_url('../assets/entry-participation.css', __FILE__), array('yes-native-portal'), YES_NATIVE_VERSION);
    $base = home_url('/competitions/enter/');
    $config = yes_native_config();
    $slug = sanitize_key(yes_native_entry_query('competition'));
    $competition = !empty($config['entry_forms'][$slug]) ? yes_native_entry_competition($config['entry_forms'][$slug]) : null;
    $context = $competition ? array('competition'=>$slug) : array();
    $school = yes_native_find_school_by_id(yes_native_entry_query('school_id'));
    if ($school) { $context['school_id'] = $school['reference']; }
    $token = yes_native_entry_query('draft');
    // Saved links reopen the same challenge, school, role and mode. Never use numeric entry IDs as bearer tokens.
    if ($token && preg_match('/^[a-z0-9]{8,64}$/D', $token) && !ctype_digit($token)) {
        $entry = new Forminator_Form_Entry_Model($token);
        $saved_competition = yes_native_entry_competition((int) $entry->form_id);
        if ($saved_competition && $entry->status === 'draft' && hash_equals((string) $entry->draft_id, $token)) {
            $restored = yes_native_entry_draft_context($entry);
            $restored['submitter'] = in_array($restored['submitter'] ?? '', array('student','educator'), true) ? $restored['submitter'] : 'student';
            $restored['competition'] = $saved_competition['slug'];
            foreach ($restored as $key=>$value) { $_GET[$key] = $value; $_REQUEST[$key] = $value; }
            return yes_native_entry_hub_details();
        }
        return yes_native_page('Continue your saved entry', 'This saved entry link is no longer available. Sign in to check your entries or start a new one.', '<div class="yes-native__actions"><a href="'.esc_url(home_url('/login/?saved=1')).'">Find my saved entries</a><a class="secondary" href="'.esc_url($base).'">Start a new entry</a></div>');
    }
    $role = yes_native_entry_role();
    if (!$role) {
        $body = '<section class="yes-native__card yes-entry-role"><h2>Who is submitting?</h2><div class="yes-entry-role-options">';
        foreach (array('student'=>array('I am a student','Submit your own work or your team’s entry.'),'educator'=>array('I am an educator','Submit students’ work on behalf of your school.')) as $value=>$copy) {
            $body .= '<a href="'.esc_url(add_query_arg(array_merge($context,array('submitter'=>$value)),$base)).'"><strong>'.esc_html($copy[0]).'</strong><span>'.esc_html($copy[1]).'</span></a>';
        }
        $saved_url = is_user_logged_in() ? home_url('/dashboard/') : home_url('/login/?saved=1');
        $body .= '</div></section><p class="yes-entry-saved">Started an entry earlier? <a href="'.esc_url($saved_url).'">Continue a saved entry</a></p>';
        return yes_native_page('Submit your entry', 'Choose who is submitting. You can enter more than one competition, one at a time.', $body);
    }
    if (!$competition) {
        $context['submitter'] = $role;
        $body = '<p>'.esc_html($role === 'educator' ? 'You are submitting on behalf of your school.' : 'You are submitting as a student.').'</p><div class="yes-native__grid yes-entry-challenges">';
        foreach (yes_native_guidelines()['competitions'] as $item) {
            if (empty($config['entry_forms'][$item['slug']])) { continue; }
            $body .= '<article class="yes-native__card"><h2>'.esc_html($item['title']).'</h2><p>'.esc_html($item['classLabel']).'</p><p>'.esc_html(yes_native_entry_allows_team($item) ? 'Individual or team' : 'Individual entry').'</p><a class="yes-native__button" href="'.esc_url(add_query_arg(array_merge($context,array('competition'=>$item['slug'])),$base)).'">Choose '.esc_html($item['title']).'</a></article>';
        }
        $body .= '</div><p><a href="'.esc_url(add_query_arg(array_diff_key($context,array('submitter'=>1)),$base)).'">Change student or educator</a></p>';
        return yes_native_page('Choose your competition', 'Choose one challenge now. You can submit another entry afterwards.', $body);
    }
    return yes_native_entry_hub_details();
}

/** Require every included participant, including individual entries. Partial saves stay possible. */
function yes_native_entry_participant_errors($errors, $form_id, $fields) {
    $item = yes_native_entry_competition((int) $form_id);
    if (!$item || yes_native_entry_valid_draft((int) $form_id)) { return $errors; }
    $values = yes_native_entry_values($fields);
    $role = $values['hidden-yes-submitter'] ?? '';
    if (!in_array($role,array('student','educator'),true)) { $errors[] = array('hidden-yes-submitter'=>'Choose Student or Educator before starting your entry.'); return $errors; }
    $size = ($values['radio-yes-entry-mode'] ?? '') === 'team' ? yes_native_entry_count($values['number-yes-team-size'] ?? '') : 1;
    $max = max(1,(int) ($item['team']['maxMembers'] ?? 1));
    $names = array();
    for ($n=1;$n<=min($size,$max);$n++) {
        $student = $size > 1 ? 'student '.$n : 'the student';
        $name_key = $n===1 ? 'text-yes-name' : 'text-yes-student-'.$n;
        $class_key = $n===1 ? 'select-yes-class' : 'select-yes-class-'.$n;
        $name = $values[$name_key] ?? '';
        if (mb_strlen($name)<2) { $errors[] = array($name_key=>'Enter '.$student.'’s full name.'); }
        if ($name && in_array(mb_strtolower($name),$names,true)) { $errors[] = array($name_key=>'List each participating student once.'); }
        $names[] = mb_strtolower($name);
        $class = $values[$class_key] ?? '';
        if (!ctype_digit($class) || !in_array((int)$class,$item['classes'],true)) { $errors[] = array($class_key=>'Choose an eligible class for '.$student.'.'); }
        $email_key = ($role==='educator' ? 'email-yes-student-' : 'email-yes-guardian-').$n;
        if (!is_email($values[$email_key] ?? '')) { $errors[] = array($email_key=>$role==='educator' ? 'Enter this student’s email address.' : 'Enter this student’s guardian email address.'); }
        if ($role==='student') {
            $phone_key='phone-yes-guardian-'.$n;
            $phone=preg_replace('/[\s().-]+/','',$values[$phone_key] ?? '');
            if (!preg_match('/^\+?[0-9]{10,15}$/D',$phone)) { $errors[]=array($phone_key=>'Enter this student’s guardian phone number, with the country code if needed.'); }
        }
    }
    return $errors;
}
add_filter('forminator_custom_form_submit_errors','yes_native_entry_participant_errors',22,3);

/** Store declared submission provenance, and discard contacts for the inactive role / extra members. */
function yes_native_entry_participant_meta($fields,$form_id) {
    $item = yes_native_entry_competition((int)$form_id);
    if (!$item) { return $fields; }
    $values = yes_native_entry_values($fields);
    // Forminator deliberately omits hidden fields from draft field_data_array.
    $role = $values['hidden-yes-submitter'] ?? '';
    if ($role === '' && yes_native_entry_valid_draft((int)$form_id)) {
        $raw = Forminator_CForm_Front_Action::$prepared_data['hidden-yes-submitter'] ?? ($_POST['hidden-yes-submitter'] ?? '');
        $role = is_string($raw) ? sanitize_key(wp_unslash($raw)) : '';
    }
    $size = ($values['radio-yes-entry-mode'] ?? '') === 'team' ? yes_native_entry_count($values['number-yes-team-size'] ?? '') : 1;
    $fields = array_values(array_filter($fields,function($field) use($role,$size){
        $key=$field['name'] ?? '';
        if (in_array($key,array('_yes_entry_submitter_role','_yes_entry_submission_by','textarea-yes-members'),true)) { return false; }
        if (preg_match('/^(?:email-yes-guardian-|phone-yes-guardian-)([0-9]+)$/D',$key,$m)) { return $role==='student' && (int)$m[1]<=$size; }
        if (preg_match('/^email-yes-student-([0-9]+)$/D',$key,$m)) { return $role==='educator' && (int)$m[1]<=$size; }
        if (preg_match('/^(?:text-yes-student-|select-yes-class-)([0-9]+)$/D',$key,$m)) { return (int)$m[1]<=$size; }
        return true;
    }));
    if (in_array($role,array('student','educator'),true)) {
        $fields[]=array('name'=>'_yes_entry_submitter_role','value'=>$role);
        $fields[]=array('name'=>'_yes_entry_submission_by','value'=>yes_native_entry_role_label($role));
    }
    return $fields;
}
add_filter('forminator_custom_form_submit_field_data','yes_native_entry_participant_meta',25,2);

function yes_native_entry_role_hidden_value($value,$saved_value,$field,$instance) {
    if (($field['element_id'] ?? '')!=='hidden-yes-submitter') { return $value; }
    if (isset($_POST['hidden-yes-submitter']) && is_string($_POST['hidden-yes-submitter'])) { return sanitize_key(wp_unslash($_POST['hidden-yes-submitter'])); }
    return yes_native_entry_role();
}
add_filter('forminator_field_hidden_field_value','yes_native_entry_role_hidden_value',40,4);

/** Targeted, rerunnable migration; account/OTP/notification mappings and post status are retained. */
function yes_native_prepare_entry_role_flow() {
    $results=array();
    foreach (yes_native_config()['entry_forms'] as $slug=>$id) {
        $model=Forminator_API::get_form((int)$id);
        if(is_wp_error($model)){return $model;}
        $item=yes_native_entry_competition((int)$id);
        $new=array(yes_native_field('hidden-yes-submitter','hidden','Submitted by',array('required'=>'','default_value'=>'query','prefill'=>'submitter')));
        $labels=array();foreach($item['classes'] as $class){$labels[$class]='Class '.$class;}
        $max=max(1,(int)($item['team']['maxMembers'] ?? 1));
        $participants=array();
        for($n=1;$n<=$max;$n++) {
            $base=array();
            if($n>1){$base[]=array('element_id'=>'radio-yes-entry-mode','rule'=>'is','value'=>'team');}
            if($n>2){$base[]=array('element_id'=>'number-yes-team-size','rule'=>'is','value'=>(string)$n);}
            if($n>1){$participants[]=yes_native_field('html-yes-participant-'.$n,'html','',array('required'=>'','conditions'=>$base,'variations'=>'<h2>Student '.$n.'</h2>'));}
            if($n>1){
                $participants[]=yes_native_field('text-yes-student-'.$n,'text','Student '.$n.' full name',array('conditions'=>$base));
                $participants[]=yes_native_field('select-yes-class-'.$n,'select','Student '.$n.' class',array('value_type'=>'single','options'=>yes_native_options($labels),'conditions'=>$base));
            }
            // The first name/class fields stay at their existing IDs for saved entries and topic validation.
            $student_conditions=array_merge($base,array(array('element_id'=>'hidden-yes-submitter','rule'=>'is','value'=>'student')));
            $educator_conditions=array_merge($base,array(array('element_id'=>'hidden-yes-submitter','rule'=>'is','value'=>'educator')));
            $participants[]=yes_native_field('email-yes-student-'.$n,'email','Student '.$n.' email',array('conditions'=>$educator_conditions));
            $participants[]=yes_native_field('email-yes-guardian-'.$n,'email','Student '.$n.' guardian email',array('conditions'=>$student_conditions));
            $participants[]=yes_native_field('phone-yes-guardian-'.$n,'phone','Student '.$n.' guardian phone',array('conditions'=>$student_conditions,'phone_validation'=>'none','description'=>'Use your guardian’s contact number. Include the country code if needed, for example +91.'));
        }
        foreach($model->get_fields_as_array() as $field) {
            $key=$field['element_id'];
            if($key==='hidden-yes-submitter'||$key==='page-break-yes-participants'||$key==='textarea-yes-members'||preg_match('/^(html-yes-participant-|text-yes-student-|select-yes-class-|email-yes-student-|email-yes-guardian-|phone-yes-guardian-)/',$key)){continue;}
            if($key==='text-yes-name'){$new[]=yes_native_field('html-yes-participant-1','html','',array('required'=>'','variations'=>'<h2>Student 1</h2>'));$field['field_label']='Student 1 full name';}
            if($key==='select-yes-class'){$field['field_label']='Student 1 class';}
            if($key==='text-yes-school-id'){$field['description']='Type your registered school name or ID and select its branch. School not listed? Ask your educator to register it first.';}
            if($key==='page-break-yes-work'){$new=array_merge($new,$participants);}
            $new[]=$field;
        }
        yes_native_model_fields($model,$new);
        $model->settings['paginationData']['page-break-yes-work-steps']='Students and school';
        $saved=$model->save();if(is_wp_error($saved)){return $saved;}$results[$slug]=(int)$saved;
    }
    foreach(array('student','teacher') as $kind){
        $model=Forminator_API::get_form((int)yes_native_config()[$kind]);
        if(is_wp_error($model)){return $model;}
        $fields=$model->get_fields_as_array();
        foreach($fields as &$field){
            foreach(array('field_label','description') as $key){if(isset($field[$key])&&is_string($field[$key])){$field[$key]=str_ireplace(array('parent/','parent','teacher'),array('Guardian ','guardian','educator'),$field[$key]);}}
            if(($field['element_id'] ?? '')==='email-11'){$field['field_label']='Guardian email address';}
            if(($field['element_id'] ?? '')==='phone-1'){$field['field_label']='Guardian phone number';}
        }unset($field);
        yes_native_model_fields($model,$fields);
        if($kind==='student'){$model->settings['paginationData']['page-break-2-steps']='Guardian contact';}
        if($kind==='teacher'){$model->settings['submitData']['custom-submit-text']='Register educator';}
        $saved=$model->save();if(is_wp_error($saved)){return $saved;}$results[$kind]=(int)$saved;
    }
    return $results;
}

/** Individual entries use singular labels without changing field IDs or saved form definitions. */
function yes_native_entry_participant_labels($wrappers, $form_id) {
    $item = yes_native_entry_competition((int)$form_id);
    if (!$item) { return $wrappers; }
    $mode = yes_native_entry_query('entry_type');
    if (isset($_POST['radio-yes-entry-mode']) && is_string($_POST['radio-yes-entry-mode'])) {
        $mode = sanitize_key(wp_unslash($_POST['radio-yes-entry-mode']));
    }
    if (yes_native_entry_allows_team($item) && $mode === 'team') { return $wrappers; }
    $labels = array(
        'text-yes-name' => 'Student full name',
        'select-yes-class' => 'Student class',
        'email-yes-student-1' => 'Student email',
        'email-yes-guardian-1' => 'Student guardian email',
        'phone-yes-guardian-1' => 'Student guardian phone',
    );
    foreach ($wrappers as &$wrapper) {
        foreach ($wrapper['fields'] as &$field) {
            $key = $field['element_id'] ?? '';
            if (isset($labels[$key])) { $field['field_label'] = $labels[$key]; }
            if ($key === 'html-yes-participant-1') { $field['variations'] = '<h2>Student</h2>'; }
        }
        unset($field);
    }
    unset($wrapper);
    return $wrappers;
}
add_filter('forminator_cform_render_fields','yes_native_entry_participant_labels',60,2);

/** The entry type was chosen before this form. Retain its controls for conditional logic and saves. */
function yes_native_entry_context_field_markup($html,$field,$renderer) {
    if (!yes_native_entry_competition((int)($renderer->model->id ?? 0)) || !in_array($field['element_id'] ?? '',array('radio-yes-entry-mode','number-yes-team-size'),true)) { return $html; }
    $tag=new WP_HTML_Tag_Processor($html);
    if($tag->next_tag()){ $tag->add_class('yes-entry-context-field'); }
    return $tag->get_updated_html();
}
add_filter('forminator_field_markup','yes_native_entry_context_field_markup',60,3);

function yes_native_entry_language($html,$path,$native) {
    return str_replace(array('For parents','For teachers &amp; schools','For teachers & schools','For teachers &amp; Schools','For teachers & Schools'),array('For guardians','For educators &amp; schools','For educators & schools','For educators &amp; Schools','For educators & Schools'),$html);
}
add_filter('yes_frontend_page_html','yes_native_entry_language',80,3);

/** Saved forms and account pages must render current data, never cached form HTML. */
function yes_native_entry_no_page_cache() {
    $path=rtrim((string)wp_parse_url($_SERVER['REQUEST_URI'] ?? '',PHP_URL_PATH),'/');
    if (!in_array($path,array('/competitions/enter','/register','/teachers/register','/schools/register','/schools/nominate','/partners/enquire','/partner-enquiry','/login','/dashboard','/schools/dashboard'),true)) { return; }
    if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE',true); }
    do_action('litespeed_control_set_nocache','Youth Eco Summit live forms and saved entries');
}
add_action('init','yes_native_entry_no_page_cache',1);
