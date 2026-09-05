/** @jest-environment node */

import {
  collectDriverIdsToDelete,
  deleteDriverCascade,
} from '../../src/lib/deleteDriverCascade';

function createCascadeClient({ driver = null, assigned = [], trips = [] } = {}) {
  const deletedIds = [];
  const deletedUsers = [];
  const updates = [];

  const resolve = (state) => {
    if (state.table === 'trips' && state.op === 'select') {
      const ids = state.inFilters.driver_id || [];
      const statuses = state.inFilters.status || [];
      const data = trips.filter(
        (trip) => ids.includes(trip.driver_id) && statuses.includes(trip.status),
      );
      return { data, error: null };
    }

    if (state.table === 'trips' && state.op === 'update') {
      updates.push({ table: 'trips', filters: { ...state.filters }, inFilters: { ...state.inFilters }, payload: state.payload });
      return { data: null, error: null };
    }

    if (state.table === 'drivers' && state.op === 'select') {
      if (state.filters.owner_id && state.filters.is_assigned_driver === true) {
        return {
          data: assigned.filter((row) => row.owner_id === state.filters.owner_id),
          error: null,
        };
      }
      return { data: [], error: null };
    }

    if (state.table === 'drivers' && state.op === 'update') {
      updates.push({ table: 'drivers', filters: { ...state.filters }, payload: state.payload });
      return { data: null, error: null };
    }

    if (state.table === 'drivers' && state.op === 'delete') {
      if (state.inFilters.id) deletedIds.push(...state.inFilters.id);
      else if (state.filters.id) deletedIds.push(state.filters.id);
      return { data: null, error: null };
    }

    return { data: null, error: null };
  };

  const from = jest.fn((table) => {
    const state = { table, op: 'select', filters: {}, inFilters: {}, payload: null };
    const builder = {
      select() { state.op = 'select'; return builder; },
      update(payload) { state.op = 'update'; state.payload = payload; return builder; },
      delete() { state.op = 'delete'; return builder; },
      eq(col, val) { state.filters[col] = val; return builder; },
      in(col, vals) { state.inFilters[col] = vals; return builder; },
      limit() { return builder; },
      maybeSingle: async () => {
        if (table === 'drivers' && state.filters.id) {
          return { data: driver?.id === state.filters.id ? driver : null, error: null };
        }
        return { data: null, error: null };
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(resolve(state)).then(onfulfilled, onrejected);
      },
    };
    return builder;
  });

  return {
    client: {
      from,
      auth: {
        admin: {
          deleteUser: jest.fn(async (userId) => {
            deletedUsers.push(userId);
            return { data: {}, error: null };
          }),
        },
      },
    },
    deletedIds,
    deletedUsers,
    updates,
  };
}

describe('collectDriverIdsToDelete', () => {
  it('titular incluye asignados y no inventa socios', () => {
    const result = collectDriverIdsToDelete(
      { id: 'owner-1' },
      [{ id: 'asig-1' }, { id: 'asig-2' }],
    );
    expect(result).toEqual({
      targetIds: ['owner-1', 'asig-1', 'asig-2'],
      assignedIds: ['asig-1', 'asig-2'],
    });
  });

  it('asignado solo se borra a sí mismo', () => {
    expect(collectDriverIdsToDelete(
      { id: 'asig-1', owner_id: 'owner-1', is_assigned_driver: true },
      [{ id: 'asig-2' }],
    )).toEqual({ targetIds: ['asig-1'], assignedIds: [] });
  });
});

describe('deleteDriverCascade', () => {
  const owner = {
    id: 'owner-1',
    user_id: 'auth-owner',
    full_name: 'Juan Pérez',
    owner_id: null,
    is_assigned_driver: false,
  };
  const assigned = [
    { id: 'asig-1', user_id: 'auth-asig-1', full_name: 'Ana', owner_id: 'owner-1', is_assigned_driver: true },
    { id: 'asig-2', user_id: 'auth-asig-2', full_name: 'Luis', owner_id: 'owner-1', is_assigned_driver: true },
  ];

  it('titular sin asignados borra solo al titular', async () => {
    const { client, deletedIds, deletedUsers } = createCascadeClient({ driver: owner, assigned: [] });
    const result = await deleteDriverCascade(client, 'owner-1');

    expect(result).toEqual({
      id: 'owner-1',
      full_name: 'Juan Pérez',
      deletedAssignedCount: 0,
      deletedIds: ['owner-1'],
    });
    expect(deletedIds).toEqual(['owner-1']);
    expect(deletedUsers).toEqual(['auth-owner']);
  });

  it('titular con asignados borra flota y no toca a un socio', async () => {
    const { client, deletedIds, deletedUsers } = createCascadeClient({ driver: owner, assigned });
    const result = await deleteDriverCascade(client, 'owner-1');

    expect(result.deletedAssignedCount).toBe(2);
    expect(result.deletedIds).toEqual(['owner-1', 'asig-1', 'asig-2']);
    expect(deletedIds).toEqual(['asig-1', 'asig-2', 'owner-1']);
    expect(deletedUsers).toEqual(['auth-asig-1', 'auth-asig-2', 'auth-owner']);
    expect(deletedIds).not.toContain('socio-9');
  });

  it('asignado no borra al titular', async () => {
    const { client, deletedIds, deletedUsers } = createCascadeClient({
      driver: assigned[0],
      assigned,
    });
    const result = await deleteDriverCascade(client, 'asig-1');

    expect(result.deletedAssignedCount).toBe(0);
    expect(result.deletedIds).toEqual(['asig-1']);
    expect(deletedIds).toEqual(['asig-1']);
    expect(deletedUsers).toEqual(['auth-asig-1']);
    expect(deletedIds).not.toContain('owner-1');
  });

  it('viaje activo bloquea el delete', async () => {
    const { client, deletedIds } = createCascadeClient({
      driver: owner,
      assigned,
      trips: [{ id: 'trip-1', driver_id: 'asig-1', status: 'in_progress' }],
    });

    await expect(deleteDriverCascade(client, 'owner-1')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/viaje activo/i),
    });
    expect(deletedIds).toEqual([]);
  });

  it('chofer inexistente devuelve NOT_FOUND', async () => {
    const { client } = createCascadeClient({ driver: null });
    await expect(deleteDriverCascade(client, 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
