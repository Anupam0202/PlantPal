import type { GreenKind } from '@plantpal/schemas';
import { usePrefs, type LocalePref } from '../../state/prefs';

/** Corridor map (§6.16) and the community hex map (§20). */
const en = {
  unavailable: 'The map can’t be shown on this device. The list below has the same information.',
  basemapMissing: 'Background map unavailable right now; the hexagons are still accurate.',
  corridor: {
    title: 'Green corridor',
    hub: 'Green corridor',
    hubBody: 'How your garden links to mapped parks, woods and gardens nearby.',
    intro:
      'Green spaces close together let insects and birds move between them. Your garden can be a stepping stone.',
    needLocation: 'Set your garden’s location to see the green space around it.',
    addLocation: 'Add a location',
    needServer: 'The corridor map needs the PlantPal server, which isn’t available here.',
    failed: 'Couldn’t load mapped green space. Please try again later.',
    retry: 'Try again',
    loading: 'Looking up mapped green space…',
    mapLabel: 'Map of mapped green space around your garden',
    steppingStone: (distance: string, kind: string) =>
      `Your garden is a stepping stone ${distance} from the nearest mapped ${kind}.`,
    inside: (kind: string) => `Your garden is inside mapped ${kind}.`,
    none: 'No mapped green space within about 1 km. Every planted balcony or yard here counts even more.',
    share: (pct: number) => `About ${pct}% of the area around you is mapped green space.`,
    nearest: 'Nearest mapped green space',
    unnamed: 'Unnamed',
    away: (distance: string) => `${distance} away`,
    here: 'You are here',
    legend: 'Darker hexagons have more mapped green space (each is about 0.1 km²).',
    honesty:
      'This is mapped land cover from OpenStreetMap, not habitat quality, and mapping is more complete in some places than others.',
    truncated: 'Only the largest areas are shown here.',
    privacy:
      'Only a coarse area (about 5 km²) is sent to look this up. Distances are worked out on this device.',
    kinds: {
      park: 'park',
      wood: 'wood',
      meadow: 'meadow or grassland',
      allotment: 'allotment',
      cemetery: 'cemetery',
      garden: 'garden',
      'green-roof': 'green roof',
    } satisfies Record<GreenKind, string>,
  },
  community: {
    tab: 'Map',
    mapLabel: 'Map of active growers in your area',
    intro:
      'Hexagons of about 5 km² with active growers. An area appears only when at least five people are active there, so no one can be singled out.',
    empty: 'Not enough active growers to show the map yet',
    emptyBody:
      'Areas appear once at least five people nearby have shared something in the last 90 days. This protects everyone’s privacy.',
    growers: (n: number) => `${n} active growers`,
    where: (distance: string, direction: string) => `${distance} ${direction} of the area centre`,
    centre: 'At the area centre',
    directions: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
  },
};

export type MapMessages = typeof en;
const hi: MapMessages = {
  unavailable: 'इस डिवाइस पर नक्शा नहीं दिखाया जा सकता। नीचे की सूची में यही जानकारी है।',
  basemapMissing: 'पृष्ठभूमि का नक्शा अभी उपलब्ध नहीं; षट्भुज फिर भी सही हैं।',
  corridor: {
    title: 'हरित गलियारा',
    hub: 'हरित गलियारा',
    hubBody: 'आपका बगीचा आसपास के नक्शे में दर्ज पार्कों, जंगलों और बगीचों से कैसे जुड़ता है।',
    intro:
      'पास-पास की हरी जगहें कीटों और पक्षियों को उनके बीच आने-जाने देती हैं। आपका बगीचा इस राह का एक पड़ाव बन सकता है।',
    needLocation: 'आसपास की हरी जगह देखने के लिए बगीचे का स्थान सेट करें।',
    addLocation: 'स्थान जोड़ें',
    needServer: 'गलियारे के नक्शे के लिए PlantPal सर्वर चाहिए, जो यहाँ उपलब्ध नहीं है।',
    failed: 'नक्शे में दर्ज हरी जगह लोड नहीं हो सकी। कृपया बाद में फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    loading: 'नक्शे में दर्ज हरी जगह खोजी जा रही है…',
    mapLabel: 'आपके बगीचे के आसपास नक्शे में दर्ज हरी जगह का नक्शा',
    steppingStone: (distance, kind) =>
      `आपका बगीचा एक पड़ाव है: नक्शे में दर्ज सबसे नज़दीकी हरी जगह (${kind}) ${distance} दूर है।`,
    inside: (kind) => `आपका बगीचा नक्शे में दर्ज हरी जगह (${kind}) के अंदर है।`,
    none: 'लगभग 1 किमी के भीतर नक्शे में दर्ज कोई हरी जगह नहीं। यहाँ पौधों वाली हर बालकनी या आँगन और भी ज़्यादा मायने रखता है।',
    share: (pct) => `आपके आसपास के इलाके का लगभग ${pct}% हिस्सा नक्शे में दर्ज हरी जगह है।`,
    nearest: 'नक्शे में दर्ज सबसे नज़दीकी हरी जगह',
    unnamed: 'बिना नाम',
    away: (distance) => `${distance} दूर`,
    here: 'आप यहाँ हैं',
    legend: 'गहरे षट्भुजों में नक्शे में दर्ज हरी जगह ज़्यादा है (हर एक लगभग 0.1 किमी² का है)।',
    honesty:
      'यह OpenStreetMap में दर्ज ज़मीन का उपयोग है, आवास की गुणवत्ता नहीं, और कुछ जगहों का नक्शा दूसरों से ज़्यादा पूरा है।',
    truncated: 'यहाँ केवल सबसे बड़े इलाके दिखाए गए हैं।',
    privacy:
      'इसे खोजने के लिए केवल एक मोटा इलाका (लगभग 5 किमी²) भेजा जाता है। दूरियाँ इसी डिवाइस पर निकाली जाती हैं।',
    kinds: {
      park: 'पार्क',
      wood: 'जंगल',
      meadow: 'घास का मैदान',
      allotment: 'सामुदायिक बगीचा',
      cemetery: 'कब्रिस्तान',
      garden: 'बगीचा',
      'green-roof': 'हरी छत',
    },
  },
  community: {
    tab: 'नक्शा',
    mapLabel: 'आपके इलाके के सक्रिय बागवानों का नक्शा',
    intro:
      'लगभग 5 किमी² के षट्भुज जिनमें सक्रिय बागवान हैं। कोई इलाका तभी दिखता है जब वहाँ कम से कम पाँच लोग सक्रिय हों, ताकि किसी एक की पहचान न हो सके।',
    empty: 'नक्शा दिखाने के लिए अभी काफ़ी सक्रिय बागवान नहीं',
    emptyBody:
      'इलाके तब दिखते हैं जब पास के कम से कम पाँच लोगों ने पिछले 90 दिनों में कुछ साझा किया हो। इससे सबकी निजता सुरक्षित रहती है।',
    growers: (n) => `${n} सक्रिय बागवान`,
    where: (distance, direction) => `इलाके के केंद्र से ${distance} ${direction}`,
    centre: 'इलाके के केंद्र में',
    directions: [
      'उत्तर',
      'उत्तर-पूर्व',
      'पूर्व',
      'दक्षिण-पूर्व',
      'दक्षिण',
      'दक्षिण-पश्चिम',
      'पश्चिम',
      'उत्तर-पश्चिम',
    ],
  },
};

const es: MapMessages = {
  unavailable:
    'El mapa no se puede mostrar en este dispositivo. La lista de abajo tiene la misma información.',
  basemapMissing: 'El mapa de fondo no está disponible ahora; los hexágonos siguen siendo correctos.',
  corridor: {
    title: 'Corredor verde',
    hub: 'Corredor verde',
    hubBody: 'Cómo se conecta tu jardín con los parques, bosques y jardines cartografiados cercanos.',
    intro:
      'Los espacios verdes cercanos entre sí permiten que insectos y aves se muevan entre ellos. Tu jardín puede ser un punto de paso.',
    needLocation: 'Indica la ubicación de tu jardín para ver los espacios verdes a su alrededor.',
    addLocation: 'Añadir una ubicación',
    needServer: 'El mapa del corredor necesita el servidor de PlantPal, que no está disponible aquí.',
    failed: 'No se pudieron cargar los espacios verdes cartografiados. Inténtalo más tarde.',
    retry: 'Reintentar',
    loading: 'Buscando espacios verdes cartografiados…',
    mapLabel: 'Mapa de los espacios verdes cartografiados alrededor de tu jardín',
    steppingStone: (distance, kind) =>
      `Tu jardín es un punto de paso a ${distance} de la zona verde cartografiada más cercana (${kind}).`,
    inside: (kind) => `Tu jardín está dentro de una zona verde cartografiada (${kind}).`,
    none: 'No hay espacios verdes cartografiados a menos de 1 km. Aquí cada balcón o patio con plantas cuenta todavía más.',
    share: (pct) => `Alrededor del ${pct}% de la zona que te rodea es espacio verde cartografiado.`,
    nearest: 'Espacio verde cartografiado más cercano',
    unnamed: 'Sin nombre',
    away: (distance) => `a ${distance}`,
    here: 'Estás aquí',
    legend: 'Los hexágonos más oscuros tienen más espacio verde cartografiado (cada uno mide unos 0,1 km²).',
    honesty:
      'Esto es la cobertura del suelo cartografiada en OpenStreetMap, no la calidad del hábitat, y la cartografía está más completa en unos lugares que en otros.',
    truncated: 'Aquí solo se muestran las zonas más grandes.',
    privacy:
      'Para buscarlo solo se envía una zona aproximada (unos 5 km²). Las distancias se calculan en este dispositivo.',
    kinds: {
      park: 'parque',
      wood: 'bosque',
      meadow: 'prado o pastizal',
      allotment: 'huerto urbano',
      cemetery: 'cementerio',
      garden: 'jardín',
      'green-roof': 'cubierta verde',
    },
  },
  community: {
    tab: 'Mapa',
    mapLabel: 'Mapa de cultivadores activos en tu zona',
    intro:
      'Hexágonos de unos 5 km² con cultivadores activos. Una zona solo aparece cuando hay al menos cinco personas activas, para que nadie pueda ser identificado.',
    empty: 'Aún no hay suficientes cultivadores activos para mostrar el mapa',
    emptyBody:
      'Las zonas aparecen cuando al menos cinco personas cercanas han compartido algo en los últimos 90 días. Así se protege la privacidad de todos.',
    growers: (n) => `${n} cultivadores activos`,
    where: (distance, direction) => `a ${distance} al ${direction} del centro de la zona`,
    centre: 'En el centro de la zona',
    directions: ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'],
  },
};

export const catalogs: Record<LocalePref, MapMessages> = { en, hi, es };

export function useMapT(): MapMessages {
  return catalogs[usePrefs((s) => s.locale)];
}
