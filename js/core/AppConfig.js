/**
 * AppConfig.js — build-time switches for the public, managed-AI release.
 *
 * In this build, AI features are provided by the app's server proxy and gated
 * behind a Google Play subscription (verified by RevenueCat). Users do NOT bring
 * their own key.
 */
const AppConfig = {
  // When true, every AI action requires an active subscription. The BYO-key
  // settings UI is hidden (see AISettingsModal) so the only way in is to subscribe.
  MANAGED_ONLY: true,

  // Must match the entitlement identifier you create in RevenueCat
  // (RevenueCat → Entitlements) AND the REVENUECAT_ENTITLEMENT_ID env on the proxy.
  ENTITLEMENT_ID: 'premium',

  // RevenueCat PUBLIC SDK key for Android (RevenueCat → Project → API keys →
  // "Public app-specific" / starts with "goog_"). NOT the secret key — the secret
  // lives only on the proxy as REVENUECAT_SECRET_KEY.
  REVENUECAT_PUBLIC_SDK_KEY: 'goog_REPLACE_ME',

  // Optional shared secret. If you set PROXY_APP_TOKEN on the proxy, put the same
  // value here so the app sends it as the x-app-token header.
  PROXY_APP_TOKEN: '',

  // REQUIRED for the installed Android app: the absolute URL of your deployed
  // proxy (where /api/claude-proxy lives), e.g. 'https://your-app.vercel.app'.
  // Leave '' only for the web build that is served from the same origin as the proxy.
  PROXY_BASE_URL: '',
};
if (typeof window !== 'undefined') window.AppConfig = AppConfig;
