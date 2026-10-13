<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'security.php';
zadSecurityHeaders();
zadRequireMethod('POST');
zadRequireSameOrigin();
zadRequireJsonContentType();
zadRateLimit('create-payment', 6, 300);

$data = zadReadJsonBody();
$method = $data['method'] ?? null;
$amount = $data['amount'] ?? null;
$name = zadCleanText($data['name'] ?? null, 120);
$email = strtolower(zadCleanText($data['email'] ?? null, 254));
$phone = preg_replace('/[\s().-]/', '', zadCleanText($data['phone'] ?? null, 24)) ?? '';

$allowedAmounts = [50, 100, 250, 500];
if (!is_string($method) || !in_array($method, [
    'card',
    'vodafone_cash',
    'etisalat_cash',
    'orange_cash',
    'instapay',
], true) || !is_int($amount) || !in_array($amount, $allowedAmounts, true)) {
    zadJsonResponse(422, ['error' => 'Choose a supported payment method and amount']);
}

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    zadJsonResponse(422, ['error' => 'Enter a valid name and email address']);
}

if ($method !== 'instapay'
    && !preg_match('/^\+?[0-9]{8,15}$/', $phone)) {
    zadJsonResponse(422, ['error' => 'Enter a valid payment phone number']);
}

if ($method === 'instapay') {
    $paymentUrl = getenv('INSTAPAY_PAYMENT_URL');
    if (!is_string($paymentUrl) || $paymentUrl === '') {
        zadJsonResponse(503, ['error' => 'InstaPay is not configured yet']);
    }
    $urlParts = parse_url($paymentUrl);
    if (!is_array($urlParts) || ($urlParts['scheme'] ?? '') !== 'https'
        || empty($urlParts['host']) || isset($urlParts['user']) || isset($urlParts['pass'])) {
        zadJsonResponse(503, ['error' => 'InstaPay payment link is not configured safely']);
    }
    zadJsonResponse(200, ['redirectUrl' => $paymentUrl]);
}

$integrationEnvironment = [
    'card' => 'PAYMOB_CARD_INTEGRATION_ID',
    'vodafone_cash' => 'PAYMOB_VODAFONE_CASH_INTEGRATION_ID',
    'etisalat_cash' => 'PAYMOB_ETISALAT_CASH_INTEGRATION_ID',
    'orange_cash' => 'PAYMOB_ORANGE_CASH_INTEGRATION_ID',
];
$apiKey = getenv('PAYMOB_API_KEY');
$integrationId = getenv($integrationEnvironment[$method]);
$iframeId = getenv('PAYMOB_IFRAME_ID');
if (!is_string($apiKey) || $apiKey === ''
    || !is_string($integrationId) || !preg_match('/^[0-9]+$/', $integrationId)
    || !is_string($iframeId) || !preg_match('/^[0-9]+$/', $iframeId)) {
    zadJsonResponse(503, ['error' => 'This payment method is not configured yet']);
}

$tokenResponse = zadPaymobRequest('auth/tokens', ['api_key' => $apiKey]);
$authToken = $tokenResponse['token'] ?? null;
if (!is_string($authToken) || $authToken === '') {
    zadJsonResponse(502, ['error' => 'Payment provider authentication failed']);
}

$orderResponse = zadPaymobRequest('ecommerce/orders', [
    'auth_token' => $authToken,
    'delivery_needed' => false,
    'amount_cents' => $amount * 100,
    'currency' => 'EGP',
    'items' => [],
]);
$orderId = $orderResponse['id'] ?? null;
if (!is_int($orderId) && !is_string($orderId)) {
    zadJsonResponse(502, ['error' => 'Payment provider could not create the order']);
}

$nameParts = preg_split('/\s+/u', $name, 2) ?: [];
$firstName = $nameParts[0] ?? '';
$lastName = $nameParts[1] ?? 'Supporter';
$billingPhone = $phone;
$billingData = [
    'apartment' => 'NA',
    'email' => $email,
    'floor' => 'NA',
    'first_name' => $firstName,
    'street' => 'NA',
    'building' => 'NA',
    'phone_number' => $billingPhone,
    'shipping_method' => 'NA',
    'postal_code' => 'NA',
    'city' => 'Cairo',
    'country' => 'EG',
    'last_name' => $lastName,
    'state' => 'Cairo',
];
$keyResponse = zadPaymobRequest('acceptance/payment_keys', [
    'auth_token' => $authToken,
    'amount_cents' => $amount * 100,
    'expiration' => 1800,
    'order_id' => $orderId,
    'billing_data' => $billingData,
    'currency' => 'EGP',
    'integration_id' => (int) $integrationId,
    'lock_order_when_paid' => true,
]);
$paymentToken = $keyResponse['token'] ?? null;
if (!is_string($paymentToken) || $paymentToken === '') {
    zadJsonResponse(502, ['error' => 'Payment provider could not create a secure checkout']);
}

$redirectUrl = 'https://accept.paymob.com/api/acceptance/iframes/'
    . rawurlencode($iframeId) . '?payment_token=' . rawurlencode($paymentToken);
zadJsonResponse(200, ['redirectUrl' => $redirectUrl]);
