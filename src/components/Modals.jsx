import LegacyMarkup from './LegacyMarkup.jsx';
import AccountModal from './AccountModal.jsx';

const modalSelectors = [
  '#developer-modal',
  '#share-modal',
  '#bookmarks-modal',
  '#feedback-modal',
  '#support-modal',
  '#telegram-promo-modal',
  '#telegram-success-modal',
  '#memorization-modal',
];

export default function Modals() {
  return (
    <>
      <AccountModal />
      {modalSelectors.map((selector) => <LegacyMarkup key={selector} selector={selector} />)}
      <LegacyMarkup selector="#onboarding-tour" />
      <LegacyMarkup selector="#support-prompt" />
      <LegacyMarkup selector="#share-toast" />
    </>
  );
}
