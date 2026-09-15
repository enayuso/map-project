import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import appleAuth, { AppleButton } from '@invertase/react-native-apple-authentication';
import { useTheme } from '../theme/ThemeContext';
import { AVATAR_EMOJI_CHOICES, type Profile } from './api';

// Naver/Kakao both have profile creation/customization — see
// docs/research/14-naver-kakao-profile-systems.md for the research this is
// built from, and sharing/README.md's Profile section for why this app's
// version is deliberately much smaller: a nickname and a pick from a small
// set of Belize-themed emoji avatars — not an uploaded photo, not reviewer
// grades/badges, not a follow graph. Start simple, extend only when real
// usage asks for more.
//
// Two sign-in paths, shown together: email + password (this app's own
// first-party account, primary here) and Sign in with Apple (secondary —
// fully built and working, but needs the paid Apple Developer Program
// membership to actually enable the capability, which isn't available on
// every account; email/password exists specifically so profiles work
// without it).

// Mirrors sharing/app/main.py's PASSWORD_MIN_LENGTH — server-enforced
// regardless, this is just so a too-short password is caught before a
// round trip rather than after.
const PASSWORD_MIN_LENGTH = 8;

type AuthMode = 'signup' | 'login';

type Props = {
  visible: boolean;
  onClose: () => void;
  profile: Profile | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  onSignUpWithEmail: (email: string, password: string) => void;
  onLogInWithEmail: (email: string, password: string) => void;
  onSignInWithApple: () => void;
  onSignOut: () => void;
  onUpdateNickname: (nickname: string) => void;
  onUpdateAvatar: (avatarEmoji: string) => void;
  onDeleteAccount: () => void;
};

export default function ProfilePanel({
  visible,
  onClose,
  profile,
  loading,
  signingIn,
  error,
  onSignUpWithEmail,
  onLogInWithEmail,
  onSignInWithApple,
  onSignOut,
  onUpdateNickname,
  onUpdateAvatar,
  onDeleteAccount,
}: Props) {
  const { colors, scheme } = useTheme();
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [emailDraft, setEmailDraft] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');

  // Resyncs the editable draft whenever the real nickname changes from
  // outside this input (signing in, or a save from this same input
  // completing) — same "resync on prop change, not on every keystroke"
  // pattern as src/search/SearchBox.tsx's own `value` prop.
  useEffect(() => {
    setNicknameDraft(profile?.nickname ?? '');
  }, [profile?.nickname]);

  // Clears the sign-in form once there's no profile to show it alongside
  // — fires once on mount (harmless, both start blank anyway) and once
  // right after a real sign-out/account-deletion, so a just-typed password
  // doesn't linger on screen once the account it belonged to is gone.
  useEffect(() => {
    if (!profile) {
      setEmailDraft('');
      setPasswordDraft('');
    }
  }, [profile]);

  if (!visible) return null;

  const trimmedDraft = nicknameDraft.trim();
  const nicknameChanged = trimmedDraft.length > 0 && trimmedDraft !== profile?.nickname;

  const trimmedEmail = emailDraft.trim();
  const canSubmitAuthForm =
    trimmedEmail.length > 0 && passwordDraft.length >= (authMode === 'signup' ? PASSWORD_MIN_LENGTH : 1);

  const submitAuthForm = () => {
    if (!canSubmitAuthForm) return;
    if (authMode === 'signup') onSignUpWithEmail(trimmedEmail, passwordDraft);
    else onLogInWithEmail(trimmedEmail, passwordDraft);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently removes your profile and signs you out everywhere. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: onDeleteAccount },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>👤 Profile</Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} style={styles.loadingSpinner} />
        ) : profile ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.avatarRow}>
              {AVATAR_EMOJI_CHOICES.map(choice => (
                <Pressable
                  key={choice}
                  style={[
                    styles.avatarChoice,
                    { backgroundColor: colors.divider },
                    choice === profile.avatarEmoji && [styles.avatarChoiceSelected, { borderColor: colors.accent }],
                  ]}
                  onPress={() => onUpdateAvatar(choice)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${choice} as your avatar`}
                  accessibilityState={{ selected: choice === profile.avatarEmoji }}>
                  <Text style={styles.avatarEmoji}>{choice}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Nickname</Text>
            <View style={styles.nicknameRow}>
              <TextInput
                style={[styles.nicknameInput, { color: colors.textPrimary, borderColor: colors.dividerStrong }]}
                value={nicknameDraft}
                onChangeText={setNicknameDraft}
                maxLength={24}
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => nicknameChanged && onUpdateNickname(trimmedDraft)}
                accessibilityLabel="Nickname"
              />
              {nicknameChanged && (
                <Pressable
                  style={[styles.saveButton, { backgroundColor: colors.textPrimary }]}
                  onPress={() => onUpdateNickname(trimmedDraft)}
                  accessibilityRole="button"
                  accessibilityLabel="Save nickname">
                  <Text style={[styles.saveLabel, { color: colors.onTextPrimary }]}>Save</Text>
                </Pressable>
              )}
            </View>

            <Text style={[styles.memberSince, { color: colors.textSecondary }]}>
              Member since {formatMemberSince(profile.memberSince)}
            </Text>

            {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

            <Pressable
              style={[styles.signOutButton, { backgroundColor: colors.divider }]}
              onPress={onSignOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out">
              <Text style={[styles.signOutLabel, { color: colors.textPrimary }]}>Sign out</Text>
            </Pressable>

            <Pressable
              onPress={confirmDeleteAccount}
              accessibilityRole="button"
              accessibilityLabel="Delete account">
              <Text style={[styles.deleteLabel, { color: colors.danger }]}>Delete account</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.signedOutHint, { color: colors.textSecondary }]}>
              {authMode === 'signup'
                ? 'Create an account to pick a nickname and an avatar.'
                : 'Sign in to your account.'}
            </Text>

            <TextInput
              style={[styles.authInput, { color: colors.textPrimary, borderColor: colors.dividerStrong }]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={emailDraft}
              onChangeText={setEmailDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email"
            />
            <TextInput
              style={[styles.authInput, { color: colors.textPrimary, borderColor: colors.dividerStrong }]}
              placeholder={authMode === 'signup' ? `Password (min ${PASSWORD_MIN_LENGTH} characters)` : 'Password'}
              placeholderTextColor={colors.textSecondary}
              value={passwordDraft}
              onChangeText={setPasswordDraft}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={authMode === 'signup' ? 'newPassword' : 'password'}
              returnKeyType="done"
              onSubmitEditing={submitAuthForm}
              accessibilityLabel="Password"
            />

            <Pressable
              style={[
                styles.actionButton,
                { backgroundColor: colors.textPrimary },
                !canSubmitAuthForm && styles.actionButtonDisabled,
              ]}
              onPress={submitAuthForm}
              disabled={!canSubmitAuthForm || signingIn}
              accessibilityRole="button"
              accessibilityLabel={authMode === 'signup' ? 'Create account' : 'Sign in'}>
              {signingIn ? (
                <ActivityIndicator size="small" color={colors.onTextPrimary} />
              ) : (
                <Text style={[styles.actionLabel, { color: colors.onTextPrimary }]}>
                  {authMode === 'signup' ? 'Create account' : 'Sign in'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}
              accessibilityRole="button"
              hitSlop={4}
              style={styles.toggleModeButton}>
              <Text style={[styles.toggleModeLabel, { color: colors.accent }]}>
                {authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
              </Text>
            </Pressable>

            {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.dividerStrong }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.dividerStrong }]} />
            </View>

            {appleAuth.isSupported && (
              <AppleButton
                buttonType={AppleButton.Type.SIGN_IN}
                buttonStyle={scheme === 'dark' ? AppleButton.Style.WHITE : AppleButton.Style.BLACK}
                cornerRadius={20}
                style={styles.appleButton}
                onPress={onSignInWithApple}
              />
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function formatMemberSince(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    maxHeight: 480,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#3a3226',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 13,
    color: '#3a3226',
  },
  loadingSpinner: {
    marginVertical: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  avatarChoice: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarChoiceSelected: {
    borderWidth: 2,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nicknameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    marginRight: 8,
  },
  saveButton: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  saveLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  memberSince: {
    fontSize: 12,
    marginBottom: 14,
  },
  signOutButton: {
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  signOutLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteLabel: {
    fontSize: 12,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginBottom: 4,
  },
  signedOutHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  authInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  actionButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 2,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleModeButton: {
    marginTop: 10,
    alignItems: 'center',
  },
  toggleModeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 11,
    marginHorizontal: 10,
  },
  appleButton: {
    width: '100%',
    height: 44,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
  },
});
