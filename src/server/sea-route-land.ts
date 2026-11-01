import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

type Point = readonly [number, number];
type Bounds = readonly [number, number, number, number];
type LandPolygon = { rings: Position[][]; bounds: Bounds };
const tolerance = 1e-10;

// Leaflet draws straight segments in Web Mercator, so check that same geometry.
function project(latitude: number, longitude: number): Position {
  const clampedLatitude = Math.max(-85.0511287798, Math.min(85.0511287798, latitude));
  return [longitude, Math.log(Math.tan(Math.PI / 4 + clampedLatitude * Math.PI / 360)) * 180 / Math.PI];
}

function boundsOf(points: readonly Position[]): Bounds {
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const point of points) {
    left = Math.min(left, point[0]); bottom = Math.min(bottom, point[1]);
    right = Math.max(right, point[0]); top = Math.max(top, point[1]);
  }
  return [left, bottom, right, top];
}

function overlaps(a: Bounds, b: Bounds) {
  return a[0] <= b[2] + tolerance && a[2] >= b[0] - tolerance && a[1] <= b[3] + tolerance && a[3] >= b[1] - tolerance;
}

function orientation(a: Position, b: Position, c: Position) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point: Position, a: Position, b: Position) {
  return Math.abs(orientation(a, b, point)) <= tolerance &&
    point[0] >= Math.min(a[0], b[0]) - tolerance && point[0] <= Math.max(a[0], b[0]) + tolerance &&
    point[1] >= Math.min(a[1], b[1]) - tolerance && point[1] <= Math.max(a[1], b[1]) + tolerance;
}

/** Boundary is reported separately so even a coastline touch fails closed. */
function ringLocation(point: Position, ring: Position[]): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[previous], b = ring[index];
    if (onSegment(point, a, b)) return 'boundary';
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

function polygonContains(point: Position, polygon: LandPolygon) {
  if (!overlaps(polygon.bounds, [point[0], point[1], point[0], point[1]])) return false;
  const outer = ringLocation(point, polygon.rings[0]);
  if (outer !== 'inside') return outer === 'boundary';
  for (const hole of polygon.rings.slice(1)) {
    const location = ringLocation(point, hole);
    if (location === 'boundary') return true;
    if (location === 'inside') return false;
  }
  return true;
}

function segmentsTouch(a: Position, b: Position, c: Position, d: Position) {
  if (!overlaps([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    [Math.min(c[0], d[0]), Math.min(c[1], d[1]), Math.max(c[0], d[0]), Math.max(c[1], d[1])])) return false;
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (Math.abs(abC) <= tolerance && onSegment(c, a, b) || Math.abs(abD) <= tolerance && onSegment(d, a, b) ||
    Math.abs(cdA) <= tolerance && onSegment(a, c, d) || Math.abs(cdB) <= tolerance && onSegment(b, c, d)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

/** Coarse geographic guard; it cannot certify navigable water or small-island clearance. */
export function createLandMask(data: FeatureCollection<Polygon | MultiPolygon>) {
  const polygons: LandPolygon[] = data.features.flatMap(feature => {
    const shapes = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return shapes.filter(rings => rings[0]?.length >= 4).map(shape => {
      const rings = shape.map(ring => ring.map(coordinate => project(coordinate[1], coordinate[0])));
      return { rings, bounds: boundsOf(rings[0]) };
    });
  });
  if (!polygons.length) throw new Error('The sea-route land dataset is empty.');
  return {
    contains(point: Point) {
      const coordinate = project(point[0], point[1]);
      return polygons.some(polygon => polygonContains(coordinate, polygon));
    },
    intersectsPath(points: readonly Point[]) {
      const coordinates = points.map(([latitude, longitude]) => project(latitude, longitude));
      const routeBounds = boundsOf(coordinates);
      for (const polygon of polygons) {
        if (!overlaps(polygon.bounds, routeBounds)) continue;
        if (coordinates.some(point => polygonContains(point, polygon))) return true;
        for (let index = 1; index < coordinates.length; index++) {
          const a = coordinates[index - 1], b = coordinates[index];
          const segmentBounds: Bounds = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
          if (!overlaps(polygon.bounds, segmentBounds)) continue;
          for (const ring of polygon.rings) {
            for (let edge = 0, previous = ring.length - 1; edge < ring.length; previous = edge++) {
              if (segmentsTouch(a, b, ring[previous], ring[edge])) return true;
            }
          }
        }
      }
      return false;
    },
  };
}

let landMask: Promise<ReturnType<typeof createLandMask>> | undefined;
export function getSeaRouteLandMask() {
  if (!landMask) landMask = readFile(join(process.cwd(), 'src/server/data/ne-10m-land.geojson'), 'utf8')
    .then(text => createLandMask(JSON.parse(text) as FeatureCollection<Polygon | MultiPolygon>))
    .catch(error => { landMask = undefined; throw error; });
  return landMask;
}
