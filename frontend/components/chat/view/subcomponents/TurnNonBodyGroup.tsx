/**
 * PURPOSE: Render one turn's thinking and tool activity inside an outer
 * collapsible group while delegating message details to existing renderers.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import MessageComponent from './MessageComponent';
import type { ChatMessage, Provider } from '../../types/types';
import type { Project } from '../../../../types/app';
import type { TurnNonBodyGroupBlock } from '../../utils/turnNonBodyCollapse';
import {
  estimateOpenAiTokenCostCny,
  formatTokenCostCny,
  formatTokenCostUsd,
  USD_CNY_REFERENCE_RATE,
} from '../../utils/openAiTokenCost';
import { formatProcessedDuration } from '../../utils/turnSummaryFormatting';

type DiffLine = {
  type: string;
  content: string;
  lineNum: number;
};

interface TurnNonBodyGroupProps {
  block: TurnNonBodyGroupBlock;
  blockIndex: number;
  createDiff: (oldStr: string, newStr: string) => DiffLine[];
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onShowSettings?: () => void;
  autoExpandTools?: boolean;
  showRawParameters?: boolean;
  showThinking?: boolean;
  selectedProject?: Project | null;
  provider: Provider | string;
}

type RenderChildMessageProps = Omit<TurnNonBodyGroupProps, 'block'> & {
  suppressAssistantMetadata?: boolean;
};

/**
 * Render child transcript messages without replacing their internal tool and
 * thinking disclosure behavior.
 */
function renderChildMessage(
  message: ChatMessage,
  index: number,
  props: RenderChildMessageProps,
) {
  return (
    <MessageComponent
      key={String(message.messageKey || message.toolCallId || message.toolId || index)}
      message={message}
      index={index}
      prevMessage={index > 0 ? null : null}
      createDiff={props.createDiff}
      onFileOpen={props.onFileOpen}
      onShowSettings={props.onShowSettings}
      autoExpandTools={props.autoExpandTools}
      showRawParameters={props.showRawParameters}
      showThinking={props.showThinking}
      suppressAssistantMetadata={props.suppressAssistantMetadata}
      selectedProject={props.selectedProject}
      provider={props.provider}
    />
  );
}

/**
 * Render the outer turn-level disclosure used after assistant body appears.
 */
export default function TurnNonBodyGroup({
  block,
  blockIndex,
  createDiff,
  onFileOpen,
  onShowSettings,
  autoExpandTools,
  showRawParameters,
  showThinking,
  selectedProject,
  provider,
}: TurnNonBodyGroupProps) {
  const { t, i18n } = useTranslation('chat');
  const language = i18n.resolvedLanguage || i18n.language;
  const isChinese = language.startsWith('zh');
  const [isOpen, setIsOpen] = useState(block.defaultOpen);
  const [, setElapsedTick] = useState(0);
  const isToolOnlyBlock = block.items.every((item) => item.kind === 'tool-group');
  const toolInvocationCount = block.items.filter((item) => item.kind === 'tool-group').length;
  const toolInvocationLabel = t('turnSummary.toolCalls', { count: toolInvocationCount });
  const processingStartedAtMs = block.processingStartedAt instanceof Date
    ? block.processingStartedAt.getTime()
    : typeof block.processingStartedAt === 'number'
      ? block.processingStartedAt
      : block.processingStartedAt
        ? Date.parse(block.processingStartedAt)
        : Number.NaN;
  const processedDurationMs = block.isProcessing && Number.isFinite(processingStartedAtMs)
    ? Date.now() - processingStartedAtMs
    : block.processedDurationMs;
  const processedDuration = processedDurationMs === undefined
    ? null
    : formatProcessedDuration(processedDurationMs, language);
  const tokenCost = estimateOpenAiTokenCostCny(block.model, block.tokenUsage);
  const tokenCostLabel = tokenCost
    ? isChinese ? formatTokenCostCny(tokenCost.cny) : formatTokenCostUsd(tokenCost.usd)
    : null;
  const tokenCostTitle = tokenCost
    ? t('turnSummary.costDisclaimer', { model: tokenCost.modelLabel, rate: USD_CNY_REFERENCE_RATE })
    : undefined;

  useEffect(() => {
    setIsOpen(block.defaultOpen);
  }, [block.defaultOpen, block.turnKey, provider]);

  /**
   * Refresh only active process summaries; completed transcript groups retain
   * the fixed duration captured when their final assistant body was grouped.
   */
  useEffect(() => {
    if (!block.isProcessing || !Number.isFinite(processingStartedAtMs)) {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedTick((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [block.isProcessing, processingStartedAtMs]);

  /**
   * Toggle the outer group from React state so live defaultOpen changes cannot
   * race with the browser's native details toggle event.
   */
  const handleSummaryClick = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setIsOpen((current) => !current);
  };

  if (isToolOnlyBlock) {
    return (
      <details
        data-testid="turn-tool-list-group"
        className="group/tools rounded-md border border-gray-200/70 bg-gray-50/60 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900/30"
        open={isOpen}
      >
        <summary
          data-testid="turn-tool-list-toggle"
          className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-expanded={isOpen}
          onClick={handleSummaryClick}
        >
          <svg
            className="h-3 w-3 flex-shrink-0 transition-transform duration-150 group-open/tools:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {processedDuration && (
            <span data-testid="turn-non-body-elapsed">{t('turnSummary.duration', { duration: processedDuration })}</span>
          )}
          {tokenCostLabel && (
            <span data-testid="turn-non-body-cost" title={tokenCostTitle}>{t('turnSummary.estimatedCost', { cost: tokenCostLabel })}</span>
          )}
        </summary>

        {isOpen && (
          <details data-testid="turn-tool-list" className="mt-2 pl-[18px]">
            <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300">
              {toolInvocationLabel}
            </summary>
            <div className="mt-2 space-y-2 pl-[18px]">
            {block.items.flatMap((item, itemIndex) => item.messages.map((message, messageIndex) => renderChildMessage(
                message,
                blockIndex * 1000 + itemIndex * 100 + messageIndex,
                {
                  blockIndex,
                  createDiff,
                  onFileOpen,
                  onShowSettings,
                  autoExpandTools,
                  showRawParameters,
                  showThinking,
                  suppressAssistantMetadata: true,
                  selectedProject,
                  provider,
                },
              ))) }
            </div>
          </details>
        )}
      </details>
    );
  }

  return (
    <details
      data-testid="turn-non-body-group"
      className="group/turn rounded-md border border-gray-200/70 bg-gray-50/60 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900/30"
      open={isOpen}
    >
      <summary
        data-testid="turn-non-body-toggle"
        className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        aria-expanded={isOpen}
        onClick={handleSummaryClick}
      >
        <svg
          className="h-3 w-3 flex-shrink-0 transition-transform duration-150 group-open/turn:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {processedDuration && (
          <span data-testid="turn-non-body-elapsed">{t('turnSummary.duration', { duration: processedDuration })}</span>
        )}
        {tokenCostLabel && (
          <span data-testid="turn-non-body-cost" title={tokenCostTitle}>{t('turnSummary.estimatedCost', { cost: tokenCostLabel })}</span>
        )}
      </summary>

      {isOpen && (
        <div className="mt-2 space-y-2 pl-[18px]">
          {block.items.map((item, itemIndex) => {
            if (item.kind === 'thinking-group') {
              return (
                <div key={item.groupKey} data-testid="turn-thinking-group" className="space-y-2">
                  {item.messages.map((message, messageIndex) => renderChildMessage(message, messageIndex, {
                    blockIndex,
                    createDiff,
                    onFileOpen,
                    onShowSettings,
                    autoExpandTools,
                    showRawParameters,
                    showThinking,
                    suppressAssistantMetadata: true,
                    selectedProject,
                    provider,
                  }))}
                </div>
              );
            }

            return (
              <details key={item.groupKey} data-testid="turn-tool-group" className="rounded border border-gray-200/70 px-2 py-1 dark:border-gray-700/60">
                <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300">
                  {t('turnSummary.toolCalls', { count: item.commandCount })}
                </summary>
                <div className="mt-2 space-y-2 pl-[18px]">
                  {item.messages.map((message, messageIndex) => (
                    <div
                      key={String(message.messageKey || message.toolCallId || message.toolId || messageIndex)}
                    >
                      {renderChildMessage(message, itemIndex + messageIndex, {
                        blockIndex,
                        createDiff,
                        onFileOpen,
                        onShowSettings,
                        autoExpandTools,
                        showRawParameters,
                        showThinking,
                        suppressAssistantMetadata: true,
                        selectedProject,
                        provider,
                      })}
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </details>
  );
}
