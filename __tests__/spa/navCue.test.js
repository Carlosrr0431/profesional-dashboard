import { currentNavCue, maneuverPhrase } from '../../src/spa/conductor/navCue';

describe('guia de navegacion web', () => {
  test('dice doblar a la derecha en la calle del paso', () => {
    expect(maneuverPhrase({
      maneuver: 'turn-right',
      html_instructions: 'Balcarce',
    })).toBe('Doblá a la derecha en Balcarce');
  });

  test('salta el giro que el auto ya pasó', () => {
    const cue = currentNavCue([
      { maneuver: 'turn-left', html_instructions: 'Mitre', endLocation: { lat: -24.79, lng: -65.41 } },
      { maneuver: 'turn-right', html_instructions: 'España', endLocation: { lat: -24.80, lng: -65.42 } },
    ], -24.79, -65.41);
    expect(cue.phrase).toContain('España');
  });
});