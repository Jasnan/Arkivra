import type {
  AccentColor,
  AppearanceDensity,
  AppearanceFont,
  AppearanceFontSize,
  AppearanceRadius,
  PreferenceFileBrowserView,
  PreferenceDateFormat,
  PreferenceChatAnswerMode,
  PreferenceLanguage,
} from '@/components/providers/accent-color-context';

export interface UserUiPreferences {
  accentColor: AccentColor;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  fontSize: AppearanceFontSize;
  radius: AppearanceRadius;
  language: PreferenceLanguage;
  dateFormat: PreferenceDateFormat | null;
  showExtractedTextTab: boolean;
  defaultFileBrowserView: PreferenceFileBrowserView;
  defaultChatAnswerMode: PreferenceChatAnswerMode;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<
    UserUiPreferences,
    'accentColor'
    | 'defaultChatAnswerMode'
    | 'defaultFileBrowserView'
    | 'density'
    | 'fontFamily'
    | 'fontSize'
    | 'language'
    | 'dateFormat'
    | 'radius'
    | 'showExtractedTextTab'
  >
>;
