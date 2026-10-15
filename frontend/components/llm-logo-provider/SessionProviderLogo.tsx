/**
 * Map session providers to consistently sized brand vectors.
 * Use the same provider visual language in navigation and session cards.
 */
import type { SessionProvider } from '../../types/app';
import ChatGptLogo from './ChatGptLogo';
import ClaudeLogo from './ClaudeLogo';
import HermesLogo from './HermesLogo';
import KimiLogo from './KimiLogo';
import PiLogo from './PiLogo';

type SessionProviderLogoProps = {
  provider?: SessionProvider | string | null;
  model?: string | null;
  className?: string;
};

export default function SessionProviderLogo({
  provider = 'codex',
  model = null,
  className = 'w-5 h-5',
}: SessionProviderLogoProps) {
  /** Use a brand logo for known providers and a model logo only as a fallback. */
  if (provider === 'codex') {
    return <ChatGptLogo className={className} />;
  }

  if (provider === 'claude') {
    return <ClaudeLogo className={className} />;
  }

  if (provider === 'pi') {
    return <PiLogo className={className} />;
  }

  if (provider === 'hermes') {
    return <HermesLogo className={className} />;
  }

  const modelLabel = (model || '').toLowerCase();
  if (modelLabel.includes('kimi')) {
    return <KimiLogo className={className} />;
  }

  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-full bg-muted text-[0.65em] font-semibold text-muted-foreground`}
      aria-label="Unknown provider"
    >
      AI
    </span>
  );
}
