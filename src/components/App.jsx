import { useEffect } from 'react';
import Footer from './Footer.jsx';
import Header from './Header.jsx';
import LegacyMarkup from './LegacyMarkup.jsx';
import Modals from './Modals.jsx';
import QuranReader from './QuranReader.jsx';
import Settings from './Settings.jsx';
import SelfAccountability from './SelfAccountability.jsx';

function MainNavigation() {
  return <LegacyMarkup selector=".main-navigation" />;
}

function OtherSections() {
  return (
    <>
      <LegacyMarkup selector="#azkar-panel" />
      <LegacyMarkup selector="#tasbeeh-panel" />
      <LegacyMarkup selector="#duas-panel" />
      <LegacyMarkup selector="#telegram-panel" />
      <SelfAccountability />
    </>
  );
}

function MobileNavigation() {
  return <LegacyMarkup selector=".mobile-bottom-nav" />;
}

export default function App() {
  useEffect(() => {
    const splash = document.querySelector('#app-splash');
    const ready = {
      quran: window.__zadHydrationState?.quran === true,
      profile: window.__zadHydrationState?.profile === true,
    };
    let hideTimer = 0;
    let fallbackTimer = 0;
    let splashFinished = false;

    function finishSplash() {
      if (splashFinished || !ready.quran || !ready.profile || !splash) return;
      splashFinished = true;
      window.cancelAnimationFrame(hideTimer);
      hideTimer = window.requestAnimationFrame(() => {
        splash.classList.add('is-hidden');
        fallbackTimer = window.setTimeout(() => splash.remove(), 500);
      });
    }

    function markReady(part) {
      ready[part] = true;
      finishSplash();
    }

    const onQuranReady = () => markReady('quran');
    const onProfileReady = () => markReady('profile');
    window.addEventListener('zad:quran-ready', onQuranReady);
    window.addEventListener('zad:profile-ready', onProfileReady);
    finishSplash();
    import('../legacy/app.js').catch((error) => {
      console.error('Could not initialize Zad application features:', error);
      markReady('quran');
    });
    const fallback = window.setTimeout(() => {
      markReady('quran');
      markReady('profile');
    }, 15000);
    return () => {
      window.removeEventListener('zad:quran-ready', onQuranReady);
      window.removeEventListener('zad:profile-ready', onProfileReady);
      window.clearTimeout(fallback);
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(hideTimer);
    };
  }, []);

  return (
    <>
      <LegacyMarkup selector="#app-sidebar" />
      <Header />
      <main className="container app-shell">
        <MainNavigation />
        <LegacyMarkup selector="#load-status" />
        <div className="tab-content">
          <QuranReader />
          <OtherSections />
        </div>
      </main>
      <Footer />
      <Settings />
      <Modals />
      <MobileNavigation />
    </>
  );
}
