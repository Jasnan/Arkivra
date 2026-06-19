export type UiAccentColor = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'cyan' | 'purple' | 'pink';
export type UiDensity = 'compact' | 'comfortable' | 'relaxed';
export type UiFontFamily = 'inter' | 'sora' | 'space-grotesk';
export type UiFontSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type UiRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type UiLanguage = 'en' | 'de' | 'fr';
export type UiDateFormat = 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'YYYY/MM/DD';
export type UiFileBrowserView = 'list' | 'grid';
export type UiChatAnswerMode = 'text' | 'multimodal';

export interface UserUiPreferences {
  accentColor: UiAccentColor;
  density: UiDensity;
  fontFamily: UiFontFamily;
  fontSize: UiFontSize;
  radius: UiRadius;
  language: UiLanguage;
  dateFormat: UiDateFormat | null;
  showExtractedTextTab: boolean;
  defaultFileBrowserView: UiFileBrowserView;
  defaultChatAnswerMode: UiChatAnswerMode;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<
    UserUiPreferences,
    'accentColor'
    | 'defaultFileBrowserView'
    | 'density'
    | 'fontFamily'
    | 'fontSize'
    | 'language'
    | 'dateFormat'
    | 'defaultChatAnswerMode'
    | 'radius'
    | 'showExtractedTextTab'
  >
>;
