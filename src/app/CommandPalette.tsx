import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Dialog } from '@/components/ui/overlays';
import { ICONS } from '@/components/ui/icons';
import { PaletteReferralResults } from '@/features/queue/PaletteReferralResults';
import type { NavItem } from './nav';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
}

/**
 * Ctrl+K palette. Prototype scope: navigation and a referral search that opens the list filtered.
 * Patient and referrer search results are added by the queue and referrer features.
 */
export function CommandPalette({ open, onOpenChange, items }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const go = (to: string) => {
    onOpenChange(false);
    setQuery('');
    navigate(to);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Go to a page or search referrals.">
      <Command label="Command palette" className="flex flex-col gap-2">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Type a page, a name or a reference"
          className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-focus md:h-10"
        />
        <Command.List className="max-h-80 overflow-auto">
          <Command.Empty className="px-3 py-3 text-base text-ink-muted">No matching pages.</Command.Empty>
          <Command.Group heading="Pages" className="text-sm text-ink-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Command.Item
                  key={item.to}
                  value={item.label}
                  onSelect={() => go(item.to)}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-base text-ink data-[selected=true]:bg-accent-subtle md:min-h-9"
                >
                  <Icon size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
                  {item.label}
                </Command.Item>
              );
            })}
          </Command.Group>
          <Command.Group heading="Search" className="text-sm text-ink-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
            <Command.Item
              value="search referrals"
              onSelect={() => go('/referrals')}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-base text-ink data-[selected=true]:bg-accent-subtle md:min-h-9"
            >
              <ICONS.search size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
              Search referrals
            </Command.Item>
          </Command.Group>
          <PaletteReferralResults query={query} onSelect={(id) => go(`/referrals/${id}`)} />
        </Command.List>
      </Command>
    </Dialog>
  );
}
