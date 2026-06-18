import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenBackHeader from '../components/ui/ScreenBackHeader';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';

const APP_VERSION = '1.0.0';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfileFields, clearProfile } = useAuthStore();

  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [nameFocused, setNameFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = name.trim() !== (profile?.name || '');

  const canSave = name.trim().length >= 2 && hasChanges;

  const handleSave = async () => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);
    try {
      await updateProfileFields({ name: name.trim() });
      Toast.show({ type: 'success', text1: 'Perfil actualizado', visibilityTime: 2000 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      'Vas a salir de la app y tendrás que verificar tu teléfono de nuevo. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            await clearProfile();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} translucent />

      <ScreenBackHeader title="Mi perfil" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <LinearGradient
              colors={colors.gradient.brand}
              style={styles.avatar}
            >
              <Text style={styles.avatarLetter}>
                {(profile?.name || 'P').charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <Text style={styles.avatarName}>{profile?.name || 'Pasajero'}</Text>
            {profile?.phone ? (
              <Text style={styles.avatarPhone}>{profile.phone}</Text>
            ) : null}
          </View>

          {/* Edit form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Editar información</Text>

            <Text style={styles.fieldLabel}>NOMBRE</Text>
            <View style={[styles.fieldRow, nameFocused && styles.fieldRowFocused]}>
              <View style={[styles.fieldIcon, nameFocused && { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="person-outline" size={17} color={nameFocused ? colors.primary : colors.textMuted} />
              </View>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
                placeholderTextColor={colors.textLight}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                style={styles.fieldInput}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={{ height: 16 }} />

            <Text style={styles.fieldLabel}>TELÉFONO VERIFICADO</Text>
            <View style={[styles.fieldRow, styles.fieldRowReadonly]}>
              <View style={[styles.fieldIcon, { backgroundColor: `${colors.success}18` }]}>
                <Ionicons name="logo-whatsapp" size={17} color={colors.success} />
              </View>
              <TextInput
                value={phone}
                editable={false}
                placeholder="Ej: 3874001234"
                placeholderTextColor={colors.textLight}
                style={[styles.fieldInput, styles.fieldInputReadonly]}
              />
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            </View>

            <Pressable
              onPress={handleSave}
              disabled={!canSave || isSaving}
              style={({ pressed }) => [
                styles.saveBtn,
                (!canSave || isSaving) && styles.saveBtnDisabled,
                pressed && canSave && { opacity: 0.88 },
              ]}
            >
              <LinearGradient
                colors={canSave ? [colors.primaryLight, colors.primary] : ['#D0D5E0', '#C8CCD8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.saveBtnGrad}
              >
                <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* App info */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="car" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Profesional Pasajero</Text>
                <Text style={styles.infoValue}>Versión {APP_VERSION}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="location-outline" size={18} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Zona de cobertura</Text>
                <Text style={styles.infoValue}>Salta Capital, Argentina</Text>
              </View>
            </View>
          </View>

          {/* Danger zone */}
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.dangerBtnText}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.3 },

  content: { paddingHorizontal: 16, paddingTop: 24 },

  avatarSection: {
    alignItems: 'center', marginBottom: 28,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarLetter: { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  avatarName: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.2 },
  avatarPhone: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 4 },

  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textMuted,
    letterSpacing: 0.5, marginBottom: 8, marginLeft: 2,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceRaised, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14,
  },
  fieldRowFocused: { borderColor: colors.primary, backgroundColor: '#FAFBFF' },
  fieldRowReadonly: { backgroundColor: colors.surfaceRaised, opacity: 0.95 },
  fieldInputReadonly: { color: colors.textMuted },
  fieldIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldInput: {
    flex: 1, color: colors.text, fontSize: 15,
    fontFamily: 'Inter_400Regular', paddingVertical: 15, marginLeft: 12,
  },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 20 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },

  infoSection: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
    marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  infoIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text },
  infoValue: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 12 },

  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1.5, borderColor: colors.danger,
    paddingVertical: 14,
    backgroundColor: colors.dangerBg,
  },
  dangerBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.danger },
});
