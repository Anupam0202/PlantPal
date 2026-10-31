/**
 * Field lessons (§6.20): short, practical, with one question each. The wording is plain general
 * guidance, not plant-specific advice; it links to the sources a curator should check it against
 * (recorded as needing review in the scope ledger). English only for now.
 */
export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  paragraphs: string[];
  check: { question: string; options: string[]; answer: number; why: string };
  /** Where to read more; also what a curator checks the lesson against. */
  sources: Array<{ title: string; url: string }>;
  /** A page in PlantPal to try it. */
  tryIt?: { label: string; to: string };
}

export const LESSONS: Lesson[] = [
  {
    id: 'light-basics',
    title: 'Light basics: counting direct sun',
    minutes: 4,
    summary: 'Plants are labelled by hours of direct sun, not by how bright a room feels.',
    paragraphs: [
      'Plant labels usually mean hours of direct sun on the leaves: “full sun” is commonly six or more hours a day, “part sun” or “part shade” about three to six, and “shade” less than three.',
      'Bright indirect light can feel sunny to us but gives a plant much less energy than direct sun. A balcony that only gets sky light is a shade site, even if it feels bright.',
      'Sun changes with the season. A wall or a building across the street can block the low winter sun while the high summer sun clears it. Check in the season you plan to grow.',
      'Count it rather than guess: note when direct sun reaches the spot and when it leaves, on a clear day. PlantPal’s Sun Hours Finder does the geometry for you from the spot’s direction and what blocks the sky.',
    ],
    check: {
      question:
        'A spot gets direct sun from 9:00 to 11:30 and bright sky light the rest of the day. How would most labels describe it?',
      options: ['Full sun', 'Part sun or part shade', 'Shade'],
      answer: 2,
      why: 'Two and a half hours of direct sun is under three hours, so most labels would call it shade, however bright the rest of the day feels.',
    },
    sources: [{ title: 'RHS gardening advice', url: 'https://www.rhs.org.uk/advice' }],
    tryIt: { label: 'Open the Sun Hours Finder', to: '/plan/sun' },
  },
  {
    id: 'watering-by-touch',
    title: 'Watering by touch',
    minutes: 4,
    summary: 'Check the soil before you water; a schedule is only a reminder to look.',
    paragraphs: [
      'Most potted plants are harmed more by water that sits around the roots than by a short dry spell. Before watering, push a finger into the mix to about the second knuckle (2–3 cm).',
      'If it feels dry at that depth, water slowly until a little drains from the bottom, then let it drain. If it still feels damp, wait and check again in a day or two.',
      'Pots dry faster in sun, wind and heat, and small or clay pots dry fastest. Covered balconies get no rain at all, even in a storm.',
      'This is why PlantPal shows “check by” dates instead of fixed watering days: the date is when to look, and what you find decides what to do.',
    ],
    check: {
      question:
        'A “check water” task is due, and the soil 3 cm down still feels damp. What is the best next step?',
      options: [
        'Water anyway, because the task is due',
        'Mark it checked and look again in a day or two',
        'Water twice as much next time',
      ],
      answer: 1,
      why: 'The task is a reminder to look. Damp soil means the roots still have water, so waiting is safer than adding more.',
    },
    sources: [{ title: 'RHS gardening advice', url: 'https://www.rhs.org.uk/advice' }],
    tryIt: { label: 'See today’s checks', to: '/today' },
  },
  {
    id: 'saving-seeds',
    title: 'Saving seeds',
    minutes: 5,
    summary: 'Save from healthy, fully ripe plants, dry the seed well, and test before you rely on it.',
    paragraphs: [
      'Seed from open-pollinated or heirloom plants usually grows into plants like the parent. Seed from F1 hybrids often does not, and seed from plants that cross easily (squashes, for example) may surprise you.',
      'Let the seed ripen fully on the plant: dry pods and heads, or fully ripe fruit for things like tomatoes. Choose healthy plants that did well for you.',
      'Dry the seed thoroughly, label it with the plant and date, and store it somewhere cool, dark and dry, such as a paper envelope in an airtight jar.',
      'Before the season, do a germination test: sow ten seeds on damp paper and count how many sprout. Eight of ten is an 80% rate, so sow a few extra.',
    ],
    check: {
      question: 'You sowed 10 seeds on damp paper and 6 sprouted. What does that tell you?',
      options: [
        'The lot is dead',
        'About 60% germinate, so sow a few more than you need',
        'You should never save seed again',
      ],
      answer: 1,
      why: 'A 60% rate is usable: sow extra seeds to allow for the ones that will not sprout.',
    },
    sources: [{ title: 'RHS gardening advice', url: 'https://www.rhs.org.uk/advice' }],
    tryIt: { label: 'Open your seed library', to: '/garden/seeds' },
  },
  {
    id: 'timed-counts',
    title: 'Timed counts: why zero counts matter',
    minutes: 4,
    summary: 'A 10-minute count of insects on one kind of flower is simple, comparable data.',
    paragraphs: [
      'A Flower-Insect Timed (FIT) Count, from the UK Pollinator Monitoring Scheme, means watching a patch of one kind of flower for 10 minutes in good weather and counting insects that land on the flowers, by broad group.',
      'Seeing nothing is a result. A zero count on a sunny, warm day says something real about that flower at that time, so record it rather than skipping it.',
      'Counts are only comparable when they are done the same way: the same kind of flower, the full 10 minutes, a similar time of year and similar weather. PlantPal shows a trend only when counts match like that.',
    ],
    check: {
      question:
        'You watched your lavender for the full 10 minutes in sunshine and saw no insects. What should you do?',
      options: [
        'Don’t record it, nothing happened',
        'Record it as a zero count',
        'Add a few insects so it looks normal',
      ],
      answer: 1,
      why: 'A complete count with zero insects is data. Leaving it out would make the patch look busier than it is.',
    },
    sources: [
      { title: 'UK Pollinator Monitoring Scheme: FIT Counts', url: 'https://ukpoms.org.uk/fit-counts' },
    ],
    tryIt: { label: 'Start a timed count', to: '/nature/count' },
  },
  {
    id: 'balcony-composting',
    title: 'Balcony composting',
    minutes: 4,
    summary: 'Small, closed systems work on a balcony if you balance wet and dry material.',
    paragraphs: [
      'Compost needs a mix of “greens” (wet, nitrogen-rich: vegetable peelings, coffee grounds, fresh plant trimmings) and “browns” (dry, carbon-rich: shredded paper, cardboard, dry leaves).',
      'Too many greens makes it wet and smelly; add browns. Too dry and it stops; add greens or a little water. It should feel like a wrung-out sponge.',
      'On a balcony, a closed bin or a worm bin keeps things tidy. Keep meat, dairy and oily food out of small home systems, and check your building’s rules.',
      'Finished compost is dark and crumbly and smells of earth. Mix it into potting mix rather than using it on its own.',
    ],
    check: {
      question: 'Your balcony compost bin smells bad and looks slimy. What helps most?',
      options: [
        'Add more vegetable peelings',
        'Add dry browns like shredded cardboard',
        'Seal it and leave it for a year',
      ],
      answer: 1,
      why: 'Smell and slime usually mean too much wet, green material. Dry browns absorb water and let air back in.',
    },
    sources: [{ title: 'RHS gardening advice', url: 'https://www.rhs.org.uk/advice' }],
  },
  {
    id: 'reading-forecasts',
    title: 'Reading a forecast for plants',
    minutes: 4,
    summary: 'Night lows, wind and evaporation matter more to pots than the daily headline.',
    paragraphs: [
      'For frost, look at the overnight low, not the daytime high. Pots and seedlings can be damaged near 0 °C, and clear, still nights get colder than forecasts for the town suggest.',
      'Wind and heat dry pots quickly. Evapotranspiration (often shown as ET₀, in millimetres) estimates how much water a reference crop loses in a day: higher numbers mean pots will dry faster.',
      'Rain only counts if it reaches the soil. A covered balcony stays dry in a storm, and a few millimetres of rain barely wets a full pot.',
      'Forecasts are for an area, not your exact spot. Use them to plan when to check, then let the soil and the plants tell you what to do.',
    ],
    check: {
      question: 'The forecast says 18 °C by day, 1 °C overnight, clear and calm. What should you watch for?',
      options: ['Heat stress', 'Frost risk for tender plants overnight', 'Nothing, 18 °C is mild'],
      answer: 1,
      why: 'A clear, calm night forecast at 1 °C can bring frost in sheltered or open spots, whatever the daytime high.',
    },
    sources: [{ title: 'Open-Meteo weather variables', url: 'https://open-meteo.com/en/docs' }],
    tryIt: { label: 'See your forecast', to: '/today' },
  },
];

export const LESSON_IDS = LESSONS.map((l) => l.id);
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id) ?? null;
