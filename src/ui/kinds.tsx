import { AppWindow, Boxes, Braces, Cpu, Database, GitBranch, Link2, Network, Puzzle, Router, UserRound, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** What each kind of thing is called on its box and in its row, and its icon. */
export const KIND: Record<string, { word: string; icon: LucideIcon }> = {
  people: { word: 'Person', icon: UserRound },
  systems: { word: 'System', icon: Network },
  apps: { word: 'App', icon: AppWindow },
  stores: { word: 'Store', icon: Database },
  components: { word: 'Component', icon: Boxes },
  infrastructure: { word: 'Infrastructure', icon: Router },
};

/** The icons of the records that are not things; their tiles are neutral. */
const OTHER: Record<string, LucideIcon> = { connections: Link2, technologies: Cpu, owners: UsersRound, features: Puzzle, flows: GitBranch, data: Braces };

/** The icon of a kind of record. */
export const iconOf = (kind: string): LucideIcon => KIND[kind]?.icon ?? OTHER[kind] ?? Boxes;

/** The type of a thing in words: "System", or "Store · database" when the record names its own kind. */
export function typeWords(kind: string, type?: unknown): string {
  const word = KIND[kind]?.word ?? kind;
  return typeof type === 'string' ? `${word} · ${type}` : word;
}
