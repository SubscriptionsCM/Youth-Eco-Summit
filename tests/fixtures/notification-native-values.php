<?php
require $argv[1];
$value=json_decode(stream_get_contents(STDIN),true);
if(!function_exists('yes_bridge_native_field_value')){echo json_encode(array('available'=>false));exit;}
try{echo json_encode(array('value'=>yes_bridge_native_field_value(array('type'=>$value['type']),$value['value'])));}
catch(Throwable $error){echo json_encode(array('rejected'=>true));}
