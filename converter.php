<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

/**
 * Extract the bot's literal data arrays without executing the Telegram bot.
 *
 * Save the supplied bot source as Quran.php beside this script, then run:
 *   php converter.php
 *
 * Only PHP arrays containing literal strings, integers, and nested arrays
 * are accepted. Bot setup, network requests, and other source code are ignored.
 */

$sourceFile = __DIR__ . DIRECTORY_SEPARATOR . 'Quran.php';
$outputFile = __DIR__ . DIRECTORY_SEPARATOR . 'data.json';

if (!is_file($sourceFile) || !is_readable($sourceFile)) {
    fwrite(STDERR, "Quran.php was not found or is not readable.\n");
    exit(1);
}

$tokens = token_get_all((string) file_get_contents($sourceFile));

$skipTrivia = static function (array $tokens, int &$index): void {
    while (isset($tokens[$index]) && is_array($tokens[$index])
        && in_array($tokens[$index][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
        $index++;
    }
};

$decodeString = static function (string $literal): string {
    $quote = $literal[0];
    $contents = substr($literal, 1, -1);
    if ($quote === "'") {
        return preg_replace_callback(
            "/\\\\\\\\([\\\\\\\\'])/",
            static fn(array $match): string => $match[1],
            $contents
        ) ?? $contents;
    }
    return stripcslashes($contents);
};

$readArray = static function (string $variable) use ($tokens, $skipTrivia, $decodeString): array {
    $index = null;
    foreach ($tokens as $tokenIndex => $token) {
        if (is_array($token) && $token[0] === T_VARIABLE && $token[1] === '$' . $variable) {
            $index = $tokenIndex + 1;
            break;
        }
    }
    if ($index === null) {
        throw new RuntimeException("The source does not define \${$variable}.");
    }

    $skipTrivia($tokens, $index);
    if (($tokens[$index] ?? null) !== '=') {
        throw new RuntimeException("\${$variable} must be assigned a literal array.");
    }

    $index++;
    $skipTrivia($tokens, $index);
    if (($tokens[$index] ?? null) !== '[') {
        throw new RuntimeException("\${$variable} must be assigned a literal array.");
    }

    $parseValue = null;
    $parseValue = static function () use (&$parseValue, $tokens, $skipTrivia, $decodeString, &$index): mixed {
        $skipTrivia($tokens, $index);
        $token = $tokens[$index] ?? null;

        if ($token === '[') {
            $index++;
            $array = [];
            while (true) {
                $skipTrivia($tokens, $index);
                if (($tokens[$index] ?? null) === ']') {
                    $index++;
                    return $array;
                }
                if (!isset($tokens[$index])) {
                    throw new RuntimeException('Unexpected end of a PHP array.');
                }

                $value = $parseValue();
                $skipTrivia($tokens, $index);
                if (($tokens[$index] ?? null) === T_DOUBLE_ARROW) {
                    $index++;
                    if (!is_string($value) && !is_int($value)) {
                        throw new RuntimeException('Array keys must be strings or integers.');
                    }
                    $array[$value] = $parseValue();
                } else {
                    $array[] = $value;
                }

                $skipTrivia($tokens, $index);
                if (($tokens[$index] ?? null) === ',') {
                    $index++;
                } elseif (($tokens[$index] ?? null) !== ']') {
                    throw new RuntimeException('Expected a comma or closing bracket in a PHP array.');
                }
            }
        }

        if (is_array($token) && $token[0] === T_CONSTANT_ENCAPSED_STRING) {
            $index++;
            return $decodeString($token[1]);
        }
        if (is_array($token) && $token[0] === T_LNUMBER) {
            $index++;
            return (int) $token[1];
        }

        throw new RuntimeException('Only literal strings, integers, and nested arrays can be exported.');
    };

    $value = $parseValue();
    if (!is_array($value)) {
        throw new RuntimeException("\${$variable} did not contain an array.");
    }
    return $value;
};

try {
    $azkar = $readArray('adhkar_lists');
    $tasbeeh = $readArray('tasbeeh_phrases');
    $asmaAlHusna = $readArray('asma_al_husna_list');

    $existingQuran = [];
    if (is_file($outputFile) && is_readable($outputFile)) {
        $existingData = json_decode(
            (string) file_get_contents($outputFile),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
        if (is_array($existingData['quran'] ?? null)) {
            $existingQuran = $existingData['quran'];
        }
    }

    $data = [
        'quran' => [
            'pageCount' => is_int($existingQuran['pageCount'] ?? null) ? $existingQuran['pageCount'] : 604,
            'pageUrlTemplate' => is_string($existingQuran['pageUrlTemplate'] ?? null)
                ? $existingQuran['pageUrlTemplate']
                : 'https://quran.ksu.edu.sa/png_big/{page}.png',
            'surahs' => is_array($existingQuran['surahs'] ?? null) ? $existingQuran['surahs'] : [],
            'juzs' => is_array($existingQuran['juzs'] ?? null) ? $existingQuran['juzs'] : [],
            'textAvailable' => false,
        ],
        'azkar' => [
            'sabah' => $azkar['sabah'] ?? [],
            'masaa' => $azkar['masaa'] ?? [],
            'sleep' => $azkar['sleep'] ?? [],
            'wakeup' => $azkar['wakeup'] ?? [],
            'asma_al_husna' => $asmaAlHusna,
        ],
        'tasbeeh' => $tasbeeh,
    ];

    $json = json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
    if (file_put_contents($outputFile, $json . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Could not write data.json; check directory permissions.');
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'Conversion failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}

fwrite(STDOUT, "Exported Azkar, Tasbeeh, and Quran page metadata to data.json.\n");
