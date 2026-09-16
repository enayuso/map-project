/**
 * State + handlers for the profile feature (email/password + Sign in with
 * Apple, nickname/avatar customization, account deletion) — see
 * sharing/README.md's Profile section and docs/research/14-naver-kakao-
 * profile-systems.md for the full design. Extracted as its own hook rather
 * than folded into App.tsx directly, same reasoning as every other feature
 * hook in this app (src/errors/useErrorLog.ts's header comment has the
 * fullest version of that argument).
 *
 * Unlike useSharing/useMeetup, this hook owns real per-device secret state
 * (the session token) that has to survive app restarts — see
 * sessionStorage.ts for where/why that's persisted.
 */
import { useEffect, useRef, useState } from 'react';
import appleAuth from '@invertase/react-native-apple-authentication';
import { logError } from '../errors/logger';
import {
  deleteAccount as requestAccountDeletion,
  fetchProfile,
  logInWithEmail as logInWithEmailRequest,
  ProfileAuthError,
  resendVerificationCode as resendVerificationCodeRequest,
  signInWithAppleIdentityToken,
  signOutSession,
  signUpWithEmail as signUpWithEmailRequest,
  updateProfile,
  verifyEmailCode,
  type Profile,
  type SignedIn,
} from './api';
import { clearStoredSessionToken, getStoredSessionToken, setStoredSessionToken } from './sessionStorage';

export type UseProfile = {
  panelVisible: boolean;
  toggle: () => void;
  close: () => void;
  /** null while signed out (or before the initial session-restore check
   * finishes — see `loading`). */
  profile: Profile | null;
  /** True only during the one-time check on mount for a previously-stored
   * session — not re-used for any sign-in method's own in-flight state,
   * see `signingIn`. */
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signUpWithEmail: (email: string, password: string, termsAccepted: boolean) => Promise<void>;
  logInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithApple: (termsAccepted: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
  updateAvatar: (avatarEmoji: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** True while a verify/resend request is in flight — its own flag,
   * separate from `signingIn`, since this happens *after* signing in. */
  verifyingEmail: boolean;
  verifyEmail: (code: string) => Promise<void>;
  resendVerificationCode: () => Promise<void>;
};

export function useProfile(closeUtilityPanels: () => void): UseProfile {
  const [panelVisible, setPanelVisible] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  // A ref, not just relying on `profile` being non-null — a network hiccup
  // right after sign-in could leave `profile` unset for a moment while the
  // token itself is already valid and stored; every action below needs the
  // token specifically, not "is a profile currently loaded."
  const sessionTokenRef = useRef<string | null>(null);

  // Restores a previously-signed-in session on launch — this app's own
  // established "check AsyncStorage once on mount" pattern (same shape as
  // theme/appearancePreference.ts), just with a live server round-trip
  // afterward to confirm the session is still actually valid.
  useEffect(() => {
    let active = true;
    getStoredSessionToken().then(async token => {
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      sessionTokenRef.current = token;
      try {
        const restored = await fetchProfile(token);
        if (active) setProfile(restored);
      } catch (e) {
        if (e instanceof ProfileAuthError) {
          // The session is genuinely gone server-side (signed out
          // elsewhere, or the account itself was deleted) — clear the
          // stale local token so this doesn't silently fail on every
          // future launch instead of just showing signed-out.
          sessionTokenRef.current = null;
          await clearStoredSessionToken();
        } else {
          // A transient/network failure shouldn't sign the user out —
          // leave the stored token in place; the next successful fetch
          // (e.g. reopening the profile panel) picks the profile back up.
          logError('profile:restoreSession', e);
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = () => {
    if (panelVisible) {
      setPanelVisible(false);
    } else {
      closeUtilityPanels();
      setPanelVisible(true);
    }
  };

  // Shared by all three sign-in methods below — same "store the token,
  // load the profile it came with" step regardless of how the session was
  // obtained.
  const applySignedIn = async ({ sessionToken, profile: signedInProfile }: SignedIn) => {
    sessionTokenRef.current = sessionToken;
    await setStoredSessionToken(sessionToken);
    setProfile(signedInProfile);
  };

  const signUpWithEmail = async (email: string, password: string, termsAccepted: boolean) => {
    setError(null);
    setSigningIn(true);
    try {
      await applySignedIn(await signUpWithEmailRequest(email, password, termsAccepted));
    } catch (e) {
      // sharing/api.ts's parseAuthResponse already extracts the server's
      // own message (a duplicate email, a too-short password) — show that
      // directly rather than a generic one, it's the actually useful text.
      logError('profile:signUp', e);
      setError(e instanceof Error ? e.message : 'Could not create your account — try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const logInWithEmail = async (email: string, password: string) => {
    setError(null);
    setSigningIn(true);
    try {
      await applySignedIn(await logInWithEmailRequest(email, password));
    } catch (e) {
      logError('profile:logIn', e);
      setError(e instanceof Error ? e.message : 'Could not sign in — try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const signInWithApple = async (termsAccepted: boolean) => {
    setError(null);
    setSigningIn(true);
    try {
      // No requestedScopes — this app deliberately never asks Apple for a
      // user's real name or email (see sharing/README.md's Profile
      // section): a nickname and an avatar emoji, both chosen inside the
      // app itself, are the entire profile. Sign in with Apple works fine
      // with zero requested scopes; fullName/email on the response just
      // come back null, which is exactly what's wanted here.
      const response = await appleAuth.performRequest({ requestedOperation: appleAuth.Operation.LOGIN });
      if (!response.identityToken) throw new Error('Apple did not return an identity token');
      await applySignedIn(await signInWithAppleIdentityToken(response.identityToken, termsAccepted));
    } catch (e) {
      // The user dismissing Apple's own sign-in sheet isn't an error worth
      // surfacing — anything else genuinely is.
      const code = (e as { code?: string } | null)?.code;
      if (code !== appleAuth.Error.CANCELED) {
        logError('profile:signInWithApple', e);
        setError('Could not sign in with Apple — try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    const token = sessionTokenRef.current;
    sessionTokenRef.current = null;
    setProfile(null);
    await clearStoredSessionToken();
    // After the local state is already cleared — see signOutSession's own
    // comment for why telling the server is best-effort tidy-up, not
    // something the local "you're signed out" result should wait on.
    if (token) await signOutSession(token);
  };

  const updateNickname = async (nickname: string) => {
    const token = sessionTokenRef.current;
    if (!token) return;
    try {
      setProfile(await updateProfile(token, { nickname }));
    } catch (e) {
      logError('profile:updateNickname', e);
      setError('Could not update your nickname — try again.');
    }
  };

  const updateAvatar = async (avatarEmoji: string) => {
    const token = sessionTokenRef.current;
    if (!token) return;
    try {
      setProfile(await updateProfile(token, { avatarEmoji }));
    } catch (e) {
      logError('profile:updateAvatar', e);
      setError('Could not update your avatar — try again.');
    }
  };

  const verifyEmail = async (code: string) => {
    const token = sessionTokenRef.current;
    if (!token) return;
    setError(null);
    setVerifyingEmail(true);
    try {
      await verifyEmailCode(token, code);
      // The endpoint just returns {ok: true}, not a full profile — patch
      // the one field that changed locally rather than an extra GET
      // /profile round trip for something already known.
      setProfile(prev => (prev ? { ...prev, emailVerified: true } : prev));
    } catch (e) {
      // sharing/api.ts's extractErrorMessage already surfaces the server's
      // own message ("Incorrect code," "That code expired," "Too many
      // attempts") — show it directly, it's the useful text here.
      logError('profile:verifyEmail', e);
      setError(e instanceof Error ? e.message : 'Could not verify that code — try again.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const resendVerificationCode = async () => {
    const token = sessionTokenRef.current;
    if (!token) return;
    setError(null);
    setVerifyingEmail(true);
    try {
      await resendVerificationCodeRequest(token);
    } catch (e) {
      logError('profile:resendVerificationCode', e);
      setError('Could not resend the code — try again.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const deleteAccount = async () => {
    const token = sessionTokenRef.current;
    if (!token) return;
    try {
      await requestAccountDeletion(token);
    } catch (e) {
      logError('profile:deleteAccount', e);
      // Still sign out locally below even if the server call failed — an
      // account the user just asked to delete shouldn't stay signed in on
      // this device just because the request hit a network blip.
    }
    sessionTokenRef.current = null;
    setProfile(null);
    await clearStoredSessionToken();
  };

  return {
    panelVisible,
    toggle,
    close: () => setPanelVisible(false),
    profile,
    loading,
    signingIn,
    error,
    signUpWithEmail,
    logInWithEmail,
    signInWithApple,
    signOut,
    updateNickname,
    updateAvatar,
    deleteAccount,
    verifyingEmail,
    verifyEmail,
    resendVerificationCode,
  };
}
