import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

function parseContext(ctx) {
  if (!ctx) return {};
  if (typeof ctx === 'object') return ctx;
  try { return JSON.parse(ctx); } catch { return {}; }
}

function waitMinutes(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
}

export function useQueuedPassengers() {
  const [queuedList, setQueuedList] = useState([]);      // active queue
  const [dispatchLog, setDispatchLog] = useState([]);    // recent dispatches
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const channelRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      // ── 1. Active waiting queue ─────────────────────────────────────────
      const { data: queued, error: queuedErr } = await supabase
        .from('whatsapp_conversations')
        .select('id, phone, push_name, context, updated_at, status')
        .eq('status', 'queued_no_driver')
        .order('updated_at', { ascending: true }); // FIFO

      if (queuedErr) throw queuedErr;

      // ── 2. Dispatch log: trips created from the queue ────────────────────
      // Identified by '[APPROACH_ONLY]' + 'cola de espera' in notes
      const { data: dispatchedTrips, error: tripsErr } = await supabase
        .from('trips')
        .select(
          'id, passenger_name, passenger_phone, destination_address, origin_address, ' +
          'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, cancel_reason'
        )
        .ilike('notes', '%cola de espera%')
        .order('created_at', { ascending: false })
        .limit(30);

      if (tripsErr) throw tripsErr;

      // ── 3. Fetch driver info for dispatched trips ────────────────────────
      let driversMap = {};
      const driverIds = [...new Set((dispatchedTrips || []).map((t) => t.driver_id).filter(Boolean))];
      if (driverIds.length > 0) {
        const { data: driversData } = await supabase
          .from('drivers')
          .select('id, full_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_color')
          .in('id', driverIds);
        (driversData || []).forEach((d) => { driversMap[d.id] = d; });
      }

      // ── 4. Try to get queued_at for dispatch log entries by matching phone ─
      // We look at conversations that WERE queued (status no longer queued_no_driver)
      // and recently moved to awaiting_driver / trip_created
      const passengerPhones = [...new Set((dispatchedTrips || []).map((t) => t.passenger_phone).filter(Boolean))];
      let convByPhone = {};
      if (passengerPhones.length > 0) {
        const { data: convData } = await supabase
          .from('whatsapp_conversations')
          .select('id, phone, context, updated_at, last_trip_id')
          .in('phone', passengerPhones);
        (convData || []).forEach((c) => { convByPhone[c.phone] = c; });
      }

      // ── Assemble queue ───────────────────────────────────────────────────
      const queue = (queued || []).map((conv, index) => {
        const ctx = parseContext(conv.context);
        return {
          id: conv.id,
          position: index + 1,
          phone: conv.phone,
          pushName: conv.push_name,
          passengerName: ctx.passenger_name || conv.push_name || 'Pasajero',
          pickupAddress: ctx.pickup_formatted_address || ctx.pickup_location || '—',
          destination: ctx.destination || null,
          queuedAt: conv.updated_at,
          waitMinutes: waitMinutes(conv.updated_at),
          notes: ctx.notes || null,
        };
      });

      // ── Assemble dispatch log ────────────────────────────────────────────
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const log = (dispatchedTrips || []).map((trip) => {
        const driver = driversMap[trip.driver_id] || null;
        const conv = convByPhone[trip.passenger_phone] || null;
        const isToday = new Date(trip.created_at) >= todayStart;

        // Estimate how long they waited: diff between trip creation and... we don't have
        // queued_at directly, so we show N/A unless we can infer it from context
        let waitedMinutes = null;
        if (conv?.context) {
          const ctx = parseContext(conv.context);
          // If this trip is the last_trip_id of the conversation, and context has timing data
          // we can approximate. For now leave as null.
        }

        return {
          id: trip.id,
          passengerName: trip.passenger_name || 'Pasajero',
          passengerPhone: trip.passenger_phone,
          pickupAddress: trip.destination_address || '—', // approach-only: destination = passenger pickup
          driverOrigin: trip.origin_address || '—',
          status: trip.status,
          cancelReason: trip.cancel_reason || null,
          dispatchedAt: trip.created_at,
          acceptedAt: trip.accepted_at,
          startedAt: trip.started_at,
          completedAt: trip.completed_at,
          driver,
          waitedMinutes,
          isToday,
        };
      });

      setQueuedList(queue);
      setDispatchLog(log);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (err) {
      console.error('[useQueuedPassengers] Error:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    // Realtime: watch conversations + trips for changes
    const channel = supabase
      .channel('queue-monitor-v1')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, fetchAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips' }, fetchAll)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips' }, fetchAll)
      .subscribe();

    channelRef.current = channel;

    // Refresh wait times every 30 seconds even without DB changes
    const ticker = setInterval(fetchAll, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(ticker);
    };
  }, [fetchAll]);

  // Derive stats
  const stats = {
    inQueue: queuedList.length,
    dispatchedToday: dispatchLog.filter((d) => d.isToday).length,
    avgWaitMinutes:
      queuedList.length > 0
        ? Math.round(queuedList.reduce((s, c) => s + c.waitMinutes, 0) / queuedList.length)
        : 0,
    longestWaitMinutes: queuedList.length > 0 ? Math.max(...queuedList.map((c) => c.waitMinutes)) : 0,
  };

  return { queuedList, dispatchLog, stats, loading, lastUpdated, refetch: fetchAll };
}
