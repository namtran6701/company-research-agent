import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, ArrowLeft, Send, Copy, Download } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { ResearchOutput, GlassStyle, AnimationStyle } from '../types';
import './SplitView.css';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface SplitViewProps {
  output: ResearchOutput;
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
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Auto-scroll to bottom
    setTimeout(() => {
      chatMessagesRef.current?.scrollTo({ 
        top: chatMessagesRef.current.scrollHeight, 
        behavior: 'smooth' 
      });
    }, 100);

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "Thank you for your question about the research report. This is a simulated response. In the actual implementation, this would be connected to your AI system to provide insights and answer questions about the company research data.",
        sender: 'assistant',
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
      
      // Auto-scroll to bottom
      setTimeout(() => {
        chatMessagesRef.current?.scrollTo({ 
          top: chatMessagesRef.current.scrollHeight, 
          behavior: 'smooth' 
        });
      }, 100);
    }, 1500);
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

  return (
    <article 
      ref={containerRef}
      className={`split-view-container ${glassStyle.card} ${fadeInAnimation.fadeIn} ${isResetting ? 'opacity-0 transform -translate-y-4' : 'opacity-100 transform translate-y-0'}`}
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
      aria-label="Research report with chat interface"
    >
      {/* Header with Action Buttons */}
      <header 
        className="flex items-center justify-between p-6 border-b border-gray-200"
        style={{ gridColumn: '1 / -1' }}
        role="banner"
      >
        <div className="flex items-center gap-4">
          {chatOpen && (
            <button
              onClick={closeChat}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all duration-300"
              aria-label="Close chat and return to full report view"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to Report</span>
            </button>
          )}
        </div>
        
        <nav className="split-view-header-buttons flex items-center gap-2" role="toolbar" aria-label="Report actions">
          <button
            onClick={openChat}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#468BFF] text-white hover:bg-[#8FBCFA] transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Open chat panel to ask questions about the report"
            aria-pressed={chatOpen}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="button-text">Ask Follow-Up Questions</span>
          </button>
          
          <button
            onClick={onCopyToClipboard}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-[#468BFF] text-white hover:bg-[#8FBCFA] transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
            className="inline-flex items-center justify-center p-2 rounded-lg bg-[#FFB800] text-white hover:bg-[#FFA800] transition-all duration-300 disabled:opacity-50 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
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
              className="bg-white w-full h-3/4 rounded-t-xl flex flex-col"
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
                className="flex-1 overflow-y-auto p-4 space-y-4"
                role="log"
                aria-live="polite"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <h3 className="font-medium mb-2">Ready to help!</h3>
                    <p className="text-sm">Ask me any questions about the research report.</p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className={`chat-message flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        message.sender === 'user' 
                          ? 'bg-[#468BFF] text-white' 
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        <p className="text-sm">{message.content}</p>
                        <p className={`text-xs mt-1 ${
                          message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
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
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={1}
                      style={{ fontSize: '16px' }}
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isLoading}
                      className="p-2 bg-[#468BFF] text-white rounded-lg hover:bg-[#8FBCFA] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
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
            className="split-view-chat-panel flex flex-col bg-white border-r border-gray-200 transition-all duration-300"
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
              className="chat-messages flex-1 overflow-y-auto p-4 space-y-4"
              role="log"
              aria-live="polite"
            >
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="font-medium mb-2">Ready to help!</h3>
                  <p className="text-sm">Ask me any questions about the research report. I can clarify details, provide additional insights, or help you understand the data better.</p>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div key={message.id} className={`chat-message flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-lg px-4 py-2 ${
                      message.sender === 'user' 
                        ? 'bg-[#468BFF] text-white' 
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm">{message.content}</p>
                      <p className={`text-xs mt-1 ${
                        message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
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
                    className="chat-input-textarea flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className="p-2 bg-[#468BFF] text-white rounded-lg hover:bg-[#8FBCFA] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
        className="split-view-report-panel overflow-y-auto transition-all duration-300"
        style={{ gridColumn: chatOpen && !isMobile ? '3' : '1' }}
        role="main"
        aria-label="Research report content"
      >
        <div className="p-6 prose prose-lg max-w-none">
          <ReactMarkdown
            rehypePlugins={[rehypeRaw]}
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children, ...props }) => {
                const text = String(children);
                const isFirstH1 = text.includes("Research Report");
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
                            className="text-[#468BFF] hover:text-[#8FBCFA] underline transition-colors duration-300"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {part}
                          </a>
                        ) : part
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
                  className="text-[#468BFF] hover:text-[#8FBCFA] underline transition-colors duration-300"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props} 
                />
              ),
            }}
          >
            {output.details.report || "No report available"}
          </ReactMarkdown>
        </div>
      </main>
    </article>
  );
};

export default SplitView;