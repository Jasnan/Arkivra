import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { FileBrowserView } from './vault-browser.types';

export function usePreferredFileBrowserView(): [FileBrowserView, Dispatch<SetStateAction<FileBrowserView>>] {
  const { defaultFileBrowserView } = useAccentColor();
  const [browserView, setBrowserViewState] = useState<FileBrowserView>(defaultFileBrowserView);
  const hasSessionBrowserViewOverrideRef = useRef(false);

  useEffect(() => {
    if (!hasSessionBrowserViewOverrideRef.current) {
      setBrowserViewState(defaultFileBrowserView);
    }
  }, [defaultFileBrowserView]);

  const setBrowserView = useCallback<Dispatch<SetStateAction<FileBrowserView>>>((nextView) => {
    hasSessionBrowserViewOverrideRef.current = true;
    setBrowserViewState(nextView);
  }, []);

  return [browserView, setBrowserView];
}
