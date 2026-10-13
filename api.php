<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'security.php';
zadSecurityHeaders();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'data.json';
if (!is_file($dataFile) || !is_readable($dataFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Application data is unavailable'], JSON_UNESCAPED_UNICODE);
    exit;
}

$modifiedAt = filemtime($dataFile);
if ($modifiedAt === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Application data is unavailable'], JSON_UNESCAPED_UNICODE);
    exit;
}
$etag = '"' . hash_file('sha256', $dataFile) . '"';
header('Cache-Control: public, max-age=300, stale-while-revalidate=60');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $modifiedAt) . ' GMT');
header('ETag: ' . $etag);
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
}

readfile($dataFile);
