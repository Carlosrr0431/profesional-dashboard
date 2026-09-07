const { mapStageClassName, resizeMapInstance } = require('../../src/lib/mapFullscreen');

describe('mapStageClassName', () => {
  it('expande el mapa a toda la pantalla', () => {
    expect(mapStageClassName(true)).toMatch(/fixed inset-0/);
    expect(mapStageClassName(true)).toMatch(/z-\[80\]/);
    expect(mapStageClassName(false)).toMatch(/relative/);
    expect(mapStageClassName(false)).not.toMatch(/fixed inset-0/);
  });
});

describe('resizeMapInstance', () => {
  it('llama resize en el mapa de MapLibre', () => {
    const resize = jest.fn();
    expect(resizeMapInstance({ getMap: () => ({ resize }) })).toBe(true);
    expect(resize).toHaveBeenCalledTimes(1);
  });

  it('ignora refs vacíos', () => {
    expect(resizeMapInstance(null)).toBe(false);
    expect(resizeMapInstance({})).toBe(false);
  });
});
