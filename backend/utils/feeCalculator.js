// =========================================================
// SmartPark — Fee calculation (authoritative, backend-only)
// Mirrors the original logic exactly:
//   hours = outTime - inTime
//   if hours <= 0: hours = 24 - (inTime - outTime)
//   fee = hours * rate
// The frontend never computes real fees — it may only show a
// live "estimated fee so far" for UI purposes, using this same
// formula against the current hour, which the backend recomputes
// authoritatively at removal time regardless of what the client sent.
// =========================================================

function computeHours(inTime, outTime) {
  if (inTime === outTime) {
    return 1; // Minimum 1-hour billing for same-hour stay
  }
  let hours = outTime - inTime;
  if (hours < 0) {
    hours = 24 - (inTime - outTime);
  }
  return Math.max(1, hours);
}

function computeFee(hours, rate) {
  return Math.max(1, hours) * rate;
}

module.exports = { computeHours, computeFee };
