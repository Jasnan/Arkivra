import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useMeQuery } from '@/features/me/me.queries';

function isCommandShortcut(event: KeyboardEvent) {
  return event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const commandItems = [
    { label: 'Vaults', description: 'Open your vault workspace', value: 'vaults', action: () => navigate('/vaults') },
    { label: 'Search', description: 'Search across accessible documents', value: 'search', action: () => navigate('/search') },
    { label: 'Settings', description: 'Manage your account and security', value: 'settings', action: () => navigate('/settings') },
    { label: 'About', description: 'View version info and project links', value: 'about', action: () => navigate('/about') },
    ...(meQuery.data?.isGlobalAdmin
      ? [{ label: 'Admin', description: 'Open backups, users, and vault oversight', value: 'admin', action: () => navigate('/admin') }]
      : []),
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCommandShortcut(event)) {
        return;
      }

      event.preventDefault();
      setOpen(current => !current);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOpenRequest = () => setOpen(true);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('arkivra:command-menu.open', handleOpenRequest);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('arkivra:command-menu.open', handleOpenRequest);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <Command
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-popover text-popover-foreground shadow-2xl"
        label="Command Menu"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-border px-4">
          <Command.Input
            autoFocus
            className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Jump to a page or scaffolded area..."
          />
        </div>
        <Command.List className="max-h-[22rem] overflow-y-auto p-3">
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing matched that search.
          </Command.Empty>
          <Command.Group heading="Workspace" className="text-sm text-muted-foreground">
            {commandItems.map(item => {
              return (
                <Command.Item
                  key={item.value}
                  value={item.value}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-foreground outline-none data-[selected=true]:bg-muted"
                  onSelect={() => {
                    item.action();
                    setOpen(false);
                  }}
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
