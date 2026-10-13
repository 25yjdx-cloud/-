import { appUrl } from './appUrl.js';

const SEASON_MANIFESTS = {
  default: 'manifest-default.json',
  fallback: 'manifest-fallback.json',
  ramadan: 'manifest-ramadan.json',
  fitr: 'manifest-fitr.json',
  adha: 'manifest-adha.json',
};

const SEASON_ICONS = {
  default: 'assets/icons/icon-default.png',
  fallback: 'assets/icons/icon-fallback.png',
  ramadan: 'assets/icons/icon-ramadan.png',
  fitr: 'assets/icons/icon-fitr.png',
  adha: 'assets/icons/icon-adha.png',
};

export function getSeasonForDate(date = new Date()) {
  const gregorianMonth = date.getMonth();
  let season = date.getDate() === 1 && [1, 5, 8, 11].includes(gregorianMonth)
    ? 'fallback'
    : 'default';

  if (!Intl.DateTimeFormat.supportedLocalesOf(['en-u-ca-islamic-umalqura']).length) {
    return season;
  }

  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const hijriMonth = Number(parts.find((part) => part.type === 'month')?.value);
  const hijriDay = Number(parts.find((part) => part.type === 'day')?.value);

  if (hijriMonth === 9) {
    season = hijriDay >= 27 ? 'fitr' : 'ramadan';
  } else if (hijriMonth === 10 && hijriDay <= 3) {
    season = 'fitr';
  } else if (hijriMonth === 12 && hijriDay >= 7 && hijriDay <= 13) {
    season = 'adha';
  }

  return season;
}

export function updateSeasonalIcons(date = new Date()) {
  const season = getSeasonForDate(date);
  const favicon = document.querySelector('#seasonal-app-icon');
  const touchIcon = document.querySelector('#seasonal-touch-icon');
  const manifest = document.querySelector('#seasonal-manifest');
  if (!favicon || !touchIcon || !manifest) return season;

  favicon.href = appUrl(SEASON_ICONS[season]);
  touchIcon.href = appUrl('assets/icons/icon-192x192.png');
  manifest.href = appUrl(SEASON_MANIFESTS[season]);
  return season;
}

export function startSeasonalIconUpdates() {
  updateSeasonalIcons();
  const timer = window.setInterval(updateSeasonalIcons, 30 * 60 * 1000);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') updateSeasonalIcons();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
