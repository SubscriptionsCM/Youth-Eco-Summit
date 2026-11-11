<?php
$fixture = json_decode(stream_get_contents(STDIN), true);
$yes_fixture_mails = array();
function yes_bridge_notification_plan($input) {
    global $fixture;
    return $fixture['plan'];
}
function wp_mail($to, $subject, $body, $headers, $attachments) {
    global $fixture, $yes_fixture_mails;
    $yes_fixture_mails[] = array('to' => $to, 'subject' => $subject, 'attachments' => $attachments);
    return !empty($fixture['accept']);
}
require $argv[1];
try {
    $result = yes_bridge_notification_mail($fixture['input']);
    echo json_encode(array('result' => $result, 'mailCalls' => $yes_fixture_mails));
} catch (Throwable $error) {
    echo json_encode(array('rejected' => true, 'mailCalls' => $yes_fixture_mails));
}
