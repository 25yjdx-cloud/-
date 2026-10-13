<?php
declare(strict_types=1);

function zadSecurityHeaders(): void
{
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('Content-Security-Policy: default-src \'self\'; script-src \'self\' https://cdn.jsdelivr.net; style-src \'self\' https://cdn.jsdelivr.net \'unsafe-inline\'; img-src \'self\' data: https://quran.ksu.edu.sa https://*.googleusercontent.com; font-src \'self\' data: https://cdn.jsdelivr.net; connect-src \'self\'; object-src \'none\'; base-uri \'self\'; form-action \'self\'; frame-ancestors \'none\'');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

function zadJsonResponse(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function zadRequireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        zadJsonResponse(405, ['error' => 'Method not allowed']);
    }
}

function zadRequireJsonContentType(): void
{
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') {
        zadJsonResponse(415, ['error' => 'Content-Type must be application/json']);
    }
}

function zadRequireSameOrigin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        zadJsonResponse(403, ['error' => 'Request origin could not be verified']);
    }

    $configuredOrigin = getenv('APP_ORIGIN');
    if (!is_string($configuredOrigin) || $configuredOrigin === '') {
        zadJsonResponse(503, ['error' => 'Application origin is not configured']);
    }
    $originParts = parse_url($configuredOrigin);
    $isLocalDevelopmentHost = is_array($originParts)
        && in_array(strtolower((string) ($originParts['host'] ?? '')), ['localhost', '127.0.0.1'], true);
    if (!is_array($originParts)
        || (($originParts['scheme'] ?? '') !== 'https' && !($isLocalDevelopmentHost && ($originParts['scheme'] ?? '') === 'http'))
        || empty($originParts['host']) || isset($originParts['path']) || isset($originParts['query'])) {
        zadJsonResponse(503, ['error' => 'Application origin is not configured safely']);
    }
    $expectedOrigin = rtrim($configuredOrigin, '/');

    if (!hash_equals($expectedOrigin, rtrim($origin, '/'))) {
        zadJsonResponse(403, ['error' => 'Cross-origin request rejected']);
    }
}

function zadRateLimit(string $action, int $limit, int $windowSeconds): void
{
    $clientAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = hash('sha256', $action . "\0" . $clientAddress);
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'zad-rate-limit';

    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        zadJsonResponse(503, ['error' => 'Request protection is temporarily unavailable']);
    }

    $handle = fopen($directory . DIRECTORY_SEPARATOR . $key . '.json', 'c+');
    if ($handle === false) {
        zadJsonResponse(503, ['error' => 'Request protection is temporarily unavailable']);
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        zadJsonResponse(503, ['error' => 'Request protection is temporarily unavailable']);
    }

    $contents = stream_get_contents($handle);
    $stored = is_string($contents) ? json_decode($contents, true) : null;
    $now = time();
    $timestamps = is_array($stored) ? $stored : [];
    $timestamps = array_values(array_filter(
        $timestamps,
        static fn($timestamp): bool => is_int($timestamp) && $timestamp > $now - $windowSeconds
    ));

    if (count($timestamps) >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        header('Retry-After: ' . max(1, $windowSeconds - ($now - min($timestamps))));
        zadJsonResponse(429, ['error' => 'Too many requests. Please try again later.']);
    }

    $timestamps[] = $now;
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, json_encode($timestamps, JSON_THROW_ON_ERROR));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function zadReadJsonBody(int $maximumBytes = 8192): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $maximumBytes) {
        zadJsonResponse(413, ['error' => 'Request body is too large']);
    }

    $raw = file_get_contents('php://input', false, null, 0, $maximumBytes + 1);
    if (!is_string($raw) || $raw === '') {
        zadJsonResponse(400, ['error' => 'Request body is empty']);
    }
    if (strlen($raw) > $maximumBytes) {
        zadJsonResponse(413, ['error' => 'Request body is too large']);
    }

    try {
        $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        zadJsonResponse(400, ['error' => 'Invalid JSON request body']);
    }
    if (!is_array($data) || array_is_list($data)) {
        zadJsonResponse(400, ['error' => 'Request body must be a JSON object']);
    }
    return $data;
}

function zadCleanText(mixed $value, int $maximumLength): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '');
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length > $maximumLength) {
        return '';
    }
    return $value;
}

function zadPaymobRequest(string $path, array $payload): array
{
    if (!function_exists('curl_init')) {
        zadJsonResponse(503, ['error' => 'Secure payment service is unavailable']);
    }
    $handle = curl_init('https://accept.paymob.com/api/' . ltrim($path, '/'));
    if ($handle === false) {
        zadJsonResponse(503, ['error' => 'Secure payment service is unavailable']);
    }
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    $responseBody = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if (!is_string($responseBody) || $status < 200 || $status >= 300) {
        zadJsonResponse(502, ['error' => 'Payment provider could not create a checkout session']);
    }

    try {
        $response = json_decode($responseBody, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        zadJsonResponse(502, ['error' => 'Payment provider returned an invalid response']);
    }
    if (!is_array($response)) {
        zadJsonResponse(502, ['error' => 'Payment provider returned an invalid response']);
    }
    return $response;
}
