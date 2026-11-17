export type RouteCurvePoint = readonly [number, number];
type Point = [number, number];
export type RouteDisplayGeometry = { path: Point[]; markerPoints: Point[] };

// Display-only rounding, measured along the two original legs at each corner.
// A quadratic stays inside the entry/corner/exit triangle: it cannot overshoot.
export const LONG_ROUTE_LEG_METRES = 10000;
export const LONG_ROUTE_CORNER_FRACTION = 0.5;
export const MAX_LONG_ROUTE_DEVIATION_METRES = 20000;
export const MAX_SMOOTHED_ROUTE_POINTS = 700;
const earthRadius = 6378137;
const radians = Math.PI / 180;
const mercatorLatitudeLimit = 85.0511287798;

const copy = (point: RouteCurvePoint): Point => [point[0], point[1]];
const project = ([latitude, longitude]: RouteCurvePoint): Point => [
  earthRadius * longitude * radians,
  earthRadius * Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2)),
];
const unproject = ([x, y]: Point): Point => [
  (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) / radians,
  x / earthRadius / radians,
];
const quadratic = (entry: Point, corner: Point, exit: Point, t: number): Point => {
  const remaining = 1 - t;
  return [
    remaining * remaining * entry[0] + 2 * remaining * t * corner[0] + t * t * exit[0],
    remaining * remaining * entry[1] + 2 * remaining * t * corner[1] + t * t * exit[1],
  ];
};
const segmentDistance = (point: Point, a: Point, b: Point) => {
  const x = b[0] - a[0], y = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * x + (point[1] - a[1]) * y) / (x * x + y * y)));
  return Math.hypot(point[0] - a[0] - t * x, point[1] - a[1] - t * y);
};

/**
 * Soften a reviewed illustrative route without editing its stored waypoints.
 * Endpoints and fine approach geometry remain exact;
 * straight legs, duplicate points, U-turns and unsupported wraps stay unchanged.
 * Coarse offshore marker controls are projected onto the displayed polyline.
 * This is drawing geometry, never a navigation or land-clearance calculation.
 */
export function createRouteDisplayGeometry(points: readonly RouteCurvePoint[]): RouteDisplayGeometry {
  const original = points.map(copy);
  const markerPoints = points.map(copy);
  const maxSamples = Math.min(32, Math.floor((MAX_SMOOTHED_ROUTE_POINTS - 2) / Math.max(1, points.length - 2)) - 1);
  if (points.length < 3 || maxSamples < 2 || points.some((point, index) =>
    !Number.isFinite(point[0]) || !Number.isFinite(point[1])
    || Math.abs(point[0]) > mercatorLatitudeLimit || Math.abs(point[1]) > 180
    || index > 0 && Math.abs(point[1] - points[index - 1][1]) > 180)) return { path: original, markerPoints };

  const projected = points.map(project);
  const result: Point[] = [copy(points[0])];
  const coarseCorners: { index: number; start: number; end: number }[] = [];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = projected[index - 1], corner = projected[index], next = projected[index + 1];
    const incoming: Point = [corner[0] - previous[0], corner[1] - previous[1]];
    const outgoing: Point = [next[0] - corner[0], next[1] - corner[1]];
    const before = Math.hypot(...incoming), after = Math.hypot(...outgoing);
    const cosine = before && after ? Math.max(-1, Math.min(1, (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / before / after)) : 1;
    // Nearly straight corners need no extra points; doubling back must not turn
    // into a loop or a shortcut across a narrow channel.
    if (before < 1 || after < 1 || cosine > Math.cos(3 * radians) || cosine < Math.cos(150 * radians)) {
      result.push(copy(points[index]));
      continue;
    }
    const scale = Math.cos(points[index][0] * radians);
    const shortestLeg = Math.min(before, after);
    // Offshore curves use independent half-leg arms. Adjacent curves therefore
    // meet near the midpoint of a long leg instead of leaving a ruler-straight
    // bridge. Dense river/harbour waypoints keep their exact geometry.
    const longLegs = shortestLeg * scale > LONG_ROUTE_LEG_METRES;
    if (!longLegs) {
      result.push(copy(points[index]));
      continue;
    }
    let entryTrim = before * LONG_ROUTE_CORNER_FRACTION;
    let exitTrim = after * LONG_ROUTE_CORNER_FRACTION;
    // A short approach beside a much longer sea leg must not pull a broad
    // offshore sweep sideways across that approach's nearby coastline.
    if (Math.max(before, after) > shortestLeg * 3) {
      if (before < after) entryTrim = before * .2;
      else exitTrim = after * .2;
    }
    const arms = (): [Point, Point] => [
      [corner[0] - incoming[0] / before * entryTrim, corner[1] - incoming[1] / before * entryTrim],
      [corner[0] + outgoing[0] / after * exitTrim, corner[1] + outgoing[1] / after * exitTrim],
    ];
    {
      const [entry, exit] = arms();
      let deviation = 0;
      for (let sample = 1; sample < 64; sample++) {
        const point = quadratic(entry, corner, exit, sample / 64);
        deviation = Math.max(deviation, Math.min(segmentDistance(point, previous, corner), segmentDistance(point, corner, next)));
      }
      // The same local triangle is scaled toward its corner, preserving its
      // shape. Leave margin between sampled measurement and the hard bound.
      const reduction = Math.min(1, MAX_LONG_ROUTE_DEVIATION_METRES * .98 / scale / deviation);
      entryTrim *= reduction;
      exitTrim *= reduction;
    }
    const [entry, exit] = arms();
    const samples = maxSamples;
    const firstSample = result.length;
    result.push(unproject(entry));
    for (let sample = 1; sample <= samples; sample++) {
      result.push(unproject(quadratic(entry, corner, exit, sample / samples)));
    }
    coarseCorners.push({ index, start: firstSample, end: result.length - 1 });
  }
  result.push(copy(points.at(-1)!));
  const displayed = result.map(project);
  for (const { index, start, end } of coarseCorners) {
    const source = projected[index];
    let closest: Point = source, minimum = Infinity;
    // Keep this control attached to its own arc even if another part of the
    // route doubles back nearby.
    for (let segment = start + 1; segment <= end; segment++) {
      const a = displayed[segment - 1], b = displayed[segment];
      const x = b[0] - a[0], y = b[1] - a[1];
      const squared = x * x + y * y;
      const t = squared ? Math.max(0, Math.min(1, ((source[0] - a[0]) * x + (source[1] - a[1]) * y) / squared)) : 0;
      const point: Point = [a[0] + t * x, a[1] + t * y];
      const distance = Math.hypot(source[0] - point[0], source[1] - point[1]);
      if (distance < minimum) { minimum = distance; closest = point; }
    }
    markerPoints[index] = unproject(closest);
  }
  return { path: result, markerPoints };
}

export function smoothRoutePath(points: readonly RouteCurvePoint[]): Point[] {
  return createRouteDisplayGeometry(points).path;
}
