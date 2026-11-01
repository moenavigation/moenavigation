import { createElement } from 'react';
import { Anchor, Compass, Container, Fuel, LifeBuoy, MapPin, MessagesSquare, ShieldCheck, Ship, type LucideIcon, type LucideProps } from 'lucide-react';

/** Shared choices keep the CMS preview and every public service icon consistent. */
export const serviceIconOptions = [
  { value: 'Ship', label: 'Ship', Icon: Ship },
  { value: 'Fuel', label: 'Fuel', Icon: Fuel },
  { value: 'Container', label: 'Container', Icon: Container },
  { value: 'Compass', label: 'Compass', Icon: Compass },
  { value: 'Anchor', label: 'Anchor', Icon: Anchor },
  { value: 'LifeBuoy', label: 'Rescue', Icon: LifeBuoy },
  { value: 'ShieldCheck', label: 'Safety', Icon: ShieldCheck },
  { value: 'MapPin', label: 'Location', Icon: MapPin },
  { value: 'MessagesSquare', label: 'Communication', Icon: MessagesSquare },
] as const satisfies readonly { value: string; label: string; Icon: LucideIcon }[];

export function getServiceIcon(value?: string): LucideIcon {
  return serviceIconOptions.find(option => option.value === value)?.Icon ?? Ship;
}

/** A stable component avoids defining a dynamic component type in its consumer. */
export function ServiceIcon({ name, ...props }: LucideProps & { name?: string }) {
  return createElement(getServiceIcon(name), props);
}
