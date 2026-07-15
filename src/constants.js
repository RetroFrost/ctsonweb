export const APP_VERSION = 'CTS Web 1.0.0';

export const MODEL_REFERENCE = 'reference_detail';
export const MODEL_ILLUSTRATED = 'illustrated_cards';
export const MODEL_CLASSIC = 'classic_compact';

export const MODELS = {
  [MODEL_REFERENCE]: {
    id: MODEL_REFERENCE,
    name: 'Reference Detail',
    visibleCards: 4,
    fields: [
      ['Badge Date / Value', 'badge_primary'],
      ['Title', 'title'],
      ['Description', 'description'],
      ['Image', 'image'],
    ],
  },
  [MODEL_ILLUSTRATED]: {
    id: MODEL_ILLUSTRATED,
    name: 'Illustrated Cards',
    visibleCards: 3,
    fields: [
      ['Badge Value', 'badge_primary'],
      ['Badge Label', 'badge_secondary'],
      ['Title', 'title'],
      ['Artwork', 'image'],
    ],
  },
  [MODEL_CLASSIC]: {
    id: MODEL_CLASSIC,
    name: 'Classic Compact',
    visibleCards: 4,
    fields: [
      ['Value', 'badge_primary'],
      ['Unit', 'badge_secondary'],
      ['Title', 'title'],
      ['Image', 'image'],
    ],
  },
};

export const FIELD_ROLES = ['badge_primary', 'badge_secondary', 'title', 'description', 'image'];

export const BACKGROUNDS = [
  { id: 'beach', name: 'Beach' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'forest', name: 'Forest' },
  { id: 'lavender', name: 'Lavender' },
  { id: 'night', name: 'Night' },
  { id: 'blueprint', name: 'Blueprint Grid' },
];

export const FONT_OPTIONS = [
  'Nunito',
  'Inter',
  'Arial',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'system-ui',
];

export const DEFAULT_HEADERS = ['Badge Date / Value', 'Title', 'Description', 'Image'];
export const DEFAULT_ROWS = [
  ['2008', 'Android 1.0', 'The first commercial Android release.', ''],
  ['2009', 'Android 1.5 Cupcake', 'Widgets and an on-screen keyboard arrived.', ''],
  ['2010', 'Android 2.2 Froyo', 'Performance and hotspot features improved.', ''],
  ['2011', 'Android 3.0 Honeycomb', 'A tablet-focused interface appeared.', ''],
  ['2014', 'Android 5.0 Lollipop', 'Material Design reshaped the platform.', ''],
  ['2021', 'Android 12', 'Material You introduced dynamic color.', ''],
];

export const DEFAULT_PROJECT = {
  version: 1,
  data: {
    headers: DEFAULT_HEADERS,
    rows: DEFAULT_ROWS,
  },
  settings: {
    width: 1920,
    height: 1080,
    fps: 30,
    customDuration: null,
    modelId: MODEL_REFERENCE,
    visibleCards: 0,
    fieldMapping: {},
    soundtrackMasterVolume: 1,
    hexagonsBounce: true,
    fontFamily: 'Nunito',
    customFont: null,
    illustratedBackground: 'beach',
    imageScale: 1,
    hexagonScale: 1,
    autoSizeArtwork: true,
    showHexagons: true,
    titleBarEnabled: true,
  },
  transforms: {},
  audioTracks: [],
};

export const TIMING = {
  revealSeconds: 2,
  scrollSeconds: 10 / 3,
  endHoldSeconds: 2,
  fadeSeconds: 0.8,
};
