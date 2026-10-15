import { useTranslation } from 'react-i18next';
/**
 * Render a horizontally draggable pending-session card.
 * Support swipe-to-complete on mobile and desktop while retaining click and keyboard access.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SessionProvider } from '../../types/app';
import { formatTimestamp } from '../../utils/dateUtils';

type SessionAttentionCardProps = {
  provider: SessionProvider;
  sessionId: string;
  projectName: string;
  firstRequest: string;
  latestRequest: string;
  lastActivity: string;
  isSubmitting: boolean;
  onNavigate: () => void;
  onHandled: () => Promise<boolean>;
};

type PointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: 'pending' | 'horizontal' | 'vertical';
};

const SWIPE_START_DISTANCE = 8;
const SWIPE_MIN_TRIGGER = 92;
const SWIPE_MAX_TRIGGER = 150;

/** Draw a lightweight completion icon. */
function CheckIcon({ className = '' }: { className?: string }) {
  /** Keep the action background clear during dragging without another icon dependency. */
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="m5 12.5 4.25 4.25L19 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Draw the swipe-right hint. */
function SwipeArrowIcon({ className = '' }: { className?: string }) {
  /** Show first-time users the completion direction without requiring experimentation. */
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Support right-swipe completion, left-swipe rebound, click navigation, and keyboard equivalents.
 */
export default function SessionAttentionCard({
  provider,
  sessionId,
  projectName,
  firstRequest,
  latestRequest,
  lastActivity,
  isSubmitting,
  onNavigate,
  onHandled,
}: SessionAttentionCardProps) {
  /** Update only the dragged card, avoiding whole-board rendering on pointer movement. */
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const { t } = useTranslation('common');
  const cardRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const dragXRef = useRef(0);
  const suppressClickRef = useRef(false);
  const hasDistinctLatestRequest = latestRequest.trim() !== firstRequest.trim();
  const activityTimestamp = formatTimestamp(lastActivity, { includeTime: true }) || t('attention.unknownTime');
  const hintId = `session-attention-hint-${provider}-${sessionId}`;

  /** Calculate a completion threshold relative to the current card width. */
  const swipeTrigger = (): number => {
    /** Keep narrow screens usable without allowing accidental completion on wide screens. */
    const cardWidth = cardRef.current?.getBoundingClientRect().width || 360;
    return Math.min(SWIPE_MAX_TRIGGER, Math.max(SWIPE_MIN_TRIGGER, cardWidth * 0.28));
  };

  /** Store display offset and live gesture state together so release reads the latest frame. */
  const updateDragX = (nextDragX: number) => {
    /** Determine fast-swipe completion independently of React state commit timing. */
    dragXRef.current = nextDragX;
    setDragX(nextDragX);
  };

  /** Track one primary pointer while allowing normal vertical page scrolling. */
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    /** Ignore secondary mouse buttons and cards whose submission is in progress. */
    if (isSubmitting || isExiting || (event.pointerType === 'mouse' && event.button !== 0)) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: 'pending',
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  /** Distinguish horizontal swipes from vertical scrolling by the dominant movement axis. */
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    /** Apply slight resistance to left swipes; follow right swipes and reveal the completion action. */
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.axis === 'pending' && Math.hypot(deltaX, deltaY) >= SWIPE_START_DISTANCE) {
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }
    if (gesture.axis !== 'horizontal') return;
    suppressClickRef.current = true;
    updateDragX(deltaX >= 0 ? deltaX : Math.max(-28, deltaX * 0.18));
  };

  /** On release, submit and slide out past the threshold, or return to the original position. */
  const finishPointerGesture = async (event: ReactPointerEvent<HTMLElement>) => {
    /** Submit once per release and restore the card on failure or concurrent activity. */
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setIsDragging(false);
    if (gesture.axis !== 'horizontal' || dragXRef.current < swipeTrigger()) {
      updateDragX(0);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      return;
    }
    suppressClickRef.current = true;
    setIsExiting(true);
    updateDragX((cardRef.current?.getBoundingClientRect().width || 360) + 48);
    const handled = await onHandled();
    if (!handled) {
      setIsExiting(false);
      updateDragX(0);
    }
  };

  /** Rebound on pointer cancellation without interpreting an incomplete gesture as completion. */
  const cancelPointerGesture = (event: ReactPointerEvent<HTMLElement>) => {
    /** Interruptions such as calls or scroll takeover must not complete a session accidentally. */
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    suppressClickRef.current = true;
    setIsDragging(false);
    updateDragX(0);
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  /** Open on click, ignoring synthetic clicks immediately after a drag. */
  const handleClick = () => {
    /** A swipe completes the item without unexpectedly opening the session. */
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onNavigate();
  };

  /** Provide equivalent keyboard actions for users who cannot drag. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    /** Enter opens the session; ArrowRight completes it, matching the visual direction. */
    if (event.key === 'Enter') {
      event.preventDefault();
      onNavigate();
    } else if (event.key === 'ArrowRight' && !isSubmitting && !isExiting) {
      event.preventDefault();
      setIsExiting(true);
      updateDragX((cardRef.current?.getBoundingClientRect().width || 360) + 48);
      void onHandled().then((handled) => {
        if (!handled) {
          setIsExiting(false);
          updateDragX(0);
        }
      });
    }
  };

  const trigger = swipeTrigger();
  const completionProgress = Math.min(1, Math.max(0, dragX / trigger));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-emerald-600 shadow-sm">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 flex items-center gap-2 px-5 text-sm font-semibold text-white"
        style={{ opacity: Math.max(0.3, completionProgress) }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <CheckIcon className="h-5 w-5" />
        </span>
        {completionProgress >= 1 ? t('attention.release') : t('attention.swipe')}
      </div>

      <article
        ref={cardRef}
        data-testid={`session-attention-card-${provider}:${sessionId}`}
        data-swipe-state={isExiting ? 'completing' : dragX > 0 ? 'swiping' : 'idle'}
        role="button"
        tabIndex={isSubmitting ? -1 : 0}
        aria-describedby={hintId}
        aria-keyshortcuts="Enter ArrowRight"
        aria-disabled={isSubmitting}
        className={`relative touch-pan-y cursor-grab select-none rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm will-change-transform hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:px-5 ${isDragging ? 'transition-none' : 'transition-transform duration-200 ease-out motion-reduce:transition-none'}`}
        style={{
          transform: `translate3d(${dragX}px, 0, 0)`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => void finishPointerGesture(event)}
        onPointerCancel={cancelPointerGesture}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="mb-4 flex min-w-0 items-center gap-2.5">
          <time
            data-slot="session-attention-time"
            dateTime={lastActivity}
            title={t('attention.lastActive', { time: activityTimestamp })}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {activityTimestamp}
          </time>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{projectName}</span>
          <span id={hintId} className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/80">
            <SwipeArrowIcon className="h-4 w-4" />
            {t('attention.swipe')}
          </span>
        </div>

        <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground">
          {firstRequest}
        </p>

        {hasDistinctLatestRequest ? (
          <>
            <p aria-label={t('attention.omitted')} className="my-1 text-[15px] leading-6 text-muted-foreground">...</p>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground">
              {latestRequest}
            </p>
          </>
        ) : null}
      </article>
    </div>
  );
}
