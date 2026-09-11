const {
  parseStars,
  sanitizeRatingComment,
  computeRatingAggregate,
  summarizeDriverRating,
  canRateCompletedTrip,
  formatReviewsCount,
} = require('../../../shared/driver-rating');
const {
  assertCanSubmitDriverRating,
  buildDriverRatingInsert,
  isUniqueViolation,
} = require('../../src/lib/driverRating');

describe('driver-rating', () => {
  it('parseStars acepta 1–5 y rechaza el resto', () => {
    expect(parseStars(5)).toBe(5);
    expect(parseStars('3')).toBe(3);
    expect(parseStars(4.4)).toBe(4);
    expect(parseStars(0)).toBeNull();
    expect(parseStars(6)).toBeNull();
    expect(parseStars('')).toBeNull();
  });

  it('sanitizeRatingComment recorta y vacía a null', () => {
    expect(sanitizeRatingComment('  muy   bueno  ')).toBe('muy bueno');
    expect(sanitizeRatingComment('   ')).toBeNull();
    expect(sanitizeRatingComment('a'.repeat(400)).length).toBe(280);
  });

  it('computeRatingAggregate calcula promedio e histograma', () => {
    expect(computeRatingAggregate([])).toEqual({
      count: 0,
      average: null,
      histogram: [0, 0, 0, 0, 0],
    });
    expect(computeRatingAggregate([5, 5, 4])).toEqual({
      count: 3,
      average: 4.7,
      histogram: [0, 0, 0, 1, 2],
    });
  });

  it('summarizeDriverRating no inventa 5.0 si no hay reseñas', () => {
    expect(summarizeDriverRating({ rating: 5, rating_count: 0 })).toMatchObject({
      hasRatings: false,
      averageLabel: 'Nuevo',
      compactLabel: 'Nuevo',
      count: 0,
    });
    expect(summarizeDriverRating({
      rating: 4.8,
      rating_count: 23,
      rating_star_5: 18,
      rating_star_4: 5,
    })).toMatchObject({
      hasRatings: true,
      averageLabel: '4.8',
      countLabel: '23 reseñas',
      compactLabel: '4.8 · 23 reseñas',
      histogram: [0, 0, 0, 5, 18],
    });
    expect(formatReviewsCount(1)).toBe('1 reseña');
  });

  it('canRateCompletedTrip exige viaje terminado con chofer', () => {
    expect(canRateCompletedTrip({ status: 'completed', driver_id: 'd1' })).toBe(true);
    expect(canRateCompletedTrip({ status: 'in_progress', driver_id: 'd1' })).toBe(false);
    expect(canRateCompletedTrip({ status: 'completed', driver_id: null })).toBe(false);
  });

  it('assertCanSubmitDriverRating valida trip y estrellas', () => {
    expect(assertCanSubmitDriverRating({ trip: null, stars: 5 }).reason).toBe('trip_not_found');
    expect(assertCanSubmitDriverRating({
      trip: { id: 't1', status: 'accepted', driver_id: 'd1' },
      stars: 5,
    }).reason).toBe('trip_not_completed');
    expect(assertCanSubmitDriverRating({
      trip: { id: 't1', status: 'completed', driver_id: 'd1' },
      stars: 0,
    }).reason).toBe('invalid_stars');
    expect(assertCanSubmitDriverRating({
      trip: { id: 't1', status: 'completed', driver_id: 'd1' },
      stars: 5,
    })).toEqual({ ok: true, stars: 5, driverId: 'd1' });
  });

  it('buildDriverRatingInsert arma el registro', () => {
    expect(buildDriverRatingInsert({
      trip: { id: 't1', driver_id: 'd1' },
      phone: '5493870000000',
      stars: 4,
      comment: '  puntual  ',
    })).toEqual({
      trip_id: 't1',
      driver_id: 'd1',
      passenger_phone: '5493870000000',
      stars: 4,
      comment: 'puntual',
    });
  });

  it('isUniqueViolation detecta 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
});
