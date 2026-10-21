import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { BACKGROUND_COLORS, COLORS, THEME_COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type ThemeMode } from '@/lib/profiles';

const DARK_COLORS = {
  card: '#18232E',
  textPrimary: '#F1F5F9',
  textSecondary: '#A8B6C4',
  textOnPrimary: '#FFFFFF',
  surface: '#223240',
  border: '#344451',
  shadow: '#000000',
  accentSurface: '#382F1D',
  danger: '#FF8A80',
} as const;

export type AppColors = { [Key in keyof typeof COLORS]: string };

export { THEME_COLORS } from '@/constants/colors';
export { BACKGROUND_COLORS } from '@/constants/colors';

type ThemeContextValue = {
  primary: string;
  tint: string;
  backgroundColor: string;
  isDark: boolean;
  colors: AppColors;
  setPrimary: (color: string) => void;
  setBackground: (color: string) => void;
  setIsDark: (isDark: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  primary: COLORS.primary,
  tint: COLORS.surface,
  backgroundColor: COLORS.background,
  isDark: false,
  colors: COLORS,
  setPrimary: () => {},
  setBackground: () => {},
  setIsDark: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [savedColor, setSavedColor] = useState<string>(COLORS.primary);
  const [savedBackground, setSavedBackground] = useState<string>(COLORS.background);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    let active = true;
    setSavedColor(COLORS.primary);
    setSavedBackground(COLORS.background);
    setIsDark(false);

    if (user) {
      getProfile(user.id).then((profile) => {
        if (active) {
          setSavedColor(profile?.theme_color ?? COLORS.primary);
          setSavedBackground(profile?.theme_background ?? COLORS.background);
          setIsDark(profile?.theme_mode === 'dark');
        }
      });
    }

    return () => {
      active = false;
    };
  }, [user]);

  const selected = THEME_COLORS.find((color) => color.primary === savedColor)
    ?? THEME_COLORS[0];
  const selectedBackground = BACKGROUND_COLORS.find((option) => option.light === savedBackground)
    ?? BACKGROUND_COLORS[0];
  const colors = useMemo<AppColors>(
    () => ({
      ...COLORS,
      ...(isDark ? DARK_COLORS : {}),
      primary: selected.primary,
      textOnPrimary: getContrastingTextColor(selected.primary),
      surface: isDark ? DARK_COLORS.surface : COLORS.surface,
      background: isDark ? selectedBackground.dark : selectedBackground.light,
      accent: selected.accent,
      tertiary: selected.tertiary,
      accentSurface: isDark ? DARK_COLORS.surface : COLORS.accentSurface,
    }),
    [isDark, selected, selectedBackground]
  );
  const value = useMemo(
    () => ({
      primary: selected.primary,
      tint: isDark ? DARK_COLORS.surface : COLORS.surface,
      backgroundColor: selectedBackground.light,
      isDark,
      colors,
      setPrimary: setSavedColor,
      setBackground: setSavedBackground,
      setIsDark,
    }),
    [selected, selectedBackground, isDark, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

function getContrastingTextColor(hexColor: string) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hexColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hexColor.slice(5, 7), 16) / 255;
  const linearize = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * linearize(red)
    + 0.7152 * linearize(green)
    + 0.0722 * linearize(blue);
  const darkTextLuminance = 0.2126 * linearize(13 / 255)
    + 0.7152 * linearize(27 / 255)
    + 0.0722 * linearize(42 / 255);
  const darkTextContrast = (luminance + 0.05) / (darkTextLuminance + 0.05);
  const whiteTextContrast = 1.05 / (luminance + 0.05);

  return darkTextContrast >= whiteTextContrast ? COLORS.textPrimary : '#FFFFFF';
}
