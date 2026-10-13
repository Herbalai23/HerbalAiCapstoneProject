export const PITAHC_OFFICIAL_URL = 'https://pitahc.gov.ph/';
export const PITAHC_OFFICIAL_LABEL = 'Official portal';
export const PITAHC_OFFICIAL_NAME = 'Philippine Institute of Traditional and Alternative Health Care';

export const EXTERNAL_LINKS = {
  pitahc: {
    label: 'PITAHC',
    detail: PITAHC_OFFICIAL_LABEL,
    href: PITAHC_OFFICIAL_URL,
    fullName: PITAHC_OFFICIAL_NAME,
  },
  tkdl: {
    label: 'TKDL Philippines',
    detail: 'Herbarium',
    href: 'https://www.tkdl.ph/library/herbarium',
  },
  kew: {
    label: 'Kew Science',
    detail: 'Plants of the World Online',
    href: 'https://powo.science.kew.org/',
  },
  stuart: {
    label: 'StuartXchange',
    detail: 'Philippine plant reference',
    href: 'https://www.stuartxchange.org/CompleteList.html',
  },
} as const;
