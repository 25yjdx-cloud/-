import { useEffect } from 'react';
import Footer from './Footer.jsx';
import Header from './Header.jsx';
import LegacyMarkup from './LegacyMarkup.jsx';
import Modals from './Modals.jsx';
import QuranReader from './QuranReader.jsx';
import Settings from './Settings.jsx';

function MainNavigation() {
  return <LegacyMarkup selector=".main-navigation" />;
}

function OtherSections() {
  return (
    <>
      <LegacyMarkup selector="#azkar-panel" />
      <LegacyMarkup selector="#tasbeeh-panel" />
      <LegacyMarkup selector="#duas-panel" />
    </>
  );
}

function MobileNavigation() {
  return <LegacyMarkup selector=".mobile-bottom-nav" />;
}

export default function App() {
  useEffect(() => {
    import('../legacy/app.js');
  }, []);

  return (
    <>
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
