export const MAX_ROUTE_POINTS = 100;

/** Keep each unfinished value as text until the normal Save validation runs. */
export function routeCoordinateRows(text: string) {
  if (text === '') return [];
  return text.split(/\r?\n/).map(line => {
    const comma = line.indexOf(',');
    return comma < 0 ? { latitude: line, longitude: '' } : { latitude: line.slice(0, comma), longitude: line.slice(comma + 1) };
  });
}

export function updateRouteCoordinate(text: string, index: number, field: 'latitude' | 'longitude', value: string) {
  const rows = routeCoordinateRows(text);
  if (!rows[index]) return text;
  const next = { ...rows[index], [field]: value };
  const parts = text.split(/(\r?\n)/);
  parts[index * 2] = `${next.latitude},${next.longitude}`;
  return parts.join('');
}

/** New intermediate points go before the destination, preserving the complete route. */
export function addRouteCoordinate(text: string) {
  const count = routeCoordinateRows(text).length;
  if (count >= MAX_ROUTE_POINTS) return text;
  if (!count) return ',\n,';
  const parts = text.split(/(\r?\n)/);
  const newline = parts[1] || '\n';
  if (count === 1) return `${text}${newline},`;
  parts.splice(parts.length - 1, 0, ',', newline);
  return parts.join('');
}

export function removeRouteCoordinate(text: string, index: number) {
  const count = routeCoordinateRows(text).length;
  if (index < 0 || index >= count) return text;
  if (count === 1) return '';
  const parts = text.split(/(\r?\n)/);
  parts.splice(index === count - 1 ? index * 2 - 1 : index * 2, 2);
  return parts.join('');
}
