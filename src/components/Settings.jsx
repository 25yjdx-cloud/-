import { getSettingsMarkupParts } from './legacyMarkup.js';
import AppVersion from './AppVersion.jsx';
import SupportCard from './SupportCard.jsx';

export default function Settings() {
  const parts = getSettingsMarkupParts();
  return (
    <div className="modal fade" id="settings-modal" tabIndex="-1" aria-labelledby="settings-title" aria-hidden="true">
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
        <div className="modal-content settings-modal-content">
          <div className="modal-header" dangerouslySetInnerHTML={{ __html: parts.header }} />
          <div className="modal-body settings-body">
            <div dangerouslySetInnerHTML={{ __html: parts.beforeSupport }} />
            <SupportCard />
            <div dangerouslySetInnerHTML={{ __html: parts.afterSupport }} />
            <AppVersion />
          </div>
        </div>
      </div>
    </div>
  );
}
