import { APP_VERSION } from '../config/appVersion.js';

export default function AppVersion({ className = 'app-version' }) {
  return (
    <p className={className} aria-label={`إصدار التطبيق ${APP_VERSION}`}>
      إصدار التطبيق <strong>v{APP_VERSION}</strong>
    </p>
  );
}
