/** A realistic localStorage dump from the earlier PlantPal app with the awkward cases the migration must handle. */

// 1×1 transparent PNG.
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export const FAKE_KEY = 'test-only-not-a-real-gemini-key';

const plants = [
  {
    id: 'p1',
    commonName: 'Tomato',
    scientificName: 'Solanum lycopersicum',
    dateAdded: '2025-03-01T10:00:00.000Z',
    status: 'active',
    location: 'South railing',
    description: 'A sunny fruiting plant',
  },
  { id: 'p2', commonName: 'Basil', dateAdded: '2025-03-05T08:30:00.000Z', status: 'dormant' },
  {
    id: 'p3',
    commonName: 'Mint',
    scientificName: 'Mentha',
    dateAdded: '2025-04-01T09:00:00.000Z',
    status: 'removed',
  },
  {
    id: 'p1',
    commonName: 'Tomato (duplicate copy)',
    dateAdded: '2025-03-01T10:00:00.000Z',
    status: 'active',
  },
  { id: 'p4', commonName: '  ', dateAdded: 'not a date', status: 'active' },
  'garbage',
];

const journal = [
  {
    id: 'j1',
    plantId: 'p1',
    date: '2025-03-02T06:00:00.000Z',
    type: 'watering',
    title: 'Morning water',
    waterAmountLiters: 1.5,
  },
  {
    id: 'j2',
    plantId: 'p1',
    date: '2025-03-03T06:00:00.000Z',
    type: 'watering',
    title: 'Water',
    waterAmountLiters: '2L',
  },
  { id: 'j3', plantId: 'p1', date: '2025-03-01T12:00:00.000Z', type: 'planted', title: 'Planted out' },
  {
    id: 'j4',
    plantId: 'p1',
    date: '2025-04-10T07:00:00.000Z',
    type: 'first-flower',
    title: 'First flower!',
    photoUrl: TINY_PNG,
  },
  {
    id: 'j5',
    plantId: 'p2',
    date: '2025-04-11T07:00:00.000Z',
    type: 'measurement',
    title: 'Measured',
    measurements: { heightCm: 22.5, leafCount: 14, fruitCount: -2 },
  },
  {
    id: 'j6',
    plantId: 'p2',
    date: '2025-04-12T07:00:00.000Z',
    type: 'observation',
    title: 'Looks good',
    photoUrl: 'https://example.org/basil.jpg',
    weatherSnapshot: { temperature: 31, humidity: 40, description: 'Sunny' },
  },
  {
    id: 'j7',
    plantId: 'p2',
    date: '2025-04-13T07:00:00.000Z',
    type: 'pest-issue',
    title: 'Aphids',
    photoUrl: 'blob:http://localhost/abc',
  },
  {
    id: 'j8',
    plantId: 'gone',
    date: '2025-04-14T07:00:00.000Z',
    type: 'observation',
    title: 'Orphan note',
    notes: 'from a deleted plant',
  },
  { id: 'j1', plantId: 'p1', date: '2025-03-02T06:00:00.000Z', type: 'watering', title: 'dup' },
  { id: 'j9', plantId: 'p3', date: 'yesterday', type: 'feeding', title: 'Fed' },
  { id: 'j10', plantId: 'p3', date: '2025-05-01T07:00:00.000Z', type: 'dance', title: 'Unknown type' },
];

const harvests = [
  {
    id: 'h1',
    plantName: 'Tomato',
    harvestedAt: '2025-06-01T09:00:00.000Z',
    quantity: 1.2,
    unit: 'kg',
    notes: '',
  },
  {
    id: 'h2',
    plantName: 'tomato',
    harvestedAt: '2025-06-02T09:00:00.000Z',
    quantity: 300,
    unit: 'g',
    notes: 'cherry',
  },
  {
    id: 'h3',
    plantName: 'Tomato',
    harvestedAt: '2025-06-03T09:00:00.000Z',
    quantity: 6,
    unit: 'pieces',
    notes: '',
  },
  {
    id: 'h4',
    plantName: 'Basil',
    harvestedAt: '2025-06-04T09:00:00.000Z',
    quantity: 2.5,
    unit: 'bunches',
    notes: '',
  },
  {
    id: 'h5',
    plantName: 'Mulberry',
    harvestedAt: '2025-06-05T09:00:00.000Z',
    quantity: 1,
    unit: 'litres',
    notes: '',
  },
  {
    id: 'h6',
    plantName: 'Tomato',
    harvestedAt: '2025-06-06T09:00:00.000Z',
    quantity: -1,
    unit: 'kg',
    notes: '',
  },
];

const gardens = [
  {
    id: 'garden-1',
    name: 'Balcony',
    type: 'balcony',
    location: 'Pune',
    latitude: 18.52,
    longitude: 73.86,
    plantIds: ['p1', 'p2'],
    createdAt: '2025-02-20T10:00:00.000Z',
    notes: 'West facing',
  },
  {
    id: 'garden-2',
    name: 'Terrace',
    type: 'rooftop',
    location: '',
    plantIds: ['p2'],
    createdAt: '2025-02-21T10:00:00.000Z',
    notes: '',
  },
];

const zones = [
  {
    id: 'z1',
    name: 'Hot corner',
    direction: 'southwest',
    wind: 'exposed',
    nearStructure: true,
    drainage: 'fast',
    hasShade: false,
    aiAnalysis: 'Very hot in the afternoon.',
  },
  {
    id: 'z2',
    name: 'Shady nook',
    direction: 'north',
    wind: 'sheltered',
    nearStructure: false,
    drainage: 'collects',
    hasShade: true,
  },
];

const soil = [
  {
    id: 's1',
    createdAt: '2025-03-10T10:00:00.000Z',
    method: 'photo-ai',
    ph: 6.4,
    texture: { sand: 40, silt: 40, clay: 20 },
    soilType: 'Loam',
    aiAnalysis: 'Looks like loam.',
  },
  { id: 's2', createdAt: '2025-03-11T10:00:00.000Z', method: 'diy-ph', ph: 7.1, notes: 'Kit from nursery' },
  {
    id: 's3',
    createdAt: '2025-03-12T10:00:00.000Z',
    method: 'professional',
    ph: 20,
    texture: { sand: 30, silt: 50, clay: 20 },
    nutrients: { nitrogen: 'low', phosphorus: 'medium', potassium: 'high' },
  },
];

const scans = [
  {
    rating: 'fair',
    plantName: 'Basil',
    issues: [{ name: 'Leaf spot', confidence: 'low', cause: 'Fungal', urgency: 'soon' }],
    treatmentPlan: ['Remove leaves'],
    preventionTips: [],
    summary: 'Some spots',
    analyzedAt: '2025-04-20T10:00:00.000Z',
  },
  {
    rating: 'healthy',
    issues: [],
    treatmentPlan: [],
    preventionTips: [],
    summary: 'Fine',
    analyzedAt: '2025-04-21T10:00:00.000Z',
  },
];

export const legacyFixture: Record<string, string> = {
  'plantpal-garden-plants': JSON.stringify(plants),
  'plantpal-garden-journal': JSON.stringify(journal),
  'plantpal-harvests': JSON.stringify(harvests),
  'plantpal-multi-gardens': JSON.stringify(gardens),
  'plantpal-microclimate-zones': JSON.stringify(zones),
  'plantpal-soil-profiles': JSON.stringify(soil),
  'plantpal-scan-history': JSON.stringify(scans),
  'plantpal-community-map': JSON.stringify([
    {
      id: 'pin-1',
      area: 'My Area',
      plants: ['Tomato'],
      timestamp: '2025-05-01T10:00:00.000Z',
      visibility: 'neighborhood',
      impactCo2: 12,
    },
  ]),
  'plantpal-swap-listings': JSON.stringify([
    {
      id: 'swap-1',
      type: 'offer',
      plantName: 'Basil',
      offerType: 'cutting',
      quantity: 3,
      notes: '',
      area: 'Pune',
      timestamp: '2025-05-02T10:00:00.000Z',
      userName: 'You',
      rating: 5,
    },
  ]),
  'plantpal-garden-profile': JSON.stringify({
    xp: 640,
    level: 3,
    streakDays: 4,
    lastActiveDate: '2025-06-06',
    joinedDate: '2025-02-20T10:00:00.000Z',
    earnedBadges: [{ badgeId: 'first-seed', tier: 'bronze', earnedDate: '2025-03-01T10:00:00.000Z' }],
  }),
  'plantpal-env-profile': JSON.stringify({
    latitude: 18.5204,
    longitude: 73.8567,
    locationName: 'Pune, India',
    timezone: 'Asia/Kolkata',
    airQuality: { aqi: 80 },
  }),
  'plantpal-theme': 'dark',
  'plantpal-user-gemini-api-key': FAKE_KEY,
  'plantpal-experimental-flag': 'on',
};
