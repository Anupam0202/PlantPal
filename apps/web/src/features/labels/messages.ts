import { usePrefs, type LocalePref } from '../../state/prefs';
import type { LabelSize } from './render';

type Level = 'low' | 'medium' | 'high';

/** The Plant labels page, and the words printed on the labels themselves. */
const en = {
  title: 'Plant labels',
  intro:
    'Printable labels with the plant’s name, planted date, three care basics and a QR code to its page in PlantPal. Made on this device; print on A4 and cut along the dashed lines.',
  empty: 'No plants to label yet',
  emptyBody: 'Add a plant first; its label appears here.',
  size: 'Label size',
  sizes: { front: 'Container front', stake: 'Pot stake' } satisfies Record<LabelSize, string>,
  sizeNotes: {
    front: 'Each label is 70 × 45 mm.',
    stake: 'Each label is a 90 × 25 mm strip.',
  } satisfies Record<LabelSize, string>,
  plants: 'Plants',
  qrNote:
    'The QR code opens the plant’s page on a device that has this garden. Care basics come from cited catalogue facts; plants not in the catalogue get none.',
  make: 'Make labels (PDF)',
  ready: (n: number) => (n === 1 ? '1 label ready' : `${n} labels ready`),
  /** Printed on the labels. */
  planted: (date: string) => `Planted ${date}`,
  sun: (hours: string) => `Sun: ${hours} h direct`,
  water: (need: string) => `Water: ${need} need`,
  height: (cm: number) => `Grows to ${cm} cm`,
  levels: { low: 'low', medium: 'medium', high: 'high' } satisfies Record<Level, string>,
};

export type LabelMessages = typeof en;

const hi: LabelMessages = {
  title: 'पौधों के लेबल',
  intro:
    'पौधे के नाम, रोपने की तारीख, देखभाल की तीन बुनियादी बातों और PlantPal में उसके पेज के QR कोड वाले छापने लायक लेबल। ये इसी डिवाइस पर बनते हैं; A4 पर छापें और बिंदीदार रेखाओं पर काटें।',
  empty: 'लेबल के लिए अभी कोई पौधा नहीं',
  emptyBody: 'पहले एक पौधा जोड़ें; उसका लेबल यहाँ दिखेगा।',
  size: 'लेबल का आकार',
  sizes: { front: 'गमले के सामने', stake: 'गमले में गाड़ने वाली पट्टी' },
  sizeNotes: {
    front: 'हर लेबल 70 × 45 मिमी का है।',
    stake: 'हर लेबल 90 × 25 मिमी की एक पट्टी है।',
  },
  plants: 'पौधे',
  qrNote:
    'QR कोड उस डिवाइस पर पौधे का पेज खोलता है जिसमें यह बगीचा है। देखभाल की बुनियादी बातें सूची के संदर्भित तथ्यों से आती हैं; जो पौधे सूची में नहीं हैं उन्हें ये नहीं मिलतीं।',
  make: 'लेबल बनाएँ (PDF)',
  ready: (n) => `${n} लेबल तैयार`,
  planted: (date) => `रोपा: ${date}`,
  sun: (hours) => `सीधी धूप: ${hours} घंटे`,
  water: (need) => `पानी की ज़रूरत: ${need}`,
  height: (cm) => `${cm} सेमी तक बढ़ता है`,
  levels: { low: 'कम', medium: 'मध्यम', high: 'अधिक' },
};

const es: LabelMessages = {
  title: 'Etiquetas de plantas',
  intro:
    'Etiquetas para imprimir con el nombre de la planta, la fecha de plantación, tres cuidados básicos y un código QR a su página en PlantPal. Se crean en este dispositivo; imprime en A4 y corta por las líneas discontinuas.',
  empty: 'Aún no hay plantas para etiquetar',
  emptyBody: 'Añade primero una planta; su etiqueta aparecerá aquí.',
  size: 'Tamaño de etiqueta',
  sizes: { front: 'Frente de maceta', stake: 'Estaca de maceta' },
  sizeNotes: {
    front: 'Cada etiqueta mide 70 × 45 mm.',
    stake: 'Cada etiqueta es una tira de 90 × 25 mm.',
  },
  plants: 'Plantas',
  qrNote:
    'El código QR abre la página de la planta en un dispositivo que tenga este jardín. Los cuidados básicos salen de datos citados del catálogo; las plantas que no están en el catálogo no los tienen.',
  make: 'Crear etiquetas (PDF)',
  ready: (n) => (n === 1 ? '1 etiqueta lista' : `${n} etiquetas listas`),
  planted: (date) => `Plantada el ${date}`,
  sun: (hours) => `Sol directo: ${hours} h`,
  water: (need) => `Agua: necesidad ${need}`,
  height: (cm) => `Crece hasta ${cm} cm`,
  levels: { low: 'baja', medium: 'media', high: 'alta' },
};

export const catalogs: Record<LocalePref, LabelMessages> = { en, hi, es };

export function useLabelT(): LabelMessages {
  return catalogs[usePrefs((s) => s.locale)];
}
