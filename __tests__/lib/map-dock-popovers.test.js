const {
  formatWaitLabel,
  isMapListPopover,
} = require('../../src/components/MapDockPopovers');

describe('MapDockPopovers helpers', () => {
  it('formatea esperas largas en horas', () => {
    expect(formatWaitLabel(12)).toBe('12 min');
    expect(formatWaitLabel(60)).toBe('1 h');
    expect(formatWaitLabel(225)).toBe('3 h 45 min');
    expect(formatWaitLabel(748)).toBe('12 h 28 min');
  });

  it('solo trata cola, viajes y programados como paneles de lista', () => {
    expect(isMapListPopover('queue')).toBe(true);
    expect(isMapListPopover('trips')).toBe(true);
    expect(isMapListPopover('scheduled-due')).toBe(true);
    expect(isMapListPopover('new-trip')).toBe(false);
    expect(isMapListPopover(null)).toBe(false);
  });
});
