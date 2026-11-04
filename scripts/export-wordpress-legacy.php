<?php
/** Supplemental read-only Elementor / Formidable archive. Run under WP-CLI.
 * wp eval-file export-wordpress-legacy.php /new/private/directory
 */
if (!defined('WP_CLI') || !WP_CLI) { exit(1); }
global $wpdb;
$destination=$args[0] ?? ''; $parent=realpath(dirname($destination));$web=realpath(ABSPATH);
if (!$parent || file_exists($destination) || strpos($parent . '/',$web . '/')===0) { WP_CLI::error('Use a new private directory outside the web root.'); }
umask(0077);mkdir($destination,0700);mkdir($destination.'/attachments',0700);
$records=array();$attachments=array();$issues=array();$uploads=wp_upload_dir(null,false);$base=realpath($uploads['basedir']);
$tables=$wpdb->get_col('SHOW TABLES');
$exists=function($suffix) use($tables,$wpdb){return in_array($wpdb->prefix.$suffix,$tables,true);};
$paths=function($value) use(&$paths,$base,$uploads){
 $out=array();
 if(is_array($value)){foreach($value as $part){$out=array_merge($out,$paths($part));}return $out;}
 if(!is_string($value)||$value===''){return $out;}
 if(is_serialized($value)){return $paths(@unserialize($value,array('allowed_classes'=>false)));}
 if(in_array(substr(ltrim($value),0,1),array('[','{'),true)){$decoded=json_decode($value,true);if(is_array($decoded)){return $paths($decoded);}}
 $candidate=$value;
 if(strpos($value,trailingslashit($uploads['baseurl']))===0){$candidate=$base.'/'.rawurldecode(substr($value,strlen(trailingslashit($uploads['baseurl']))));}
 $resolved=realpath($candidate);
 if($resolved&&is_file($resolved)&&$base&&strpos($resolved,$base.DIRECTORY_SEPARATOR)===0){$out[]=$resolved;}
 return $out;
};
$add=function($kind,$sourceId,$payload) use(&$records){$records[]=array('kind'=>$kind,'sourceId'=>(string)$sourceId,'payload'=>$payload);};
$copy=function($entryId,$payload,$extra=array()) use(&$attachments,$paths,$destination){
 foreach(array_values(array_unique(array_merge($paths($payload),$extra))) as $path){
  $sourceId=$entryId.':'.hash('sha256',$path);$relative='attachments/'.hash('sha256',$sourceId);$sha=hash_file('sha256',$path);
  if(!copy($path,$destination.'/'.$relative)||hash_file('sha256',$destination.'/'.$relative)!==$sha){throw new RuntimeException('Legacy attachment changed during export.');}
  $attachments[]=array('sourceId'=>$sourceId,'entryId'=>$entryId,'path'=>$relative,'sha256'=>$sha,'bytes'=>filesize($destination.'/'.$relative),'filename'=>basename($path),'mimeType'=>(new finfo(FILEINFO_MIME_TYPE))->file($path));
 }
};
try{
 $wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$wpdb->query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 if($exists('e_submissions')){
  $values=array();$logs=array();
  if($exists('e_submissions_values')){foreach($wpdb->get_results("SELECT * FROM {$wpdb->prefix}e_submissions_values ORDER BY id",ARRAY_A) as $row){$values[$row['submission_id']][]=$row;}}
  if($exists('e_submissions_actions_log')){foreach($wpdb->get_results("SELECT * FROM {$wpdb->prefix}e_submissions_actions_log ORDER BY id",ARRAY_A) as $row){$logs[$row['submission_id']][]=$row;}}
  foreach($wpdb->get_results("SELECT * FROM {$wpdb->prefix}e_submissions ORDER BY id",ARRAY_A) as $row){
   $key='elementor:'.$row['id'];$payload=array('source_table'=>$wpdb->prefix.'e_submissions','row'=>$row,'values'=>$values[$row['id']]??array(),'actions_log'=>$logs[$row['id']]??array());$add('entry',$key,$payload);$copy($key,$payload);
  }
  foreach($wpdb->get_results("SELECT * FROM {$wpdb->posts} WHERE ID IN (SELECT DISTINCT post_id FROM {$wpdb->prefix}e_submissions) ORDER BY ID",ARRAY_A) as $post){
   $post['elementor_data']=get_post_meta($post['ID'],'_elementor_data',true);$post['elementor_page_settings']=get_post_meta($post['ID'],'_elementor_page_settings',true);$add('post','elementor-post:'.$post['ID'],$post);
  }
 }
 if($exists('frm_forms')){foreach($wpdb->get_results("SELECT * FROM {$wpdb->prefix}frm_forms ORDER BY id",ARRAY_A) as $form){
  $fields=$exists('frm_fields')?$wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}frm_fields WHERE form_id=%d ORDER BY id",$form['id']),ARRAY_A):array();
  $add('form','formidable:'.$form['id'],array('source_table'=>$wpdb->prefix.'frm_forms','row'=>$form,'fields'=>$fields));
 }}
 if($exists('frm_items')){
  $meta=array();if($exists('frm_item_metas')){foreach($wpdb->get_results("SELECT * FROM {$wpdb->prefix}frm_item_metas ORDER BY id",ARRAY_A) as $row){$meta[$row['item_id']][]=$row;}}
  foreach($wpdb->get_results("SELECT * FROM {$wpdb->prefix}frm_items ORDER BY id",ARRAY_A) as $row){$key='formidable:'.$row['id'];$payload=array('source_table'=>$wpdb->prefix.'frm_items','row'=>$row,'meta'=>$meta[$row['id']]??array());$add('entry',$key,$payload);$copy($key,$payload);}
 }
 // Preserve certificate-generation metadata separately from participant entries.
 foreach(array('e2pdf_entries','e2pdf_datasets','e2pdf_elements','e2pdf_pages','e2pdf_revisions','e2pdf_templates') as $suffix){
  if($exists($suffix)){$rows=$wpdb->get_results("SELECT * FROM {$wpdb->prefix}{$suffix}",ARRAY_A);if($rows){$add('option','metadata:'.$suffix,array('source_table'=>$wpdb->prefix.$suffix,'rows'=>$rows));}}
 }
 $wpdb->query('COMMIT');
 $data=array('format'=>'yes-wordpress-export/v1','source'=>untrailingslashit(home_url()),'capturedAt'=>gmdate('c'),'counts'=>array('records'=>count($records),'attachments'=>count($attachments)),'records'=>$records,'attachments'=>$attachments);
 $json=wp_json_encode($data,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);file_put_contents($destination.'/export.json',$json,LOCK_EX);file_put_contents($destination.'/issues.json',wp_json_encode($issues));
 WP_CLI::success(wp_json_encode(array('records'=>count($records),'entries'=>count(array_filter($records,function($record){return $record['kind']==='entry';})),'attachments'=>count($attachments),'manifestSha256'=>hash('sha256',$json))));
}catch(Throwable $error){$wpdb->query('ROLLBACK');WP_CLI::error('Legacy export incomplete; source records were not changed. '.$error->getMessage());}
