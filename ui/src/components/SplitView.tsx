import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageCircle, X, Send, Copy, Download } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { ResearchOutput, GlassStyle, AnimationStyle } from '../types';
import './SplitView.css';
import { streamAnswer } from '../utils/qa';
import { segmentReport, type ReportBlock } from '../utils/reportSegmentation';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface SplitViewProps {
  output: ResearchOutput;
  jobId: string | null;
  isResetting: boolean;
  glassStyle: GlassStyle;
  fadeInAnimation: AnimationStyle;
  loaderColor: string;
  isGeneratingPdf: boolean;
  isCopied: boolean;
  onCopyToClipboard: () => void;
  onGeneratePdf: () => void;
}

const SplitView: React.FC<SplitViewProps> = ({
  output,
  jobId,
  isResetting,
  glassStyle,
  fadeInAnimation,
  loaderColor,
  isGeneratingPdf,
  isCopied,
  onCopyToClipboard,
  onGeneratePdf
}) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(25); // Start with 25% for chat (75% for report)
  const [isResizing, setIsResizing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});

  // Check for mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const openChat = () => {
    setChatOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
  };

  const closeChat = () => {
    setChatOpen(false);
    setChatMessages([]); // Clear messages when closing
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    const assistantId = (Date.now() + 1).toString();
    const initialAssistant: ChatMessage = {
      id: assistantId,
      content: '',
      sender: 'assistant',
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMessage, initialAssistant]);
    setInputValue('');
    setIsLoading(true);

    // Ensure we scroll to bottom as content grows
    const scrollToBottom = () => {
      setTimeout(() => {
        chatMessagesRef.current?.scrollTo({
          top: chatMessagesRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    };
    scrollToBottom();

    try {
      await streamAnswer(userMessage.content, (chunk) => {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: (m.content || '') + chunk } : m
          )
        );
        scrollToBottom();
      }, { jobId: jobId || undefined });
    } catch (err) {
      const fallback = 'Sorry, I ran into an issue answering that. Please try again.';
      setChatMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: fallback } : m))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    setIsResizing(true);
    setIsDragging(true);
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !chatOpen || isMobile) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(20, Math.min(30, ((e.clientX - rect.left) / rect.width) * 100));
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, chatOpen, isMobile]);

  if (!output || !output.details) return null;

  // Prepare segmented report blocks with stable IDs
  const reportBlocks: ReportBlock[] = useMemo(() => {
    return segmentReport(output.details.report || '');
  }, [output?.details?.report]);

  const setBlockRef = (id: string) => (el: HTMLElement | null) => {
    blockRefs.current[id] = el;
  };

  const scrollToBlock = (id: string) => {
    const el = blockRefs.current[id] || document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('citation-highlight');
      window.setTimeout(() => el.classList.remove('citation-highlight'), 1200);
    }
  };

  // Render assistant message with inline citation markers [bN] -> clickable superscripts
  const renderAssistantContent = (text: string) => {
    if (!text) return <p className="text-sm"/>;

    const parts: Array<JSX.Element | string> = [];
    const idToIndex = new Map<string, number>();
    let nextIndex = 1;
    const regex = /\[(b\d+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) parts.push(before);
      const blockId = match[1];
      if (!idToIndex.has(blockId)) idToIndex.set(blockId, nextIndex++);
      const n = idToIndex.get(blockId)!;
      parts.push(
        <sup
          key={`${blockId}-${match.index}`}
          className="ml-0.5 text-[10px] text-primary cursor-pointer align-super"
          role="button"
          tabIndex={0}
          onClick={() => scrollToBlock(blockId)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToBlock(blockId); } }}
          aria-label={`Cites segment ${blockId}`}
          title={`Cites ${blockId}`}
        >
          {n}
        </sup>
      );
      lastIndex = match.index + match[0].length;
    }
    const tail = text.slice(lastIndex);
    if (tail) parts.push(tail);
    return <p className="text-sm">{parts}</p>;
  };

  return (
    <article 
      ref={containerRef}
      className={`split-view-container ${glassStyle.card} ${fadeInAnimation.fadeIn} ${isResetting ? 'opacity-0 transform -translate-y-4' : 'opacity-100 transform translate-y-0'} min-h-0`}
      style={{ 
        height: chatOpen ? (isMobile ? '100vh' : '80vh') : 'auto', 
        minHeight: chatOpen ? (isMobile ? '100vh' : '600px') : 'auto',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: chatOpen && !isMobile 
          ? `minmax(320px, ${chatWidth}%) 4px 1fr` 
          : '1fr'
      }}
      data-chat-open={chatOpen}
      aria-label="Ecommerce report with chat interface"
    >
      {/* Header with Action Buttons */}
      <header 
        className="flex items-center justify-between p-6 border-b border-gray-200"
        style={{ gridColumn: '1 / -1' }}
        role="banner"
      >
        
        <nav className="split-view-header-buttons ml-auto flex items-center gap-2" role="toolbar" aria-label="Report actions">
          <button
            onClick={openChat}
            className="inline-flex items-center gap-2 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Open chat panel to ask questions about the report"
            aria-pressed={chatOpen}
            title="Ask follow-up questions"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="button-text text-sm leading-none">Ask Follow-Up Questions</span>
          </button>
          
          <button
            onClick={onCopyToClipboard}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Copy report to clipboard"
            title="Copy to clipboard"
          >
            {isCopied ? (
              <div className="h-4 w-4 text-white" aria-label="Copied successfully">✓</div>
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          
          <button
            onClick={onGeneratePdf}
            disabled={isGeneratingPdf}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 disabled:opacity-50 focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label={isGeneratingPdf ? "Generating PDF..." : "Download report as PDF"}
            title="Download PDF"
          >
            {isGeneratingPdf ? (
              <div className="h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </nav>
      </header>

      {/* Chat Panel - Mobile Modal or Desktop Left Panel */}
      {chatOpen && (
        isMobile ? (
          // Mobile Modal Overlay
          <div 
            className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-end"
            onClick={closeChat}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-title"
          >
            <div 
              className="bg-white w-full h-3/4 rounded-t-xl flex flex-col min-h-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <h2 id="chat-title" className="font-semibold text-gray-900">Follow-Up Questions</h2>
                <button
                  onClick={closeChat}
                  className="p-2 rounded-full hover:bg-gray-200 transition-all duration-300"
                  aria-label="Close chat"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              
              <div 
                ref={chatMessagesRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
                role="log"
                aria-live="polite"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <h3 className="font-medium mb-2">Ready to help!</h3>
                    <p className="text-sm">Ask me any questions about the ecommerce report.</p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className={`chat-message flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        message.sender === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {message.sender === 'assistant' ? (
                          renderAssistantContent(message.content)
                        ) : (
                          <p className="text-sm">{message.content}</p>
                        )}
                        <p className={`text-xs mt-1 ${
                          message.sender === 'user' ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        }`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg px-4 py-2">
                      <div className="flex space-x-1">
                        <div className="loading-dots w-2 h-2 bg-gray-400 rounded-full"></div>
                        <div className="loading-dots w-2 h-2 bg-gray-400 rounded-full"></div>
                        <div className="loading-dots w-2 h-2 bg-gray-400 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="border-t border-gray-200 p-4">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
                  <div className="flex items-end gap-2">
                    <label className="sr-only" htmlFor="mobile-chat-input">Type your question</label>
                    <textarea
                      id="mobile-chat-input"
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask a question about the report..."
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                      rows={1}
                      style={{ fontSize: '16px' }}
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoading}
                      className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
                </form>
              </div>
            </div>
          </div>
        ) : (
          // Desktop Left Panel
          <aside 
            className="split-view-chat-panel flex flex-col bg-white border-r border-gray-200 transition-all duration-300 min-h-0 h-full"
            style={{ gridColumn: '1' }}
            role="complementary"
            aria-labelledby="desktop-chat-title"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <h2 id="desktop-chat-title" className="font-semibold text-gray-900">Follow-Up Questions</h2>
              <button
                onClick={closeChat}
                className="p-1 rounded-full hover:bg-gray-200 transition-all duration-300"
                aria-label="Close chat panel"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div 
              ref={chatMessagesRef}
              className="chat-messages flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
              role="log"
              aria-live="polite"
            >
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="font-medium mb-2">Ready to help!</h3>
                  <p className="text-sm">Ask me any questions about the ecommerce report. I can clarify details, provide additional insights, or help you understand the data better.</p>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div key={message.id} className={`chat-message flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-lg px-4 py-2 ${
                      message.sender === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-secondary text-secondary-foreground'
                    }`}>
                      {message.sender === 'assistant' ? (
                        renderAssistantContent(message.content)
                      ) : (
                        <p className="text-sm">{message.content}</p>
                      )}
                      <p className={`text-xs mt-1 ${
                        message.sender === 'user' ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <div className="flex space-x-1">
                      <div className="loading-dots w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="loading-dots w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="loading-dots w-2 h-2 bg-gray-400 rounded-full"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-4">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
                <div className="flex items-end gap-2">
                  <label className="sr-only" htmlFor="desktop-chat-input">Type your question</label>
                  <textarea
                    id="desktop-chat-input"
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about the report..."
                    className="chat-input-textarea flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
              </form>
            </div>
          </aside>
        )
      )}

      {/* Resize Handle - Desktop Only */}
      {chatOpen && !isMobile && (
        <div 
          className={`split-view-resize-handle bg-gray-200 hover:bg-blue-300 cursor-col-resize flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-blue-400' : ''}`}
          style={{ gridColumn: '2' }}
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and report panels"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && chatWidth > 20) {
              setChatWidth(Math.max(20, chatWidth - 2));
            } else if (e.key === 'ArrowRight' && chatWidth < 30) {
              setChatWidth(Math.min(30, chatWidth + 2));
            }
          }}
        >
          <div className="w-1 h-8 bg-gray-400 rounded-full"></div>
        </div>
      )}

      {/* Report Panel - Main Content */}
      <main 
        className="split-view-report-panel overflow-y-auto transition-all duration-300 min-h-0"
        style={{ gridColumn: chatOpen && !isMobile ? '3' : '1' }}
        role="main"
        aria-label="Ecommerce report content"
      >
        <div className="p-6 prose prose-lg max-w-none">
          {reportBlocks.map((blk) => (
            <div key={blk.id} id={blk.id} data-block-id={blk.id} ref={setBlockRef(blk.id)}>
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children, ...props }) => {
                    const text = String(children);
                    const isFirstH1 = text.includes("Ecommerce Report");
                    return (
                      <h1 
                        className={`font-bold text-gray-900 break-words whitespace-pre-wrap ${
                          isFirstH1 ? 'text-4xl mb-8 mt-4' : 'text-3xl mb-6'
                        }`} 
                        {...props}
                      >
                        {children}
                      </h1>
                    );
                  },
                  h2: (props) => (
                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4" {...props} />
                  ),
                  h3: (props) => (
                    <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3" {...props} />
                  ),
                  p: ({ children, ...props }) => {
                    const text = String(children);
                    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
                    if (urlRegex.test(text)) {
                      const parts = text.split(urlRegex);
                      return (
                        <p className="text-gray-800 my-2" {...props}>
                          {parts.map((part, i) =>
                            urlRegex.test(part) ? (
                              <a
                                key={i}
                                href={part}
                                className="text-primary hover:text-primary/80 underline transition-colors duration-300"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {part}
                              </a>
                            ) : (
                              part
                            )
                          )}
                        </p>
                      );
                    }
                    return <p className="text-gray-800 my-2" {...props}>{children}</p>;
                  },
                  ul: (props) => (
                    <ul className="text-gray-800 space-y-1 list-disc pl-6" {...props} />
                  ),
                  li: (props) => (
                    <li className="text-gray-800" {...props} />
                  ),
                  a: ({ href, ...props }) => (
                    <a
                      href={href}
                      className="text-primary hover:text-primary/80 underline transition-colors duration-300"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    />
                  ),
                }}
              >
                {blk.text}
              </ReactMarkdown>
            </div>
          ))}
        </div>
      </main>
    </article>
  );
};

export default SplitView;
