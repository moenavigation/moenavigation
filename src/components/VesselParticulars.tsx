import { Container, Construction, Droplets, Ruler, Weight } from 'lucide-react';
import { useId } from 'react';
import type { VesselSpecs } from '@/lib/cms-types';
import { local, type Locale } from '@/lib/content';
import { technicalSections } from '@/lib/vessel-technical-sections';
import styles from './VesselParticulars.module.css';

type Particular = { label: string; value: number | undefined; unit?: string; dimension?: boolean };

export default function VesselParticulars({ locale, specs }: { locale: Locale; specs?: VesselSpecs }) {
  const id = useId();
  const number = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-GB', { maximumFractionDigits: 3 });
  const dimension = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const metres = local(locale, 'm', 'ม.');
  const tonnes = local(locale, 'tonnes', 'ตัน');
  const groups: { key: string; title: string; icon: typeof Ruler; rows: Particular[] }[] = [
    { key: 'dimension', title: local(locale, 'Dimension', 'ขนาดเรือ'), icon: Ruler, rows: [
      { label: local(locale, 'LOA', 'ความยาวตลอดลำ (LOA)'), value: specs?.lengthM, unit: metres, dimension: true },
      ...(specs?.lbpM !== undefined ? [{ label: local(locale, 'Length between perpendiculars', 'ความยาวระหว่างเส้นฉาก'), value: specs.lbpM, unit: metres, dimension: true }] : []),
      { label: local(locale, 'Breadth', 'ความกว้าง'), value: specs?.beamM, unit: metres, dimension: true },
      { label: local(locale, 'Depth', 'ความลึก'), value: specs?.depthM, unit: metres, dimension: true },
      { label: local(locale, 'Draft', 'ระยะกินน้ำลึก'), value: specs?.draftM, unit: metres, dimension: true },
    ] },
    { key: 'container', title: local(locale, 'Container Capacity', 'ความจุตู้คอนเทนเนอร์'), icon: Container, rows: [
      { label: local(locale, 'Nominal', 'ความจุตามพิกัด'), value: specs?.capacityTeu, unit: 'TEU' },
      { label: local(locale, 'Reefer Plug', 'จุดจ่ายไฟตู้เย็น'), value: specs?.reeferPlugs, unit: local(locale, 'units', 'จุด') },
    ] },
    { key: 'tonnage', title: local(locale, 'Tonnage', 'ขนาดระวาง'), icon: Weight, rows: [
      { label: specs?.tonnageBasis === 'international' ? 'GT' : 'GRT', value: specs?.grossTonnage },
      { label: specs?.tonnageBasis === 'international' ? 'NT' : 'NRT', value: specs?.netTonnage },
      { label: 'DWT', value: specs?.deadweightT, unit: tonnes },
      { label: 'DWCC', value: specs?.cargoCapacityT, unit: tonnes },
    ] },
  ];
  if (specs?.craneSwlT !== undefined || specs?.cargoVolumeM3 !== undefined || specs?.cargoTanks !== undefined) {
    const equipment = [
      { label: local(locale, 'Safe working load', 'พิกัดยกที่ปลอดภัย'), value: specs.craneSwlT, unit: tonnes },
      { label: local(locale, 'Cargo volume at 100%', 'ปริมาตรบรรทุกที่ 100%'), value: specs.cargoVolumeM3, unit: 'm³' },
      { label: local(locale, 'Cargo tanks', 'จำนวนถังสินค้า'), value: specs.cargoTanks },
    ].filter(row => row.value !== undefined);
    const crane = specs.craneSwlT !== undefined && equipment.length === 1;
    const capacity = { key: 'cargo', title: crane ? local(locale, 'Crane capacity', 'กำลังยกเครน') : local(locale, 'Cargo capacity', 'ความจุสินค้า'), icon: crane ? Construction : Droplets, rows: equipment };
    if (specs.capacityTeu === undefined && specs.reeferPlugs === undefined) groups.splice(1, 1, capacity);
    else groups.push(capacity);
  }

  const technical = technicalSections.map(section => ({
    key: section.key, title: section[locale],
    lines: (specs?.[locale === 'th' ? section.keyTh : section.key] ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean),
  })).filter(section => section.lines.length > 0);

  return <><div className={styles.groups}>
    {groups.map(({ key, title, icon: Icon, rows }) => <section className={styles.group} key={key} aria-labelledby={`${id}-${key}`}>
      <header className={styles.heading}><span className={styles.icon}><Icon aria-hidden="true" /></span><h2 id={`${id}-${key}`}>{title}</h2></header>
      <dl className={styles.rows}>
        {rows.map(row => <div className={styles.row} key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value !== undefined && Number.isFinite(row.value)
            ? <>{(row.dimension ? dimension : number).format(row.value)}{row.unit && <span className={styles.unit}> {row.unit}</span>}</>
            : <><span aria-hidden="true" className={styles.missing}>—</span><span className="sr-only">{local(locale, 'Not provided', 'ยังไม่มีข้อมูล')}</span></>}
          </dd>
        </div>)}
      </dl>
    </section>)}
  </div>
    {technical.length > 0 && <div className={styles.technicalGroups}>
      {technical.map(section => <section key={section.key} aria-labelledby={`${id}-${section.key}`} className={styles.group}>
        <header className={styles.heading}><h2 id={`${id}-${section.key}`}>{section.title}</h2></header>
        <ul className={styles.technicalLines}>{section.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </section>)}
    </div>}
  </>;
}
