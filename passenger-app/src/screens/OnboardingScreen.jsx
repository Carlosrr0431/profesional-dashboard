import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';
import { normalizePassengerPhone, extractLocalArMobileDigits } from '../utils/phone';
import { sendPassengerOtp, verifyPassengerOtp } from '../services/authService';
import OtpInput from '../components/ui/OtpInput';
import { LoginBrandHeader } from '../components/auth/LoginBrandHeader';
import { useResponsive } from '../hooks/useResponsive';
import { CONTENT_MAX_WIDTH } from '../utils/responsive';

const RESEND_COOLDOWN_SEC = 60;

function formatPhoneHint(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `···· ${digits.slice(-4)}`;
}

function formatPhoneDisplay(digits) {
  const d = String(digits || '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { saveProfile } = useAuthStore();
  const { s, fs, isLandscape, screenPadding } = useResponsive();

  const [phase, setPhase] = useState('phone');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const phoneInputRef = useRef(null);

  const openPhoneKeyboard = useCallback(() => {
    const input = phoneInputRef.current;
    if (!input) return;
    input.blur();
    setTimeout(() => input.focus(), 64);
  }, []);

  const phoneDigits = phone.replace(/\D/g, '');
  const canSendCode = normalizePassengerPhone(phone).length === 12;
  const canVerify = code.length === 4;

  const handlePhoneChange = useCallback((text) => {
    const digits = String(text || '').replace(/\D/g, '');
    const local = extractLocalArMobileDigits(digits);
    if (local) {
      setPhone(local);
      return;
    }
    // Pegado incompleto tipo 5493878630: no guardarlo como si fuera un móvil local.
    if (digits.startsWith('54') || (digits.startsWith('9') && digits.length > 11)) {
      return;
    }
    setPhone(digits.slice(0, 10));
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setResendSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const handleSendCode = useCallback(async () => {
    if (!canSendCode || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      const canonical = normalizePassengerPhone(phone);
      if (!canonical) {
        Toast.show({
          type: 'error',
          text1: 'Número inválido',
          text2: 'Usá 10 dígitos con área (ej. 387…), sin 0 ni 54.',
        });
        return;
      }
      const result = await sendPassengerOtp(canonical);
      if (!result.ok) {
        // Evitar martillar el endpoint si Wasender rechaza el número.
        setResendSeconds(RESEND_COOLDOWN_SEC);
        Toast.show({ type: 'error', text1: result.message });
        return;
      }

      setNormalizedPhone(result.phone || canonical);
      setCode('');
      setResendSeconds(RESEND_COOLDOWN_SEC);
      phoneInputRef.current?.blur();
      Keyboard.dismiss();
      setPhase('otp');

      Toast.show({
        type: 'success',
        text1: 'Código enviado',
        text2: 'Revisá tu WhatsApp.',
        visibilityTime: 2500,
      });
    } finally {
      setIsLoading(false);
    }
  }, [canSendCode, isLoading, phone]);

  const handleResendCode = useCallback(async () => {
    if (resendSeconds > 0 || isLoading) return;
    await handleSendCode();
  }, [resendSeconds, isLoading, handleSendCode]);

  const handleVerifyCode = useCallback(async (otpValue) => {
    const digits = (otpValue || code).replace(/\D/g, '');
    if (digits.length !== 4 || isLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      const result = await verifyPassengerOtp(
        normalizedPhone || normalizePassengerPhone(phone),
        digits
      );

      if (!result.ok) {
        Toast.show({ type: 'error', text1: result.message });
        setCode('');
        return;
      }

      const saved = await saveProfile({
        phone: result.phone,
        sessionToken: result.sessionToken,
        sessionExpiresAt: result.sessionExpiresAt,
        name: result.name || 'Pasajero',
      });

      if (!saved) {
        Toast.show({
          type: 'error',
          text1: 'No pudimos guardar tu sesión.',
          text2: 'Intentá de nuevo.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [code, isLoading, normalizedPhone, phone, saveProfile]);

  const handleBackToPhone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase('phone');
    setCode('');
  };

  const isOtp = phase === 'otp';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={colors.gradient.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={[
          styles.inner,
          {
            paddingTop: insets.top + s(isLandscape ? 12 : 28),
            paddingBottom: insets.bottom + s(16),
            paddingHorizontal: screenPadding,
            maxWidth: CONTENT_MAX_WIDTH,
            width: '100%',
            alignSelf: 'center',
          },
        ]}>
          <LoginBrandHeader style={[styles.brand, isLandscape && { marginBottom: s(8) }]} />

          {/* Card única de login */}
          <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.card}>
            <Text style={styles.cardTitle}>
              {isOtp ? 'Ingresá el código' : 'Ingresá tu número'}
            </Text>
            <Text style={styles.cardDesc}>
              {isOtp
                ? `Enviamos un código de 4 dígitos por WhatsApp al ${formatPhoneHint(normalizedPhone || phone)}.`
                : 'Te enviamos un código por WhatsApp para verificar tu identidad.'}
            </Text>

            {isOtp ? (
              <View style={styles.otpSection}>
                <OtpInput
                  autoFocus
                  value={code}
                  onChange={setCode}
                  onComplete={handleVerifyCode}
                />

                <Pressable
                  onPress={handleResendCode}
                  disabled={resendSeconds > 0 || isLoading}
                  style={styles.linkBtn}
                >
                  <Text style={[styles.linkText, resendSeconds > 0 && styles.linkTextMuted]}>
                    {resendSeconds > 0
                      ? `Reenviar en ${resendSeconds}s`
                      : 'Reenviar código'}
                  </Text>
                </Pressable>

                <Pressable onPress={handleBackToPhone} style={styles.linkBtn}>
                  <Text style={styles.linkTextMuted}>Cambiar número</Text>
                </Pressable>

                <Pressable
                  onPress={() => handleVerifyCode(code)}
                  disabled={!canVerify || isLoading}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (!canVerify || isLoading) && styles.primaryBtnDisabled,
                    pressed && canVerify && styles.primaryBtnPressed,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {isLoading ? 'Verificando…' : 'Confirmar'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.phoneSection}>
                <Pressable onPress={openPhoneKeyboard} style={styles.phoneBar}>
                  <Text style={styles.phonePrefix}>+54</Text>
                  <View style={styles.phoneDivider} />
                  <TextInput
                    ref={phoneInputRef}
                    value={formatPhoneDisplay(phone)}
                    onChangeText={handlePhoneChange}
                    placeholder="387 400 1234"
                    placeholderTextColor={colors.textLight}
                    keyboardType="number-pad"
                    style={styles.phoneInput}
                    returnKeyType="done"
                    onSubmitEditing={handleSendCode}
                    autoComplete="tel"
                    showSoftInputOnFocus
                    pointerEvents="none"
                  />
                  {phoneDigits.length > 0 ? (
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        setPhone('');
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textLight} />
                    </Pressable>
                  ) : (
                    <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
                  )}
                </Pressable>
                <Text style={styles.phoneHint}>10 dígitos con área · sin 0 ni +54</Text>

                <Pressable
                  onPress={handleSendCode}
                  disabled={!canSendCode || isLoading}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (!canSendCode || isLoading) && styles.primaryBtnDisabled,
                    pressed && canSendCode && styles.primaryBtnPressed,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {isLoading ? 'Enviando…' : 'Enviar código'}
                  </Text>
                  {!isLoading && canSendCode ? (
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  ) : null}
                </Pressable>
              </View>
            )}
          </Animated.View>

          <Text style={styles.footer}>
            Al continuar aceptás el uso de WhatsApp para verificar tu cuenta.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: 120,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  brand: { marginTop: 12 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  cardDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 24,
  },

  phoneSection: { gap: 12 },
  phoneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    height: 60,
    gap: 12,
  },
  phonePrefix: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
  },
  phoneDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  phoneInput: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    letterSpacing: 1.2,
    paddingVertical: 0,
  },
  phoneHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -4,
  },

  otpSection: { gap: 4, alignItems: 'center' },

  linkBtn: { paddingVertical: 8 },
  linkText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primary,
  },
  linkTextMuted: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    marginTop: 8,
    width: '100%',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },

  footer: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});
