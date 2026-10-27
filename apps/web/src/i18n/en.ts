/**
 * English (base) messages. Hindi and Spanish must implement every key (type-checked).
 * Keep sentences short and plain; scientific names are never translated.
 */
export const en = {
  appName: 'PlantPal',
  tagline:
    'Know what will thrive in your exact space, care for it with confidence, and see the nature you bring back.',
  skipToContent: 'Skip to content',
  nav: {
    today: 'Today',
    garden: 'Garden',
    plan: 'Plan',
    nature: 'Nature',
    community: 'Community',
    settings: 'Settings',
    primary: 'Main navigation',
    quickCapture: 'Quick capture',
    commandPalette: 'Search and commands',
  },
  common: {
    back: 'Back',
    next: 'Next',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    done: 'Done',
    retry: 'Try again',
    skip: 'Skip',
    notSure: "I'm not sure",
    edit: 'Edit',
    delete: 'Delete',
    undo: 'Undo',
    loading: 'Loading…',
    learnMore: 'Learn more',
    unknown: 'Unknown',
    demoData: 'Demo data',
  },
  sync: {
    local: 'Saved on this device',
    pending: 'Waiting to sync',
    synced: 'Synced',
    retrying: "Couldn't sync — retrying",
    conflict: 'Conflict — choose a version',
    offline: 'Offline — changes are saved on this device',
  },
  today: {
    title: 'Today',
    emptyTitle: 'Your garden starts here',
    emptyBody:
      'Tell PlantPal about your space and we will suggest plants that suit it, then help with day-to-day care.',
    emptyAction: 'Plan my first garden',
  },
  garden: {
    title: 'Garden',
    emptyTitle: 'No plants yet',
    emptyBody: 'Plants you add or plan will appear here with their care history.',
  },
  plan: {
    title: 'Plan',
    emptyTitle: 'Plan what to grow',
    emptyBody: 'Find plants that fit your light, space and climate, then arrange them in your space.',
  },
  nature: {
    title: 'Nature',
    emptyTitle: 'The nature you bring back',
    emptyBody: 'Record visitors, blooms and water saved. Every visit counts, even when you see nothing.',
  },
  community: {
    title: 'Community',
    disabledTitle: 'Community is not switched on',
    disabledBody:
      'Seed swaps, events and local groups need a moderated server. Your garden works fully without them.',
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    contrastMore: 'Increase contrast',
    reduceMotion: 'Reduce motion',
    lowData: 'Low-data mode',
    lowDataHint: 'Smaller images, no map tiles until you ask, no background animation.',
    language: 'Language',
    units: 'Units',
    metric: 'Metric',
    imperial: 'Imperial',
    ai: 'AI (your Gemini key)',
    data: 'Your data',
    privacy: 'Privacy',
    notifications: 'Notifications',
    accessibility: 'Accessibility',
  },
  welcome: {
    title: 'Grow a living, breathing garden — wherever you are.',
    start: 'Start',
    import: 'I have PlantPal data',
  },
  notFound: {
    title: 'This path leads nowhere',
    body: 'The page you were looking for does not exist or has moved.',
    home: 'Go to Today',
  },
  update: {
    ready: 'A new version of PlantPal is ready.',
    reload: 'Reload',
    later: 'Later',
    draftWarning: 'Save your draft first — reloading would lose it.',
  },
  offlineReady: 'PlantPal can now open without a connection.',
} as const;

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof en>;
