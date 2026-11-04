<?php
/** Run only with authenticated WP-CLI: wp eval-file export-wordpress.php /private/new-directory
 * Source DB is read-only. The destination must not exist and must be outside ABSPATH.
 * Export contains private records; never put it in a repository or web root.
 */
if (!defined('WP_CLI') || !WP_CLI) { exit(1); }
global $wpdb;
$destination = $args[0] ?? '';
$parent = realpath(dirname($destination));
$web = realpath(ABSPATH);
if (!$parent || $destination === '' || file_exists($destination) || strpos($parent . '/', $web . '/') === 0) { WP_CLI::error('Use a new private directory outside the web root.'); }
umask(0077);
if (!mkdir($destination, 0700) || !mkdir($destination . '/attachments', 0700)) { WP_CLI::error('Cannot create private export directory.'); }
$records = array(); $attachments = array(); $issues = array();
$private = realpath((string)get_option('yes_native_private_upload_root'));
$upload = wp_upload_dir(null,false); $upload_root = realpath($upload['basedir']);
$source = untrailingslashit(home_url());
$add = function($kind,$source_id,$payload) use (&$records) { $records[] = array('kind'=>$kind,'sourceId'=>(string)$source_id,'payload'=>$payload); };
$decode = function($raw) { return is_serialized($raw) ? @unserialize(trim($raw),array('allowed_classes'=>false)) : $raw; };
$file_candidates = function($value) use (&$file_candidates,$private,$upload_root,$upload,$source) {
 $found = array();
 if (is_array($value)) { foreach ($value as $item) { $found = array_merge($found,$file_candidates($item)); } return $found; }
 if (!is_string($value)) { return $found; }
 $path = $value;
 if (filter_var($value,FILTER_VALIDATE_URL)) {
  if (strpos($value,trailingslashit($upload['baseurl'])) === 0) { $path = $upload_root . '/' . rawurldecode(substr($value,strlen(trailingslashit($upload['baseurl'])))); }
  elseif (strpos($value,$source . '/yes-entry-file/') === 0 && $private) { $path = $private . '/' . rawurldecode(substr($value,strlen($source . '/yes-entry-file/'))); }
  else { return $found; }
 }
 $resolved = realpath($path);
 if ($resolved && is_file($resolved) && (($private && strpos($resolved,$private . DIRECTORY_SEPARATOR) === 0) || ($upload_root && strpos($resolved,$upload_root . DIRECTORY_SEPARATOR) === 0))) { $found[] = $resolved; }
 return $found;
};
try {
 $wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 $wpdb->query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 $entries = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}frmt_form_entry ORDER BY entry_id",ARRAY_A);
 foreach ($entries as $entry) {
  $meta = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}frmt_form_entry_meta WHERE entry_id=%d ORDER BY meta_id",$entry['entry_id']),ARRAY_A);
  foreach ($meta as &$item) {
   $raw = $item['meta_value']; $item['meta_value_raw_base64'] = base64_encode($raw); $item['meta_value'] = $decode($raw);
   if (strpos((string)$item['meta_key'],'upload') !== false) {
    $paths = array_values(array_unique($file_candidates($item['meta_value'])));
    if (!$paths && $raw !== '' && $raw !== 'a:0:{}') { $issues[] = array('entryId'=>$entry['entry_id'],'field'=>$item['meta_key'],'reason'=>'Upload metadata has no resolvable local file; reconcile before cutover.'); }
    foreach ($paths as $path) {
     $source_id = $item['meta_id'] . ':' . hash('sha256',$path);
     $sha = hash_file('sha256',$path); $relative = 'attachments/' . hash('sha256',$source_id);
     // Safe filenames are hashes and numeric source IDs, never a source path.
     $relative = str_replace(':','-',$relative);
     if (!copy($path,$destination . '/' . $relative) || hash_file('sha256',$destination . '/' . $relative) !== $sha) { throw new RuntimeException('Attachment changed or failed during export.'); }
     $attachments[] = array('sourceId'=>$source_id,'entryId'=>(string)$entry['entry_id'],'path'=>$relative,'sha256'=>$sha,'bytes'=>filesize($destination . '/' . $relative),'filename'=>basename($path),'mimeType'=>(new finfo(FILEINFO_MIME_TYPE))->file($path));
    }
   }
  }
  unset($item); $entry['meta']=$meta; $add('entry',$entry['entry_id'],$entry);
 }
 foreach ($wpdb->get_results("SELECT * FROM {$wpdb->users} ORDER BY ID",ARRAY_A) as $user) {
  unset($user['user_activation_key']);
  $user['meta'] = array();
  foreach ($wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->usermeta} WHERE user_id=%d ORDER BY umeta_id",$user['ID']),ARRAY_A) as $m) {
   if (preg_match('/session_tokens|application_passwords|otp|secret|token|password/i',$m['meta_key'])) { continue; }
   $m['meta_value_raw_base64']=base64_encode($m['meta_value']); $m['meta_value']=$decode($m['meta_value']);$user['meta'][]=$m;
  }
  $add('user',$user['ID'],$user);
 }
 foreach ($wpdb->get_results("SELECT * FROM {$wpdb->posts} WHERE post_type='forminator_forms' ORDER BY ID",ARRAY_A) as $form) {
  $form['definition']=get_post_meta($form['ID'],'forminator_form_meta',true);
  $add('form',$form['ID'],$form);
 }
 foreach (array('yes_native_portal','yes_native_imported_schools','yes_native_school_catalog') as $key) { $value=get_option($key,null); if ($value!==null) { $add('option',$key,array('value'=>$value)); } }
 $wpdb->query('COMMIT');
 $data=array('format'=>'yes-wordpress-export/v1','source'=>$source,'capturedAt'=>gmdate('c'),'counts'=>array('records'=>count($records),'attachments'=>count($attachments)),'records'=>$records,'attachments'=>$attachments);
 $json=wp_json_encode($data,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
 if (file_put_contents($destination . '/export.json',$json,LOCK_EX)===false) { throw new RuntimeException('Could not save export.'); }
 file_put_contents($destination . '/issues.json',wp_json_encode($issues,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
 WP_CLI::success(wp_json_encode(array('records'=>count($records),'entries'=>count($entries),'attachments'=>count($attachments),'issues'=>count($issues),'manifestSha256'=>hash('sha256',$json))));
} catch (Throwable $error) { $wpdb->query('ROLLBACK'); WP_CLI::error('Export incomplete. Retain partial directory for investigation; source records were not changed. ' . $error->getMessage()); }
