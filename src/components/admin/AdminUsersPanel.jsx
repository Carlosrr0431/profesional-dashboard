'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useToast } from '../../context/ToastContext';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminUsersPanel({
  onBack,
  currentUserId,
  driverAppLatestVersionCode = 0,
  passengerAppLatestVersionCode = 0,
  onUpdateSetting,
}) {
  const toast = useToast();
  const { getAccessToken } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [busyUserId, setBusyUserId] = useState(null);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [getAccessToken]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users', {
        headers: await authHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los usuarios.');
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      toast.error(error.message || 'Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''))),
    [users],
  );

  async function handleCreateUser(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo crear el usuario.');
      toast.success('Usuario creado correctamente.');
      setNewEmail('');
      setNewPassword('');
      await loadUsers();
    } catch (error) {
      toast.error(error.message || 'Error al crear usuario.');
    } finally {
      setCreating(false);
    }
  }

  async function handlePasswordUpdate(userId) {
    const password = String(passwordDrafts[userId] || '');
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo actualizar la contraseña.');
      toast.success('Contraseña actualizada.');
      setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
    } catch (error) {
      toast.error(error.message || 'Error al actualizar contraseña.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDeleteUser(userId, email) {
    if (!window.confirm(`¿Eliminar el usuario ${email}?`)) return;

    setBusyUserId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo eliminar el usuario.');
      toast.success('Usuario eliminado.');
      await loadUsers();
    } catch (error) {
      toast.error(error.message || 'Error al eliminar usuario.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-light-100">
      <div className="flex-shrink-0 h-14 px-5 border-b border-gray-100 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-navy-900">Usuarios del panel</h2>
          <p className="text-xs text-gray-500">Administrá accesos al dashboard de operaciones.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Volver al mapa
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-5 space-y-5">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-navy-900">Control de versiones</h3>
          <p className="mt-1 text-xs text-gray-500">
            Actualizaciones de apps (Google Play). Poné el{' '}
            <span className="font-semibold text-gray-600">versionCode</span> del último AAB
            publicado en Play Console. Si el usuario tiene uno menor, la app muestra el modal
            para actualizar. No confundir con la versión visible (ej. 1.0.8).
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-semibold block mb-1 uppercase tracking-wide">
                Conductor (versionCode)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={driverAppLatestVersionCode > 0 ? String(driverAppLatestVersionCode) : ''}
                placeholder="ej. 10"
                onChange={(e) => onUpdateSetting?.(
                  'driver_app_latest_version_code',
                  e.target.value.replace(/\D/g, '')
                )}
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-semibold block mb-1 uppercase tracking-wide">
                Pasajero (versionCode)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={passengerAppLatestVersionCode > 0 ? String(passengerAppLatestVersionCode) : ''}
                placeholder="ej. 9"
                onChange={(e) => onUpdateSetting?.(
                  'passenger_app_latest_version_code',
                  e.target.value.replace(/\D/g, '')
                )}
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500 leading-relaxed">
            Referencia actual: Conductor 1.0.13 →{' '}
            <span className="font-semibold text-navy-900">15</span>
            {' · '}Pasajero 1.0.14 →{' '}
            <span className="font-semibold text-navy-900">15</span>.
            Cada vez que subas un AAB nuevo, incrementá este número.
          </p>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-navy-900">Crear usuario</h3>
          <p className="mt-1 text-xs text-gray-500">El usuario podrá ingresar con email y contraseña.</p>

          <form className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={handleCreateUser}>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="admin@profesional.app"
              className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Contraseña (mín. 8)"
              className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
            />
            <button
              type="submit"
              disabled={creating}
              className="h-10 rounded-xl bg-navy-900 text-sm font-semibold text-white hover:bg-navy-900/90 disabled:opacity-60"
            >
              {creating ? 'Creando...' : 'Crear usuario'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900">Usuarios registrados</h3>
            <button
              type="button"
              onClick={loadUsers}
              className="text-xs font-semibold text-navy-900 hover:underline"
            >
              Actualizar
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando usuarios...</div>
          ) : sortedUsers.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Todavía no hay usuarios admin.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sortedUsers.map((user) => {
                const isSelf = user.id === currentUserId;
                const isBusy = busyUserId === user.id;
                return (
                  <div key={user.id} className="p-5 flex flex-col xl:flex-row xl:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
                        {isSelf ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-navy-dim text-navy-900">
                            Vos
                          </span>
                        ) : null}
                        {user.emailConfirmed ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            Confirmado
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Creado: {formatDate(user.createdAt)} · Último acceso: {formatDate(user.lastSignInAt)}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <input
                        type="password"
                        minLength={8}
                        value={passwordDrafts[user.id] || ''}
                        onChange={(event) => setPasswordDrafts((prev) => ({
                          ...prev,
                          [user.id]: event.target.value,
                        }))}
                        placeholder="Nueva contraseña"
                        className="h-9 w-full sm:w-52 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handlePasswordUpdate(user.id)}
                        className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-60"
                      >
                        Cambiar clave
                      </button>
                      {!isSelf ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="h-9 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
