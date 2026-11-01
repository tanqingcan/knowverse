/** Shared dimensions for the procedural bench and its seated traveler. */
export const BENCH_MODEL_SCALE = 2.1;
export const SEATED_TRAVELER_SCALE = 1.25;
export const BENCH_SEAT_TOP = .07 * BENCH_MODEL_SCALE;
// Traveler coat: center .085 + sitting lift .03 - vertical radius .058.
export const TRAVELER_SEAT_Y = BENCH_SEAT_TOP - (.085 + .03 - .058) * SEATED_TRAVELER_SCALE + .004;
export const TRAVELER_SEAT_X = .03;
