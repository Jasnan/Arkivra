import { Moon, SunMedium } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  return (
    <Button
      variant="outline"
      size="icon"
      type="button"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
    >
      {isDarkMode ? <SunMedium size={16} /> : <Moon size={16} />}
    </Button>
  );
}
