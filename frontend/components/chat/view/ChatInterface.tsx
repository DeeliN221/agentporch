/** Web conversations are bound to the selected session, independently of terminal focus. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ChatMessagesPane from './subcomponents/ChatMessagesPane';
import ChatComposer from './subcomponents/ChatComposer';
import ConversationBookmarks from './subcomponents/ConversationBookmarks';
import { buildConversationBookmarks } from '../utils/conversationBookmarks';
import { useChatProviderState } from '../hooks/useChatProviderState';
import { useChatSessionState } from '../hooks/useChatSessionState';
import { useChatComposerState } from '../hooks/useChatComposerState';
import { useChatRealtimeHandlers } from '../hooks/useChatRealtimeHandlers';
import { useChatStatusReconcile } from './chatInterfaceStatusReconcile';
import { useChatSearchNavigation } from './chatInterfaceSearchNavigation';
import { isAgentPorchRouteSessionId, isTemporarySessionId, type PendingViewSession } from '../session/sessionIdentity';
import type { ChatInterfaceProps } from '../types/types';

function ChatInterface(props: ChatInterfaceProps) {
  const { selectedProject, selectedSession, ws, sendMessage, messageHistory,
    onFileOpen, onShowSettings, onSessionInactive, onReplaceTemporarySession,
    onNavigateToSession, autoScrollToBottom, externalMessageUpdate } = props;
  const { t } = useTranslation('chat');
  const location = useLocation();
  const pendingViewSessionRef = useRef<PendingViewSession | null>(null);
  const streamBufferRef = useRef('');
  const streamTimerRef = useRef<number | null>(null);
  const statusReconcileKeyRef = useRef<string | null>(null);
  const [activeTurnStartedAt, setActiveTurnStartedAt] = useState<string | null>(null);
  const [isFollowingLatest, setIsFollowingLatest] = useState(true);
  const [bookmarkTarget, setBookmarkTarget] = useState<string | null>(null);
  const [searchHighlightRetry, setSearchHighlightRetry] = useState(0);
  const controls = useChatProviderState({ selectedSession, disableModelCatalogs: selectedSession?.__provider === 'hermes' });
  const provider = selectedSession?.__provider || controls.provider;
  const readOnly = provider === 'hermes';
  const resetStreamingState = useCallback(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    streamTimerRef.current = null;
    streamBufferRef.current = '';
  }, []);
  useEffect(() => resetStreamingState, [resetStreamingState]);

  const session = useChatSessionState({
    selectedProject, selectedSession, providerHint: provider, sendMessage,
    isFollowingLatest, isRealtimeConnected: ws?.readyState === 1,
    autoScrollToBottom, externalMessageUpdate, resetStreamingState, pendingViewSessionRef,
  });
  const bookmarks = useMemo(() => buildConversationBookmarks(session.chatMessages), [session.chatMessages]);
  const composer = useChatComposerState({
    selectedProject, selectedSession, currentSessionId: session.currentSessionId,
    provider, codexModel: controls.codexModel, piModel: controls.piModel,
    piThinkingLevel: controls.piThinkingLevel, codexModelSwitchSessionId: null,
    codexReasoningEffort: controls.codexReasoningEffort, codexServiceTier: controls.codexServiceTier,
    canAbortSession: session.canAbortSession, tokenBudget: session.tokenBudget,
    chatMessages: session.chatMessages, sendMessage, onSessionActive: props.onSessionActive,
    onInputFocusChange: props.onInputFocusChange, onFileOpen, onShowSettings,
    pendingViewSessionRef, scrollToBottom: session.scrollToBottom,
    setChatMessages: session.setChatMessages, setSessionMessages: session.setSessionMessages,
    setIsLoading: session.setIsLoading, setCanAbortSession: session.setCanAbortSession,
    setIsUserScrolledUp: session.setIsUserScrolledUp,
    setPendingPermissionRequests: controls.setPendingPermissionRequests,
  });
  useChatRealtimeHandlers({
    messageHistory, provider, selectedProject, selectedSession,
    currentSessionId: session.currentSessionId, setCurrentSessionId: session.setCurrentSessionId,
    setChatMessages: session.setChatMessages, setSessionMessages: session.setSessionMessages,
    setIsLoading: session.setIsLoading, setActiveTurnStartedAt,
    setCanAbortSession: session.setCanAbortSession, setTokenBudget: session.setTokenBudget,
    setIsSystemSessionChange: session.setIsSystemSessionChange,
    setPendingPermissionRequests: controls.setPendingPermissionRequests,
    sendMessage, pendingViewSessionRef, streamBufferRef, streamTimerRef,
    onSessionInactive, onReplaceTemporarySession, onNavigateToSession,
    codexModelSwitchSessionId: null, loadSessionMessages: session.loadSessionMessages,
  });

  // Re-subscribe after reconnect, without opening a terminal or inspecting a pane.
  useEffect(() => {
    const routeIndex = Number(selectedSession?.routeIndex);
    const routeId = Number.isInteger(routeIndex) && routeIndex > 0 ? `c${routeIndex}`
      : isAgentPorchRouteSessionId(selectedSession?.id || '') ? selectedSession!.id : '';
    const sessionId = routeId || selectedSession?.id || session.currentSessionId;
    if (readOnly || !sessionId || isTemporarySessionId(sessionId) || ws?.readyState !== 1) return;
    sendMessage({
      type: 'subscribe-session', provider, sessionId,
      agentporchSessionId: routeId, agentporch_session_id: routeId,
      projectName: selectedSession?.__projectName || selectedProject?.name || '',
      projectPath: selectedSession?.projectPath || selectedProject?.fullPath || selectedProject?.path || '',
      providerSessionId: selectedSession?.providerSessionId || (!routeId ? selectedSession?.id || '' : ''),
    });
  }, [ws, ws?.readyState, readOnly, provider, selectedSession?.id, selectedSession?.routeIndex,
    selectedSession?.providerSessionId, selectedSession?.projectPath, selectedSession?.__projectName,
    selectedProject?.name, selectedProject?.fullPath, selectedProject?.path, session.currentSessionId, sendMessage]);

  useChatStatusReconcile({
    canAbortSession: session.canAbortSession, currentSessionId: session.currentSessionId,
    effectiveProvider: provider, isLoading: session.isLoading, pendingViewSessionRef,
    selectedProjectPath: selectedProject?.fullPath || selectedProject?.path || '',
    selectedSessionId: selectedSession?.id, selectedSessionProjectPath: selectedSession?.projectPath || '',
    selectedSessionProviderScope: typeof selectedSession?.providerScope === 'string' ? selectedSession.providerScope : null,
    selectedSessionRouteIndex: selectedSession?.routeIndex, sendMessage, statusReconcileKeyRef,
  });
  useChatSearchNavigation({
    locationSearch: location.search, selectedSessionId: selectedSession?.id,
    chatMessages: session.chatMessages, visibleMessages: session.visibleMessages,
    isLoadingMoreMessages: session.isLoadingMoreMessages, isLoadingAllMessages: session.isLoadingAllMessages,
    allMessagesLoaded: session.allMessagesLoaded, searchHighlightRetry, setSearchHighlightRetry,
    loadMessagesUntilTarget: session.loadMessagesUntilTarget, revealLoadedMessage: session.revealLoadedMessage,
  });

  if (!selectedProject) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a project to start chatting.</div>;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="web-chat" data-session-id={selectedSession?.id || ''}>
      {readOnly && <div className="border-b border-border px-4 py-2 text-sm text-muted-foreground">Read-only history. Continue this session in its original workspace.</div>}
      <ConversationBookmarks bookmarks={bookmarks} placement="floating" onBookmarkSelect={key => {
        setIsFollowingLatest(false);
        session.revealLoadedMessage(key);
        setBookmarkTarget(key);
      }} />
      <ChatMessagesPane
        scrollTargetMessageKey={bookmarkTarget}
        scrollContainerRef={session.scrollContainerRef}
        onWheel={session.handleWheel} onTouchStart={session.handleTouchStart}
        onTouchMove={session.handleTouchMove} onKeyDown={session.handleKeyDown}
        isLoadingSessionMessages={session.isLoadingSessionMessages} sessionMessagesError={session.sessionMessagesError}
        chatMessages={session.chatMessages} selectedSession={selectedSession}
        currentSessionId={session.currentSessionId} provider={provider} setProvider={controls.setProvider}
        textareaRef={composer.textareaRef} codexModel={controls.codexModel} setCodexModel={controls.setCodexModel}
        codexModelOptions={controls.codexModelOptions} codexReasoningEffort={controls.codexReasoningEffort}
        setCodexReasoningEffort={controls.setCodexReasoningEffort} codexReasoningOptions={controls.codexReasoningOptions}
        setInput={composer.setInput} isLoadingMoreMessages={session.isLoadingMoreMessages}
        hasMoreMessages={session.hasMoreMessages} totalMessages={session.totalMessages}
        visibleMessageCount={session.visibleMessageCount} visibleMessages={session.visibleMessages}
        loadEarlierMessages={session.loadEarlierMessages} loadAllMessages={session.loadAllMessages}
        allMessagesLoaded={session.allMessagesLoaded} isLoadingAllMessages={session.isLoadingAllMessages}
        loadAllJustFinished={session.loadAllJustFinished} showLoadAllOverlay={session.showLoadAllOverlay}
        createDiff={session.createDiff} onFileOpen={onFileOpen} onShowSettings={onShowSettings}
        autoExpandTools={props.autoExpandTools} showRawParameters={props.showRawParameters}
        showThinking={props.showThinking} isFollowingLatest={isFollowingLatest} selectedProject={selectedProject}
      />
      {!readOnly && <ChatComposer
        isLoading={session.isLoading} isComposerSubmitting={composer.isComposerSubmitting}
        onAbortSession={composer.handleAbortSession} provider={provider}
        codexModel={controls.codexModel} setCodexModel={controls.setCodexModel} codexModelOptions={controls.codexModelOptions}
        codexReasoningEffort={controls.codexReasoningEffort} setCodexReasoningEffort={controls.setCodexReasoningEffort}
        codexReasoningOptions={controls.codexReasoningOptions} codexServiceTier={controls.codexServiceTier}
        setCodexServiceTier={controls.setCodexServiceTier} codexServiceTierOptions={controls.codexServiceTierOptions}
        codexFastServiceTier={controls.codexFastServiceTier} piModel={controls.piModel}
        setPiModel={controls.setPiModel} piModelOptions={controls.piModelOptions}
        piThinkingLevel={controls.piThinkingLevel} setPiThinkingLevel={controls.setPiThinkingLevel}
        piThinkingOptions={controls.piThinkingOptions} activeTurnStartedAt={activeTurnStartedAt}
        onToggleCommandMenu={composer.handleToggleCommandMenu} onToggleFileMenu={composer.openFileDropdown}
        hasMessages={session.chatMessages.length > 0} isFollowingLatest={isFollowingLatest}
        onToggleFollowLatest={() => setIsFollowingLatest(value => !value)} onSubmit={composer.handleSubmit}
        isDragActive={composer.isDragActive} attachedUploads={composer.attachedUploads}
        onRemoveAttachment={index => composer.setAttachedUploads(files => files.filter((_, i) => i !== index))}
        uploadingAttachments={composer.uploadingAttachments} attachmentErrors={composer.attachmentErrors}
        showFileDropdown={composer.showFileDropdown} fileSearchQuery={composer.fileSearchQuery}
        onFileSearchQueryChange={composer.setFileSearchQuery} fileTree={composer.fileTree}
        expandedFileTreePaths={composer.expandedFileTreePaths} onToggleFileTreeDirectory={composer.toggleFileTreeDirectory}
        filteredFiles={composer.filteredFiles} selectedFileIndex={composer.selectedFileIndex}
        onSelectFile={composer.selectFile} onFileMenuKeyDown={composer.handleFileMentionsKeyDown}
        filteredCommands={composer.filteredCommands} selectedCommandIndex={composer.selectedCommandIndex}
        onCommandSelect={composer.handleCommandSelect} onCloseCommandMenu={composer.resetCommandMenuState}
        isCommandMenuOpen={composer.showCommandMenu} frequentCommands={composer.frequentCommands}
        getRootProps={composer.getRootProps} getInputProps={composer.getInputProps}
        openAttachmentPicker={composer.openAttachmentPicker} onAttachmentSelection={composer.handleAttachmentSelection}
        inputHighlightRef={composer.inputHighlightRef} renderInputWithMentions={composer.renderInputWithMentions}
        textareaRef={composer.textareaRef} input={composer.input} onInputChange={composer.handleInputChange}
        onTextareaClick={composer.handleTextareaClick} onTextareaKeyDown={composer.handleKeyDown}
        onTextareaPaste={composer.handlePaste} onTextareaScrollSync={composer.syncInputOverlayScroll}
        onTextareaInput={composer.handleTextareaInput} onInputFocusChange={composer.handleInputFocusChange}
        placeholder={t('input.placeholder', { defaultValue: 'Message your agent…' })}
        isTextareaExpanded={composer.isTextareaExpanded} onTranscript={composer.handleTranscript}
      />}
    </div>
  );
}
export default React.memo(ChatInterface);
