<?php
/** Branded email delivery and locally verified codes. SMS uses its existing plugin. */
if (!defined('ABSPATH')) { exit; }

function yes_email_delivery_mode() {
    // Keep the working gateway until authenticated SMTP has been configured and tested.
    return get_option('yes_registration_email_delivery', 'gateway');
}

function yes_email_smtp_config() {
    $names = array('HOST', 'PORT', 'USER', 'PASSWORD', 'ENCRYPTION');
    $config = array();
    foreach ($names as $name) {
        $constant = 'YES_EMAIL_SMTP_' . $name;
        if (!defined($constant) || !is_scalar(constant($constant)) || (string) constant($constant) === '') {
            return new WP_Error('smtp_config', 'Email verification is temporarily unavailable. Save your progress and try again later.');
        }
        $config[strtolower($name)] = constant($constant);
    }
    $config['port'] = (int) $config['port'];
    $config['from'] = defined('YES_EMAIL_FROM') ? YES_EMAIL_FROM : $config['user'];
    if (!is_string($config['host']) || !preg_match('/^[a-z0-9][a-z0-9.-]+$/iD', $config['host']) ||
        !is_email($config['user']) || !is_string($config['from']) || !is_email($config['from']) ||
        !in_array($config['encryption'], array('ssl', 'tls'), true) ||
        !in_array($config['port'], array(465, 587), true)) {
        return new WP_Error('smtp_config', 'Email verification is temporarily unavailable. Save your progress and try again later.');
    }
    return $config;
}

function yes_email_delivery_ready() {
    if (yes_email_delivery_mode() === 'smtp') {
        $config = yes_email_smtp_config();
        return is_wp_error($config) ? $config : true;
    }
    if (yes_email_delivery_mode() !== 'gateway') {
        return new WP_Error('email_mode', 'Email verification is temporarily unavailable. Save your progress and try again later.');
    }
    $provider = yes_email_provider();
    return is_wp_error($provider) ? $provider : true;
}

function yes_email_message($code) {
    $code = (string) $code;
    $text = "Hello,\n\nUse the code below to verify your email address and continue your Youth Eco Summit registration:\n\n" . $code .
        "\n\nThis code expires in 10 minutes. Please do not share it with anyone.\n\nIf you did not request this code, you can ignore this email.\n\nThank you,\nYouth Eco Summit";
    $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' .
        '<body style="margin:0;background:#f8f6f0;font-family:Arial,Helvetica,sans-serif;color:#292536">' .
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">' .
        '<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e1daeb">' .
        '<tr><td style="padding:24px 32px;background:#514280;color:#ffffff;font-size:22px;font-weight:bold">Youth Eco Summit</td></tr>' .
        '<tr><td style="padding:32px;font-size:18px;line-height:1.6"><p style="margin:0 0 20px">Hello,</p>' .
        '<p style="margin:0 0 24px">Use the code below to verify your email address and continue your Youth Eco Summit registration:</p>' .
        '<p style="margin:0 0 24px;padding:16px;background:#f0ecf6;text-align:center;color:#514280;font-size:34px;letter-spacing:6px;font-weight:bold">' . esc_html($code) . '</p>' .
        '<p style="margin:0 0 20px">This code expires in 10 minutes. Please do not share it with anyone.</p>' .
        '<p style="margin:0 0 24px">If you did not request this code, you can ignore this email.</p>' .
        '<p style="margin:0">Thank you,<br><strong>Youth Eco Summit</strong></p></td></tr></table></td></tr></table></body></html>';
    return array('subject' => 'Your Youth Eco Summit verification code', 'text' => $text, 'html' => $html);
}

function yes_email_new_mailer() {
    require_once ABSPATH . WPINC . '/PHPMailer/Exception.php';
    require_once ABSPATH . WPINC . '/PHPMailer/PHPMailer.php';
    require_once ABSPATH . WPINC . '/PHPMailer/SMTP.php';
    // Separate instance: do not alter WordPress notifications or the SMS gateway.
    return apply_filters('yes_registration_email_mailer', new PHPMailer\PHPMailer\PHPMailer(true));
}

function yes_email_send_branded($email, $code) {
    $config = yes_email_smtp_config();
    if (is_wp_error($config)) { return $config; }
    $message = yes_email_message($code);
    $mailer = yes_email_new_mailer();
    try {
        $mailer->isSMTP();
        $mailer->Host = $config['host'];
        $mailer->Port = $config['port'];
        $mailer->SMTPAuth = true;
        $mailer->Username = $config['user'];
        $mailer->Password = $config['password'];
        $mailer->SMTPSecure = $config['encryption'];
        $mailer->SMTPDebug = 0;
        $mailer->Timeout = 15;
        $mailer->CharSet = 'UTF-8';
        $mailer->setFrom($config['from'], 'Youth Eco Summit');
        $mailer->addAddress($email);
        $mailer->Subject = $message['subject'];
        $mailer->isHTML(true);
        $mailer->Body = $message['html'];
        $mailer->AltBody = $message['text'];
        return $mailer->send() ? true : new WP_Error('email_send', 'The email code could not be sent. Save your progress and try again later.');
    } catch (Throwable $e) {
        // Never expose SMTP credentials, server errors or OTPs in responses/logs.
        return new WP_Error('email_send', 'The email code could not be sent. Save your progress and try again later.');
    } finally { $mailer->smtpClose(); }
}

function yes_email_code_hash($key, $form_id, $recipient, $code) {
    return hash_hmac('sha256', $key . ':' . (int) $form_id . ':' . $recipient . ':' . $code, wp_salt('auth'));
}

function yes_email_deliver_challenge($form_id, $email, $key) {
    $state = array('form' => (int) $form_id, 'recipient' => yes_email_fingerprint($email), 'expires' => time() + 10 * MINUTE_IN_SECONDS, 'attempts' => 0, 'verified' => false);
    if (yes_email_delivery_mode() === 'smtp') {
        $code = (string) random_int(100000, 999999);
        $result = yes_email_send_branded($email, $code);
        if (is_wp_error($result)) { return $result; }
        $state['method'] = 'smtp';
        $state['code_hash'] = yes_email_code_hash($key, $form_id, $state['recipient'], $code);
        return $state;
    }
    if (yes_email_delivery_mode() !== 'gateway') { return new WP_Error('email_mode', 'Email verification is temporarily unavailable.'); }
    $provider = yes_email_provider();
    if (is_wp_error($provider)) { return $provider; }
    $result = $provider->mo_send_otp_token('EMAIL', $email, '');
    if (!is_array($result) || ($result['status'] ?? '') !== 'SUCCESS' || empty($result['txId']) || !is_string($result['txId'])) {
        return new WP_Error('email_send', 'The email code could not be sent. Save your progress and try again later.');
    }
    $state['method'] = 'gateway';
    $state['tx'] = $result['txId'];
    return $state;
}

function yes_email_challenge_matches($state, $form_id, $email) {
    return is_array($state) && (int) ($state['form'] ?? 0) === (int) $form_id && (int) ($state['expires'] ?? 0) > time() &&
        is_string($state['recipient'] ?? null) && hash_equals($state['recipient'], yes_email_fingerprint($email)) &&
        (int) ($state['attempts'] ?? 5) < 5 && empty($state['verified']) &&
        (!empty($state['code_hash']) || !empty($state['tx']));
}

function yes_email_challenge_code_matches($state, $key, $code) {
    if (!empty($state['code_hash']) && ($state['method'] ?? '') === 'smtp') {
        return preg_match('/^[0-9]{6}$/D', $code) && hash_equals($state['code_hash'], yes_email_code_hash($key, $state['form'], $state['recipient'], $code));
    }
    // Codes already issued before the delivery switch remain valid for their original expiry.
    if (!empty($state['tx']) && in_array($state['method'] ?? 'gateway', array('gateway'), true)) {
        $provider = yes_email_provider();
        if (is_wp_error($provider)) { return false; }
        $result = $provider->mo_validate_otp_token($state['tx'], $code, 'EMAIL');
        return is_array($result) && ($result['status'] ?? '') === 'SUCCESS';
    }
    return false;
}
