import {
  buildQuranSearchIndex,
  normalizeQuranText,
  normalizeQuranTextWithMap,
  searchQuranText,
} from '../services/quranSearch.js';
import adhkarAudioTracks from '../data/adhkar-audio.json';
import { appUrl, fetchApp } from '../services/appUrl.js';
import {
  formatReminderTime,
  getDueReminderKeys,
  normalizeReminderTime,
} from '../services/reminderTime.js';
import { parseStoredJson, serializeStoredJson } from '../services/storage.js';
import { APP_VERSION } from '../config/appVersion.js';

const STORAGE_KEYS = {
  lastRead: 'zad.lastRead',
  bookmarks: 'zad.bookmarks',
  nightMode: 'zad.nightMode',
  brightness: 'zad.brightness',
  tasbeeh: 'zad.tasbeeh',
  azkarCounts: 'zad.azkarCounts',
  reminders: 'zad.reminders',
  preferences: 'zad.preferences',
  notes: 'zad.notes',
  safePoint: 'zad.safePoint',
  fitToScreen: 'zad.fitToScreen',
};

function debounce(callback, delay = 180) {
  let timeoutId = 0;
  const debounced = (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      timeoutId = 0;
      callback(...args);
    }, delay);
  };
  debounced.flush = () => {
    if (!timeoutId) return;
    window.clearTimeout(timeoutId);
    timeoutId = 0;
    callback();
  };
  return debounced;
}

const requestCooldowns = new Map();
function startRequestCooldown(key, durationMs) {
  const now = Date.now();
  const availableAt = requestCooldowns.get(key) || 0;
  if (now < availableAt) return Math.ceil((availableAt - now) / 1000);
  requestCooldowns.set(key, now + durationMs);
  return 0;
}

const defaultDuas = [
  {
    title: 'دعاء الختم',
    category: 'دعاء الختم',
    text: 'اللهم ارحمنا برحمتك الواسعة، واغفر لنا ذنوبنا، ووفقنا لما تحبه وترضاه، وأعنا على ذكرِك وشكرك وحسن عبادتك.'
  },
  {
    title: 'دعاء استفتاح الصلاة',
    category: 'أدعية عامة',
    text: 'الله أكبر. اللهم باعد بيني وبين خطاياي كما باعدت بين المشرق والمغرب، واغسل قلبي من الذنوب كما ينقى الثوب الأبيض من الدنس.'
  },
  {
    title: 'دعاء الصباح',
    category: 'أذكار الصباح',
    text: 'اللهم بك أصبحنا وبك أمسينا، وبك نحيا وبك نموت، وإليك المصير. اللهم ما أصبح بي من نعمة فمِنْك وحدك لا شريك لك.'
  },
  {
    title: 'دعاء للرزق والبركة',
    category: 'أدعية عامة',
    text: 'اللهم بارك لنا في ما رزقتنا، واغفر لنا وارحمنا، واهدنا في من ضل، وعافنا فيمن عافانا، وتقبل منا صالح الأعمال.'
  },
  {
    title: 'دعاء التوفيق',
    category: 'دعاء التوفيق',
    text: 'ربِّ اجعلني مُقِيمَ الصلاة ومن ذريتي، ربنا تقبل دعاءنا، واغفر لنا ولوالديَّ وللمؤمنين يوم يقوم الحساب.'
  },
];

const statusElement = document.querySelector('#load-status');
const sidebarAppVersion = document.querySelector('#sidebar-app-version strong');
if (sidebarAppVersion) sidebarAppVersion.textContent = `v${APP_VERSION}`;
const reminderEmailInput = document.querySelector('#reminder-email');
const quranReader = document.querySelector('#quran-reader');
const quranPageInput = document.querySelector('#quran-page-number');
const quranPageTotal = document.querySelector('#quran-page-total');
const quranPageImage = document.querySelector('#quran-page-image');
const quranPageError = document.querySelector('#quran-page-error');
const quranBookmarkRibbon = document.querySelector('#quran-bookmark-ribbon');
const quranTextSearchInput = document.querySelector('#quran-text-search');
const quranSearchClearButton = document.querySelector('#quran-search-clear');
const quranSearchStatus = document.querySelector('#quran-search-status');
const quranSearchResults = document.querySelector('#quran-search-results');
const quranSearchSelection = document.querySelector('#quran-search-selection');
const quranSearchSelectionReference = document.querySelector('#quran-search-selection-reference');
const quranSearchSelectionVerses = document.querySelector('#quran-search-selection-verses');
const currentSurahName = document.querySelector('#current-surah-name');
const readingPosition = document.querySelector('#reading-position');
const indexSearch = document.querySelector('#index-search');
const indexList = document.querySelector('#index-list');
const indexCount = document.querySelector('#index-count');
const azkarList = document.querySelector('#azkar-list');
const adhkarAudio = document.querySelector('#adhkar-audio');
const adhkarPlayToggle = document.querySelector('#adhkar-play-toggle');
const adhkarProgress = document.querySelector('#adhkar-progress');
const adhkarPlayerStatus = document.querySelector('#adhkar-player-status');
const adhkarPlayerBadge = document.querySelector('#adhkar-player-badge');
const adhkarCurrentTime = document.querySelector('#adhkar-current-time');
const adhkarDuration = document.querySelector('#adhkar-duration');
const tasbeehList = document.querySelector('#tasbeeh-list');
const tasbeehCountElement = document.querySelector('#tasbeeh-count');
const tasbeehPhraseElement = document.querySelector('#tasbeeh-phrase');
const brightnessRange = document.querySelector('#brightness-range');
const bookmarksList = document.querySelector('#bookmarks-list');
const autoPageToggle = document.querySelector('#auto-page-toggle');
const autoPageSpeed = document.querySelector('#auto-page-speed');
const wakeLockToggle = document.querySelector('#wake-lock-toggle');
const zoomToggle = document.querySelector('#zoom-toggle');
const fitToScreenToggle = document.querySelector('#fit-to-screen-toggle');
const floatingPreviousButton = document.querySelector('#quran-floating-previous');
const floatingNextButton = document.querySelector('#quran-floating-next');
const duasList = document.querySelector('#duas-list');
const duasSearch = document.querySelector('#duas-search');
const duasFilter = document.querySelector('#duas-filter');
const quickMenu = document.querySelector('.reader-quick-menu');
const onboardingTour = document.querySelector('#onboarding-tour');
const onboardingTourCard = onboardingTour?.querySelector('.tour-card');
const tourSteps = [
  {
    tab: '#quran-tab',
    targets: ['#quran-reader', '.reader-quick-menu-trigger'],
    title: 'القرآن الكريم',
    description: 'اقرأ وتصفح القرآن الكريم، واستخدم أدوات المصحف للتكبير والتصفح التلقائي وحفظ موضع القراءة.',
  },
  {
    tab: '#azkar-tab',
    targets: ['#azkar-tab', '#tasbeeh-tab'],
    title: 'الأذكار والمسبحة',
    description: 'تابع أذكار اليوم، واستخدم المسبحة التفاعلية مع حفظ العدّاد والتصفير عند الحاجة.',
  },
  {
    tab: '#duas-tab',
    targets: ['#duas-panel .section-intro'],
    title: 'الأدعية ودعاء الختم',
    description: 'تصفّح أدعية الختم والأدعية العامة، وابحث بينها أو انسخ الدعاء الذي تحتاجه.',
  },
  {
    tab: '#quran-tab',
    targets: ['.reader-quick-menu-trigger'],
    title: 'ميزة التسميع واختبار الحفظ',
    description: 'راجع حفظك بعبارات قرآنية متتابعة، واختر نطاق التسميع من السور أو الصفحات أو الآيات. افتح الميزة من أدوات المصحف أو القائمة الجانبية، وتابع إنجازك في التقويم.',
  },
  {
    settings: true,
    targets: ['#support-settings-section'],
    title: 'الإعدادات والتنبيهات والدعم',
    description: 'خصّص التذكيرات والمظهر، وتعرّف على خيارات تثبيت التطبيق والمساهمة في تطويره.',
  },
];
let activeTourStep = -1;
let highlightedTourTargets = [];
let tourReturnFocus = null;
let tourTransitionId = 0;
let preferences = readStorage(STORAGE_KEYS.preferences, { quranTheme: 'paper', fontSize: 16, arabicFont: 'system' });
let userNotes = readStorage(STORAGE_KEYS.notes, '');
let fitToScreen = readStorage(STORAGE_KEYS.fitToScreen, false) === true;

function tourDelay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function tourTargetsBounds() {
  const rectangles = highlightedTourTargets
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rectangles.length) return null;
  const padding = 10;
  return {
    left: Math.max(0, Math.min(...rectangles.map((rect) => rect.left)) - padding),
    top: Math.max(0, Math.min(...rectangles.map((rect) => rect.top)) - padding),
    right: Math.min(window.innerWidth, Math.max(...rectangles.map((rect) => rect.right)) + padding),
    bottom: Math.min(window.innerHeight, Math.max(...rectangles.map((rect) => rect.bottom)) + padding),
  };
}

function positionTourOverlay() {
  if (!onboardingTour || onboardingTour.hidden) return;
  const bounds = tourTargetsBounds();
  if (!bounds) return;
  const topShade = onboardingTour.querySelector('.tour-shade-top');
  const bottomShade = onboardingTour.querySelector('.tour-shade-bottom');
  const startShade = onboardingTour.querySelector('.tour-shade-start');
  const endShade = onboardingTour.querySelector('.tour-shade-end');
  topShade.style.cssText = `inset: 0 0 auto; height: ${bounds.top}px;`;
  bottomShade.style.cssText = `inset: ${bounds.bottom}px 0 0;`;
  startShade.style.cssText = `inset: ${bounds.top}px auto auto 0; width: ${bounds.left}px; height: ${bounds.bottom - bounds.top}px;`;
  endShade.style.cssText = `inset: ${bounds.top}px 0 auto auto; width: ${window.innerWidth - bounds.right}px; height: ${bounds.bottom - bounds.top}px;`;
  onboardingTourCard.classList.toggle('is-top', (bounds.top + bounds.bottom) / 2 > window.innerHeight / 2);
  onboardingTourCard.classList.toggle('is-bottom', (bounds.top + bounds.bottom) / 2 <= window.innerHeight / 2);
}

function clearTourHighlights() {
  for (const target of highlightedTourTargets) target.classList.remove('tour-highlight');
  highlightedTourTargets = [];
}

async function showSettingsForTour() {
  const modal = document.querySelector('#settings-modal');
  if (modal.classList.contains('show')) return;
  const shown = new Promise((resolve) => modal.addEventListener('shown.bs.modal', resolve, { once: true }));
  bootstrap.Modal.getOrCreateInstance(modal).show();
  await shown;
}

async function hideSettingsForTour() {
  const modal = document.querySelector('#settings-modal');
  if (!modal.classList.contains('show')) return;
  const hidden = new Promise((resolve) => modal.addEventListener('hidden.bs.modal', resolve, { once: true }));
  bootstrap.Modal.getInstance(modal)?.hide();
  await hidden;
}

async function showTourStep(index) {
  if (!onboardingTour || !onboardingTourCard || index < 0 || index >= tourSteps.length) return;
  const transitionId = ++tourTransitionId;
  activeTourStep = index;
  clearTourHighlights();
  const step = tourSteps[index];
  if (step.settings) {
    document.querySelector('#settings-modal').append(onboardingTour);
    await showSettingsForTour();
    if (transitionId !== tourTransitionId) return;
    await tourDelay(100);
  } else {
    document.body.append(onboardingTour);
    await hideSettingsForTour();
    if (transitionId !== tourTransitionId) return;
    if (step.tab) {
      const tab = document.querySelector(step.tab);
      if (tab && !tab.classList.contains('active')) {
        const shown = new Promise((resolve) => tab.addEventListener('shown.bs.tab', resolve, { once: true }));
        bootstrap.Tab.getOrCreateInstance(tab).show();
        await shown;
        if (transitionId !== tourTransitionId) return;
      }
    }
    await tourDelay(160);
  }
  if (transitionId !== tourTransitionId) return;

  const targets = step.targets.map((selector) => document.querySelector(selector)).filter((element) => {
    return element instanceof HTMLElement && element.getClientRects().length > 0;
  });
  if (!targets.length) {
    finishOnboardingTour();
    console.error(`Onboarding tour target is unavailable for step ${index + 1}.`);
    return;
  }
  const target = targets[0];
  if (step.settings || step.targets.includes('.reader-quick-menu-trigger')) {
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    await tourDelay(300);
    if (transitionId !== tourTransitionId) return;
  }

  highlightedTourTargets = targets;
  for (const element of highlightedTourTargets) element.classList.add('tour-highlight');
  document.querySelector('#tour-step-count').textContent = `الخطوة ${index + 1} من ${tourSteps.length}`;
  document.querySelector('#tour-title').textContent = step.title;
  document.querySelector('#tour-description').textContent = step.description;
  document.querySelector('#tour-back').hidden = index === 0;
  document.querySelector('#tour-next').textContent = index === tourSteps.length - 1
    ? 'تم / ابدأ الاستخدام'
    : 'التالي';
  onboardingTour.hidden = false;
  onboardingTour.setAttribute('aria-hidden', 'false');
  positionTourOverlay();
  document.querySelector('#tour-next').focus({ preventScroll: true });
}

function finishOnboardingTour() {
  if (!onboardingTour || onboardingTour.hidden) return;
  tourTransitionId += 1;
  onboardingTour.hidden = true;
  onboardingTour.setAttribute('aria-hidden', 'true');
  clearTourHighlights();
  activeTourStep = -1;
  try {
    localStorage.setItem('hasCompletedTour', 'true');
  } catch (error) {
    console.warn('Could not save onboarding tour completion:', error);
  }
  if (tourReturnFocus instanceof HTMLElement && tourReturnFocus.isConnected) {
    tourReturnFocus.focus({ preventScroll: true });
  }
}

function startOnboardingTour() {
  if (!onboardingTour || !onboardingTour.hidden) return;
  tourReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void showTourStep(0);
}

document.querySelector('#onboarding-tour-open')?.addEventListener('click', startOnboardingTour);
document.querySelector('#tour-close')?.addEventListener('click', finishOnboardingTour);
document.querySelector('#tour-back')?.addEventListener('click', () => {
  if (activeTourStep > 0) void showTourStep(activeTourStep - 1);
});
document.querySelector('#tour-next')?.addEventListener('click', () => {
  if (activeTourStep === tourSteps.length - 1) {
    finishOnboardingTour();
  } else if (activeTourStep >= 0) {
    void showTourStep(activeTourStep + 1);
  }
});
onboardingTour?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    finishOnboardingTour();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...onboardingTour.querySelectorAll('button:not([hidden])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});
window.addEventListener('resize', positionTourOverlay);

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : parseStoredJson(value, fallback);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  const serialized = serializeStoredJson(value);
  if (serialized === null) {
    statusElement.textContent = 'تعذر حفظ التغييرات: البيانات أكبر من الحد المسموح أو غير صالحة.';
    statusElement.className = 'load-status is-warning';
    return false;
  }
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch {
    statusElement.textContent = 'تعذر حفظ التغييرات في هذا المتصفح.';
    statusElement.className = 'load-status is-warning';
    return false;
  }
}

function asText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function sanitizePlainText(value, maximumLength) {
  if (typeof value !== 'string' || !Number.isInteger(maximumLength) || maximumLength < 0) return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maximumLength);
}

function normalizeDigits(value) {
  return value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function recordsOf(value) {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (value && typeof value === 'object') return Object.entries(value);
  return [];
}

function firstText(record, keys) {
  for (const key of keys) {
    const value = record && typeof record === 'object' ? record[key] : undefined;
    const text = asText(value);
    if (text) return text;
  }
  return '';
}

function showEmpty(container, message, className = 'empty-message') {
  const empty = document.createElement('p');
  empty.className = className;
  empty.textContent = message;
  container.replaceChildren(empty);
}

function categoryTitle(key) {
  return ({
    sabah: 'أذكار الصباح',
    masaa: 'أذكار المساء',
    sleep: 'أذكار النوم',
    wakeup: 'أذكار الاستيقاظ',
    asma_al_husna: 'أسماء الله الحسنى',
  })[key] || key;
}

let quranData = {};
let quranSearchIndex = [];
let quranAyahs = [];
let quranPhraseBank = [];
let quranSearchReady = false;
let surahs = [];
let juzs = [];
let currentIndexType = 'surah';
let currentPage = 1;
let pageCount = 604;
let pageUrlTemplate = '';
let bookmarks = readStorage(STORAGE_KEYS.bookmarks, []);
const savedAzkarState = readStorage(STORAGE_KEYS.azkarCounts, {});
let zikrCounts = savedAzkarState && typeof savedAzkarState === 'object' && !Array.isArray(savedAzkarState)
  ? (savedAzkarState.counts && typeof savedAzkarState.counts === 'object' ? savedAzkarState.counts : {})
  : {};
let azkarDate = savedAzkarState?.date === getLocalDateKey() ? savedAzkarState.date : getLocalDateKey();
let tasbeehState = readStorage(STORAGE_KEYS.tasbeeh, { phrase: 'سبحان الله', count: 0, counts: {} });
let nightMode = readStorage(STORAGE_KEYS.nightMode, false) === true;
let brightness = Number(readStorage(STORAGE_KEYS.brightness, 100));
let tasbeehPhrases = [];
let duas = [];
let autoPageTimer = 0;
let wakeLock = null;
let wakeLockRequested = false;
let reminderTimer = 0;
let azkarResetTimer = 0;
let azkarData = null;
let reminders = readStorage(STORAGE_KEYS.reminders, { email: '', quran: '', morning: '', evening: '', lastSent: {} });
let trackedZikrKeys = new Set();

if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
  preferences = { quranTheme: 'paper', fontSize: 16, arabicFont: 'system' };
}
if (!['paper', 'night', 'warm'].includes(preferences.quranTheme)) preferences.quranTheme = 'paper';
if (!Number.isInteger(preferences.fontSize) || preferences.fontSize < 14 || preferences.fontSize > 28) preferences.fontSize = 16;
if (!['system', 'naskh', 'sans'].includes(preferences.arabicFont)) preferences.arabicFont = 'system';
if (typeof userNotes !== 'string') userNotes = '';
else userNotes = sanitizePlainText(userNotes, 2000);

if (!Array.isArray(bookmarks)) bookmarks = [];
bookmarks = bookmarks.slice(0, 500).filter((bookmark) => bookmark && typeof bookmark === 'object'
  && Number.isInteger(bookmark.page) && bookmark.page >= 1 && bookmark.page <= 604)
  .map((bookmark) => ({
    id: sanitizePlainText(String(bookmark.id || ''), 100),
    name: sanitizePlainText(typeof bookmark.name === 'string' ? bookmark.name : '', 70),
    surahName: sanitizePlainText(typeof bookmark.surahName === 'string' ? bookmark.surahName : '', 80),
    page: bookmark.page,
  }));
if (!zikrCounts || typeof zikrCounts !== 'object' || Array.isArray(zikrCounts)) zikrCounts = {};
zikrCounts = Object.fromEntries(Object.entries(zikrCounts)
  .filter(([key, count]) => key.length <= 128 && Number.isSafeInteger(count) && count >= 0)
  .slice(0, 5000));
if (!tasbeehState || typeof tasbeehState !== 'object' || Array.isArray(tasbeehState)) {
  tasbeehState = { phrase: 'سبحان الله', count: 0, counts: {} };
}
if (!tasbeehState.counts || typeof tasbeehState.counts !== 'object' || Array.isArray(tasbeehState.counts)) {
  tasbeehState.counts = {};
}
tasbeehState.counts = Object.fromEntries(Object.entries(tasbeehState.counts)
  .filter(([key, count]) => key.length <= 128 && Number.isSafeInteger(count) && count >= 0)
  .slice(0, 100));
tasbeehState.count = Number.isSafeInteger(tasbeehState.count) && tasbeehState.count >= 0
  ? tasbeehState.count
  : 0;
tasbeehState.phrase = sanitizePlainText(
  typeof tasbeehState.phrase === 'string' ? tasbeehState.phrase : 'سبحان الله',
  100,
).trim() || 'سبحان الله';
brightness = Number.isFinite(brightness) ? Math.min(125, Math.max(45, brightness)) : 100;
if (!reminders || typeof reminders !== 'object' || Array.isArray(reminders)) {
  reminders = { email: '', quran: '', morning: '', evening: '', lastSent: {} };
}
reminders.email = typeof reminders.email === 'string'
  && reminders.email.length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reminders.email)
  ? reminders.email
  : '';
for (const key of ['quran', 'morning', 'evening']) {
  reminders[key] = normalizeReminderTime(reminders[key]);
}
if (!reminders.lastSent || typeof reminders.lastSent !== 'object' || Array.isArray(reminders.lastSent)) {
  reminders.lastSent = {};
} else {
  reminders.lastSent = Object.fromEntries(Object.entries(reminders.lastSent)
    .filter(([key, timestamp]) => ['quran', 'morning', 'evening'].includes(key)
      && Number.isFinite(timestamp) && timestamp >= 0));
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const adhkarTrackButtons = {
  morning: document.querySelector('#adhkar-track-morning'),
  evening: document.querySelector('#adhkar-track-evening'),
};
let selectedAdhkarTrack = 'morning';
let selectedAdhkarSource = '';

function formatMediaTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '٠:٠٠';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(minutes)}:${new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(Number(remainder))}`;
}

function updateMediaSession(track, source) {
  if (!('mediaSession' in navigator)) return;
  if ('MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: 'زاد | الأذكار اليومية',
      album: 'القرآن والأذكار',
    });
  }
  if (!source) {
    navigator.mediaSession.playbackState = 'none';
    return;
  }
  const handlers = {
    play: () => { void playSelectedAdhkar(); },
    pause: () => adhkarAudio.pause(),
    seekbackward: (details) => {
      adhkarAudio.currentTime = Math.max(0, adhkarAudio.currentTime - (details.seekOffset || 10));
    },
    seekforward: (details) => {
      adhkarAudio.currentTime = Math.min(
        Number.isFinite(adhkarAudio.duration) ? adhkarAudio.duration : adhkarAudio.currentTime + 10,
        adhkarAudio.currentTime + (details.seekOffset || 10),
      );
    },
    seekto: (details) => {
      if (Number.isFinite(details.seekTime)) adhkarAudio.currentTime = details.seekTime;
    },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    if (typeof navigator.mediaSession.setActionHandler !== 'function') break;
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }
}

function getConfiguredAdhkarSource(track) {
  if (!track || track.enabled !== true) return '';
  if (track.type === 'local' && typeof track.path === 'string') {
    try {
      return appUrl(track.path);
    } catch {
      return '';
    }
  }
  if (track.type === 'cdn' && typeof track.url === 'string') {
    try {
      const url = new URL(track.url);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch {
      return '';
    }
  }
  return '';
}

function selectAdhkarTrack(key) {
  if (!(key in adhkarTrackButtons)) return;
  const track = adhkarAudioTracks[key];
  if (!track || typeof track.title !== 'string') {
    throw new Error(`Audio configuration is missing the ${key} track.`);
  }
  adhkarAudio.pause();
  adhkarAudio.removeAttribute('src');
  adhkarAudio.load();
  selectedAdhkarTrack = key;
  selectedAdhkarSource = getConfiguredAdhkarSource(track);
  for (const [trackKey, button] of Object.entries(adhkarTrackButtons)) {
    button.classList.toggle('is-active', trackKey === key);
    button.setAttribute('aria-pressed', String(trackKey === key));
  }
  adhkarCurrentTime.textContent = formatMediaTime(0);
  adhkarDuration.textContent = formatMediaTime(0);
  adhkarProgress.value = '0';
  adhkarProgress.max = '0';
  adhkarProgress.disabled = !selectedAdhkarSource;
  adhkarPlayToggle.disabled = !selectedAdhkarSource;
  adhkarPlayToggle.textContent = '▶';
  adhkarPlayToggle.setAttribute('aria-label', 'تشغيل الأذكار');
  adhkarPlayerBadge.textContent = selectedAdhkarSource ? 'جاهز للاستماع' : 'جاهز لإضافة الصوت';
  adhkarPlayerStatus.textContent = selectedAdhkarSource
    ? `المسار المحدد: ${track.title}`
    : `أضف ملف ${track.path} ثم فعّل المسار في src/data/adhkar-audio.json.`;
  updateMediaSession(track, selectedAdhkarSource);
  if (selectedAdhkarSource) {
    adhkarAudio.src = selectedAdhkarSource;
    adhkarAudio.load();
  }
}

async function playSelectedAdhkar() {
  if (!selectedAdhkarSource) {
    adhkarPlayerStatus.textContent = 'ملف الصوت غير مضاف بعد. أضف ملف MP3 وحدّث إعداد المسار أولاً.';
    return;
  }
  try {
    await adhkarAudio.play();
  } catch {
    adhkarPlayerStatus.textContent = 'تعذر تشغيل الصوت. تحقق من الملف ثم اضغط تشغيل مرة أخرى.';
  }
}

adhkarTrackButtons.morning.addEventListener('click', () => selectAdhkarTrack('morning'));
adhkarTrackButtons.evening.addEventListener('click', () => selectAdhkarTrack('evening'));
adhkarPlayToggle.addEventListener('click', () => {
  if (adhkarAudio.paused) void playSelectedAdhkar();
  else adhkarAudio.pause();
});
adhkarProgress.addEventListener('input', () => {
  if (Number.isFinite(adhkarAudio.duration)) adhkarAudio.currentTime = Number(adhkarProgress.value);
});
adhkarAudio.addEventListener('loadedmetadata', () => {
  const duration = Number.isFinite(adhkarAudio.duration) ? adhkarAudio.duration : 0;
  adhkarProgress.max = String(Math.floor(duration));
  adhkarDuration.textContent = formatMediaTime(duration);
});
adhkarAudio.addEventListener('timeupdate', () => {
  adhkarProgress.value = String(Math.floor(adhkarAudio.currentTime));
  adhkarCurrentTime.textContent = formatMediaTime(adhkarAudio.currentTime);
  if ('mediaSession' in navigator
    && typeof navigator.mediaSession.setPositionState === 'function'
    && Number.isFinite(adhkarAudio.duration)) {
    navigator.mediaSession.setPositionState({
      duration: adhkarAudio.duration,
      playbackRate: adhkarAudio.playbackRate,
      position: adhkarAudio.currentTime,
    });
  }
});
adhkarAudio.addEventListener('play', () => {
  adhkarPlayToggle.textContent = '❚❚';
  adhkarPlayToggle.setAttribute('aria-label', 'إيقاف مؤقت');
  adhkarPlayerBadge.textContent = 'قيد التشغيل';
  adhkarPlayerStatus.textContent = 'يستمر الصوت أثناء استخدام تطبيقات أخرى حسب دعم المتصفح ونظام الجهاز.';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
adhkarAudio.addEventListener('pause', () => {
  adhkarPlayToggle.textContent = '▶';
  adhkarPlayToggle.setAttribute('aria-label', 'تشغيل الأذكار');
  if (selectedAdhkarSource) adhkarPlayerBadge.textContent = 'متوقف مؤقتاً';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
adhkarAudio.addEventListener('ended', () => {
  adhkarPlayerBadge.textContent = 'انتهى الصوت';
  adhkarPlayerStatus.textContent = 'انتهى المقطع الصوتي.';
});
adhkarAudio.addEventListener('error', () => {
  adhkarPlayerBadge.textContent = 'تعذر تحميل الصوت';
  adhkarPlayerStatus.textContent = 'تعذر تحميل المقطع. تأكد من وجود الملف ومطابقة المسار في إعدادات الصوت.';
});
selectAdhkarTrack(selectedAdhkarTrack);

document.body.classList.toggle('night-mode', nightMode);
document.documentElement.style.setProperty('--reader-brightness', String(brightness / 100));
if (brightnessRange) brightnessRange.value = String(brightness);
document.body.dataset.readerTheme = preferences.quranTheme;
document.documentElement.style.setProperty('--reading-font-size', `${preferences.fontSize}px`);
document.documentElement.style.setProperty('--arabic-font', {
  system: 'Tahoma, Arial, sans-serif',
  naskh: '"Times New Roman", serif',
  sans: 'Arial, Tahoma, sans-serif',
}[preferences.arabicFont]);
const themeToggleButton = document.querySelector('#theme-toggle');
const themeToggleLabel = document.querySelector('#theme-toggle-label');
if (themeToggleButton) {
  themeToggleButton.setAttribute('aria-label', nightMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي');
}
if (themeToggleLabel) themeToggleLabel.textContent = nightMode ? 'الوضع النهاري' : 'الوضع الليلي';
if (tasbeehCountElement) tasbeehCountElement.textContent = String(tasbeehState.count);
if (tasbeehPhraseElement) tasbeehPhraseElement.textContent = tasbeehState.phrase;
const quranThemeSelect = document.querySelector('#quran-theme');
const readingFontSizeInput = document.querySelector('#reading-font-size');
const readingFontSizeValue = document.querySelector('#reading-font-size-value');
const arabicFontSelect = document.querySelector('#arabic-font');
const notesField = document.querySelector('#user-notes');
if (quranThemeSelect) quranThemeSelect.value = preferences.quranTheme;
if (readingFontSizeInput) readingFontSizeInput.value = String(preferences.fontSize);
if (readingFontSizeValue) readingFontSizeValue.textContent = String(preferences.fontSize);
if (arabicFontSelect) arabicFontSelect.value = preferences.arabicFont;
if (notesField) notesField.value = userNotes;

function surahAtPage(page) {
  let matched = surahs[0] ?? { id: 1, name: 'الفاتحة', page: 1 };
  for (const surah of surahs) {
    if (surah.page > page) break;
    matched = surah;
  }
  return matched;
}

function updateBookmarkRibbon() {
  const isCurrentPageBookmarked = bookmarks.some((bookmark) => (
    bookmark && Number.isInteger(bookmark.page) && bookmark.page === currentPage
  ));
  quranBookmarkRibbon.hidden = !isCurrentPageBookmarked;
  quranBookmarkRibbon.setAttribute('aria-hidden', String(!isCurrentPageBookmarked));
}

function updatePagePosition(page, { persist = true } = {}) {
  const previousPage = currentPage;
  const surah = surahAtPage(page);
  currentPage = page;
  updateBookmarkRibbon();
  quranPageInput.value = String(page);
  quranPageTotal.textContent = String(pageCount);
  quranPageInput.max = String(pageCount);
  currentSurahName.textContent = surah.name;
  readingPosition.textContent = `صفحة ${page} من ${pageCount}`;
  document.querySelector('#quran-previous').disabled = page <= 1;
  document.querySelector('#quran-next').disabled = page >= pageCount;
  if (floatingPreviousButton) floatingPreviousButton.disabled = page <= 1;
  if (floatingNextButton) floatingNextButton.disabled = page >= pageCount;

  if (persist) writeStorage(STORAGE_KEYS.lastRead, { page, surahId: surah.id, surahName: surah.name });
  if (pageUrlTemplate) {
    const pageUrl = pageUrlTemplate.replace('{page}', String(page));
    const parsedUrl = new URL(pageUrl, window.location.href);
    if (parsedUrl.protocol !== 'https:') {
      quranPageImage.hidden = true;
      quranPageError.hidden = false;
      quranPageError.textContent = 'رابط صفحة المصحف غير صالح.';
      return;
    }
    quranPageError.hidden = true;
    quranPageImage.alt = `صفحة المصحف رقم ${page}`;
    quranPageImage.src = parsedUrl.href;
    quranPageImage.hidden = false;
      if (page !== previousPage) {
        quranPageImage.classList.remove('page-turn-forward', 'page-turn-backward');
        void quranPageImage.offsetWidth;
        const turnClass = page > previousPage ? 'page-turn-forward' : 'page-turn-backward';
        quranPageImage.classList.add(turnClass);
        quranPageImage.addEventListener('animationend', () => {
          quranPageImage.classList.remove(turnClass);
        }, { once: true });
      }
  }
  renderIndex();
}

function goToPage(value) {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    quranPageError.hidden = false;
    quranPageError.textContent = `أدخل رقم صفحة بين 1 و${pageCount}.`;
    return false;
  }
  hideQuranSearchSelection();
  updatePagePosition(page);
  return true;
}

function surahNameById(surahId) {
  return surahs.find((surah) => surah.id === surahId)?.name || `السورة ${surahId}`;
}

function appendHighlightedQuranText(container, verse) {
  const mappedText = normalizeQuranTextWithMap(verse.text);
  const start = mappedText.starts[verse.highlightStart];
  const end = mappedText.ends[verse.highlightEnd - 1];
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
    container.textContent = verse.text;
    return;
  }
  container.append(document.createTextNode(verse.text.slice(0, start)));
  const highlightedText = document.createElement('mark');
  highlightedText.textContent = verse.text.slice(start, end);
  container.append(highlightedText, document.createTextNode(verse.text.slice(end)));
}

function hideQuranSearchSelection() {
  quranSearchSelection.hidden = true;
  quranSearchSelectionReference.textContent = '';
  quranSearchSelectionVerses.replaceChildren();
}

function showQuranSearchSelection(result) {
  quranSearchSelectionReference.textContent = `${surahNameById(result.surah)} · الآية ${result.ayah} · صفحة ${result.page}`;
  const fragment = document.createDocumentFragment();
  result.verses.forEach((verse) => {
    const paragraph = document.createElement('p');
    paragraph.className = 'quran-search-verse';
    const reference = document.createElement('span');
    reference.className = 'quran-search-verse-reference';
    reference.textContent = `﴿${verse.ayah}﴾`;
    const text = document.createElement('span');
    text.className = 'quran-search-verse-text';
    appendHighlightedQuranText(text, verse);
    paragraph.append(reference, text);
    fragment.append(paragraph);
  });
  quranSearchSelectionVerses.replaceChildren(fragment);
  quranSearchSelection.hidden = false;
  window.setTimeout(() => quranSearchSelection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
}

function renderQuranSearchResults() {
  const query = normalizeQuranText(quranTextSearchInput.value);
  quranSearchClearButton.hidden = !quranTextSearchInput.value;
  quranSearchResults.replaceChildren();
  hideQuranSearchSelection();

  if (!query) {
    quranSearchStatus.textContent = quranSearchReady
      ? 'ابحث في نص الآيات العربية.'
      : 'جارٍ تحميل قاعدة نص القرآن المحلية...';
    return;
  }
  if (!quranSearchReady) {
    quranSearchStatus.textContent = 'قاعدة البحث غير جاهزة بعد.';
    return;
  }

  const { results, truncated } = searchQuranText(quranSearchIndex, quranTextSearchInput.value);
  if (!results.length) {
    quranSearchStatus.textContent = 'لا توجد آيات مطابقة. جرّب كلمة أو عبارة أخرى.';
    return;
  }

  quranSearchStatus.textContent = truncated
    ? `أكثر من ${results.length} نتيجة؛ أضف كلمات لتضييق البحث.`
    : `${results.length} نتيجة`;
  const fragment = document.createDocumentFragment();
  results.forEach((result) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quran-search-result';
    button.setAttribute(
      'aria-label',
      `${surahNameById(result.surah)}، الآية ${result.ayah}، صفحة ${result.page}`,
    );

    const reference = document.createElement('span');
    reference.className = 'quran-search-result-reference';
    reference.textContent = `${surahNameById(result.surah)} · الآية ${result.ayah} · صفحة ${result.page}`;
    button.append(reference);
    result.verses.forEach((verse) => {
      const text = document.createElement('span');
      text.className = 'quran-search-result-text';
      appendHighlightedQuranText(text, verse);
      button.append(text);
    });

    button.addEventListener('click', () => {
      if (!goToPage(result.page)) return;
      showQuranSearchSelection(result);
      if (quickMenu) quickMenu.open = false;
    });
    fragment.append(button);
  });
  quranSearchResults.replaceChildren(fragment);
}

const renderQuranSearchResultsDebounced = debounce(renderQuranSearchResults, 130);
quranTextSearchInput.addEventListener('input', () => {
  const query = sanitizePlainText(quranTextSearchInput.value, 120);
  if (query !== quranTextSearchInput.value) quranTextSearchInput.value = query;
  renderQuranSearchResultsDebounced();
});
quranSearchClearButton.addEventListener('click', () => {
  quranTextSearchInput.value = '';
  renderQuranSearchResults();
  quranTextSearchInput.focus();
});
document.querySelector('#quran-search-selection-close').addEventListener('click', hideQuranSearchSelection);

quranPageImage.addEventListener('error', () => {
  quranPageImage.hidden = true;
  quranPageError.hidden = false;
  quranPageError.textContent = 'تعذر تحميل صورة الصفحة. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
});

document.querySelector('#quran-previous').addEventListener('click', () => goToPage(currentPage - 1));
document.querySelector('#quran-next').addEventListener('click', () => goToPage(currentPage + 1));
if (floatingPreviousButton) floatingPreviousButton.addEventListener('click', () => goToPage(currentPage - 1));
if (floatingNextButton) floatingNextButton.addEventListener('click', () => goToPage(currentPage + 1));
quranPageInput.addEventListener('change', () => goToPage(quranPageInput.value));
quranPageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    goToPage(quranPageInput.value);
    quranPageInput.blur();
  }
});

function renderIndex() {
  const entries = currentIndexType === 'surah' ? surahs : juzs;
  const query = indexSearch.value.trim().toLocaleLowerCase('ar');
  const filtered = entries.filter((entry) => `${entry.name} ${entry.id}`.toLocaleLowerCase('ar').includes(query));
  const fragment = document.createDocumentFragment();

  filtered.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'index-item';
    button.classList.toggle('is-current', currentPage >= entry.page
      && currentPage < (entries.find((candidate) => candidate.id === entry.id + 1)?.page ?? pageCount + 1));
    button.setAttribute('aria-current', button.classList.contains('is-current') ? 'location' : 'false');

    const number = document.createElement('span');
    number.className = 'index-item-number';
    number.textContent = String(entry.id).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'index-item-name';
    name.textContent = entry.name;
    const page = document.createElement('span');
    page.className = 'index-item-page';
    page.textContent = String(entry.page);
    button.append(number, name, page);
    button.addEventListener('click', () => {
      goToPage(entry.page);
      if (window.innerWidth < 768) bootstrap.Offcanvas.getInstance(document.querySelector('#quran-index'))?.hide();
    });
    fragment.append(button);
  });

  indexList.replaceChildren(fragment);
  indexCount.textContent = `${filtered.length} ${currentIndexType === 'surah' ? 'سورة' : 'جزء'}`;
  indexList.setAttribute('aria-label', currentIndexType === 'surah' ? 'قائمة السور' : 'قائمة الأجزاء');
  if (!filtered.length) showEmpty(indexList, 'لا توجد نتائج مطابقة.', 'empty-message');
}

function setIndexType(type) {
  currentIndexType = type;
  const isSurah = type === 'surah';
  document.querySelector('#surah-index-tab').classList.toggle('active', isSurah);
  document.querySelector('#surah-index-tab').setAttribute('aria-pressed', String(isSurah));
  document.querySelector('#juz-index-tab').classList.toggle('active', !isSurah);
  document.querySelector('#juz-index-tab').setAttribute('aria-pressed', String(!isSurah));
  indexSearch.value = '';
  indexSearch.placeholder = isSurah ? 'ابحث عن سورة...' : 'ابحث عن جزء...';
  renderIndex();
}

document.querySelector('#surah-index-tab').addEventListener('click', () => setIndexType('surah'));
document.querySelector('#juz-index-tab').addEventListener('click', () => setIndexType('juz'));
indexSearch.addEventListener('input', debounce(() => {
  indexSearch.value = sanitizePlainText(indexSearch.value, 100);
  renderIndex();
}, 180));

const quizScopeType = document.querySelector('#quiz-scope-type');
const quizStatus = document.querySelector('#quiz-status');
const quizStartButton = document.querySelector('#quiz-start');
const quizQuestion = document.querySelector('#quiz-question');
const quizReference = document.querySelector('#quiz-question-reference');
const quizVerseContext = document.querySelector('#quiz-verse-context');
const quizOptions = document.querySelector('#quiz-answer-options');
const quizNextButton = document.querySelector('#quiz-next');
const quizCancelButton = document.querySelector('#quiz-cancel');
const quizHearts = document.querySelector('#quiz-hearts');
const quizCelebration = document.querySelector('#quiz-celebration');
const quizProgressKey = 'zad.quranQuizProgress.v1';
let quizSession = null;
let quizCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function createSelectOptions(select, records) {
  const options = records.map((record) => {
    const option = document.createElement('option');
    option.value = String(record.id);
    option.textContent = `${record.id}. ${record.name}`;
    return option;
  });
  select.replaceChildren(...options);
}

function wordsInAyah(ayah) {
  return ayah.text.trim().split(/\s+/u).filter((word) => normalizeQuranText(word));
}

function phraseKey(words) {
  return normalizeQuranText(words.join(' '));
}

function getQuizPool() {
  const scope = quizScopeType.value;
  if (scope === 'surah') {
    const start = Number(document.querySelector('#quiz-surah-start').value);
    const end = Number(document.querySelector('#quiz-surah-end').value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      throw new Error('اختر نطاقاً صحيحاً من السور.');
    }
    return quranAyahs.filter((ayah) => ayah.surah >= start && ayah.surah <= end)
      .filter((ayah) => wordsInAyah(ayah).length >= 2);
  }
  if (scope === 'page') {
    const start = Number(document.querySelector('#quiz-page-start').value);
    const end = Number(document.querySelector('#quiz-page-end').value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > pageCount || start > end) {
      throw new Error(`اختر نطاق صفحات صحيحاً بين 1 و${pageCount}.`);
    }
    return quranAyahs.filter((ayah) => ayah.page >= start && ayah.page <= end)
      .filter((ayah) => wordsInAyah(ayah).length >= 2);
  }
  if (scope === 'ayah') {
    const surah = Number(document.querySelector('#quiz-ayah-surah').value);
    const start = Number(document.querySelector('#quiz-ayah-start').value);
    const end = Number(document.querySelector('#quiz-ayah-end').value);
    const surahAyahs = quranAyahs.filter((ayah) => ayah.surah === surah);
    if (!Number.isInteger(start) || !Number.isInteger(end)
      || start < 1 || end < start || end > surahAyahs.length) {
      throw new Error(`اختر نطاق آيات صحيحاً من 1 إلى ${surahAyahs.length || 0}.`);
    }
    return surahAyahs.filter((ayah) => ayah.ayah >= start && ayah.ayah <= end)
      .filter((ayah) => wordsInAyah(ayah).length >= 2);
  }
  throw new Error('نوع نطاق المراجعة غير معروف.');
}

function updateQuizScopeFields() {
  document.querySelectorAll('[data-quiz-fields]').forEach((fields) => {
    fields.hidden = fields.getAttribute('data-quiz-fields') !== quizScopeType.value;
  });
}

function renderQuizHearts() {
  if (!quizSession) {
    quizHearts.hidden = true;
    return;
  }
  quizHearts.hidden = false;
  quizHearts.textContent = `القلوب: ${'♥'.repeat(quizSession.lives)}${'♡'.repeat(3 - quizSession.lives)}`;
  quizHearts.setAttribute('aria-label', `بقي ${quizSession.lives} من 3 قلوب`);
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function finishQuiz() {
  if (!quizSession) return;
  quizStatus.textContent = `أحسنت! أتممت ${quizSession.correct} أسئلة من المراجعة.`;
  quizQuestion.hidden = true;
  quizStartButton.disabled = false;
  quizStartButton.textContent = 'ابدأ مراجعة جديدة';
  quizCancelButton.hidden = true;
  quizCelebration.hidden = false;
  quizCelebration.replaceChildren();
  const celebrationText = document.createElement('strong');
  celebrationText.textContent = 'ما شاء الله، مراجعة مباركة!';
  const confetti = document.createElement('div');
  confetti.className = 'quiz-confetti';
  confetti.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    confetti.append(piece);
  }
  quizCelebration.append(confetti, celebrationText);
  const progress = readStorage(quizProgressKey, {});
  const safeProgress = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  const today = getLocalDateKey();
  const previousCount = Number.isInteger(safeProgress[today]) && safeProgress[today] >= 0 ? safeProgress[today] : 0;
  safeProgress[today] = previousCount + 1;
  writeStorage(quizProgressKey, safeProgress);
  quizSession = null;
  renderQuizHearts();
  renderQuizCalendar();
}

function showNextQuizQuestion() {
  if (!quizSession) return;
  if (quizSession.used.size >= quizSession.questionLimit) {
    finishQuiz();
    return;
  }
  const available = quizSession.pool.filter((candidate) => !quizSession.used.has(candidate.key));
  const candidate = available[Math.floor(Math.random() * available.length)];
  const { ayah, words, targetIndex } = candidate;
  quizSession.used.add(candidate.key);
  const phraseLength = candidate.phraseLength;
  const correctWords = words.slice(targetIndex, targetIndex + phraseLength);
  const correctPhrase = correctWords.join(' ');
  const correctKey = phraseKey(correctWords);
  quizSession.current = candidate;
  quizSession.answered = false;
  quizReference.textContent = `${surahNameById(ayah.surah)} · الصفحة ${ayah.page} · الآية ${ayah.ayah}`;
  const context = document.createDocumentFragment();
  const snippetStart = Math.max(0, targetIndex - 10);
  if (snippetStart > 0) context.append(document.createTextNode('… '));
  context.append(document.createTextNode(`${words.slice(snippetStart, targetIndex).join(' ')} `));
  const stopPoint = document.createElement('span');
  stopPoint.className = 'quiz-stop-point';
  stopPoint.textContent = 'اختر تتمة الآية';
  stopPoint.setAttribute('aria-label', 'موضع العبارة التالية');
  context.append(stopPoint);
  quizVerseContext.replaceChildren(context);
  quizOptions.replaceChildren();
  quizNextButton.hidden = true;
  const distractors = shuffleItems(quranPhraseBank.filter((phrase) => (
    phrase.key !== correctKey && phrase.words.length === phraseLength
  ))).slice(0, 3).map((phrase) => phrase.text);
  if (distractors.length !== 3) throw new Error('تعذر تجهيز عبارات بديلة للاختبار.');
  const choices = shuffleItems([correctPhrase, ...distractors]);
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiz-answer-option';
    button.textContent = choice;
    button.addEventListener('click', () => {
      if (!quizSession || quizSession.answered) return;
      quizSession.answered = true;
      if (phraseKey([choice]) === correctKey) {
        quizSession.correct += 1;
        quizStatus.textContent = 'إجابة صحيحة، أحسنت!';
        button.classList.add('is-correct');
      } else {
        quizSession.lives -= 1;
        quizStatus.textContent = quizSession.lives > 0
          ? `ليست العبارة الصحيحة؛ تتابع الآية هو: ${correctPhrase}`
          : 'نفدت القلوب الثلاثة؛ أُعيد الاختبار وبدأت جولة جديدة.';
        button.classList.add('is-incorrect');
        [...quizOptions.children].forEach((option) => {
          if (phraseKey([option.textContent]) === correctKey) {
            option.classList.add('is-correct');
          }
        });
      }
      quizOptions.querySelectorAll('button').forEach((option) => { option.disabled = true; });
      renderQuizHearts();
      if (quizSession.lives <= 0) {
        startQuiz('نفدت القلوب الثلاثة؛ أُعيد الاختبار وبدأت جولة جديدة.');
        return;
      }
      quizNextButton.hidden = false;
    });
    quizOptions.append(button);
  });
}

function startQuiz(restartMessage = '') {
  try {
    const ayahs = getQuizPool();
    if (quranPhraseBank.length < 4) throw new Error('تعذر تجهيز اختيارات كافية من نص القرآن.');
    const pool = ayahs.flatMap((ayah) => {
      const words = wordsInAyah(ayah);
      return words.slice(3, -2).map((_, index) => {
        const targetIndex = index + 3;
        return {
          key: `${ayah.key}:${targetIndex}`,
          ayah,
          words,
          targetIndex,
          phraseLength: 3,
        };
      });
    });
    if (!pool.length) {
      throw new Error('لا توجد آيات طويلة كفاية لتكوين سؤال واضح في هذا النطاق. وسّع النطاق وحاول مرة أخرى.');
    }
    quizSession = {
      pool,
      used: new Set(),
      current: null,
      correct: 0,
      lives: 3,
      answered: false,
      questionLimit: Math.min(10, pool.length),
    };
    quizCelebration.hidden = true;
    quizQuestion.hidden = false;
    quizStartButton.disabled = true;
    quizStartButton.textContent = 'المراجعة مستمرة';
    quizCancelButton.hidden = false;
    quizStatus.textContent = restartMessage || 'بدأت مراجعتك من النطاق المحدد.';
    quizNextButton.onclick = showNextQuizQuestion;
    renderQuizHearts();
    showNextQuizQuestion();
  } catch (error) {
    quizStatus.textContent = error instanceof Error ? error.message : 'تعذر بدء المراجعة.';
  }
}

function cancelQuiz() {
  quizSession = null;
  quizQuestion.hidden = true;
  quizCelebration.hidden = true;
  quizStartButton.disabled = false;
  quizStartButton.textContent = 'ابدأ المراجعة';
  quizCancelButton.hidden = true;
  quizStatus.textContent = 'تم إيقاف المراجعة. يمكنك تعديل النطاق وبدء جولة جديدة.';
  renderQuizHearts();
}

function renderQuizCalendar() {
  const grid = document.querySelector('#quiz-calendar-grid');
  const monthLabel = document.querySelector('#quiz-calendar-month');
  const summary = document.querySelector('#quiz-calendar-summary');
  const progress = readStorage(quizProgressKey, {});
  const safeProgress = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  const monthStart = new Date(quizCalendarMonth.getFullYear(), quizCalendarMonth.getMonth(), 1);
  const monthEnd = new Date(quizCalendarMonth.getFullYear(), quizCalendarMonth.getMonth() + 1, 0);
  monthLabel.textContent = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(monthStart);
  grid.replaceChildren();
  ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].forEach((day) => {
    const heading = document.createElement('span');
    heading.className = 'quiz-calendar-weekday';
    heading.setAttribute('role', 'columnheader');
    heading.textContent = day;
    grid.append(heading);
  });
  const offset = (monthStart.getDay() + 1) % 7;
  for (let index = 0; index < offset; index += 1) {
    const blank = document.createElement('span');
    blank.className = 'quiz-calendar-empty';
    blank.setAttribute('aria-hidden', 'true');
    grid.append(blank);
  }
  let monthlySessions = 0;
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const key = getLocalDateKey(date);
    const count = Number.isInteger(safeProgress[key]) && safeProgress[key] > 0 ? safeProgress[key] : 0;
    monthlySessions += count;
    const cell = document.createElement('span');
    cell.className = 'quiz-calendar-day';
    cell.classList.toggle('has-practice', count > 0);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `${day}: ${count ? `${count} جلسة مراجعة` : 'لا توجد مراجعة مسجلة'}`);
    cell.textContent = String(day);
    if (count > 0) {
      const marker = document.createElement('small');
      marker.textContent = String(count);
      marker.setAttribute('aria-hidden', 'true');
      cell.append(marker);
    }
    grid.append(cell);
  }
  summary.textContent = `جلسات المراجعة المكتملة هذا الشهر: ${monthlySessions}`;
}

function initializeQuranQuiz() {
  const records = surahs.map(({ id, name }) => ({ id, name }));
  createSelectOptions(document.querySelector('#quiz-surah-start'), records);
  createSelectOptions(document.querySelector('#quiz-surah-end'), records);
  createSelectOptions(document.querySelector('#quiz-ayah-surah'), records);
  document.querySelector('#quiz-surah-end').value = String(records.at(-1)?.id ?? 1);
  quizScopeType.addEventListener('change', updateQuizScopeFields);
  document.querySelector('#quiz-ayah-surah').addEventListener('change', () => {
    const selectedSurah = Number(document.querySelector('#quiz-ayah-surah').value);
    const count = quranAyahs.filter((ayah) => ayah.surah === selectedSurah).length;
    document.querySelector('#quiz-ayah-start').max = String(count);
    document.querySelector('#quiz-ayah-end').max = String(count);
    document.querySelector('#quiz-ayah-end').value = String(Math.min(7, count));
  });
  document.querySelector('#quiz-ayah-surah').dispatchEvent(new Event('change'));
  quizStartButton.addEventListener('click', () => startQuiz());
  quizCancelButton.addEventListener('click', cancelQuiz);
  quizNextButton.onclick = showNextQuizQuestion;
  document.querySelector('#quiz-calendar-previous').addEventListener('click', () => {
    quizCalendarMonth = new Date(quizCalendarMonth.getFullYear(), quizCalendarMonth.getMonth() - 1, 1);
    renderQuizCalendar();
  });
  document.querySelector('#quiz-calendar-next').addEventListener('click', () => {
    const nextMonth = new Date(quizCalendarMonth.getFullYear(), quizCalendarMonth.getMonth() + 1, 1);
    const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (nextMonth <= currentMonth) quizCalendarMonth = nextMonth;
    renderQuizCalendar();
  });
  const calendarSection = document.querySelector('#quiz-calendar-section');
  const calendarToggle = document.querySelector('#quiz-calendar-open');
  calendarToggle.addEventListener('click', () => {
    calendarSection.hidden = !calendarSection.hidden;
    calendarToggle.setAttribute('aria-expanded', String(!calendarSection.hidden));
    if (!calendarSection.hidden) renderQuizCalendar();
  });
  updateQuizScopeFields();
  quizStatus.textContent = 'اختر نطاق المراجعة وطريقتها، ثم ابدأ.';
  quizStartButton.disabled = false;
}

function renderBookmarks() {
  const validBookmarks = bookmarks.filter((item) => item && Number.isInteger(item.page) && item.page >= 1 && item.page <= pageCount);
  if (validBookmarks.length !== bookmarks.length) {
    bookmarks = validBookmarks;
    writeStorage(STORAGE_KEYS.bookmarks, bookmarks);
  }
  document.querySelector('#bookmark-count').textContent = String(bookmarks.length);
  document.querySelector('#go-bookmark').disabled = bookmarks.length === 0;
  updateBookmarkRibbon();

  if (!bookmarks.length) {
    showEmpty(bookmarksList, 'لم تحفظ أي علامة بعد. احفظ موضع قراءتك لتعود إليه لاحقاً.', 'empty-message');
    return;
  }

  const fragment = document.createDocumentFragment();
  bookmarks.forEach((bookmark) => {
    const row = document.createElement('article');
    row.className = 'bookmark-row';
    const title = document.createElement('input');
    title.className = 'form-control bookmark-name';
    title.type = 'text';
    title.maxLength = 70;
    title.value = bookmark.name || `صفحة ${bookmark.page}`;
    title.setAttribute('aria-label', 'اسم العلامة المرجعية');
    const detail = document.createElement('span');
    detail.className = 'bookmark-detail';
    detail.textContent = `${bookmark.surahName || surahAtPage(bookmark.page).name} · صفحة ${bookmark.page}`;
    const controls = document.createElement('div');
    controls.className = 'bookmark-controls';
    const goButton = document.createElement('button');
    goButton.className = 'btn btn-sm btn-outline-success';
    goButton.type = 'button';
    goButton.textContent = 'انتقال';
    goButton.addEventListener('click', () => {
      goToPage(bookmark.page);
      bootstrap.Modal.getInstance(document.querySelector('#bookmarks-modal'))?.hide();
    });
    const renameButton = document.createElement('button');
    renameButton.className = 'btn btn-sm btn-outline-secondary';
    renameButton.type = 'button';
    renameButton.textContent = 'حفظ الاسم';
    renameButton.addEventListener('click', () => {
      const nextName = sanitizePlainText(title.value, 70).trim();
      if (!nextName) {
        title.value = bookmark.name || `صفحة ${bookmark.page}`;
        title.focus();
        return;
      }
      bookmark.name = nextName;
      writeStorage(STORAGE_KEYS.bookmarks, bookmarks);
      renderBookmarks();
    });
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-sm btn-outline-danger';
    deleteButton.type = 'button';
    deleteButton.textContent = 'حذف';
    deleteButton.addEventListener('click', () => {
      bookmarks = bookmarks.filter((item) => item.id !== bookmark.id);
      writeStorage(STORAGE_KEYS.bookmarks, bookmarks);
      renderBookmarks();
    });
    controls.append(goButton, renameButton, deleteButton);
    row.append(title, detail, controls);
    fragment.append(row);
  });
  bookmarksList.replaceChildren(fragment);
}

const saveBookmarkButton = document.querySelector('#save-bookmark');
if (saveBookmarkButton) {
  saveBookmarkButton.addEventListener('click', () => {
    const surah = surahAtPage(currentPage);
    const bookmark = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${surah.name} · صفحة ${currentPage}`,
      surahName: surah.name,
      page: currentPage,
    };
    bookmarks = [bookmark, ...bookmarks];
    writeStorage(STORAGE_KEYS.bookmarks, bookmarks);
    renderBookmarks();
    statusElement.textContent = 'تم حفظ موضع القراءة في العلامات.';
    statusElement.className = 'load-status is-success';
  });
}

const goBookmarkButton = document.querySelector('#go-bookmark');
if (goBookmarkButton) {
  goBookmarkButton.addEventListener('click', () => {
    if (bookmarks[0]) goToPage(bookmarks[0].page);
  });
}
const bookmarksModal = document.querySelector('#bookmarks-modal');
if (bookmarksModal) bookmarksModal.addEventListener('show.bs.modal', renderBookmarks);
const manageBookmarksButton = document.querySelector('#manage-bookmarks');
if (manageBookmarksButton) {
  manageBookmarksButton.addEventListener('click', () => {
    if (quickMenu) quickMenu.open = false;
    if (bookmarksModal) bootstrap.Modal.getOrCreateInstance(bookmarksModal).show();
  });
}
const openQuranIndexButton = document.querySelector('#open-quran-index');
if (openQuranIndexButton) {
  openQuranIndexButton.addEventListener('click', () => {
    if (quickMenu) quickMenu.open = false;
    const indexPanel = document.querySelector('#quran-index');
    if (window.innerWidth < 768) {
      if (indexPanel) bootstrap.Offcanvas.getOrCreateInstance(indexPanel).show();
    } else if (indexPanel) {
      indexPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      indexSearch.focus({ preventScroll: true });
    }
  });
}
renderBookmarks();

document.querySelectorAll('#appTabs [data-bs-toggle="pill"]').forEach((tab) => {
  tab.addEventListener('shown.bs.tab', (event) => {
    const activeTab = event.target;
    const activePanel = activeTab instanceof HTMLElement ? activeTab.dataset.bsTarget : null;
    document.querySelectorAll('.mobile-nav-item[data-tab-target], .sidebar-nav-link[data-tab-target]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tabTarget === activePanel);
      button.classList.toggle('is-active', button.dataset.tabTarget === activePanel);
    });
    const onQuran = event.target.id === 'quran-tab';
    document.body.classList.toggle('quran-active', onQuran);
    if (!onQuran) {
      if (quickMenu) quickMenu.open = false;
      stopAutoPageTurning();
    }
  });
});
document.querySelectorAll('.mobile-nav-item[data-tab-target], .sidebar-nav-link[data-tab-target]').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = [...document.querySelectorAll('#appTabs [data-bs-toggle="pill"]')]
      .find((candidate) => candidate.dataset.bsTarget === button.dataset.tabTarget);
    if (!tab) throw new Error(`No application tab matches ${button.dataset.tabTarget}.`);
    bootstrap.Tab.getOrCreateInstance(tab).show();
  });
});

const memorizationModal = document.querySelector('#memorization-modal');
const memorizationLinks = document.querySelectorAll('[data-open-memorization]');
memorizationLinks.forEach((link) => {
  link.addEventListener('click', () => {
    if (quickMenu?.contains(link)) quickMenu.open = false;
    bootstrap.Modal.getOrCreateInstance(memorizationModal).show();
  });
});
memorizationModal.addEventListener('shown.bs.modal', () => {
  memorizationLinks.forEach((link) => link.classList.add('is-active'));
});
memorizationModal.addEventListener('hidden.bs.modal', () => {
  memorizationLinks.forEach((link) => link.classList.remove('is-active'));
});

const appSidebar = document.querySelector('#app-sidebar');
const sidebarOpenButton = document.querySelector('#sidebar-open');
const sidebarCloseButton = document.querySelector('#sidebar-close');
const sidebarBackdrop = document.querySelector('#sidebar-backdrop');
const sidebarMobileQuery = window.matchMedia('(max-width: 767.98px)');
let sidebarReturnFocus = null;

function setSidebarOpen(open) {
  const isMobile = sidebarMobileQuery.matches;
  appSidebar.setAttribute('aria-hidden', String(!open));
  appSidebar.classList.toggle('is-open', open);
  sidebarBackdrop.hidden = !open;
  document.body.classList.toggle('sidebar-open', isMobile && open);
  sidebarOpenButton.setAttribute('aria-expanded', String(open));
  sidebarOpenButton.setAttribute('aria-label', open ? 'إغلاق القائمة الجانبية' : 'فتح القائمة الجانبية');
  if (open) {
    sidebarReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : sidebarOpenButton;
    appSidebar.querySelector('.sidebar-close-button').focus({ preventScroll: true });
  } else if (sidebarReturnFocus instanceof HTMLElement && sidebarReturnFocus.isConnected) {
    sidebarReturnFocus.focus({ preventScroll: true });
  }
}

sidebarOpenButton.addEventListener('click', () => setSidebarOpen(true));
sidebarCloseButton.addEventListener('click', () => setSidebarOpen(false));
sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
sidebarMobileQuery.addEventListener('change', () => setSidebarOpen(false));
appSidebar.addEventListener('click', (event) => {
  if (event.target instanceof Element
    && event.target.closest('[data-tab-target], [data-bs-toggle="modal"], [data-open-memorization], #theme-toggle, #onboarding-tour-open, #feedback-btn')) {
    setSidebarOpen(false);
  }
});
appSidebar.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && appSidebar.classList.contains('is-open')) {
    event.preventDefault();
    setSidebarOpen(false);
    return;
  }
  if (event.key !== 'Tab' || !appSidebar.classList.contains('is-open')) return;
  const focusable = [...appSidebar.querySelectorAll('button:not(:disabled):not([hidden]), a[href]:not([hidden])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});
setSidebarOpen(false);

const telegramBotUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
const telegramBotConfigured = /^[A-Za-z0-9_]{5,32}$/.test(telegramBotUsername);
const telegramOpenBot = document.querySelector('#telegram-open-bot');
const telegramSubscribeBot = document.querySelector('#telegram-subscribe-bot');
const telegramServiceStatus = document.querySelector('#telegram-service-status');
const telegramPromoStart = document.querySelector('#telegram-promo-start');
const telegramSuccessStart = document.querySelector('#telegram-success-start');
if (telegramBotConfigured) {
  telegramOpenBot.href = `https://t.me/${telegramBotUsername}?start=zad`;
  telegramSubscribeBot.href = `https://t.me/${telegramBotUsername}?start=subscribe`;
  telegramOpenBot.hidden = false;
  telegramSubscribeBot.hidden = false;
  if (telegramPromoStart) {
    telegramPromoStart.href = telegramOpenBot.href;
    telegramPromoStart.hidden = false;
  }
  if (telegramSuccessStart) {
    telegramSuccessStart.href = telegramOpenBot.href;
    telegramSuccessStart.hidden = false;
  }
  telegramServiceStatus.textContent = 'روابط بوت زاد جاهزة. ابدأ من البوت واتبع التعليمات الظاهرة فيه.';
}

const telegramPromoModal = document.querySelector('#telegram-promo-modal');
const telegramPromoKey = 'zad.telegramPromoDismissed.v1';
let telegramPromoDismissed = false;
let telegramPromoRequestedAccount = false;
let telegramPromoElapsed = 0;
let telegramPromoStartedAt = 0;
let telegramPromoTimer = 0;
try {
  telegramPromoDismissed = localStorage.getItem(telegramPromoKey) === 'true';
} catch (error) {
  console.warn('Could not load Telegram promo dismissal state.', error);
}

function rememberTelegramPromoDismissal() {
  telegramPromoDismissed = true;
  try {
    localStorage.setItem(telegramPromoKey, 'true');
  } catch (error) {
    console.warn('Could not save Telegram promo dismissal state.', error);
  }
}

function stopTelegramPromoTimer() {
  if (!telegramPromoStartedAt) return;
  telegramPromoElapsed += Date.now() - telegramPromoStartedAt;
  telegramPromoStartedAt = 0;
  window.clearTimeout(telegramPromoTimer);
  telegramPromoTimer = 0;
}

function startTelegramPromoTimer() {
  if (telegramPromoDismissed || telegramPromoStartedAt
    || document.visibilityState !== 'visible'
    || !document.querySelector('#telegram-panel').classList.contains('active')) return;
  telegramPromoStartedAt = Date.now();
  const remaining = Math.max(0, 50000 - telegramPromoElapsed);
  telegramPromoTimer = window.setTimeout(() => {
    telegramPromoStartedAt = 0;
    if (!telegramPromoDismissed) bootstrap.Modal.getOrCreateInstance(telegramPromoModal).show();
  }, remaining);
}

document.querySelector('#telegram-tab').addEventListener('shown.bs.tab', startTelegramPromoTimer);
document.querySelector('#telegram-tab').addEventListener('hide.bs.tab', stopTelegramPromoTimer);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopTelegramPromoTimer();
  else startTelegramPromoTimer();
});
telegramPromoModal?.addEventListener('hidden.bs.modal', () => {
  rememberTelegramPromoDismissal();
  if (telegramPromoRequestedAccount) {
    telegramPromoRequestedAccount = false;
    bootstrap.Modal.getOrCreateInstance(document.querySelector('#account-modal')).show();
  }
});
document.querySelectorAll('[data-open-account]').forEach((button) => {
  button.addEventListener('click', () => {
    const promoIsOpen = telegramPromoModal?.classList.contains('show');
    if (promoIsOpen) {
      telegramPromoRequestedAccount = true;
      bootstrap.Modal.getInstance(telegramPromoModal)?.hide();
    } else {
      bootstrap.Modal.getOrCreateInstance(document.querySelector('#account-modal')).show();
    }
  });
});
document.querySelectorAll('[data-telegram-support-amount]').forEach((button) => {
  button.addEventListener('click', () => {
    const amount = Number(button.getAttribute('data-telegram-support-amount'));
    if (![50, 100, 250, 500].includes(amount)) {
      throw new Error('Telegram support amount is not available.');
    }
    showSupportModal(amount);
  });
});
function showTelegramActivationSuccess() {
  const accountModalElement = document.querySelector('#account-modal');
  if (accountModalElement?.classList.contains('show')) {
    accountModalElement.addEventListener('hidden.bs.modal', showTelegramActivationSuccess, { once: true });
    bootstrap.Modal.getInstance(accountModalElement)?.hide();
    return;
  }
  if (telegramSuccessStart && telegramBotConfigured) telegramSuccessStart.hidden = false;
  bootstrap.Modal.getOrCreateInstance(document.querySelector('#telegram-success-modal')).show();
  window.__zadTelegramActivationPending = false;
}
window.addEventListener('zad:telegram-activated', showTelegramActivationSuccess);
if (window.__zadTelegramActivationPending) showTelegramActivationSuccess();

document.body.classList.add('quran-active');

function toggleNightMode() {
  nightMode = !nightMode;
  document.body.classList.toggle('night-mode', nightMode);
  if (themeToggleButton) {
    themeToggleButton.setAttribute('aria-label', nightMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي');
  }
  if (themeToggleLabel) themeToggleLabel.textContent = nightMode ? 'الوضع النهاري' : 'الوضع الليلي';
  writeStorage(STORAGE_KEYS.nightMode, nightMode);
}
if (themeToggleButton) themeToggleButton.addEventListener('click', toggleNightMode);

function applyBrightness(value) {
  brightness = Math.min(125, Math.max(45, Number(value)));
  document.documentElement.style.setProperty('--reader-brightness', String(brightness / 100));
  writeBrightnessDebounced();
}
const writeBrightnessDebounced = debounce(() => writeStorage(STORAGE_KEYS.brightness, brightness), 350);
brightnessRange.addEventListener('input', () => applyBrightness(brightnessRange.value));
window.addEventListener('pagehide', () => {
  writeNotesDebounced.flush();
  writePreferencesDebounced.flush();
  writeBrightnessDebounced.flush();
});

function savePreferences() {
  const quranThemeSelect = document.querySelector('#quran-theme');
  const fontSizeInput = document.querySelector('#reading-font-size');
  const fontSizeOutput = document.querySelector('#reading-font-size-value');
  const arabicFontSelect = document.querySelector('#arabic-font');

  if (quranThemeSelect) preferences.quranTheme = quranThemeSelect.value;
  if (fontSizeInput) preferences.fontSize = Number(fontSizeInput.value);
  if (arabicFontSelect) preferences.arabicFont = arabicFontSelect.value;
  document.body.dataset.readerTheme = preferences.quranTheme;
  document.documentElement.style.setProperty('--reading-font-size', `${preferences.fontSize}px`);
  document.documentElement.style.setProperty('--arabic-font', {
    system: 'Tahoma, Arial, sans-serif',
    naskh: '"Times New Roman", serif',
    sans: 'Arial, Tahoma, sans-serif',
  }[preferences.arabicFont]);
  if (fontSizeOutput) fontSizeOutput.textContent = String(preferences.fontSize);
  writePreferencesDebounced();
}

const writePreferencesDebounced = debounce(() => writeStorage(STORAGE_KEYS.preferences, preferences), 350);
if (quranThemeSelect) quranThemeSelect.addEventListener('change', savePreferences);
if (readingFontSizeInput) readingFontSizeInput.addEventListener('input', savePreferences);
if (arabicFontSelect) arabicFontSelect.addEventListener('change', savePreferences);
if (notesField) {
  notesField.addEventListener('input', () => {
    userNotes = sanitizePlainText(notesField.value, 2000);
    if (notesField.value !== userNotes) notesField.value = userNotes;
    writeNotesDebounced();
    const notesStatus = document.querySelector('#notes-status');
    if (notesStatus) {
      notesStatus.textContent = 'جارٍ حفظ المسودة على هذا الجهاز...';
    }
  });
}
const writeNotesDebounced = debounce(() => writeStorage(STORAGE_KEYS.notes, userNotes), 350);
if (notesField) {
  notesField.addEventListener('blur', () => {
    writeNotesDebounced.flush();
    const notesStatus = document.querySelector('#notes-status');
    if (notesStatus) notesStatus.textContent = 'حُفظت المسودة على هذا الجهاز. أرسلها للمراجعة باستخدام الزر.';
  });
}

async function sendFeedback(category, message, form) {
  const requestId = form.dataset.requestId || window.crypto.randomUUID();
  form.dataset.requestId = requestId;
  const response = await fetchApp('api/feedback', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category,
      message,
      requestId,
    }),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('تعذر قراءة استجابة الخادم. حاول مرة أخرى لاحقاً.');
  }
  if (!response.ok || result.success !== true) {
    throw new Error('تعذر إرسال الرسالة حالياً.');
  }
}

const feedbackForm = document.querySelector('#feedback-form');
if (feedbackForm && notesField) {
  feedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = sanitizePlainText(notesField.value, 2000).trim();
    const status = document.querySelector('#notes-status');
    const submitButton = document.querySelector('#feedback-submit');
    const category = document.querySelector('#feedback-category').value;
    if (!message || message.length > 2000 || !['suggestion', 'issue', 'other'].includes(category)) {
      notesField.setCustomValidity('اكتب رسالتك قبل الإرسال.');
      feedbackForm.reportValidity();
      notesField.setCustomValidity('');
      return;
    }

    const cooldownSeconds = startRequestCooldown('feedback', 8000);
    if (cooldownSeconds) {
      status.textContent = `انتظر ${cooldownSeconds} ثوانٍ قبل إرسال رسالة أخرى.`;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'جارٍ إرسال الرسالة...';
    status.textContent = '';
    try {
      await sendFeedback(category, message, feedbackForm);

      notesField.value = '';
      userNotes = '';
      writeStorage(STORAGE_KEYS.notes, '');
      delete feedbackForm.dataset.requestId;
      status.textContent = 'تم إرسال ملاحظتك بنجاح، شكراً لمشاركتك!';
    } catch (error) {
      status.textContent = 'تعذر الاتصال بالخادم. بقيت الرسالة محفوظة كمسودة على هذا الجهاز.';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'إرسال للمراجعة';
    }
  });
}

async function toggleFocusMode() {
  if (document.fullscreenElement === quranReader) {
    await document.exitFullscreen();
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  if (quranReader && quranReader.requestFullscreen) {
    try {
      await quranReader.requestFullscreen();
    } catch (error) {
      console.warn('Fullscreen is unavailable; using the in-page focus mode.', error);
      document.body.classList.toggle('reader-focus-mode');
    }
  } else {
    document.body.classList.toggle('reader-focus-mode');
  }
}

const focusToggleButton = document.querySelector('#focus-toggle');
if (focusToggleButton) focusToggleButton.addEventListener('click', toggleFocusMode);
const mushafStage = document.querySelector('.mushaf-stage');
if (mushafStage) {
  mushafStage.addEventListener('click', (event) => {
    if (mushafStage.dataset.swipeNavigation === 'true') {
      mushafStage.dataset.swipeNavigation = 'false';
      event.preventDefault();
      return;
    }
    if (event.target === event.currentTarget || event.target === quranPageImage) toggleFocusMode();
  });
  let swipeStart = null;
  let swipeResetTimer = 0;
  mushafStage.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    swipeStart = { x: event.clientX, y: event.clientY };
    mushafStage.setPointerCapture(event.pointerId);
  });
  mushafStage.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    event.preventDefault();
    mushafStage.dataset.swipeNavigation = 'true';
    goToPage(currentPage + (deltaX < 0 ? 1 : -1));
    window.clearTimeout(swipeResetTimer);
    swipeResetTimer = window.setTimeout(() => {
      mushafStage.dataset.swipeNavigation = 'false';
    }, 600);
  });
  mushafStage.addEventListener('pointercancel', () => { swipeStart = null; });
}
document.addEventListener('fullscreenchange', () => {
  const focused = document.fullscreenElement === quranReader;
  document.body.classList.toggle('reader-focus-mode', focused);
  if (focusToggleButton) {
    focusToggleButton.setAttribute('aria-label', focused ? 'إنهاء وضع التركيز' : 'تفعيل وضع التركيز');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.fullscreenElement) document.body.classList.remove('reader-focus-mode');
  if (!document.body.classList.contains('quran-active')
    || event.altKey || event.ctrlKey || event.metaKey
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToPage(currentPage - 1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    goToPage(currentPage + 1);
  }
});

if (zoomToggle && mushafStage) {
  zoomToggle.addEventListener('click', () => {
    const isZoomed = mushafStage.classList.toggle('is-zoomed');
    if (isZoomed) {
      fitToScreen = false;
      mushafStage.classList.remove('is-fit-to-screen');
      if (fitToScreenToggle) fitToScreenToggle.setAttribute('aria-pressed', 'false');
      writeStorage(STORAGE_KEYS.fitToScreen, false);
    }
    zoomToggle.setAttribute('aria-pressed', String(isZoomed));
    zoomToggle.textContent = isZoomed ? '⌕ تصغير الصفحة' : '⌕ تكبير الصفحة';
  });
}

let zoomedBeforeFit = false;
if (mushafStage && fitToScreenToggle) {
  mushafStage.classList.toggle('is-fit-to-screen', fitToScreen);
  fitToScreenToggle.setAttribute('aria-pressed', String(fitToScreen));
  fitToScreenToggle.addEventListener('click', () => {
    fitToScreen = !fitToScreen;
    mushafStage.classList.toggle('is-fit-to-screen', fitToScreen);
    if (fitToScreen) {
      zoomedBeforeFit = mushafStage.classList.contains('is-zoomed');
      mushafStage.classList.remove('is-zoomed');
      if (zoomToggle) {
        zoomToggle.setAttribute('aria-pressed', 'false');
        zoomToggle.textContent = '⌕ تكبير الصفحة';
      }
    } else if (zoomedBeforeFit) {
      mushafStage.classList.add('is-zoomed');
      if (zoomToggle) {
        zoomToggle.setAttribute('aria-pressed', 'true');
        zoomToggle.textContent = '⌕ تصغير الصفحة';
      }
      zoomedBeforeFit = false;
    }
    fitToScreenToggle.setAttribute('aria-pressed', String(fitToScreen));
    writeStorage(STORAGE_KEYS.fitToScreen, fitToScreen);
  });
}

function stopAutoPageTurning() {
  window.clearInterval(autoPageTimer);
  autoPageTimer = 0;
  if (autoPageToggle) {
    autoPageToggle.textContent = '▶ بدء التقليب';
    autoPageToggle.setAttribute('aria-pressed', 'false');
  }
}

function startAutoPageTurning() {
  stopAutoPageTurning();
  const seconds = Number(autoPageSpeed?.value);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
    statusElement.textContent = 'أدخل مدة صحيحة بين ثانية واحدة و24 ساعة.';
    statusElement.className = 'load-status is-warning';
    autoPageSpeed?.focus();
    return;
  }
  if (autoPageToggle) {
    autoPageToggle.textContent = '❚❚ إيقاف التقليب';
    autoPageToggle.setAttribute('aria-pressed', 'true');
  }
  autoPageTimer = window.setInterval(() => {
    if (currentPage >= pageCount) {
      stopAutoPageTurning();
      return;
    }
    goToPage(currentPage + 1);
  }, seconds * 1000);
}

if (autoPageToggle) autoPageToggle.addEventListener('click', () => {
  if (autoPageTimer) stopAutoPageTurning();
  else startAutoPageTurning();
});
if (autoPageSpeed) autoPageSpeed.addEventListener('input', () => {
  autoPageSpeed.setCustomValidity(
    Number.isInteger(Number(autoPageSpeed.value))
      && Number(autoPageSpeed.value) >= 1
      && Number(autoPageSpeed.value) <= 86400
      ? ''
      : 'أدخل عدداً صحيحاً بين 1 و86400 ثانية.'
  );
  if (autoPageTimer) {
    if (autoPageSpeed.validity.valid) startAutoPageTurning();
    else stopAutoPageTurning();
  }
});

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    wakeLockRequested = false;
    statusElement.textContent = 'ميزة إبقاء الشاشة مستيقظة غير مدعومة في هذا المتصفح.';
    statusElement.className = 'load-status is-warning';
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      if (wakeLockRequested && document.visibilityState === 'visible') {
        requestWakeLock();
      } else {
        wakeLockToggle.setAttribute('aria-pressed', 'false');
        wakeLockToggle.textContent = '☼ إبقاء الشاشة مستيقظة';
      }
    });
    wakeLockRequested = true;
    wakeLockToggle.setAttribute('aria-pressed', 'true');
    wakeLockToggle.textContent = '☼ إيقاف إبقاء الشاشة';
  } catch (error) {
    wakeLockRequested = false;
    wakeLockToggle.setAttribute('aria-pressed', 'false');
    wakeLockToggle.textContent = '☼ إبقاء الشاشة مستيقظة';
    statusElement.textContent = `تعذر إبقاء الشاشة مستيقظة: ${error.message}`;
    statusElement.className = 'load-status is-warning';
  }
}

wakeLockToggle.addEventListener('click', async () => {
  if (wakeLock) {
    wakeLockRequested = false;
    await wakeLock.release();
    wakeLock = null;
    wakeLockToggle.textContent = '☼ إبقاء الشاشة مستيقظة';
    wakeLockToggle.setAttribute('aria-pressed', 'false');
  } else {
    wakeLockRequested = true;
    await requestWakeLock();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLockRequested && !wakeLock) {
    requestWakeLock();
  }
});

function saveReminders() {
  const email = sanitizePlainText(reminderEmailInput.value, 254).trim();
  reminderEmailInput.value = email;
  const emailError = document.querySelector('#reminder-email-error');
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  reminderEmailInput.setCustomValidity('');
  const invalidEmail = email && (!reminderEmailInput.checkValidity() || !emailPattern.test(email));
  reminderEmailInput.setCustomValidity(invalidEmail ? 'أدخل عنوان بريد إلكتروني صحيحاً.' : '');
  if (!reminderEmailInput.checkValidity()) {
    if (emailError) {
      emailError.textContent = reminderEmailInput.validationMessage;
      emailError.hidden = false;
    }
    return false;
  }
  if (emailError) {
    emailError.textContent = '';
    emailError.hidden = true;
  }

  reminders.email = email;
  for (const key of ['quran', 'morning', 'evening']) {
    const timeInput = document.querySelector(`#reminder-${key}`);
    const normalizedTime = normalizeReminderTime(timeInput.value);
    if (timeInput.value && !normalizedTime) {
      timeInput.setCustomValidity('أدخل وقتاً صحيحاً بصيغة الساعة والدقيقة.');
      return false;
    }
    timeInput.setCustomValidity('');
    reminders[key] = normalizedTime;
  }
  return writeStorage(STORAGE_KEYS.reminders, reminders);
}

function loadReminderSettings() {
  reminderEmailInput.value = typeof reminders.email === 'string' ? reminders.email : '';
  reminderEmailInput.setCustomValidity('');
  document.querySelector('#user-notes').value = userNotes;
  for (const key of ['quran', 'morning', 'evening']) {
    document.querySelector(`#reminder-${key}`).value = normalizeReminderTime(reminders[key]);
  }
  if (!reminders.lastSent || typeof reminders.lastSent !== 'object') reminders.lastSent = {};
}

document.querySelector('#reminder-settings').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!saveReminders()) reminderEmailInput.reportValidity();
});
document.querySelector('#reminder-settings').addEventListener('change', saveReminders);
reminderEmailInput.addEventListener('input', debounce(saveReminders, 250));
document.querySelector('#settings-modal').addEventListener('show.bs.modal', loadReminderSettings);

document.querySelector('#reminder-notifications').addEventListener('click', async () => {
  const status = document.querySelector('#reminder-status');
  if (!saveReminders()) {
    reminderEmailInput.reportValidity();
    status.textContent = 'صحّح البريد الإلكتروني قبل تفعيل التذكيرات.';
    return;
  }
  if (!('Notification' in window)) {
    status.textContent = 'تنبيهات المتصفح غير مدعومة في هذا المتصفح.';
    return;
  }
  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    status.textContent = permission === 'granted'
      ? `تم تفعيل التنبيهات. ستظهر في الأوقات المحددة ما دام التطبيق مفتوحاً أو يعمل في الخلفية.${['quran', 'morning', 'evening'].some((key) => reminders[key]) ? ` المواعيد: ${['quran', 'morning', 'evening'].filter((key) => reminders[key]).map((key) => formatReminderTime(reminders[key])).join('، ')}.` : ''}`
      : 'لم يتم السماح بالتنبيهات. يمكنك تفعيلها من إعدادات المتصفح.';
    if (permission === 'granted') checkReminders();
  } catch (error) {
    status.textContent = `تعذر تفعيل التنبيهات: ${error.message}`;
  }
});

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const today = getLocalDateKey(now);
  const notificationCopy = {
    quran: ['حان وقت ورد القرآن', 'افتح المصحف وأكمل وردك اليومي.'],
    morning: ['حان وقت أذكار الصباح', 'ابدأ يومك بذكر الله.'],
    evening: ['حان وقت أذكار المساء', 'اختم يومك بأذكار المساء.'],
  };
  getDueReminderKeys(reminders, now).forEach((key) => {
    const [title, body] = notificationCopy[key];
    try {
      const notification = new Notification(title, {
        body,
        tag: `zad-reminder-${key}-${today}`,
        timestamp: scheduledAt.getTime(),
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      reminders.lastSent[key] = today;
      writeStorage(STORAGE_KEYS.reminders, reminders);
    } catch (error) {
      const status = document.querySelector('#reminder-status');
      if (status) status.textContent = `تعذر عرض التنبيه. تحقق من إذن الإشعارات في المتصفح: ${error.message}`;
    }
  });
}

checkReminders();
reminderTimer = window.setInterval(checkReminders, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkReminders();
});

const supportPaymentForm = document.querySelector('#support-payment-form');
const supportPaymentMethod = document.querySelector('#support-method');
const supportPhoneField = document.querySelector('#support-phone-field');
const supportPhoneInput = document.querySelector('#support-phone');
const supportOpenButton = document.querySelector('#support-open');
const supportModalElement = document.querySelector('#support-modal');
const supportAmountInput = document.querySelector('#support-amount');
const settingsModalElement = document.querySelector('#settings-modal');
let selectedSupportAmount = 50;
function showSupportModal(amount = 50) {
  if (!supportModalElement || !supportAmountInput) return;
  selectedSupportAmount = amount;
  supportAmountInput.value = String(amount);
  if (settingsModalElement?.classList.contains('show')) {
    settingsModalElement.addEventListener('hidden.bs.modal', () => {
      bootstrap.Modal.getOrCreateInstance(supportModalElement).show();
    }, { once: true });
    bootstrap.Modal.getInstance(settingsModalElement)?.hide();
  } else {
    bootstrap.Modal.getOrCreateInstance(supportModalElement).show();
  }
}
if (supportOpenButton && supportModalElement) {
  supportOpenButton.addEventListener('click', () => showSupportModal(selectedSupportAmount));
}
const supportTiers = document.querySelector('.support-tiers');
if (supportTiers) {
  supportTiers.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const tierButton = event.target.closest('button[data-support-amount]');
    if (!tierButton || !supportTiers.contains(tierButton)) return;
    const amount = Number(tierButton.getAttribute('data-support-amount'));
    if (![50, 100, 250, 500].includes(amount)) return;
    supportTiers.querySelectorAll('button[data-support-amount]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button === tierButton));
    });
    selectedSupportAmount = amount;
    showSupportModal(amount);
  });
}

async function openFeedbackForm() {
  if (!onboardingTour.hidden) finishOnboardingTour();
  const modal = document.querySelector('#settings-modal');
  if (!modal.classList.contains('show')) {
    const shown = new Promise((resolve) => modal.addEventListener('shown.bs.modal', resolve, { once: true }));
    bootstrap.Modal.getOrCreateInstance(modal).show();
    await shown;
  }
  const disclosure = document.querySelector('.feedback-disclosure');
  disclosure.open = true;
  await tourDelay(240);
  disclosure.scrollIntoView({ behavior: 'smooth', block: 'center' });
  notesField.focus({ preventScroll: true });
}

const feedbackModalElement = document.querySelector('#feedback-modal');
const feedbackModalForm = document.querySelector('#feedback-modal-form');
const feedbackModalMessage = document.querySelector('#feedback-modal-message');
const feedbackModalSubmit = document.querySelector('#feedback-modal-submit');
const feedbackModalStatus = document.querySelector('#feedback-modal-status');

async function openDedicatedFeedbackModal() {
  if (!onboardingTour.hidden) finishOnboardingTour();
  if (settingsModalElement?.classList.contains('show')) {
    const settingsHidden = new Promise((resolve) => {
      settingsModalElement.addEventListener('hidden.bs.modal', resolve, { once: true });
    });
    bootstrap.Modal.getInstance(settingsModalElement)?.hide();
    await settingsHidden;
  }
  if (!feedbackModalElement.classList.contains('show')) {
    const feedbackShown = new Promise((resolve) => {
      feedbackModalElement.addEventListener('shown.bs.modal', resolve, { once: true });
    });
    bootstrap.Modal.getOrCreateInstance(feedbackModalElement).show();
    await feedbackShown;
  }
  feedbackModalMessage.focus({ preventScroll: true });
}

document.querySelector('#feedback-btn').addEventListener('click', () => {
  void openDedicatedFeedbackModal();
});

const developerShareButton = document.querySelector('#developer-share');
const developerShareStatus = document.querySelector('#developer-share-status');
const shareModalElement = document.querySelector('#share-modal');
const shareModalStatus = document.querySelector('#share-modal-status');
const shareToast = document.querySelector('#share-toast');
let shareToastTimer = 0;
const appShareText = 'تطبيق زاد: طمأنينة في يومك مع القران والأذكار والأدعية. حمّله الآن!';

function prepareShareLinks() {
  const url = window.location.href;
  const titleAndUrl = `زاد - القرآن والأذكار والأدعية ${url}`;
  document.querySelector('#share-whatsapp').href =
    `https://api.whatsapp.com/send?text=${encodeURIComponent(titleAndUrl)}`;
  const telegram = new URL('https://t.me/share/url');
  telegram.searchParams.set('url', url);
  telegram.searchParams.set('text', appShareText);
  document.querySelector('#share-telegram').href = telegram.href;
}

async function showShareFallback(message = '') {
  prepareShareLinks();
  shareModalStatus.textContent = message;
  const developerModal = document.querySelector('#developer-modal');
  if (developerModal.classList.contains('show')) {
    const hidden = new Promise((resolve) => {
      developerModal.addEventListener('hidden.bs.modal', resolve, { once: true });
    });
    bootstrap.Modal.getInstance(developerModal)?.hide();
    await hidden;
  }
  bootstrap.Modal.getOrCreateInstance(shareModalElement).show();
}

function showShareToast() {
  shareToast.hidden = false;
  window.clearTimeout(shareToastTimer);
  shareToastTimer = window.setTimeout(() => {
    shareToast.hidden = true;
  }, 2600);
}

async function copyShareUrl() {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch (error) {
      console.warn('Clipboard API could not copy the share URL; trying the browser fallback.', error);
    }
  }

  const copyField = document.createElement('textarea');
  copyField.value = url;
  copyField.setAttribute('readonly', '');
  copyField.style.position = 'fixed';
  copyField.style.opacity = '0';
  document.body.append(copyField);
  copyField.select();
  const copied = document.execCommand('copy');
  copyField.remove();
  if (!copied) throw new Error('تعذر نسخ الرابط. انسخه من شريط العنوان.');
}

developerShareButton.addEventListener('click', async () => {
  developerShareStatus.className = 'developer-share-status';
  developerShareStatus.textContent = '';
  const shareData = {
    title: 'زاد - القرآن والأذكار والأدعية',
    text: appShareText,
    url: window.location.href,
  };
  if (typeof navigator.share !== 'function') {
    await showShareFallback();
    return;
  }

  try {
    await navigator.share(shareData);
    developerShareStatus.classList.add('is-success');
    developerShareStatus.textContent = 'شكراً لمشاركتك زاد.';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    await showShareFallback('تعذرت المشاركة المباشرة. اختر وسيلة مشاركة بديلة.');
  }
});

document.querySelector('#share-copy-link').addEventListener('click', async () => {
  try {
    await copyShareUrl();
    shareModalStatus.textContent = '';
    showShareToast();
  } catch (error) {
    shareModalStatus.textContent = error instanceof Error
      ? error.message
      : 'تعذر نسخ الرابط. حاول مرة أخرى.';
  }
});

feedbackModalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!feedbackModalForm.reportValidity()) return;
  const message = sanitizePlainText(feedbackModalMessage.value, 2000).trim();
  const category = document.querySelector('#feedback-modal-category').value;
  if (!message || message.length > 2000
    || !['suggestion', 'note', 'complaint'].includes(category)) {
    feedbackModalMessage.setCustomValidity('اكتب رسالتك قبل الإرسال.');
    feedbackModalForm.reportValidity();
    feedbackModalMessage.setCustomValidity('');
    return;
  }

  const cooldownSeconds = startRequestCooldown('feedback', 8000);
  if (cooldownSeconds) {
    feedbackModalStatus.className = 'feedback-modal-status is-error';
    feedbackModalStatus.textContent = `انتظر ${cooldownSeconds} ثوانٍ قبل إرسال رسالة أخرى.`;
    return;
  }

  feedbackModalSubmit.disabled = true;
  feedbackModalSubmit.textContent = 'جارٍ إرسال رسالتك...';
  feedbackModalStatus.className = 'feedback-modal-status';
  feedbackModalStatus.textContent = '';
  try {
    await sendFeedback(category, message, feedbackModalForm);

    feedbackModalForm.reset();
    delete feedbackModalForm.dataset.requestId;
    feedbackModalStatus.classList.add('is-success');
    feedbackModalStatus.textContent = 'تم إرسال ملاحظتك بنجاح، شكراً لمشاركتك!';
  } catch (error) {
    feedbackModalStatus.classList.add('is-error');
    feedbackModalStatus.textContent = 'تعذر الاتصال بالخادم. حاول مرة أخرى لاحقاً.';
  } finally {
    feedbackModalSubmit.disabled = false;
    feedbackModalSubmit.textContent = 'إرسال للمراجعة';
  }
});

const supportPrompt = document.querySelector('#support-prompt');
const supportPromptClose = document.querySelector('#closeBtn');
const SUPPORT_PROMPT_MIN_DELAY = 10 * 60 * 1000;
const SUPPORT_PROMPT_MAX_DELAY = 25 * 60 * 1000;
function getNextSupportPromptDelay() {
  return SUPPORT_PROMPT_MIN_DELAY
    + Math.floor(Math.random() * (SUPPORT_PROMPT_MAX_DELAY - SUPPORT_PROMPT_MIN_DELAY + 1));
}
let supportPromptRemaining = getNextSupportPromptDelay();
let supportPromptStartedAt = 0;
let supportPromptTimer = 0;

function displaySupportPrompt() {
  supportPromptTimer = 0;
  supportPromptStartedAt = 0;
  if (supportModalElement?.classList.contains('show')) {
    scheduleNextSupportPrompt();
    return;
  }
  supportPrompt.hidden = false;
}

function startSupportPromptTimer() {
  if (!supportPrompt.hidden || supportPromptTimer || document.visibilityState !== 'visible') return;
  supportPromptStartedAt = performance.now();
  supportPromptTimer = window.setTimeout(displaySupportPrompt, supportPromptRemaining);
}

function scheduleNextSupportPrompt() {
  if (supportPromptTimer) window.clearTimeout(supportPromptTimer);
  supportPromptTimer = 0;
  supportPromptStartedAt = 0;
  supportPromptRemaining = getNextSupportPromptDelay();
  startSupportPromptTimer();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (supportPromptTimer) {
      window.clearTimeout(supportPromptTimer);
      supportPromptTimer = 0;
      supportPromptRemaining = Math.max(0, supportPromptRemaining - (performance.now() - supportPromptStartedAt));
      supportPromptStartedAt = 0;
    }
  } else {
    startSupportPromptTimer();
  }
});

supportPromptClose.addEventListener('click', () => {
  supportPrompt.hidden = true;
  scheduleNextSupportPrompt();
});

document.querySelector('#support-prompt-open').addEventListener('click', () => {
  supportPrompt.hidden = true;
  showSupportModal();
});

supportModalElement.addEventListener('hidden.bs.modal', scheduleNextSupportPrompt);

startSupportPromptTimer();

if (supportPaymentForm && supportPaymentMethod && supportPhoneField && supportPhoneInput) {
  const updateSupportPaymentFields = () => {
    const requiresPhone = supportPaymentMethod.value !== 'instapay';
    supportPhoneField.hidden = !requiresPhone;
    supportPhoneInput.required = requiresPhone;
    if (!requiresPhone) supportPhoneInput.value = '';
  };
  supportPaymentMethod.addEventListener('change', updateSupportPaymentFields);
  updateSupportPaymentFields();

  supportPaymentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supportPaymentForm.reportValidity()) return;
    const submitButton = document.querySelector('#support-payment-submit');
    const status = document.querySelector('#support-payment-status');
    const name = sanitizePlainText(document.querySelector('#support-name').value, 120).trim();
    const email = sanitizePlainText(document.querySelector('#support-email').value, 254).trim();
    const phone = sanitizePlainText(supportPhoneInput.value, 24).trim();
    const amount = Number(document.querySelector('#support-amount').value);
    const method = supportPaymentMethod.value;
    if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
      || (phone && !/^\+?[0-9]{8,15}$/.test(phone))
      || ![50, 100, 250, 500].includes(amount)
      || !['card', 'vodafone_cash', 'etisalat_cash', 'orange_cash', 'instapay'].includes(method)) {
      status.textContent = 'تحقق من طول البيانات المدخلة وحاول مرة أخرى.';
      return;
    }

    const cooldownSeconds = startRequestCooldown('payment', 10000);
    if (cooldownSeconds) {
      status.textContent = `انتظر ${cooldownSeconds} ثوانٍ قبل بدء طلب دفع آخر.`;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'جارٍ تجهيز الدفع الآمن...';
    status.textContent = '';
    try {
      const response = await fetchApp('create-payment.php', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          method,
          name,
          email,
          phone,
        }),
        credentials: 'same-origin',
        cache: 'no-store',
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('خدمة الدفع أعادت استجابة غير صالحة. حاول مرة أخرى لاحقاً.');
      }
      if (!response.ok || typeof result.redirectUrl !== 'string') {
        throw new Error(typeof result.error === 'string' ? result.error : 'تعذر بدء عملية الدفع.');
      }
      const checkoutUrl = new URL(result.redirectUrl);
      if (checkoutUrl.protocol !== 'https:') {
        throw new Error('رابط الدفع الآمن غير صالح.');
      }
      window.location.assign(checkoutUrl.href);
    } catch (error) {
      status.textContent = 'تعذر الاتصال بخدمة الدفع. حاول مرة أخرى لاحقاً.';
      submitButton.disabled = false;
      submitButton.textContent = 'المتابعة إلى الدفع الآمن';
    }
  });
}

function updateAzkarProgress(total = 0) {
  const count = [...trackedZikrKeys].reduce((sum, key) => sum + (Number.isInteger(zikrCounts[key]) ? zikrCounts[key] : 0), 0);
  const percent = total ? Math.min(100, Math.round(count / total * 100)) : 0;
  document.querySelector('#azkar-progress-label').textContent = `${percent}% مكتمل اليوم`;
  document.querySelector('#azkar-progress-count').textContent = `${count} من ${total}`;
  const progress = document.querySelector('.daily-progress .progress');
  progress.setAttribute('aria-valuenow', String(percent));
  document.querySelector('#azkar-progress-bar').style.width = `${percent}%`;
}

function saveAzkarProgress() {
  writeStorage(STORAGE_KEYS.azkarCounts, { date: azkarDate, counts: zikrCounts });
}

function scheduleAzkarReset() {
  window.clearTimeout(azkarResetTimer);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  azkarResetTimer = window.setTimeout(() => {
    azkarDate = getLocalDateKey();
    zikrCounts = {};
    saveAzkarProgress();
    if (azkarData) renderAzkar(azkarData);
    scheduleAzkarReset();
  }, midnight.getTime() - now.getTime() + 50);
}

scheduleAzkarReset();

function renderDuas(value) {
  const entries = Array.isArray(value) && value.length ? value : defaultDuas;
  duas = entries.map((entry, index) => {
    const record = Array.isArray(entry) ? entry[1] : entry;
    return {
      id: String(index),
      title: firstText(record, ['title', 'name', 'العنوان']) || `دعاء ${index + 1}`,
      category: firstText(record, ['category', 'section', 'القسم']) || 'أدعية عامة',
      text: firstText(record, ['text', 'content', 'dua', 'النص', 'الدعاء']) || record,
    };
  }).filter((dua) => dua.text);

  const categories = [...new Set(duas.map((dua) => dua.category))];
  const selectedCategory = duasFilter?.value || '';
  if (duasFilter) {
    duasFilter.replaceChildren(new Option('كل الأقسام', ''));
    categories.forEach((category) => duasFilter.add(new Option(category, category)));
    if (categories.includes(selectedCategory)) duasFilter.value = selectedCategory;
  }
  drawDuas();
  displayRandomDua();
}

function displayRandomDua() {
  const sources = duas.length ? duas : defaultDuas;
  if (!sources.length) return;
  const item = sources[Math.floor(Math.random() * sources.length)];
  const titleElement = document.querySelector('#dua-random-title');
  const textElement = document.querySelector('#dua-random-text');
  if (titleElement) titleElement.textContent = item.title || 'دعاء عشوائي';
  if (textElement) textElement.textContent = item.text || '';
}

function drawDuas() {
  const query = duasSearch && duasSearch.value ? duasSearch.value.trim().toLocaleLowerCase('ar') : '';
  const filtered = duas.filter((dua) => (!duasFilter || !duasFilter.value || dua.category === duasFilter.value)
    && `${dua.title} ${dua.category} ${dua.text}`.toLocaleLowerCase('ar').includes(query));
  if (!filtered.length) {
    const fallback = duas.length ? 'لا توجد أدعية تطابق البحث.' : 'لا توجد أدعية متاحة حالياً. تم عرض دعاء افتراضي.';
    if (duasList) showEmpty(duasList, fallback, 'empty-message');
    return;
  }
  const fragment = document.createDocumentFragment();
  filtered.forEach((dua) => {
    const card = document.createElement('details');
    card.className = 'dua-card';
    const summary = document.createElement('summary');
    summary.className = 'dua-summary';
    const title = document.createElement('span');
    title.textContent = dua.title;
    const category = document.createElement('span');
    category.className = 'dua-category';
    category.textContent = dua.category;
    summary.append(title, category);
    const content = document.createElement('div');
    content.className = 'dua-content';
    const text = document.createElement('p');
    text.textContent = dua.text;
    const copy = document.createElement('button');
    copy.className = 'btn btn-sm btn-outline-success';
    copy.type = 'button';
    copy.textContent = 'نسخ الدعاء';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(dua.text);
        copy.textContent = 'تم النسخ';
      } catch (error) {
        copy.textContent = 'تعذر النسخ';
        console.warn('Could not copy dua text:', error);
      }
      window.setTimeout(() => { copy.textContent = 'نسخ الدعاء'; }, 1600);
    });
    content.append(text, copy);
    card.append(summary, content);
    fragment.append(card);
  });
  if (duasList) duasList.replaceChildren(fragment);
}

const randomDuaButton = document.querySelector('#random-dua-button');
if (randomDuaButton) {
  randomDuaButton.addEventListener('click', displayRandomDua);
}
if (duasSearch) duasSearch.addEventListener('input', debounce(() => {
  duasSearch.value = sanitizePlainText(duasSearch.value, 120);
  drawDuas();
}, 180));
if (duasFilter) duasFilter.addEventListener('change', drawDuas);

function buildSafePointSnapshot() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    bookmarks,
    lastRead: readStorage(STORAGE_KEYS.lastRead, { page: currentPage || 1 }),
    nightMode,
    brightness,
    preferences,
    notes: userNotes,
    tasbeeh: tasbeehState,
    azkarCounts: { date: azkarDate, counts: zikrCounts },
    reminders,
  };
}

function createSafePoint() {
  const snapshot = buildSafePointSnapshot();
  writeStorage(STORAGE_KEYS.safePoint, snapshot);
  const status = document.querySelector('#safe-point-status');
  if (status) status.textContent = 'تم إنشاء نقطة آمنة. يمكنك استعادتها في أي وقت.';
}

function restoreSafePoint() {
  const snapshot = readStorage(STORAGE_KEYS.safePoint, null);
  const status = document.querySelector('#safe-point-status');
  if (!snapshot) {
    if (status) status.textContent = 'لا توجد نقطة آمنة محفوظة على هذا الجهاز.';
    return;
  }
  const nextPreferences = snapshot.preferences ?? { quranTheme: 'paper', fontSize: 16, arabicFont: 'system' };
  const nextNotes = typeof snapshot.notes === 'string' ? snapshot.notes : '';

  bookmarks = Array.isArray(snapshot.bookmarks) ? snapshot.bookmarks : [];
  writeStorage(STORAGE_KEYS.bookmarks, bookmarks);
  writeStorage(STORAGE_KEYS.lastRead, snapshot.lastRead ?? { page: currentPage || 1 });
  nightMode = Boolean(snapshot.nightMode);
  brightness = Number.isFinite(snapshot.brightness) ? snapshot.brightness : 100;
  preferences = nextPreferences;
  userNotes = nextNotes;
  tasbeehState = snapshot.tasbeeh ?? { phrase: 'سبحان الله', count: 0, counts: {} };
  reminders = snapshot.reminders ?? { email: '', quran: '', morning: '', evening: '', lastSent: {} };
  azkarDate = snapshot.azkarCounts?.date || getLocalDateKey();
  zikrCounts = snapshot.azkarCounts?.counts || {};

  writeStorage(STORAGE_KEYS.nightMode, nightMode);
  writeStorage(STORAGE_KEYS.brightness, brightness);
  writeStorage(STORAGE_KEYS.preferences, preferences);
  writeStorage(STORAGE_KEYS.notes, userNotes);
  writeStorage(STORAGE_KEYS.tasbeeh, tasbeehState);
  writeStorage(STORAGE_KEYS.reminders, reminders);
  writeStorage(STORAGE_KEYS.azkarCounts, { date: azkarDate, counts: zikrCounts });

  document.body.classList.toggle('night-mode', nightMode);
  if (brightnessRange) brightnessRange.value = String(brightness);
  if (status) status.textContent = 'تمت استعادة نقطة الأمان بنجاح. سيتم تحديث التطبيق.';
  window.location.reload();
}

document.querySelector('#safe-point-create')?.addEventListener('click', createSafePoint);
document.querySelector('#safe-point-restore')?.addEventListener('click', restoreSafePoint);

document.querySelector('#backup-export').addEventListener('click', () => {
  const backup = buildSafePointSnapshot();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `zad-backup-${getLocalDateKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector('#backup-import-trigger').addEventListener('click', () => {
  document.querySelector('#backup-import-file').click();
});
document.querySelector('#backup-import-file').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  const status = document.querySelector('#reminder-status');
  try {
    if (file.size > 1024 * 1024) throw new Error('حجم ملف النسخة الاحتياطية يتجاوز الحد المسموح (1 ميغابايت).');
    const backup = JSON.parse(await file.text());
    if (!backup || ![1, 2].includes(backup.version) || !Array.isArray(backup.bookmarks)
      || backup.bookmarks.length > 500
      || !Number.isInteger(backup.brightness) || typeof backup.nightMode !== 'boolean'
      || !backup.tasbeeh || typeof backup.tasbeeh !== 'object'
      || !backup.azkarCounts || typeof backup.azkarCounts !== 'object'
      || !backup.reminders || typeof backup.reminders !== 'object'
      || !backup.lastRead || !Number.isInteger(backup.lastRead.page)
      || !backup.azkarCounts.counts || typeof backup.azkarCounts.counts !== 'object'
      || (backup.version === 2 && (!backup.preferences || typeof backup.preferences !== 'object'
        || typeof backup.notes !== 'string'))) {
      throw new Error('ملف النسخة الاحتياطية لا يطابق الصيغة المطلوبة.');
    }
    if (backup.bookmarks.some((bookmark) => !bookmark || typeof bookmark !== 'object'
      || !Number.isInteger(bookmark.page) || bookmark.page < 1 || bookmark.page > 604
      || (bookmark.name !== undefined && (typeof bookmark.name !== 'string' || bookmark.name.length > 70)))) {
      throw new Error('تحتوي النسخة الاحتياطية على علامة مرجعية غير صالحة.');
    }
    const importedPreferences = backup.preferences ?? { quranTheme: 'paper', fontSize: 16, arabicFont: 'system' };
    const importedNotes = backup.notes ?? '';
    const imported = [
      [STORAGE_KEYS.bookmarks, backup.bookmarks],
      [STORAGE_KEYS.lastRead, backup.lastRead],
      [STORAGE_KEYS.nightMode, backup.nightMode],
      [STORAGE_KEYS.brightness, backup.brightness],
      [STORAGE_KEYS.tasbeeh, backup.tasbeeh],
      [STORAGE_KEYS.azkarCounts, backup.azkarCounts],
      [STORAGE_KEYS.reminders, backup.reminders],
      [STORAGE_KEYS.preferences, importedPreferences],
      [STORAGE_KEYS.notes, importedNotes],
    ];
    if (imported.some(([, value]) => serializeStoredJson(value) === null)) {
      throw new Error('تحتوي النسخة الاحتياطية على بيانات تتجاوز حدود التخزين الآمن.');
    }
    const saved = imported.every(([key, value]) => writeStorage(key, value));
    if (!saved) throw new Error('تعذر حفظ بعض البيانات المستوردة في مساحة التخزين.');
    status.textContent = 'تم استيراد النسخة. سيتم تحديث التطبيق الآن.';
    window.location.reload();
  } catch (error) {
    status.textContent = `تعذر استيراد النسخة: ${error.message}`;
    status.className = 'settings-note is-warning';
  } finally {
    input.value = '';
  }
});

function targetForZikr(text) {
  const match = normalizeDigits(text).match(/\((\d+)\s*مر(?:ة|ات)\)/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function renderAzkar(value) {
  if (azkarDate !== getLocalDateKey()) {
    azkarDate = getLocalDateKey();
    zikrCounts = {};
  }
  const categories = recordsOf(value);
  if (!categories.length) {
    showEmpty(azkarList, 'لا توجد أذكار متاحة حالياً.');
    updateAzkarProgress();
    return;
  }

  const fragment = document.createDocumentFragment();
  let totalTarget = 0;
  trackedZikrKeys = new Set();
  categories.forEach(([key, items], categoryIndex) => {
    const records = Array.isArray(items) ? items : [items];
    const accordionItem = document.createElement('article');
    accordionItem.className = 'accordion-item azkar-category';
    const heading = document.createElement('h2');
    heading.className = 'accordion-header';
    const button = document.createElement('button');
    button.className = 'accordion-button collapsed';
    button.type = 'button';
    button.dataset.bsToggle = 'collapse';
    button.dataset.bsTarget = `#azkar-category-${categoryIndex}`;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `azkar-category-${categoryIndex}`);
    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = categoryTitle(key);
    const categoryCount = document.createElement('span');
    categoryCount.className = 'category-count';
    categoryCount.textContent = `${records.length} ${key === 'asma_al_husna' ? 'اسماً' : 'ذكراً'}`;
    button.append(name, categoryCount);
    heading.append(button);

    const panel = document.createElement('div');
    panel.id = `azkar-category-${categoryIndex}`;
    panel.className = 'accordion-collapse collapse';
    const body = document.createElement('div');
    body.className = 'accordion-body azkar-items';
    records.forEach((record, itemIndex) => {
      const text = typeof record === 'string'
        ? record
        : firstText(record, ['text', 'content', 'zekr', 'ذكر', 'النص']);
      if (!text) return;
      const counterKey = `${key}:${itemIndex}`;
      const target = targetForZikr(text);
      const count = Number.isInteger(zikrCounts[counterKey])
        ? Math.max(0, Math.min(target, zikrCounts[counterKey]))
        : 0;
      zikrCounts[counterKey] = count;
      if (key !== 'asma_al_husna') {
        totalTarget += target;
        trackedZikrKeys.add(counterKey);
      }
      const zikrCard = document.createElement('article');
      zikrCard.className = 'zikr-card';
      zikrCard.classList.toggle('is-completed', count >= target);
      const zikrText = document.createElement('p');
      zikrText.className = 'zikr-text';
      zikrText.textContent = text;
      const counter = document.createElement('button');
      counter.className = 'zikr-counter';
      counter.type = 'button';
      counter.disabled = count >= target;
      counter.setAttribute('aria-label', `العدد ${count} من ${target}`);
      const countLabel = document.createElement('span');
      countLabel.className = 'counter-remaining';
      countLabel.textContent = `${count}/${target}`;
      const targetLabel = document.createElement('span');
      targetLabel.className = 'counter-target';
      targetLabel.textContent = count >= target ? 'مكتمل' : 'اضغط للعد';
      counter.append(countLabel, targetLabel);
      counter.addEventListener('click', (event) => {
        event.stopPropagation();
        const nextCount = Math.min(target, (zikrCounts[counterKey] || 0) + 1);
        zikrCounts[counterKey] = nextCount;
        countLabel.textContent = `${nextCount}/${target}`;
        targetLabel.textContent = nextCount >= target ? 'مكتمل' : 'اضغط للعد';
        counter.disabled = nextCount >= target;
        counter.setAttribute('aria-label', `العدد ${nextCount} من ${target}`);
        zikrCard.classList.toggle('is-completed', nextCount >= target);
        saveAzkarProgress();
        updateAzkarProgress(totalTarget);
      });
      zikrCard.append(zikrText, counter);
      body.append(zikrCard);
    });
    panel.append(body);
    accordionItem.append(heading, panel);
    fragment.append(accordionItem);
  });
  azkarList.replaceChildren(fragment);
  saveAzkarProgress();
  updateAzkarProgress(totalTarget);
}

function updateTasbeehDisplay() {
  tasbeehPhraseElement.textContent = tasbeehState.phrase;
  tasbeehCountElement.textContent = String(tasbeehState.count);
  document.querySelectorAll('.tasbeeh-phrase-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.phrase === tasbeehState.phrase);
    button.setAttribute('aria-pressed', String(button.dataset.phrase === tasbeehState.phrase));
  });
}

function renderTasbeeh(value) {
  tasbeehPhrases = recordsOf(value)
    .map(([, record]) => firstText(record, ['text', 'phrase', 'name', 'ذكر', 'النص']) || asText(record))
    .filter(Boolean);
  document.querySelector('#tasbeeh-phrase-count').textContent = `${tasbeehPhrases.length} صيغة`;
  if (!tasbeehPhrases.length) {
    showEmpty(tasbeehList, 'لا توجد صيغ تسبيح في البيانات.');
    updateTasbeehDisplay();
    return;
  }

  if (!tasbeehPhrases.includes(tasbeehState.phrase)) {
    tasbeehState.phrase = tasbeehPhrases[0];
    tasbeehState.count = Number.isInteger(tasbeehState.counts[tasbeehState.phrase])
      ? tasbeehState.counts[tasbeehState.phrase]
      : 0;
  }
  const fragment = document.createDocumentFragment();
  tasbeehPhrases.forEach((phrase) => {
    const button = document.createElement('button');
    button.className = 'tasbeeh-phrase-button';
    button.type = 'button';
    button.dataset.phrase = phrase;
    button.setAttribute('aria-pressed', String(phrase === tasbeehState.phrase));
    const text = document.createElement('span');
    text.textContent = phrase;
    const savedCount = document.createElement('span');
    savedCount.className = 'phrase-saved-count';
    savedCount.textContent = String(Number.isInteger(tasbeehState.counts[phrase]) ? tasbeehState.counts[phrase] : 0);
    button.append(text, savedCount);
    button.addEventListener('click', () => {
      tasbeehState.phrase = phrase;
      tasbeehState.count = Number.isInteger(tasbeehState.counts[phrase]) ? tasbeehState.counts[phrase] : 0;
      writeStorage(STORAGE_KEYS.tasbeeh, tasbeehState);
      updateTasbeehDisplay();
    });
    fragment.append(button);
  });
  tasbeehList.replaceChildren(fragment);
  updateTasbeehDisplay();
}

document.querySelector('#tasbeeh-increment').addEventListener('click', () => {
  tasbeehState.count += 1;
  tasbeehState.counts[tasbeehState.phrase] = tasbeehState.count;
  writeStorage(STORAGE_KEYS.tasbeeh, tasbeehState);
  updateTasbeehDisplay();
});
document.querySelector('#tasbeeh-reset').addEventListener('click', () => {
  tasbeehState.count = 0;
  tasbeehState.counts[tasbeehState.phrase] = 0;
  writeStorage(STORAGE_KEYS.tasbeeh, tasbeehState);
  updateTasbeehDisplay();
});

async function fetchData() {
  const sources = ['api.php', 'data.json'];
  let lastError;
  for (const source of sources) {
    try {
      const response = await fetchApp(source, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`${source} returned HTTP ${response.status}`);
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${source} did not return a JSON object`);
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to load application data');
}

async function loadQuranTextSearchData() {
  try {
    const response = await fetchApp('quran-text.json', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`quran-text.json returned HTTP ${response.status}`);
    const data = await response.json();
    if (data?.schemaVersion !== 1 || data?.edition !== 'quran-uthmani'
      || data?.ayahCount !== 6236 || !Array.isArray(data.ayahs)) {
      throw new Error('The local Quran text database has an unexpected format.');
    }
    quranSearchIndex = buildQuranSearchIndex(data.ayahs);
    const indexedAyahCount = quranSearchIndex.reduce((total, group) => total + group.ayahs.length, 0);
    if (indexedAyahCount !== 6236) throw new Error('The local Quran text database is incomplete.');
    quranAyahs = quranSearchIndex.flatMap((group) => group.ayahs.map((ayah) => ({
      ...ayah,
      key: `${ayah.surah}:${ayah.ayah}`,
    })));
    const uniquePhrases = new Map();
    quranAyahs.forEach((ayah) => {
      const words = wordsInAyah(ayah);
      for (let index = 0; index <= words.length - 3; index += 1) {
        const phraseWords = words.slice(index, index + 3);
        const key = phraseKey(phraseWords);
        if (key && !uniquePhrases.has(key)) {
          uniquePhrases.set(key, { key, words: phraseWords, text: phraseWords.join(' ') });
        }
      }
    });
    quranPhraseBank = [...uniquePhrases.values()];
    quranSearchReady = true;
    renderQuranSearchResults();
  } catch (error) {
    quranSearchStatus.textContent = 'تعذر تحميل قاعدة نص القرآن المحلية؛ تحقق من ملف quran-text.json.';
    quranSearchReady = false;
    console.error('Failed to load local Quran search data:', error);
  }
}

const quranSearchLoadPromise = loadQuranTextSearchData();

try {
  const data = await fetchData();
  quranData = data.quran ?? data.Quran ?? {};
  pageCount = Number.isInteger(quranData.pageCount) ? quranData.pageCount : 604;
  pageUrlTemplate = typeof quranData.pageUrlTemplate === 'string' ? quranData.pageUrlTemplate : '';
  surahs = recordsOf(quranData.surahs).map(([key, record], index) => ({
    id: Number(record?.id ?? key) || index + 1,
    name: firstText(record, ['name', 'name_arabic', 'name_ar', 'title']) || `السورة ${index + 1}`,
    page: Number(record?.page ?? record?.startPage) || index + 1,
    endPage: Number(record?.endPage) || undefined,
  })).sort((left, right) => left.id - right.id);
  juzs = recordsOf(quranData.juzs).map(([key, record], index) => ({
    id: Number(record?.id ?? key) || index + 1,
    name: firstText(record, ['name', 'title']) || `الجزء ${index + 1}`,
    page: Number(record?.page ?? record?.startPage) || index + 1,
  })).sort((left, right) => left.id - right.id);
  if (quranSearchReady && quranTextSearchInput.value) renderQuranSearchResults();

  const savedPosition = readStorage(STORAGE_KEYS.lastRead, { page: 1 });
  const initialPage = Number.isInteger(savedPosition?.page) && savedPosition.page >= 1 && savedPosition.page <= pageCount
    ? savedPosition.page
    : 1;
  updatePagePosition(initialPage, { persist: false });
  renderIndex();
  azkarData = data.azkar ?? data.Azkar;
  renderAzkar(azkarData);
  renderTasbeeh(data.tasbeeh ?? data.Tasbeeh);
  try {
    const duasResponse = await fetchApp('duas.json', { headers: { Accept: 'application/json' } });
    if (!duasResponse.ok) throw new Error(`duas.json returned HTTP ${duasResponse.status}`);
    renderDuas(await duasResponse.json());
  } catch (error) {
    showEmpty(duasList, `تعذر تحميل ملف الأدعية: ${error.message}`, 'empty-message');
    console.error('Failed to load duas.json:', error);
  }
  statusElement.textContent = 'تم تحميل بيانات التطبيق.';
  statusElement.className = 'load-status is-success';
  await quranSearchLoadPromise;
  window.__zadHydrationState = { ...window.__zadHydrationState, quran: true };
  window.dispatchEvent(new Event('zad:quran-ready'));
} catch (error) {
  statusElement.textContent = `تعذر تحميل البيانات: ${error.message}. شغّل التطبيق عبر خادم محلي.`;
  statusElement.className = 'load-status is-warning';
  showEmpty(indexList, 'تعذر تحميل فهرس المصحف.');
  showEmpty(azkarList, 'تعذر تحميل الأذكار.');
  showEmpty(tasbeehList, 'تعذر تحميل صيغ التسبيح.');
  showEmpty(duasList, 'تعذر تحميل ملف الأدعية.');
  quizStatus.textContent = 'تعذر تحميل بيانات القرآن؛ لا يمكن بدء اختبار الحفظ حالياً.';
  console.error('Failed to load application data:', error);
  window.__zadHydrationState = { ...window.__zadHydrationState, quran: true };
  window.dispatchEvent(new Event('zad:quran-ready'));
}

if (quranSearchReady && surahs.length) initializeQuranQuiz();

try {
  if (localStorage.getItem('hasCompletedTour') !== 'true') {
    window.setTimeout(startOnboardingTour, 650);
  }
} catch (error) {
  console.warn('Could not check onboarding tour completion:', error);
}
