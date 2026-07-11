import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenBackHeader from '../components/ui/ScreenBackHeader';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';
import { useTrip } from '../hooks/useTrip';
import { useTripStore } from '../stores/tripStore';
import { formatArs } from '../utils/formatMoney';
import { useResponsive } from '../hooks/useResponsive';
import { CONTENT_MAX_WIDTH } from '../utils/responsive';
import {
  extractFinalDestFromNotes,
  resolveTripPickupCoords,
  resolveTripFinalDestCoords,
} from '../../shared/trip-contract';

const HISTORY_PAGE_SIZE = 40;
const OPEN_STATUSES = new Set(['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress']);

function isCoordLikeAddress(address) {
  return /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(String(address || '').trim());
}

function extractPickupAddress(trip) {
  const pickup = resolveTripPickupCoords(trip);
  if (pickup?.address) return pickup.address;
  return 'Dirección no disponible';
}

function extractFinalDest(trip) {
  const fromCoords = resolveTripFinalDestCoords(trip);
  if (fromCoords?.address) return fromCoords.address;

  const dest = String(trip.destination_address || '').trim();
  if (dest && !isCoordLikeAddress(dest)) return dest;

  const fromJson = extractFinalDestFromNotes(trip?.notes);
  if (fromJson?.address) return fromJson.address;

  if (!trip.notes) return null;
  const match = trip.notes.match(/Destino final sugerido:\s*(.+)/);
  return match ? match[1].trim() : null;
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = parseISO(isoString);
    return format(date, "d 'de' MMMM 'a las' HH:mm", { locale: es });
  } catch {
    return isoString;
  }
}

const STATUS_BADGE = {
  completed: { label: 'Completado', color: colors.success, bg: colors.successBg, icon: 'checkmark-circle' },
  cancelled: { label: 'Cancelado', color: colors.danger, bg: colors.dangerBg, icon: 'close-circle' },
  in_progress: { label: 'En curso', color: colors.info, bg: colors.infoBg, icon: 'car' },
  going_to_pickup: { label: 'Yendo a buscarte', color: colors.info, bg: colors.infoBg, icon: 'navigate' },
  accepted: { label: 'Conductor asignado', color: colors.primary, bg: colors.accentMuted, icon: 'person' },
  pending: { label: 'Buscando conductor', color: colors.warning, bg: colors.warningBg, icon: 'search' },
  queued: { label: 'En cola', color: colors.warning, bg: colors.warningBg, icon: 'hourglass-outline' },
};

function TripHistoryCard({ trip, onPress }) {
  const badge = STATUS_BADGE[trip.status] || {
    label: trip.status || 'Viaje',
    color: colors.textMuted,
    bg: colors.surfaceRaised,
    icon: 'ellipse',
  };
  const pickupAddress = extractPickupAddress(trip);
  const finalDest = extractFinalDest(trip);
  const isOpen = OPEN_STATUSES.has(trip.status);
  const displayDate = trip.status === 'completed' && trip.completed_at
    ? trip.completed_at
    : trip.created_at;

  const content = (
  <>
    <View style={styles.cardHeader}>
      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
        <Ionicons name={badge.icon} size={12} color={badge.color} />
        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
      </View>
      <Text style={styles.cardDate}>{formatDate(displayDate)}</Text>
    </View>

    <View style={styles.cardBody}>
      <View style={styles.addressRow}>
        <View style={[styles.addrDot, { backgroundColor: colors.primary }]} />
        <Text style={styles.addrText} numberOfLines={2}>{pickupAddress}</Text>
      </View>

      {finalDest ? (
        <>
          <View style={styles.connLine} />
          <View style={styles.addressRow}>
            <View style={[styles.addrDot, { backgroundColor: colors.info, borderRadius: 3 }]} />
            <Text style={styles.addrText} numberOfLines={2}>{finalDest}</Text>
          </View>
        </>
      ) : null}
    </View>

    {(trip.price != null || trip.distance_km != null) ? (
      <View style={styles.cardFooter}>
        {trip.price != null ? (
          <View style={styles.stat}>
            <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
            <Text style={styles.statText}>{formatArs(trip.price)}</Text>
          </View>
        ) : null}
        {trip.distance_km != null && trip.distance_km > 0 ? (
          <View style={styles.stat}>
            <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
            <Text style={styles.statText}>{Number(trip.distance_km).toFixed(1)} km</Text>
          </View>
        ) : null}
        {trip.duration_minutes != null && trip.duration_minutes > 0 ? (
          <View style={styles.stat}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.statText}>{Math.round(trip.duration_minutes)} min</Text>
          </View>
        ) : null}
      </View>
    ) : null}

    {isOpen ? (
      <View style={styles.openHint}>
        <Text style={styles.openHintText}>Tocá para ver el viaje en curso</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
      </View>
    ) : null}
  </>
  );

  if (isOpen && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.card}>{content}</View>;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { screenPadding, isTablet, isLandscape } = useResponsive();
  const contentMaxW = (isTablet || isLandscape) ? CONTENT_MAX_WIDTH : undefined;
  const { profile } = useAuthStore();
  const { fetchTripHistory } = useTrip();
  const { setActiveTrip } = useTripStore();

  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const tripsRef = useRef([]);

  tripsRef.current = trips;

  const loadInitial = useCallback(async () => {
    if (!profile?.phone) {
      setTrips([]);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    const data = await fetchTripHistory(profile.phone, 0, HISTORY_PAGE_SIZE);
    setTrips(data);
    setHasMore(data.length === HISTORY_PAGE_SIZE);
    setIsLoading(false);
  }, [profile?.phone, fetchTripHistory]);

  useEffect(() => {
    setIsLoading(true);
    loadInitial();
  }, [loadInitial]);

  const handleRefresh = useCallback(async () => {
    if (!profile?.phone) return;
    setIsRefreshing(true);
    setHasMore(true);
    const data = await fetchTripHistory(profile.phone, 0, HISTORY_PAGE_SIZE);
    setTrips(data);
    setHasMore(data.length === HISTORY_PAGE_SIZE);
    setIsRefreshing(false);
  }, [profile?.phone, fetchTripHistory]);

  const handleLoadMore = useCallback(async () => {
    if (!profile?.phone || isLoading || isRefreshing || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const offset = tripsRef.current.length;
    const data = await fetchTripHistory(profile.phone, offset, HISTORY_PAGE_SIZE);
    setTrips((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const merged = [...prev];
      for (const trip of data) {
        if (!seen.has(trip.id)) merged.push(trip);
      }
      return merged;
    });
    setHasMore(data.length === HISTORY_PAGE_SIZE);
    setIsLoadingMore(false);
  }, [profile?.phone, fetchTripHistory, isLoading, isRefreshing, isLoadingMore, hasMore]);

  const handleOpenTrip = useCallback(
    (trip) => {
      setActiveTrip(trip);
      navigation.navigate('HomeMain');
    },
    [navigation, setActiveTrip]
  );

  const completedCount = trips.filter((t) => t.status === 'completed').length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} translucent />

      <ScreenBackHeader
        title="Mis viajes"
        subtitle={
          trips.length > 0
            ? `${trips.length} viaje${trips.length === 1 ? '' : 's'}${completedCount > 0 ? ` · ${completedCount} completado${completedCount === 1 ? '' : 's'}` : ''}`
            : undefined
        }
      />

      {isLoading ? (
        <View style={[styles.centered, contentMaxW ? { maxWidth: contentMaxW, alignSelf: 'center', width: '100%' } : null]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando historial…</Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={[styles.centered, contentMaxW ? { maxWidth: contentMaxW, alignSelf: 'center', width: '100%' } : null]}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={48} color={colors.textLight} />
          </View>
          <Text style={styles.emptyTitle}>Sin viajes aún</Text>
          <Text style={styles.emptyDesc}>
            Tu historial de viajes aparecerá aquí una vez que hagas tu primer viaje.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripHistoryCard
              trip={item}
              onPress={OPEN_STATUSES.has(item.status) ? () => handleOpenTrip(item) : undefined}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: screenPadding },
            contentMaxW ? { maxWidth: contentMaxW, alignSelf: 'center', width: '100%' } : null,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  emptyIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textDark, textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted,
    textAlign: 'center', marginTop: 10, lineHeight: 22,
  },

  listContent: { paddingTop: 16, paddingBottom: 20 },
  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted },

  cardBody: { marginBottom: 12 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  addrDot: {
    width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0,
  },
  addrText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textDark, lineHeight: 20 },
  connLine: { width: 2, height: 14, backgroundColor: colors.border, marginLeft: 4, marginVertical: 2 },

  cardFooter: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 12,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textMuted },

  openHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  openHintText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.primary,
  },
});
