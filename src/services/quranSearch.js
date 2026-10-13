const ARABIC_MARKS = /\p{M}/u;
const NON_WORD_CHARACTERS = /[^\p{L}\p{N}\s]/gu;
const SEARCH_RESULT_LIMIT = 50;

function foldCharacter(character) {
  if (character === '\u0670') return 'ا';
  return Array.from(character.normalize('NFKD'))
    .filter((part) => part !== '\u0640' && !ARABIC_MARKS.test(part))
    .join('')
    .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئىي]/g, 'ي')
    .replace(/ء/g, '')
    .replace(NON_WORD_CHARACTERS, ' ');
}

export function normalizeQuranText(value) {
  return normalizeQuranTextWithMap(value).text;
}

export function normalizeQuranTextWithMap(value) {
  let text = '';
  const starts = [];
  const ends = [];
  let sourceOffset = 0;

  for (const character of String(value ?? '')) {
    const sourceStart = sourceOffset;
    sourceOffset += character.length;
    const folded = foldCharacter(character);

    for (const part of folded) {
      if (/\s/u.test(part)) {
        if (!text || text.endsWith(' ')) continue;
        text += ' ';
        starts.push(sourceStart);
        ends.push(sourceOffset);
        continue;
      }

      text += part;
      for (let index = 0; index < part.length; index += 1) {
        starts.push(sourceStart);
        ends.push(sourceOffset);
      }
    }
  }

  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }

  let interjectionOffset = text.indexOf('يا ايها');
  while (interjectionOffset !== -1) {
    const separatorOffset = interjectionOffset + 2;
    text = text.slice(0, separatorOffset) + text.slice(separatorOffset + 1);
    starts.splice(separatorOffset, 1);
    ends.splice(separatorOffset, 1);
    interjectionOffset = text.indexOf('يا ايها', interjectionOffset + 1);
  }
  return { text, starts, ends };
}

export function buildQuranSearchIndex(records) {
  if (!Array.isArray(records)) throw new TypeError('Quran ayah data must be an array.');

  const groups = new Map();
  for (const entry of records) {
    const record = Array.isArray(entry)
      ? { surah: entry[0], ayah: entry[1], page: entry[2], text: entry[3] }
      : entry;
    if (!Number.isInteger(record?.surah) || record.surah < 1 || record.surah > 114
      || !Number.isInteger(record?.ayah) || record.ayah < 1
      || !Number.isInteger(record?.page) || record.page < 1 || record.page > 604
      || typeof record?.text !== 'string' || !record.text.trim()) {
      continue;
    }

    const ayah = {
      surah: record.surah,
      ayah: record.ayah,
      page: record.page,
      text: record.text,
      normalized: normalizeQuranText(record.text),
    };
    if (!ayah.normalized) continue;
    if (!groups.has(ayah.surah)) groups.set(ayah.surah, []);
    groups.get(ayah.surah).push(ayah);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([surah, ayahs]) => {
      ayahs.sort((left, right) => left.ayah - right.ayah);
      let offset = 0;
      for (const ayah of ayahs) {
        ayah.start = offset;
        ayah.end = offset + ayah.normalized.length;
        offset = ayah.end + 1;
      }
      return {
        surah,
        ayahs,
        normalized: ayahs.map((ayah) => ayah.normalized).join(' '),
      };
    });
}

export function searchQuranText(index, query, limit = SEARCH_RESULT_LIMIT) {
  const normalizedQuery = normalizeQuranText(query);
  if (!normalizedQuery || !Array.isArray(index)) return { results: [], truncated: false };

  const results = [];
  let truncated = false;
  for (const group of index) {
    let offset = 0;
    while (offset <= group.normalized.length - normalizedQuery.length) {
      const matchStart = group.normalized.indexOf(normalizedQuery, offset);
      if (matchStart === -1) break;
      const matchEnd = matchStart + normalizedQuery.length;
      const verses = group.ayahs
        .filter((ayah) => ayah.start < matchEnd && ayah.end > matchStart)
        .map((ayah) => ({
          ...ayah,
          highlightStart: Math.max(matchStart, ayah.start) - ayah.start,
          highlightEnd: Math.min(matchEnd, ayah.end) - ayah.start,
        }));
      if (verses.length) {
        if (results.length === limit) {
          truncated = true;
          return { results, truncated };
        }
        results.push({
          surah: group.surah,
          ayah: verses[0].ayah,
          page: verses[0].page,
          verses,
        });
      }
      offset = matchStart + Math.max(normalizedQuery.length, 1);
    }
  }
  return { results, truncated };
}
