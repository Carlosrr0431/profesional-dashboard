const {
  parseStars,
  sanitizeRatingComment,
  summarizeDriverRating,
  canRateCompletedTrip,
} = require('../../shared/driver-rating.js');

function isUniqueViolation(error) {
  return String(error?.code || '') === '23505';
}

function assertCanSubmitDriverRating({ trip, stars }) {
  if (!trip?.id) {
    return {
      ok: false,
      status: 404,
      reason: 'trip_not_found',
      message: 'No encontramos el viaje.',
    };
  }

  if (!canRateCompletedTrip(trip)) {
    const status = String(trip.status || '').toLowerCase();
    if (status !== 'completed') {
      return {
        ok: false,
        status: 409,
        reason: 'trip_not_completed',
        message: 'Solo podés calificar cuando el viaje ya terminó.',
      };
    }
    return {
      ok: false,
      status: 409,
      reason: 'no_driver',
      message: 'Este viaje no tiene un conductor para calificar.',
    };
  }

  const parsed = parseStars(stars);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_stars',
      message: 'Elegí una calificación de 1 a 5 estrellas.',
    };
  }

  return { ok: true, stars: parsed, driverId: trip.driver_id };
}

function buildDriverRatingInsert({ trip, phone, stars, comment }) {
  return {
    trip_id: trip.id,
    driver_id: trip.driver_id,
    passenger_phone: phone,
    stars,
    comment: sanitizeRatingComment(comment),
  };
}

module.exports = {
  parseStars,
  sanitizeRatingComment,
  summarizeDriverRating,
  canRateCompletedTrip,
  isUniqueViolation,
  assertCanSubmitDriverRating,
  buildDriverRatingInsert,
};
