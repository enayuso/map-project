/**
 * The two legal documents served by sharing/'s own GET /privacy-policy and
 * GET /terms-of-service (see docs/research/15-belize-legal-compliance-
 * audit.md §2.1/§7) — plain HTML, opened in the system browser via
 * Linking.openURL rather than rendered in-app, so there's exactly one
 * copy of the actual text (the HTML files themselves) instead of a second
 * native-rendered copy that could drift from it.
 *
 * NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
 * same caveat as every other *_URL constant in this app's per-feature
 * api.ts files.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export const PRIVACY_POLICY_URL = `${SHARING_URL}/privacy-policy`;
export const TERMS_OF_SERVICE_URL = `${SHARING_URL}/terms-of-service`;
