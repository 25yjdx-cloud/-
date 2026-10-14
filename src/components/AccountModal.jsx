import { useEffect, useState } from 'react';
import { appUrl, fetchApp } from '../services/appUrl.js';
import { parseStoredJson, serializeStoredJson } from '../services/storage.js';

const MAX_NAME_LENGTH = 80;
const DEMO_PROFILE_KEY = 'zad.demoProfile';
const TELEGRAM_BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
const TELEGRAM_BOT_CONFIGURED = /^[A-Za-z0-9_]{5,32}$/.test(TELEGRAM_BOT_USERNAME);
const TELEGRAM_START_URL = TELEGRAM_BOT_CONFIGURED
  ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=zad`
  : '';
const TELEGRAM_SUBSCRIBE_URL = TELEGRAM_BOT_CONFIGURED
  ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=subscribe`
  : '';

async function readResponse(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    throw new Error('استجابة خدمة الحساب غير صالحة.');
  }
  const serialized = await response.text();
  if (serialized.length > 64 * 1024) throw new Error('استجابة خدمة الحساب غير صالحة.');
  const payload = parseStoredJson(serialized, null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('استجابة خدمة الحساب غير صالحة.');
  }
  if (!response.ok) {
    throw new Error('تعذر إكمال طلب الحساب حالياً.');
  }
  return payload;
}

function getAvatarInitial(name) {
  return Array.from(name.trim())[0] || 'ز';
}

function readDemoProfile() {
  const profile = parseStoredJson(window.localStorage.getItem(DEMO_PROFILE_KEY), null);
  if (profile === null) return null;
  if (!profile || typeof profile !== 'object' || typeof profile.name !== 'string'
    || typeof profile.picture !== 'string' || profile.name.length > MAX_NAME_LENGTH
    || profile.picture.length > 2048 || !isSecureAvatarUrl(profile.picture)) {
    throw new Error('بيانات الملف المحلي غير صالحة. احذف بيانات الملف التجريبي ثم حاول مجدداً.');
  }
  return {
    id: 'local-demo',
    name: profile.name,
    email: '',
    picture: profile.picture,
    isDemo: true,
  };
}

function persistDemoProfile(profile) {
  const serialized = serializeStoredJson({
    name: profile.name,
    picture: profile.picture,
  });
  if (serialized === null) throw new Error('تعذر حفظ الملف التجريبي محلياً.');
  window.localStorage.setItem(DEMO_PROFILE_KEY, serialized);
}

function isSecureAvatarUrl(value) {
  if (!value) return true;
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export default function AccountModal() {
  const [account, setAccount] = useState({
    available: false,
    loading: true,
    user: null,
    csrfToken: '',
    mode: 'server',
  });
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState('');
  const [plans, setPlans] = useState({});

  useEffect(() => {
    const controller = new AbortController();

    function enableLocalMode(message = '') {
      let demoProfile = null;
      let localStatus = message;
      try {
        demoProfile = readDemoProfile();
      } catch {
        localStatus = 'تعذر استعادة الملف المحلي. يمكنك بدء ملف تجريبي جديد وحفظه على هذا الجهاز.';
      }
      setAccount({
        available: false,
        loading: false,
        user: demoProfile,
        csrfToken: '',
        mode: 'local',
      });
      setName(demoProfile?.name || '');
      setAvatarUrl(demoProfile?.picture || '');
      setStatus(localStatus);
    }

    async function loadAccount() {
      if (import.meta.env.DEV || __GITHUB_PAGES__) {
        enableLocalMode();
        return;
      }

      try {
        const response = await fetchApp('auth.php?action=me', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await readResponse(response);
        setAccount({
          available: payload.available === true,
          loading: false,
          user: payload.user || null,
          csrfToken: payload.csrfToken || '',
          mode: payload.available === true ? 'server' : 'local',
        });
        setPlans(payload.plans || {});
        setName(payload.user?.name || '');
        setAvatarUrl(payload.user?.picture || '');
        if (payload.available !== true) {
          enableLocalMode();
          return;
        }

        const authResult = new URLSearchParams(window.location.search).get('auth');
        if (authResult === 'success') {
          setStatus(payload.user
            ? 'تم تسجيل الدخول والتحقق من حساب Google بنجاح.'
            : 'لم نتمكن من استعادة جلسة الحساب. يرجى تسجيل الدخول مرة أخرى.');
        }
        if (authResult === 'failed') setStatus('تعذر التحقق من تسجيل الدخول. حاول مرة أخرى.');
        if (authResult) {
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        enableLocalMode('خدمة الحسابات غير متاحة الآن. يمكنك المتابعة بملف تجريبي محلي.');
      }
    }

    loadAccount();
    return () => controller.abort();
  }, []);

  async function submitProfile(event) {
    event.preventDefault();
    const normalizedName = name.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      setSaved(false);
      setStatus('أدخل اسماً صالحاً قبل الحفظ.');
      return;
    }
    if (normalizedName.length > MAX_NAME_LENGTH) {
      setSaved(false);
      setStatus(`يجب ألا يتجاوز الاسم ${MAX_NAME_LENGTH} حرفاً.`);
      return;
    }
    setName(normalizedName);

    if (account.mode === 'local') {
      if (!isSecureAvatarUrl(avatarUrl.trim())) {
        setSaved(false);
        setStatus('أدخل رابط صورة آمن يبدأ بـ https:// أو اتركه فارغاً.');
        return;
      }
      const demoProfile = {
        id: 'local-demo',
        name: normalizedName,
        email: '',
        picture: avatarUrl.trim(),
        isDemo: true,
      };
      try {
        persistDemoProfile(demoProfile);
        setAccount((current) => ({ ...current, user: demoProfile }));
        setName(normalizedName);
        setAvatarUrl(demoProfile.picture);
        setSaved(true);
        setStatus('تم حفظ الملف التجريبي على هذا الجهاز.');
      } catch {
        setSaved(false);
        setStatus('تعذر حفظ الملف محلياً. تحقق من مساحة التخزين في المتصفح.');
      }
      return;
    }

    try {
      const response = await fetchApp('auth.php?action=profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': account.csrfToken,
        },
        body: JSON.stringify({ name: normalizedName }),
      });
      const payload = await readResponse(response);
      setAccount((current) => ({
        ...current,
        user: { ...current.user, ...payload.user },
      }));
      setSaved(true);
      setStatus('تم تحديث بيانات ملفك في الحساب.');
    } catch {
      setSaved(false);
      setStatus('تعذر حفظ التغييرات الآن. تحقق من اتصال الحساب وحاول مجدداً.');
    }
  }

  async function signOut() {
    if (account.mode === 'local') {
      try {
        window.localStorage.removeItem(DEMO_PROFILE_KEY);
        setAccount((current) => ({ ...current, user: null }));
        setName('');
        setAvatarUrl('');
        setSaved(false);
        setStatus('تم تسجيل الخروج من الملف التجريبي على هذا الجهاز.');
      } catch {
        setStatus('تعذر تسجيل الخروج محلياً. تحقق من إعدادات التخزين في المتصفح.');
      }
      return;
    }

    try {
      const response = await fetchApp('auth.php?action=logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': account.csrfToken,
        },
        body: '{}',
      });
      await readResponse(response);
      setAccount((current) => ({ ...current, user: null, csrfToken: '' }));
      setName('');
      setAvatarUrl('');
      setSaved(false);
      setStatus('تم تسجيل الخروج من هذا الجهاز.');
    } catch {
      setStatus('تعذر تسجيل الخروج الآن. تحقق من اتصال الحساب وحاول مجدداً.');
    }
  }

  async function startCheckout(planId) {
    setCheckoutPlan(planId);
    setStatus('');
    try {
      const response = await fetchApp('auth.php?action=vip-checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': account.csrfToken,
        },
        body: JSON.stringify({ plan: planId }),
      });
      const payload = await readResponse(response);
      if (typeof payload.redirectUrl !== 'string'
        || !payload.redirectUrl.startsWith('https://accept.paymob.com/')) {
        throw new Error('أعاد مزود الدفع رابطاً غير صالح.');
      }
      window.location.assign(payload.redirectUrl);
    } catch {
      setCheckoutPlan('');
      setStatus('تعذر بدء الدفع الآمن حالياً. تحقق من اتصال الحساب وحاول مجدداً.');
    }
  }

  const subscription = account.user?.subscription;
  const hasActiveVip = subscription?.status === 'active';
  const subscriptionExpiry = subscription?.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString('ar-EG')
    : '';

  return (
    <div className="modal fade" id="account-modal" tabIndex="-1" aria-labelledby="account-modal-title" aria-hidden="true">
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content account-modal-content">
          <div className="modal-header">
            <div>
              <p className="section-kicker mb-1">حسابك على زاد</p>
              <h2 id="account-modal-title" className="modal-title h5">الملف الشخصي</h2>
            </div>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
          </div>
          <div className="modal-body">
            {account.loading ? (
              <p className="account-profile-status" role="status">جارٍ التحقق من حالة الحساب...</p>
            ) : account.user ? (
              <>
                <div className="account-user-profile" aria-label={account.user.isDemo ? 'ملف محلي تجريبي' : 'حساب Google متصل'}>
                  {account.user.picture ? (
                    <img className="account-user-avatar" src={account.user.picture} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="account-user-avatar" aria-hidden="true">{getAvatarInitial(account.user.name)}</span>
                  )}
                  <span>
                    <strong>{account.user.name}</strong>
                    <small>{account.user.isDemo ? 'ملف تجريبي محفوظ على هذا الجهاز' : account.user.email}</small>
                  </span>
                </div>
                {account.user.isDemo ? (
                  <p className="account-local-notice" role="note">
                    هذا ملف تجريبي محلي، ولا يسجّل الدخول إلى Google أو يفعّل اشتراكاً أو مزايا VIP.
                  </p>
                ) : (
                  <section className="telegram-plan-card" aria-labelledby="telegram-plan-title">
                    <h3 id="telegram-plan-title">حالة اشتراك VIP والتذكيرات</h3>
                    {hasActiveVip ? (
                      <p>اشتراك VIP نشط{subscriptionExpiry ? ` حتى ${subscriptionExpiry}` : ''}.</p>
                    ) : (
                      <p>لا يوجد اشتراك VIP نشط حالياً. تتطلب التذكيرات الآلية اشتراكاً فعالاً.</p>
                    )}
                    <div className="vip-plan-options" aria-label="خطط اشتراك VIP">
                      {['monthly', 'annual'].map((planId) => {
                        const plan = plans[planId];
                        const available = plan?.available === true;
                        return (
                          <button
                            className="vip-plan-option"
                            key={planId}
                            type="button"
                            disabled={!available || checkoutPlan !== ''}
                            onClick={() => startCheckout(planId)}
                          >
                            <strong>{plan?.label || (planId === 'monthly' ? 'شهري - 30 يوماً' : 'سنوي - 365 يوماً')}</strong>
                            <span>
                              {checkoutPlan === planId
                                ? 'جارٍ تجهيز الدفع...'
                                : available && Number.isInteger(plan.amount)
                                  ? `${new Intl.NumberFormat('ar-EG').format(plan.amount)} ${plan.currency}`
                                  : 'غير متاح حالياً'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!plans.monthly?.available && !plans.annual?.available && (
                      <p className="telegram-plan-setup" role="status">
                        يلزم ضبط أسعار خطط VIP وإعدادات Paymob على الخادم لتفعيل الاشتراك.
                      </p>
                    )}
                    {TELEGRAM_BOT_CONFIGURED ? (
                      <div className="telegram-plan-actions">
                        <a className="btn btn-success" href={TELEGRAM_START_URL} target="_blank" rel="noopener noreferrer">
                          فتح بوت زاد
                        </a>
                        <a className="telegram-subscribe-link" href={TELEGRAM_SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer">
                          فتح الاشتراك في Telegram
                        </a>
                      </div>
                    ) : (
                      <p className="telegram-plan-setup" role="status">
                        لم يُضبط اسم البوت العام بعد؛ أضف VITE_TELEGRAM_BOT_USERNAME إلى إعدادات الواجهة.
                      </p>
                    )}
                  </section>
                )}
                <form className="account-profile-form" onSubmit={submitProfile}>
                  <label className="settings-control" htmlFor="profile-name">الاسم الظاهر
                    <input
                      id="profile-name"
                      className="form-control"
                      type="text"
                      autoComplete="name"
                      maxLength={MAX_NAME_LENGTH}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setStatus('');
                        setSaved(false);
                      }}
                    />
                  </label>
                  {account.mode === 'local' && (
                    <label className="settings-control" htmlFor="profile-avatar">رابط الصورة الشخصية (اختياري)
                      <input
                        id="profile-avatar"
                        className="form-control"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="https://example.com/photo.jpg"
                        value={avatarUrl}
                        onChange={(event) => {
                          setAvatarUrl(event.target.value);
                          setStatus('');
                          setSaved(false);
                        }}
                      />
                    </label>
                  )}
                  <button className="btn btn-success w-100" type="submit">حفظ التغييرات</button>
                  <button className="btn btn-outline-secondary w-100" type="button" onClick={signOut}>
                    {account.mode === 'local' ? 'إنهاء الملف التجريبي' : 'تسجيل الخروج'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="account-modal-note">
                  {account.mode === 'local'
                    ? 'يمكنك تجربة الملف الشخصي وحفظ الاسم والصورة على هذا الجهاز. هذا الوضع لا يتصل بحساب Google ولا يفعّل المزايا المدفوعة.'
                    : 'سجّل الدخول بحساب Google. يتحقق الخادم من الهوية ويحفظ ملفك واشتراكك بأمان.'}
                </p>
                <button
                  className="google-signin-button"
                  type="button"
                  disabled={account.loading}
                  onClick={() => {
                    if (account.mode === 'local') {
                      const demoProfile = {
                        id: 'local-demo',
                        name: name.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_NAME_LENGTH) || 'زائر زاد',
                        email: '',
                        picture: '',
                        isDemo: true,
                      };
                      try {
                        persistDemoProfile(demoProfile);
                        setAccount((current) => ({ ...current, user: demoProfile }));
                        setName(demoProfile.name);
                        setAvatarUrl('');
                        setStatus('تم تفعيل ملف تجريبي محلي. يمكنك تعديل الاسم والصورة وحفظهما.');
                      } catch {
                        setStatus('تعذر إنشاء الملف المحلي. تحقق من مساحة التخزين في المتصفح.');
                      }
                      return;
                    }
                    window.location.assign(appUrl('auth.php?action=google'));
                  }}
                >
                  <span className={`google-signin-mark${account.mode === 'local' ? ' is-local' : ''}`} aria-hidden="true">
                    {account.mode === 'local' ? 'ز' : 'G'}
                  </span>
                  <span>
                    {account.loading
                      ? 'جارٍ التحقق...'
                      : account.mode === 'local'
                        ? 'استخدام ملف تجريبي محلي'
                        : 'تسجيل الدخول باستخدام Google'}
                  </span>
                </button>
              </>
            )}
            <p className={`account-profile-status${saved ? ' is-success' : ''}`} role="status" aria-live="polite">
              {status}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
