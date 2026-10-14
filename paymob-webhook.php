<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'security.php';
zadSecurityHeaders();
zadRequireMethod('POST');
zadRequireJsonContentType();
zadRateLimit('paymob-webhook', 120, 60);

$secret = getenv('PAYMOB_HMAC_SECRET');
$providedHmac = $_GET['hmac'] ?? '';
if (!is_string($secret) || $secret === '' || !is_string($providedHmac)
    || !preg_match('/^[a-fA-F0-9]{128}$/', $providedHmac)) {
    zadJsonResponse(403, ['error' => 'Webhook signature is invalid']);
}

$data = zadReadJsonBody(32768);
$transaction = $data['obj'] ?? null;
if (!is_array($transaction) || !is_array($transaction['order'] ?? null)
    || !is_array($transaction['source_data'] ?? null)) {
    zadJsonResponse(400, ['error' => 'Webhook transaction payload is invalid']);
}

$fields = [
    $transaction['amount_cents'] ?? null,
    $transaction['created_at'] ?? null,
    $transaction['currency'] ?? null,
    $transaction['error_occured'] ?? null,
    $transaction['has_parent_transaction'] ?? null,
    $transaction['id'] ?? null,
    $transaction['integration_id'] ?? null,
    $transaction['is_3d_secure'] ?? null,
    $transaction['is_auth'] ?? null,
    $transaction['is_capture'] ?? null,
    $transaction['is_refund'] ?? null,
    $transaction['is_standalone_payment'] ?? null,
    $transaction['is_voided'] ?? null,
    $transaction['order']['id'] ?? null,
    $transaction['owner'] ?? null,
    $transaction['pending'] ?? null,
    $transaction['source_data']['pan'] ?? null,
    $transaction['source_data']['sub_type'] ?? null,
    $transaction['source_data']['type'] ?? null,
    $transaction['success'] ?? null,
];
$canonicalValue = static function (mixed $value): string {
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }
    if (is_string($value) || is_int($value) || is_float($value)) {
        return (string) $value;
    }
    return '';
};
$message = implode('', array_map($canonicalValue, $fields));
$expectedHmac = hash_hmac('sha512', $message, $secret);
if (!hash_equals($expectedHmac, strtolower($providedHmac))) {
    zadJsonResponse(403, ['error' => 'Webhook signature is invalid']);
}

if (($transaction['success'] ?? false) === true
    && ($transaction['pending'] ?? true) === false
    && ($transaction['error_occured'] ?? true) === false
    && ($transaction['is_refund'] ?? true) === false
    && ($transaction['is_voided'] ?? true) === false
    && ($transaction['currency'] ?? null) === 'EGP'
    && ($transaction['is_capture'] ?? false) === true
    && (is_int($transaction['amount_cents'] ?? null)
        || (is_string($transaction['amount_cents'] ?? null)
            && preg_match('/^[0-9]+$/', $transaction['amount_cents'])))
    && (string) ($transaction['order']['id'] ?? '') !== '') {
    $dataDirectory = getenv('AUTH_DATA_DIR');
    if (!is_string($dataDirectory) || $dataDirectory === '') {
        zadJsonResponse(503, ['error' => 'VIP subscription storage is not configured']);
    }
    if (!is_dir($dataDirectory) && !mkdir($dataDirectory, 0700, true) && !is_dir($dataDirectory)) {
        zadJsonResponse(503, ['error' => 'VIP subscription storage is unavailable']);
    }
    $resolvedDirectory = realpath($dataDirectory);
    $webRoot = realpath(__DIR__);
    if (!is_string($resolvedDirectory) || !is_string($webRoot)
        || $resolvedDirectory === $webRoot
        || str_starts_with($resolvedDirectory, $webRoot . DIRECTORY_SEPARATOR)) {
        zadJsonResponse(503, ['error' => 'VIP subscription storage must be outside the web root']);
    }

    $usersFile = $resolvedDirectory . DIRECTORY_SEPARATOR . 'users.json';
    $handle = fopen($usersFile, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        zadJsonResponse(503, ['error' => 'VIP subscription storage is unavailable']);
    }
    $contents = stream_get_contents($handle);
    $users = is_string($contents) && $contents !== '' ? json_decode($contents, true) : [];
    if (!is_array($users)) {
        flock($handle, LOCK_UN);
        fclose($handle);
        zadJsonResponse(503, ['error' => 'VIP subscription storage is invalid']);
    }
    $orderId = (string) $transaction['order']['id'];
    $order = $users['_orders'][$orderId] ?? null;
    $eventMerchantOrderId = $transaction['order']['merchant_order_id'] ?? null;
    $expectedAmount = is_array($order) && is_int($order['amount'] ?? null)
        ? $order['amount'] * 100
        : -1;
    $paymentMethod = is_array($order) && is_string($order['method'] ?? null)
        ? $order['method']
        : 'card';
    $integrationEnvironment = [
        'card' => 'PAYMOB_CARD_INTEGRATION_ID',
        'vodafone_cash' => 'PAYMOB_VODAFONE_CASH_INTEGRATION_ID',
        'etisalat_cash' => 'PAYMOB_ETISALAT_CASH_INTEGRATION_ID',
        'orange_cash' => 'PAYMOB_ORANGE_CASH_INTEGRATION_ID',
    ];
    $integrationId = isset($integrationEnvironment[$paymentMethod])
        ? getenv($integrationEnvironment[$paymentMethod])
        : null;
    if (is_array($order)
        && ($order['status'] ?? null) === 'pending'
        && (int) $transaction['amount_cents'] === $expectedAmount
        && is_string($integrationId) && preg_match('/^[0-9]+$/', $integrationId)
        && (string) ($transaction['integration_id'] ?? '') === $integrationId
        && (!is_string($eventMerchantOrderId)
            || hash_equals((string) ($order['merchantOrderId'] ?? ''), $eventMerchantOrderId))) {
        $userId = $order['userId'] ?? null;
        $days = $order['days'] ?? null;
        $plan = $order['plan'] ?? null;
        $isLifetime = $plan === 'telegram_lifetime';
        if (is_string($userId) && is_array($users[$userId] ?? null)
            && (($isLifetime
                && is_string($users[$userId]['telegramChatId'] ?? null)
                && is_string($order['telegramChatId'] ?? null)
                && hash_equals($users[$userId]['telegramChatId'], $order['telegramChatId']))
                || (!$isLifetime && is_int($days) && $days > 0))) {
            $expiresAt = null;
            if (!$isLifetime) {
                $currentExpiry = $users[$userId]['subscription']['expiresAt'] ?? '';
                $currentTimestamp = is_string($currentExpiry) ? strtotime($currentExpiry) : false;
                $startTimestamp = is_int($currentTimestamp) && $currentTimestamp > time()
                    ? $currentTimestamp
                    : time();
                $expiry = (new DateTimeImmutable('@' . $startTimestamp))
                    ->modify('+' . $days . ' days')
                    ->setTimezone(new DateTimeZone('UTC'));
                $expiresAt = $expiry->format(DATE_ATOM);
            }
            $users[$userId]['subscription'] = [
                'status' => 'active',
                'plan' => $plan,
                'expiresAt' => $expiresAt,
            ];
            $users[$userId]['updatedAt'] = gmdate(DATE_ATOM);
            $users['_orders'][$orderId]['status'] = 'completed';
            $users['_orders'][$orderId]['completedAt'] = gmdate(DATE_ATOM);
            $users['_orders'][$orderId]['transactionId'] = (string) ($transaction['id'] ?? '');
            $serialized = json_encode($users, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            rewind($handle);
            if (!ftruncate($handle, 0) || fwrite($handle, $serialized) !== strlen($serialized) || !fflush($handle)) {
                flock($handle, LOCK_UN);
                fclose($handle);
                zadJsonResponse(503, ['error' => 'VIP subscription could not be updated']);
            }
            if (function_exists('chmod')) {
                chmod($usersFile, 0600);
            }
        }
    }
    flock($handle, LOCK_UN);
    fclose($handle);
}

zadJsonResponse(200, ['received' => true]);
