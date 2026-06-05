import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { FileBrowserView } from './vault-browser.types';

export function usePreferredFileBrowserView(): [FileBrowserView, Dispatch<SetStateAction<FileBrowserView>>] {
  const { defaultFileBrowserView, setDefaultFileBrowserView } = useAccentColor();
  const [browserView, setBrowserViewState] = useState<FileBrowserView>(defaultFileBrowserView);

  useEffect(() => {
    setBrowserViewState(defaultFileBrowserView);
  }, [defaultFileBrowserView]);

  const setBrowserView = useCallback<Dispatch<SetStateAction<FileBrowserView>>>((nextView) => {
    const resolvedView = typeof nextView === 'function' ? nextView(browserView) : nextView;
    setBrowserViewState(resolvedView);
    setDefaultFileBrowserView(resolvedView);
  }, [browserView, setDefaultFileBrowserView]);

  return [browserView, setBrowserView];
}
