/**
 * EduFlow Worksheet Themes
 * Print-friendly designs for beautiful worksheets
 *
 * Design principles:
 * - White/light backgrounds (save ink when printing)
 * - Accent colors for borders, headers, decorative elements
 * - Each theme has a unique visual identity
 * - All themes are readable and professional
 */

export const WORKSHEET_THEMES = [
  {
    id: 'classic',
    name: 'Klassisch',
    description: 'Sauber und professionell',
    icon: '📄',
    category: 'professional',
    colors: {
      primary: '#1e40af',
      primaryLight: '#dbeafe',
      secondary: '#6b7280',
      accent: '#3b82f6',
      headerBg: '#f8fafc',
      questionBorder: '#3b82f6',
      questionBg: '#ffffff',
      badgeBg: '#eff6ff',
      badgeText: '#1e40af',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-lg',
      questionSpacing: 'space-y-5',
    },
    pdf: {
      titleColor: '#1e40af',
      accentColor: '#3b82f6',
      lineColor: '#d1d5db',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
    }
  },
  {
    id: 'abenteuer',
    name: 'Abenteuer',
    description: 'Entdecker-Look mit Kompass und Karte',
    icon: '🧭',
    category: 'playful',
    colors: {
      primary: '#92400e',
      primaryLight: '#fef3c7',
      secondary: '#78716c',
      accent: '#d97706',
      headerBg: '#fffbeb',
      questionBorder: '#d97706',
      questionBg: '#fffbeb',
      badgeBg: '#fef3c7',
      badgeText: '#92400e',
    },
    styles: {
      headerStyle: 'border-b-2 border-dashed',
      questionStyle: 'border-l-4 border-dashed',
      fontFamily: 'font-serif',
      titleSize: 'text-2xl',
      rounded: 'rounded-xl',
      questionSpacing: 'space-y-6',
    },
    decorations: {
      headerIcon: '🧭',
      questionPrefix: '🗺️',
      divider: '· · · ✦ · · ·',
      cornerDecoration: true,
    },
    pdf: {
      titleColor: '#92400e',
      accentColor: '#d97706',
      lineColor: '#d6d3d1',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
      decorations: { headerIcon: 'compass', dividerStyle: 'dashed' },
    }
  },
  {
    id: 'weltraum',
    name: 'Weltraum',
    description: 'Sterne und Planeten',
    icon: '🚀',
    category: 'playful',
    colors: {
      primary: '#312e81',
      primaryLight: '#e0e7ff',
      secondary: '#6366f1',
      accent: '#6366f1',
      headerBg: '#eef2ff',
      questionBorder: '#6366f1',
      questionBg: '#f5f3ff',
      badgeBg: '#e0e7ff',
      badgeText: '#312e81',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-2xl',
      questionSpacing: 'space-y-6',
    },
    decorations: {
      headerIcon: '🚀',
      questionPrefix: '⭐',
      divider: '✦ · ✧ · ✦',
      starField: true,
    },
    pdf: {
      titleColor: '#312e81',
      accentColor: '#6366f1',
      lineColor: '#c7d2fe',
      headerLineWidth: 0.8,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
      decorations: { headerIcon: 'rocket', dividerStyle: 'stars' },
    }
  },
  {
    id: 'natur',
    name: 'Natur & Wald',
    description: 'Blätter und frische Farben',
    icon: '🌿',
    category: 'playful',
    colors: {
      primary: '#166534',
      primaryLight: '#dcfce7',
      secondary: '#4ade80',
      accent: '#22c55e',
      headerBg: '#f0fdf4',
      questionBorder: '#22c55e',
      questionBg: '#f0fdf4',
      badgeBg: '#dcfce7',
      badgeText: '#166534',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-xl',
      questionSpacing: 'space-y-5',
    },
    decorations: {
      headerIcon: '🌿',
      questionPrefix: '🍃',
      divider: '~ 🌱 ~',
    },
    pdf: {
      titleColor: '#166534',
      accentColor: '#22c55e',
      lineColor: '#bbf7d0',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
      decorations: { headerIcon: 'leaf', dividerStyle: 'wave' },
    }
  },
  {
    id: 'ozean',
    name: 'Ozean',
    description: 'Wellen und Meeresfarben',
    icon: '🌊',
    category: 'playful',
    colors: {
      primary: '#0c4a6e',
      primaryLight: '#e0f2fe',
      secondary: '#0ea5e9',
      accent: '#0284c7',
      headerBg: '#f0f9ff',
      questionBorder: '#0ea5e9',
      questionBg: '#f0f9ff',
      badgeBg: '#e0f2fe',
      badgeText: '#0c4a6e',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-2xl',
      questionSpacing: 'space-y-6',
    },
    decorations: {
      headerIcon: '🌊',
      questionPrefix: '🐚',
      divider: '~ ~ ~ 🐠 ~ ~ ~',
      wavePattern: true,
    },
    pdf: {
      titleColor: '#0c4a6e',
      accentColor: '#0284c7',
      lineColor: '#bae6fd',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
      decorations: { headerIcon: 'wave', dividerStyle: 'wave' },
    }
  },
  {
    id: 'bunt',
    name: 'Bunt & Fröhlich',
    description: 'Farbenfroh für jüngere Kinder',
    icon: '🌈',
    category: 'kids',
    colors: {
      primary: '#be185d',
      primaryLight: '#fce7f3',
      secondary: '#f472b6',
      accent: '#ec4899',
      headerBg: '#fdf2f8',
      questionBorder: '#ec4899',
      questionBg: '#fdf2f8',
      badgeBg: '#fce7f3',
      badgeText: '#be185d',
    },
    styles: {
      headerStyle: 'border-b-4',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-3xl',
      rounded: 'rounded-2xl',
      questionSpacing: 'space-y-6',
    },
    decorations: {
      headerIcon: '🌈',
      questionPrefixes: ['🌟', '🎨', '🦋', '🌸', '🎪', '🎵', '🍀', '🐝'],
      divider: '✿ · ✿ · ✿',
      rainbow: true,
    },
    pdf: {
      titleColor: '#be185d',
      accentColor: '#ec4899',
      lineColor: '#f9a8d4',
      headerLineWidth: 1,
      questionBorderWidth: 3,
      fontStyle: 'helvetica',
      decorations: { headerIcon: 'rainbow', dividerStyle: 'flowers' },
    }
  },
  {
    id: 'comic',
    name: 'Comic',
    description: 'Sprechblasen und Pow-Effekte',
    icon: '💬',
    category: 'playful',
    colors: {
      primary: '#dc2626',
      primaryLight: '#fee2e2',
      secondary: '#fbbf24',
      accent: '#ef4444',
      headerBg: '#fef2f2',
      questionBorder: '#f59e0b',
      questionBg: '#fffbeb',
      badgeBg: '#fef08a',
      badgeText: '#92400e',
    },
    styles: {
      headerStyle: 'border-b-4',
      questionStyle: 'border-2 border-dashed',
      fontFamily: 'font-sans',
      titleSize: 'text-3xl',
      rounded: 'rounded-2xl',
      questionSpacing: 'space-y-6',
    },
    decorations: {
      headerIcon: '💥',
      questionPrefix: '💬',
      divider: '★ BAM ★',
      speechBubble: true,
    },
    pdf: {
      titleColor: '#dc2626',
      accentColor: '#f59e0b',
      lineColor: '#fde68a',
      headerLineWidth: 1,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
      decorations: { headerIcon: 'pow', dividerStyle: 'zigzag' },
    }
  },
  {
    id: 'jahreszeit_fruehling',
    name: 'Frühling',
    description: 'Blüten und frische Farben',
    icon: '🌸',
    category: 'seasonal',
    colors: {
      primary: '#db2777',
      primaryLight: '#fce7f3',
      secondary: '#a3e635',
      accent: '#f472b6',
      headerBg: '#fdf2f8',
      questionBorder: '#f472b6',
      questionBg: '#fefce8',
      badgeBg: '#fce7f3',
      badgeText: '#9d174d',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-xl',
      questionSpacing: 'space-y-5',
    },
    decorations: {
      headerIcon: '🌸',
      questionPrefix: '🌷',
      divider: '✿ · 🌱 · ✿',
    },
    pdf: {
      titleColor: '#db2777',
      accentColor: '#f472b6',
      lineColor: '#fbcfe8',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
    }
  },
  {
    id: 'jahreszeit_herbst',
    name: 'Herbst',
    description: 'Warme Herbstfarben und Blätter',
    icon: '🍂',
    category: 'seasonal',
    colors: {
      primary: '#9a3412',
      primaryLight: '#ffedd5',
      secondary: '#f97316',
      accent: '#ea580c',
      headerBg: '#fff7ed',
      questionBorder: '#f97316',
      questionBg: '#fff7ed',
      badgeBg: '#ffedd5',
      badgeText: '#9a3412',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-xl',
      questionSpacing: 'space-y-5',
    },
    decorations: {
      headerIcon: '🍂',
      questionPrefix: '🍁',
      divider: '~ 🍂 ~ 🍁 ~',
    },
    pdf: {
      titleColor: '#9a3412',
      accentColor: '#ea580c',
      lineColor: '#fed7aa',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
    }
  },
  {
    id: 'jahreszeit_winter',
    name: 'Winter',
    description: 'Schneeflocken und Eisfarben',
    icon: '❄️',
    category: 'seasonal',
    colors: {
      primary: '#1e3a5f',
      primaryLight: '#e0f2fe',
      secondary: '#94a3b8',
      accent: '#38bdf8',
      headerBg: '#f0f9ff',
      questionBorder: '#7dd3fc',
      questionBg: '#f8fafc',
      badgeBg: '#e0f2fe',
      badgeText: '#1e3a5f',
    },
    styles: {
      headerStyle: 'border-b-2',
      questionStyle: 'border-l-4',
      fontFamily: 'font-sans',
      titleSize: 'text-2xl',
      rounded: 'rounded-xl',
      questionSpacing: 'space-y-5',
    },
    decorations: {
      headerIcon: '❄️',
      questionPrefix: '⛄',
      divider: '❅ · ❆ · ❅',
    },
    pdf: {
      titleColor: '#1e3a5f',
      accentColor: '#38bdf8',
      lineColor: '#bae6fd',
      headerLineWidth: 0.5,
      questionBorderWidth: 2,
      fontStyle: 'helvetica',
    }
  },
]

export const THEME_CATEGORIES = [
  { id: 'all', label: 'Alle' },
  { id: 'professional', label: 'Professionell' },
  { id: 'playful', label: 'Verspielt' },
  { id: 'kids', label: 'Unterstufe' },
  { id: 'seasonal', label: 'Jahreszeiten' },
]

export function getThemeById(id) {
  return WORKSHEET_THEMES.find(t => t.id === id) || WORKSHEET_THEMES[0]
}

export function getThemesByCategory(category) {
  if (category === 'all') return WORKSHEET_THEMES
  return WORKSHEET_THEMES.filter(t => t.category === category)
}

/**
 * Get the question decoration (emoji) for a given theme and question index
 */
export function getQuestionDecoration(theme, index) {
  if (!theme?.decorations) return ''
  if (theme.decorations.questionPrefixes) {
    return theme.decorations.questionPrefixes[index % theme.decorations.questionPrefixes.length]
  }
  return theme.decorations.questionPrefix || ''
}

/**
 * Get the divider decoration for a theme
 */
export function getThemeDivider(theme) {
  return theme?.decorations?.divider || ''
}
