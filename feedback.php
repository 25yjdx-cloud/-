<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'security.php';
zadSecurityHeaders();
zadRequireMethod('POST');
zadRequireSameOrigin();
zadRequireJsonContentType();
zadRateLimit('feedback', 5, 300);

$data = zadReadJsonBody(16384);
$category = $data['category'] ?? null;
$message = zadCleanText($data['message'] ?? null, 2000);
$allowedCategories = ['suggestion', 'note', 'complaint', 'issue', 'other'];
if (!is_string($category) || !in_array($category, $allowedCategories, true) || $message === '') {
    zadJsonResponse(422, ['error' => 'Enter a message and choose a valid category']);
}

$databaseDirectory = getenv('FEEDBACK_STORAGE_DIR');
$usingDevelopmentStorage = false;
if (!is_string($databaseDirectory) || $databaseDirectory === '') {
    if (PHP_SAPI !== 'cli-server') {
        zadJsonResponse(503, ['error' => 'Feedback storage is not configured']);
    }
    $databaseDirectory = __DIR__ . DIRECTORY_SEPARATOR . 'database';
    $usingDevelopmentStorage = true;
}
if (!$usingDevelopmentStorage
    && !str_starts_with($databaseDirectory, DIRECTORY_SEPARATOR)
    && !preg_match('/^[A-Za-z]:[\\\\\/]/', $databaseDirectory)) {
    zadJsonResponse(503, ['error' => 'Feedback storage must use an absolute path']);
}
if (!is_dir($databaseDirectory)
    && !mkdir($databaseDirectory, 0700, true)
    && !is_dir($databaseDirectory)) {
    zadJsonResponse(503, ['error' => 'Feedback storage is temporarily unavailable']);
}
$resolvedDatabaseDirectory = realpath($databaseDirectory);
$documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
if (!$usingDevelopmentStorage && (!is_string($resolvedDatabaseDirectory) || !is_string($documentRoot))) {
    zadJsonResponse(503, ['error' => 'Feedback storage location could not be validated']);
}
if (!$usingDevelopmentStorage) {
    $documentRootPrefix = rtrim($documentRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if ($resolvedDatabaseDirectory === $documentRoot
        || str_starts_with($resolvedDatabaseDirectory, $documentRootPrefix)) {
        zadJsonResponse(503, ['error' => 'Feedback storage must be outside the public web root']);
    }
}

$lockPath = $databaseDirectory . DIRECTORY_SEPARATOR . 'feedback.lock';
$lock = fopen($lockPath, 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    if (is_resource($lock)) {
        fclose($lock);
    }
    zadJsonResponse(503, ['error' => 'Feedback storage is temporarily unavailable']);
}

$databasePath = $databaseDirectory . DIRECTORY_SEPARATOR . 'db.json';
$existingContents = is_file($databasePath) ? file_get_contents($databasePath) : '[]';
if (!is_string($existingContents)) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zadJsonResponse(503, ['error' => 'Feedback storage is temporarily unavailable']);
}

try {
    $feedbackEntries = json_decode($existingContents, true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zadJsonResponse(503, ['error' => 'Feedback storage is unavailable because its data is invalid']);
}
if (!is_array($feedbackEntries) || !array_is_list($feedbackEntries)) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zadJsonResponse(503, ['error' => 'Feedback storage is unavailable because its data is invalid']);
}

$feedbackEntries[] = [
    'receivedAt' => gmdate('c'),
    'category' => $category,
    'message' => $message,
];
if (count($feedbackEntries) > 5000) {
    $feedbackEntries = array_slice($feedbackEntries, -5000);
}

try {
    $encodedEntries = json_encode(
        $feedbackEntries,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
} catch (JsonException) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zadJsonResponse(503, ['error' => 'Feedback could not be encoded for storage']);
}

$file = fopen($databasePath, 'c+');
if ($file === false) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zadJsonResponse(503, ['error' => 'Feedback storage is temporarily unavailable']);
}
rewind($file);
$written = 0;
$encodedLength = strlen($encodedEntries);
while ($written < $encodedLength) {
    $bytesWritten = fwrite($file, substr($encodedEntries, $written));
    if ($bytesWritten === false || $bytesWritten === 0) {
        fclose($file);
        flock($lock, LOCK_UN);
        fclose($lock);
        zadJsonResponse(503, ['error' => 'Feedback could not be saved']);
    }
    $written += $bytesWritten;
}
if (!ftruncate($file, $encodedLength) || !fflush($file)) {
    fclose($file);
    flock($lock, LOCK_UN);
    fclose($lock);
    zadJsonResponse(503, ['error' => 'Feedback could not be saved']);
}

fclose($file);
flock($lock, LOCK_UN);
fclose($lock);
zadJsonResponse(200, ['success' => true]);
