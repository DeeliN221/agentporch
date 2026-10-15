/**
 * Display the Pi Agent brand as a vector.
 * Make provider identity recognizable without text abbreviations.
 */
export default function PiLogo({ className = 'w-5 h-5' }: { className?: string }) {
  /** Use a geometric Pi mark sized consistently with other provider logos. */
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Pi"
      role="img"
    >
      <path d="M4 7.25c3.1-1.35 6.75-1.7 10.35-1.35 2.12.2 3.95.72 5.65 1.48" strokeWidth="2.4" />
      <path d="M8.2 7.05c-.1 4.15-.72 7.95-2.2 10.9" strokeWidth="2.4" />
      <path d="M15.25 6.15v8.55c0 2.05.72 3.05 2.25 3.05.72 0 1.45-.2 2.15-.62" strokeWidth="2.4" />
    </svg>
  );
}
