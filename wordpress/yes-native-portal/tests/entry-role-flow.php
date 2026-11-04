<?php
/** WP CLI regression checks: no entries, uploads or notifications are created. */
if(!defined('WP_CLI')||!WP_CLI){exit;}
$passed=0;
$assert=function($ok,$why)use(&$passed){if(!$ok){throw new RuntimeException($why);} $passed++;};
$old_get=$_GET;$old_post=$_POST;$old_user=get_current_user_id();$old_prepared=Forminator_CForm_Front_Action::$prepared_data;
$draft_ajax=function(){return true;};
try{
$_POST=array();
$school=yes_native_school_choices()[0];
$fields=function($role,$size,$class) {
    $data=array('hidden-yes-submitter'=>$role,'radio-yes-entry-mode'=>$size>1?'team':'individual','number-yes-team-size'=>(string)$size,'text-yes-name'=>'QA Student One','select-yes-class'=>(string)$class);
    for($n=1;$n<=$size;$n++){
        if($n>1){$data['text-yes-student-'.$n]='QA Student '.$n;$data['select-yes-class-'.$n]=(string)$class;}
        $data[($role==='educator'?'email-yes-student-':'email-yes-guardian-').$n]='qa'.$n.'@example.org';
        if($role==='student'){$data['phone-yes-guardian-'.$n]='+919876543210';}
    }
    $out=array();foreach($data as $k=>$v){$out[]=array('name'=>$k,'value'=>$v);}return $out;
};
foreach(yes_native_config()['entry_forms'] as $slug=>$id){
    $item=yes_native_entry_competition($id);
    $max=max(1,(int)($item['team']['maxMembers']??1));
    foreach(array('student','educator') as $role){
        foreach(array_unique(array(1,$max)) as $size){
            $good=$fields($role,$size,$item['classes'][0]);
            $assert(yes_native_entry_participant_errors(array(),$id,$good)===array(),$slug.' valid '.$role.' '.$size);
            $bad=array_values(array_filter($good,function($f)use($role,$size){return $f['name']!==($role==='educator'?'email-yes-student-':'email-yes-guardian-').$size;}));
            $assert(yes_native_entry_participant_errors(array(),$id,$bad)!==array(),$slug.' missing last contact must fail');
            $good[]=array('name'=>$role==='educator'?'email-yes-guardian-1':'email-yes-student-1','value'=>'unneeded@example.org');
            $good[]=array('name'=>'email-yes-guardian-9','value'=>'extra@example.org');
            $stored=yes_native_entry_values(yes_native_entry_participant_meta($good,$id));
            $assert($stored['_yes_entry_submitter_role']===$role,$slug.' stored role');
            $assert(!isset($stored[$role==='educator'?'email-yes-guardian-1':'email-yes-student-1']),$slug.' inactive role contact stripped');
            $assert(!isset($stored['email-yes-guardian-9']),$slug.' inactive participant stripped');
        }
    }
    $assert(yes_native_entry_participant_errors(array(),$id,array())!==array(),$slug.' missing role rejected');
    $model=Forminator_API::get_form($id);$ids=array_column($model->get_fields_as_array(),'element_id');
    $assert(in_array('hidden-yes-submitter',$ids,true)&&in_array('email-yes-guardian-1',$ids,true)&&in_array('email-yes-student-1',$ids,true),$slug.' live fields');
    $assert(!in_array('textarea-yes-members',$ids,true),$slug.' old freeform removed');
}
// Native Forminator saves omit hidden fields. A nonce-verified draft must retain the declared role and every contact.
add_filter('wp_doing_ajax',$draft_ajax,999);
$id=yes_native_config()['entry_forms']['short-film-making'];
foreach(array('student','educator') as $role){
    $_POST=array('action'=>'forminator_submit_form_custom-forms','save_draft'=>'true','forminator_nonce'=>wp_create_nonce('forminator_submit_form'.$id));
    Forminator_CForm_Front_Action::$prepared_data=array('hidden-yes-submitter'=>$role);
    $good=array_values(array_filter($fields($role,3,7),function($f){return $f['name']!=='hidden-yes-submitter';}));
    $stored=yes_native_entry_values(yes_native_entry_participant_meta($good,$id));
    $assert(($stored['_yes_entry_submitter_role']??'')===$role,'Native draft retains '.$role.' provenance');
    for($n=1;$n<=3;$n++){
        $assert(isset($stored[($role==='educator'?'email-yes-student-':'email-yes-guardian-').$n]),'Native draft retains '.$role.' contact '.$n);
        if($role==='student'){$assert(isset($stored['phone-yes-guardian-'.$n]),'Native draft retains guardian phone '.$n);}
    }
    $model=(object)array('meta_data'=>array('_yes_entry_submitter_role'=>array('value'=>$role)));
    $assert((yes_native_entry_draft_context($model)['submitter']??'')===$role,'Saved link role restored from provenance');
    $_POST['forminator_nonce']='invalid-test-nonce';
    $bad=yes_native_entry_values(yes_native_entry_participant_meta($good,$id));
    $assert(!isset($bad['_yes_entry_submitter_role']),'Invalid draft cannot use prepared role fallback');
}
remove_filter('wp_doing_ajax',$draft_ajax,999);$_POST=array();
$_GET=array();$html=yes_native_entry_hub();
$assert(strpos($html,'I am a student')!==false&&strpos($html,'I am an educator')!==false,'Two clear roles');
$assert(strpos($html,'name="entry_type"')===false&&strpos($html,'name="school_id"')===false,'Role comes first');
$assert(strpos($html,'Continue a saved entry')!==false,'Saved entry access');
$_GET=array('submitter'=>'educator');$html=yes_native_entry_hub();
$assert(substr_count($html,'>Choose ')>=10,'Competition choice comes next');
$assert(strpos($html,'name="entry_type"')===false,'No team choice before competition');
$_GET=array('submitter'=>'student','competition'=>'blog-writing');$html=yes_native_entry_hub();
$assert(strpos($html,'name="school_id"')!==false&&strpos($html,'value="team"')===false,'Individual challenge bypasses team choice');
$_GET=array('submitter'=>'student','competition'=>'short-film-making');$html=yes_native_entry_hub();
$assert(strpos($html,'value="team"')!==false&&strpos($html,'name="school_id"')===false,'Eligible team challenge asks entry type');
$_GET=array('submitter'=>'educator','competition'=>'blog-writing','entry_type'=>'individual','school_id'=>$school['reference']);
$context=yes_native_entry_registration_context();
$assert($context['submitter']==='educator','Role survives registration context');
$link=yes_native_entry_context_link('/login/',$context);$assert(strpos($link,'submitter=educator')!==false,'Role survives sign-in');
wp_set_current_user(0);
$html=yes_native_entry_selected_page(yes_native_entry_competition(yes_native_config()['entry_forms']['blog-writing']),$school,$context,true);
$assert(strpos($html,'/teachers/register/')!==false&&strpos($html,'Create an educator account')!==false,'Educator account route');
$assert(yes_native_entry_participant_errors(array(),yes_native_config()['school'],array())===array(),'School form unaffected');
}finally{remove_filter('wp_doing_ajax',$draft_ajax,999);Forminator_CForm_Front_Action::$prepared_data=$old_prepared;$_GET=$old_get;$_POST=$old_post;wp_set_current_user($old_user);}
echo wp_json_encode(array('passed'=>$passed,'records_created'=>0,'messages_sent'=>0))."\n";
