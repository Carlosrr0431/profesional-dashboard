import { useState, useEffect, useCallback } from 'react';
import { formatPrice, formatDateTime } from '../lib/utils';
import { paymentSourceLabel, toAnchorString } from '../lib/commissionPaymentPeriods';
import CommissionPeriodPicker from './CommissionPeriodPicker';

export default function CommissionPaymentsReport({ onSelectDriver }) {
  const [period, setPeriod] = useState('week');
  const [anchorDate, setAnchorDate] = useState(() => toAnchorString(new Date()));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ period });
      if (period !== 'all') {
        params.set('anchor', anchorDate);
      }
      const response = await fetch(
        `/api/driver-management/commission-payments?${params.toString()}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || 'No se pudo cargar el reporte');
      }
      setData(payload?.data || null);
    } catch (err) {
      setError(err?.message || 'Error al cargar pagos');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, anchorDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleModeChange = (nextMode) => {
    setPeriod(nextMode);
    if (nextMode !== 'all') {
      setAnchorDate(toAnchorString(new Date()));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
      <div className="px-6 lg:px-10 py-3 border-b border-light-300/50 bg-light-50 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-navy-900">Pagos de comisión</h2>
            <p className="text-xs text-gray-500">
              Registro global de pagos Paypertic y manuales de todos los choferes
            </p>
          </div>
          <CommissionPeriodPicker
            useModal
            mode={period}
            onModeChange={handleModeChange}
            anchorDate={anchorDate}
            onAnchorChange={setAnchorDate}
          />
        </div>

        {!loading && data ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <SummaryCard
              label={data.periodLabel || 'Período'}
              value={formatPrice(data.total)}
              sub={`${data.count} pago${data.count !== 1 ? 's' : ''}`}
              accent="accent"
            />
            <SummaryCard
              label="Semana actual"
              value={formatPrice(data.weekTotal)}
              sub="Lunes a hoy (Salta)"
              accent="online"
            />
            <SummaryCard
              label="Mes actual"
              value={formatPrice(data.monthTotal)}
              sub="Mes calendario en curso"
              accent="amber"
            />
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto px-6 lg:px-10 py-6">
        {loading ? (
          <div className="grid xl:grid-cols-5 gap-6">
            <div className="xl:col-span-2 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`pay-skel-a-${i}`} className="h-12 rounded-xl bg-light-200/90 animate-pulse" />
              ))}
            </div>
            <div className="xl:col-span-3 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`pay-skel-b-${i}`} className="h-14 rounded-xl bg-light-200/90 animate-pulse" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-danger text-sm">{error}</div>
        ) : !data?.payments?.length ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No hay pagos registrados en este período
          </div>
        ) : (
          <div className="grid xl:grid-cols-5 gap-6 w-full max-w-none">
            {data.byDriver?.length > 0 ? (
              <div className="xl:col-span-2 bg-light-50 rounded-2xl border border-light-300/50 overflow-hidden h-fit">
                <div className="px-4 py-3 border-b border-light-300/50">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total por chofer
                  </h3>
                </div>
                <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[320px]">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-light-50">
                      <tr className="border-b border-light-300/40">
                        <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase">Chofer</th>
                        <th className="text-center px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase">Pagos</th>
                        <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDriver.map((row) => (
                        <tr
                          key={row.driver_id}
                          className="border-b border-light-300/30 hover:bg-light-200/40 cursor-pointer"
                          onClick={() => onSelectDriver?.(row.driver_id)}
                        >
                          <td className="px-4 py-2.5 text-sm font-medium text-navy-900">{row.driver_name}</td>
                          <td className="px-4 py-2.5 text-center text-sm text-gray-500">{row.count}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-online">{formatPrice(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className={`bg-light-50 rounded-2xl border border-light-300/50 overflow-hidden ${data.byDriver?.length ? 'xl:col-span-3' : 'xl:col-span-5'}`}>
              <div className="px-4 py-3 border-b border-light-300/50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Detalle de pagos
                </h3>
              </div>
              <div className="divide-y divide-light-300/30 overflow-auto max-h-[calc(100vh-280px)] min-h-[320px]">
                {data.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-light-200/30 cursor-pointer"
                    onClick={() => onSelectDriver?.(payment.driver_id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-900 truncate">{payment.driver_name}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {paymentSourceLabel(payment.payment_source, payment.notes)}
                        {payment.paypertic_id ? ` · #${payment.paypertic_id}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-online">{formatPrice(payment.amount)}</p>
                      <p className="text-[10px] text-gray-400">{formatDateTime(payment.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, accent }) {
  const accentClass = accent === 'online'
    ? 'text-online'
    : accent === 'amber'
      ? 'text-amber-600'
      : 'text-accent';

  return (
    <div className="bg-light-200/50 border border-light-300/40 rounded-xl px-4 py-3">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${accentClass}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
