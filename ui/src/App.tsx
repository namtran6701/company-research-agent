import React, { useState, useEffect, useRef } from "react";
import { Search, Brain, Zap, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CompanySearch from "./components/CompanySearch";
import ResearchBriefings from "./components/ResearchBriefings";
import CurationExtraction from "./components/CurationExtraction";
import ResearchQueries from "./components/ResearchQueries";
import ResearchStatus from "./components/ResearchStatus";
import SplitView from "./components/SplitView";
import {
  ResearchOutput,
  DocCount,
  DocCounts,
  EnrichmentCounts,
  ResearchState,
  ResearchStatusType,
} from "./types";
import { checkForFinalReport } from "./utils/handlers";
import {
  colorAnimation,
  dmSansStyle,
  glassStyle,
  fadeInAnimation,
} from "./styles";

const API_URL = import.meta.env.VITE_API_URL;
const WS_URL = import.meta.env.VITE_WS_URL;

if (!API_URL || !WS_URL) {
  throw new Error(
    "Environment variables VITE_API_URL and VITE_WS_URL must be set"
  );
}

// Add styles to document head
const colorStyle = document.createElement("style");
colorStyle.textContent = colorAnimation;
document.head.appendChild(colorStyle);

const dmSansStyleElement = document.createElement("style");
dmSansStyleElement.textContent = dmSansStyle;
document.head.appendChild(dmSansStyleElement);

type AppState = "search" | "researching" | "completed";

function App() {
  const [state, setState] = useState<AppState>("search");
  const [companyName, setCompanyName] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [status, setStatus] = useState<ResearchStatusType | null>(null);
  const [output, setOutput] = useState<ResearchOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hasFinalReport, setHasFinalReport] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 3;
  const reconnectDelay = 2000; // 2 seconds
  const [researchState, setResearchState] = useState<ResearchState>({
    status: "idle",
    message: "",
    queries: [],
    streamingQueries: {},
    briefingStatus: {
      company: false,
      industry: false,
      financial: false,
      auditor: false,
      news: false,
    },
  });
  const [originalCompanyName, setOriginalCompanyName] = useState<string>("");

  // Add ref for status section
  const statusRef = useRef<HTMLDivElement>(null);

  // Add state to track initial scroll
  const [hasScrolledToStatus, setHasScrolledToStatus] = useState(false);

  // Modify the scroll helper function
  const scrollToStatus = () => {
    if (!hasScrolledToStatus && statusRef.current) {
      const yOffset = -20; // Reduced negative offset to scroll further down
      const y =
        statusRef.current.getBoundingClientRect().top +
        window.pageYOffset +
        yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
      setHasScrolledToStatus(true);
    }
  };

  // Add new state for query section collapse
  const [isQueriesExpanded, setIsQueriesExpanded] = useState(true);
  const [shouldShowQueries, setShouldShowQueries] = useState(false);

  // Add new state for tracking search phase
  const [isSearchPhase, setIsSearchPhase] = useState(false);

  // Add state for section collapse
  const [isBriefingExpanded, setIsBriefingExpanded] = useState(true);
  const [isEnrichmentExpanded, setIsEnrichmentExpanded] = useState(true);

  // Add state for phase tracking
  const [currentPhase, setCurrentPhase] = useState<
    "search" | "enrichment" | "briefing" | "complete" | null
  >(null);

  // Add new state for PDF generation
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [, setPdfUrl] = useState<string | null>(null);

  const [isResetting, setIsResetting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  // Track current research job id for per-run Q&A
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Add new state for color cycling
  const [loaderColor, setLoaderColor] = useState("#468BFF");

  // Add useEffect for color cycling
  useEffect(() => {
    if (!isResearching) return;

    const colors = [
      "#468BFF", // Blue
      "#8FBCFA", // Light Blue
      "#FE363B", // Red
      "#FF9A9D", // Light Red
      "#FDBB11", // Yellow
      "#F6D785", // Light Yellow
    ];

    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % colors.length;
      setLoaderColor(colors[currentIndex]);
    }, 1000);

    return () => clearInterval(interval);
  }, [isResearching]);

  const resetResearch = () => {
    setIsResetting(true);

    // Use setTimeout to create a smooth transition
    setTimeout(() => {
      setStatus(null);
      setOutput(null);
      setError(null);
      setIsComplete(false);
      setResearchState({
        status: "idle",
        message: "",
        queries: [],
        streamingQueries: {},
        briefingStatus: {
          company: false,
          industry: false,
          financial: false,
          auditor: false,
          news: false,
        },
      });
      setPdfUrl(null);
      setCurrentPhase(null);
      setIsSearchPhase(false);
      setShouldShowQueries(false);
      setIsQueriesExpanded(true);
      setIsBriefingExpanded(true);
      setIsEnrichmentExpanded(true);
      setIsResetting(false);
      setHasScrolledToStatus(false); // Reset scroll flag when resetting research
      setCurrentJobId(null);
    }, 300); // Match this with CSS transition duration
  };

  const connectWebSocket = (jobId: string) => {
    console.log("Initializing WebSocket connection for job:", jobId);

    // Use the WS_URL directly if it's a full URL, otherwise construct it
    const wsUrl =
      WS_URL.startsWith("wss://") || WS_URL.startsWith("ws://")
        ? `${WS_URL}/research/ws/${jobId}`
        : `${
            window.location.protocol === "https:" ? "wss:" : "ws:"
          }//${WS_URL}/research/ws/${jobId}`;

    console.log("Connecting to WebSocket URL:", wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connection established for job:", jobId);
      setReconnectAttempts(0);
    };

    ws.onclose = (event) => {
      console.log("WebSocket disconnected", {
        jobId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        timestamp: new Date().toISOString(),
      });

      if (isResearching && !hasFinalReport) {
        // Start polling for final report
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(
            () =>
              checkForFinalReport(
                jobId,
                setOutput,
                setStatus,
                setIsComplete,
                setIsResearching,
                setCurrentPhase,
                setHasFinalReport,
                pollingIntervalRef
              ),
            5000
          );
        }

        // Attempt reconnection if we haven't exceeded max attempts
        if (reconnectAttempts < maxReconnectAttempts) {
          console.log(
            `Attempting to reconnect (${
              reconnectAttempts + 1
            }/${maxReconnectAttempts})...`
          );
          setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connectWebSocket(jobId);
          }, reconnectDelay);
        } else {
          console.log("Max reconnection attempts reached");
          setError("Connection lost. Checking for final report...");
          // Keep polling for final report
        }
      } else if (isResearching) {
        setError("Research connection lost. Please try again.");
        setIsResearching(false);
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", {
        jobId,
        error: event,
        timestamp: new Date().toISOString(),
        readyState: ws.readyState,
        url: wsUrl,
      });
      setError("WebSocket connection error");
      setIsResearching(false);
    };

    ws.onmessage = (event) => {
      const rawData = JSON.parse(event.data);

      if (rawData.type === "status_update") {
        const statusData = rawData.data;

        // Handle phase transitions
        if (statusData.result?.step) {
          const step = statusData.result.step;
          if (step === "Search" && currentPhase !== "search") {
            setCurrentPhase("search");
            setIsSearchPhase(true);
            setShouldShowQueries(true);
            setIsQueriesExpanded(true);
          } else if (step === "Enriching" && currentPhase !== "enrichment") {
            setCurrentPhase("enrichment");
            setIsSearchPhase(false);
            setIsQueriesExpanded(false);
            setIsEnrichmentExpanded(true);
          } else if (step === "Briefing" && currentPhase !== "briefing") {
            setCurrentPhase("briefing");
            setIsEnrichmentExpanded(false);
            setIsBriefingExpanded(true);
          }
        }

        // Handle completion
        if (statusData.status === "completed") {
          setCurrentPhase("complete");
          setIsComplete(true);
          setIsResearching(false);
          setStatus({
            step: "Complete",
            message: "Research completed successfully",
          });
          setOutput({
            summary: "",
            details: {
              report: statusData.result.report,
            },
          });
          setHasFinalReport(true);

          // Clear polling interval if it exists
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }

        // Set search phase when first query starts generating
        if (statusData.status === "query_generating" && !isSearchPhase) {
          setIsSearchPhase(true);
          setShouldShowQueries(true);
          setIsQueriesExpanded(true);
        }

        // End search phase and start enrichment when moving to next step
        if (statusData.result?.step && statusData.result.step !== "Search") {
          if (isSearchPhase) {
            setIsSearchPhase(false);
            // Add delay before collapsing queries
            setTimeout(() => {
              setIsQueriesExpanded(false);
            }, 1000);
          }

          // Handle enrichment phase
          if (statusData.result.step === "Enriching") {
            setIsEnrichmentExpanded(true);
            // Collapse enrichment section when complete
            if (statusData.status === "enrichment_complete") {
              setTimeout(() => {
                setIsEnrichmentExpanded(false);
              }, 1000);
            }
          }

          // Handle briefing phase
          if (statusData.result.step === "Briefing") {
            setIsBriefingExpanded(true);
            if (
              statusData.status === "briefing_complete" &&
              statusData.result?.category
            ) {
              // Update briefing status
              setResearchState((prev) => {
                const newBriefingStatus = {
                  ...prev.briefingStatus,
                  [statusData.result.category]: true,
                };

                // Check if all briefings are complete
                const allBriefingsComplete = Object.values(
                  newBriefingStatus
                ).every((status) => status);

                // Only collapse when all briefings are complete
                if (allBriefingsComplete) {
                  setTimeout(() => {
                    setIsBriefingExpanded(false);
                  }, 2000);
                }

                return {
                  ...prev,
                  briefingStatus: newBriefingStatus,
                };
              });
            }
          }
        }

        // Handle enrichment-specific updates
        if (statusData.result?.step === "Enriching") {
          // Initialize enrichment counts when starting a category
          if (statusData.status === "category_start") {
            const category = statusData.result
              .category as keyof EnrichmentCounts;
            if (category) {
              setResearchState((prev) => ({
                ...prev,
                enrichmentCounts: {
                  ...prev.enrichmentCounts,
                  [category]: {
                    total: statusData.result.count || 0,
                    enriched: 0,
                  },
                } as EnrichmentCounts,
              }));
            }
          }
          // Update enriched count when a document is processed
          else if (statusData.status === "extracted") {
            const category = statusData.result
              .category as keyof EnrichmentCounts;
            if (category) {
              setResearchState((prev) => {
                const currentCounts = prev.enrichmentCounts?.[category];
                if (currentCounts) {
                  return {
                    ...prev,
                    enrichmentCounts: {
                      ...prev.enrichmentCounts,
                      [category]: {
                        ...currentCounts,
                        enriched: Math.min(
                          currentCounts.enriched + 1,
                          currentCounts.total
                        ),
                      },
                    } as EnrichmentCounts,
                  };
                }
                return prev;
              });
            }
          }
          // Handle extraction errors
          else if (statusData.status === "extraction_error") {
            const category = statusData.result
              .category as keyof EnrichmentCounts;
            if (category) {
              setResearchState((prev) => {
                const currentCounts = prev.enrichmentCounts?.[category];
                if (currentCounts) {
                  return {
                    ...prev,
                    enrichmentCounts: {
                      ...prev.enrichmentCounts,
                      [category]: {
                        ...currentCounts,
                        total: Math.max(0, currentCounts.total - 1),
                      },
                    } as EnrichmentCounts,
                  };
                }
                return prev;
              });
            }
          }
          // Update final counts when a category is complete
          else if (statusData.status === "category_complete") {
            const category = statusData.result
              .category as keyof EnrichmentCounts;
            if (category) {
              setResearchState((prev) => ({
                ...prev,
                enrichmentCounts: {
                  ...prev.enrichmentCounts,
                  [category]: {
                    total: statusData.result.total || 0,
                    enriched: statusData.result.enriched || 0,
                  },
                } as EnrichmentCounts,
              }));
            }
          }
        }

        // Handle curation-specific updates
        if (statusData.result?.step === "Curation") {
          // Initialize doc counts when curation starts
          if (
            statusData.status === "processing" &&
            statusData.result.doc_counts
          ) {
            setResearchState((prev) => ({
              ...prev,
              docCounts: statusData.result.doc_counts as DocCounts,
            }));
          }
          // Update initial count for a category
          else if (statusData.status === "category_start") {
            const docType = statusData.result?.doc_type as keyof DocCounts;
            if (docType) {
              setResearchState((prev) => ({
                ...prev,
                docCounts: {
                  ...prev.docCounts,
                  [docType]: {
                    initial: statusData.result.initial_count,
                    kept: 0,
                  } as DocCount,
                } as DocCounts,
              }));
            }
          }
          // Increment the kept count for a specific category
          else if (statusData.status === "document_kept") {
            const docType = statusData.result?.doc_type as keyof DocCounts;
            setResearchState((prev) => {
              if (docType && prev.docCounts?.[docType]) {
                return {
                  ...prev,
                  docCounts: {
                    ...prev.docCounts,
                    [docType]: {
                      initial: prev.docCounts[docType].initial,
                      kept: prev.docCounts[docType].kept + 1,
                    },
                  } as DocCounts,
                };
              }
              return prev;
            });
          }
          // Update final doc counts when curation is complete
          else if (
            statusData.status === "curation_complete" &&
            statusData.result.doc_counts
          ) {
            setResearchState((prev) => ({
              ...prev,
              docCounts: statusData.result.doc_counts as DocCounts,
            }));
          }
        }

        // Handle briefing status updates
        if (statusData.status === "briefing_start") {
          setStatus({
            step: "Briefing",
            message: statusData.message,
          });
        } else if (
          statusData.status === "briefing_complete" &&
          statusData.result?.category
        ) {
          const category = statusData.result.category;
          setResearchState((prev) => ({
            ...prev,
            briefingStatus: {
              ...prev.briefingStatus,
              [category]: true,
            },
          }));
        }

        // Handle query updates
        if (statusData.status === "query_generating") {
          setResearchState((prev) => {
            const key = `${statusData.result.category}-${statusData.result.query_number}`;
            return {
              ...prev,
              streamingQueries: {
                ...prev.streamingQueries,
                [key]: {
                  text: statusData.result.query,
                  number: statusData.result.query_number,
                  category: statusData.result.category,
                  isComplete: false,
                },
              },
            };
          });
        } else if (statusData.status === "query_generated") {
          setResearchState((prev) => {
            // Remove from streaming queries and add to completed queries
            const key = `${statusData.result.category}-${statusData.result.query_number}`;
            const { [key]: _, ...remainingStreamingQueries } =
              prev.streamingQueries;

            return {
              ...prev,
              streamingQueries: remainingStreamingQueries,
              queries: [
                ...prev.queries,
                {
                  text: statusData.result.query,
                  number: statusData.result.query_number,
                  category: statusData.result.category,
                },
              ],
            };
          });
        }
        // Handle report streaming
        else if (statusData.status === "report_chunk") {
          setOutput((prev) => ({
            summary: "Generating report...",
            details: {
              report: prev?.details?.report
                ? prev.details.report + statusData.result.chunk
                : statusData.result.chunk,
            },
          }));
        }
        // Handle other status updates
        else if (statusData.status === "processing") {
          setIsComplete(false);
          // Only update status.step if we're not in curation or the new step is curation
          if (
            !status?.step ||
            status.step !== "Curation" ||
            statusData.result?.step === "Curation"
          ) {
            setStatus({
              step: statusData.result?.step || "Processing",
              message: statusData.message || "Processing...",
            });
          }

          // Reset briefing status when starting a new research
          if (statusData.result?.step === "Briefing") {
            setResearchState((prev) => ({
              ...prev,
              briefingStatus: {
                company: false,
                industry: false,
                financial: false,
                auditor: false,
                news: false,
              },
            }));
          }

          scrollToStatus();
        } else if (
          statusData.status === "failed" ||
          statusData.status === "error" ||
          statusData.status === "website_error"
        ) {
          setError(statusData.error || statusData.message || "Research failed");
          if (
            statusData.status === "website_error" &&
            statusData.result?.continue_research
          ) {
          } else {
            setIsResearching(false);
            setIsComplete(false);
          }
        }
      }
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Create a custom handler for the form that receives form data
  const handleFormSubmit = async (formData: {
    companyName: string;
    companyUrl: string;
    companyHq: string;
    companyIndustry: string;
  }) => {
    // Clear any existing errors first
    setError(null);

    // If research is complete, reset the UI first
    if (isComplete) {
      resetResearch();
      await new Promise((resolve) => setTimeout(resolve, 300)); // Wait for reset animation
    }

    // Reset states
    setHasFinalReport(false);
    setReconnectAttempts(0);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    setIsResearching(true);
    setOriginalCompanyName(formData.companyName);
    setHasScrolledToStatus(false); // Reset scroll flag when starting new research

    try {
      const url = `${API_URL}/research`;

      // Format the company URL if provided
      const formattedCompanyUrl = formData.companyUrl
        ? formData.companyUrl.startsWith("http://") ||
          formData.companyUrl.startsWith("https://")
          ? formData.companyUrl
          : `https://${formData.companyUrl}`
        : undefined;

      // Log the request details
      const requestData = {
        company: formData.companyName,
        company_url: formattedCompanyUrl,
        industry: formData.companyIndustry || undefined,
        hq_location: formData.companyHq || undefined,
      };

      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      }).catch((error) => {
        console.error("Fetch error:", error);
        throw error;
      });

      console.log("Response received:", {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error response:", errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Response data:", data);

      if (data.job_id) {
        console.log("Connecting WebSocket with job_id:", data.job_id);
        setCurrentJobId(data.job_id);
        connectWebSocket(data.job_id);
      } else {
        throw new Error("No job ID received");
      }
    } catch (err) {
      console.log("Caught error:", err);
      setError(err instanceof Error ? err.message : "Failed to start research");
      setIsResearching(false);
    }
  };

  // Add new function to handle PDF generation
  const handleGeneratePdf = async () => {
    if (!output || isGeneratingPdf) return;

    setIsGeneratingPdf(true);
    try {
      console.log("Generating PDF with company name:", originalCompanyName);
      const response = await fetch(`${API_URL}/generate-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          report_content: output.details.report,
          company_name: originalCompanyName || output.details.report,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link element
      const link = document.createElement("a");
      link.href = url;
      link.download = `${originalCompanyName || "research_report"}.pdf`;

      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError(
        error instanceof Error ? error.message : "Failed to generate PDF"
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Add new function to handle copying to clipboard
  const handleCopyToClipboard = async () => {
    if (!output?.details?.report) return;

    try {
      await navigator.clipboard.writeText(output.details.report);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
      setError("Failed to copy to clipboard");
    }
  };

  // Add document count display component

  // Add BriefingProgress component

  // Add EnrichmentProgress component

  // Function to render progress components in order
  const renderProgressComponents = () => {
    const components = [];

    // Ecommerce Report with Split View (always at the top when available)
    if (output && output.details) {
      components.push(
        <SplitView
          key="split-view"
          output={{
            summary: output.summary,
            details: {
              report: output.details.report || "",
            },
          }}
          jobId={currentJobId}
          isResetting={isResetting}
          glassStyle={glassStyle}
          fadeInAnimation={fadeInAnimation}
          loaderColor={loaderColor}
          isGeneratingPdf={isGeneratingPdf}
          isCopied={isCopied}
          onCopyToClipboard={handleCopyToClipboard}
          onGeneratePdf={handleGeneratePdf}
        />
      );
    }

    // Current phase component
    if (
      currentPhase === "briefing" ||
      (currentPhase === "complete" && researchState.briefingStatus)
    ) {
      components.push(
        <ResearchBriefings
          key="briefing"
          briefingStatus={researchState.briefingStatus}
          isExpanded={isBriefingExpanded}
          onToggleExpand={() => setIsBriefingExpanded(!isBriefingExpanded)}
          isResetting={isResetting}
        />
      );
    }

    if (
      currentPhase === "enrichment" ||
      currentPhase === "briefing" ||
      currentPhase === "complete"
    ) {
      components.push(
        <CurationExtraction
          key="enrichment"
          enrichmentCounts={researchState.enrichmentCounts}
          isExpanded={isEnrichmentExpanded}
          onToggleExpand={() => setIsEnrichmentExpanded(!isEnrichmentExpanded)}
          isResetting={isResetting}
          loaderColor={loaderColor}
        />
      );
    }

    // Queries are always at the bottom when visible
    if (
      shouldShowQueries &&
      (researchState.queries.length > 0 ||
        Object.keys(researchState.streamingQueries).length > 0)
    ) {
      components.push(
        <ResearchQueries
          key="queries"
          queries={researchState.queries}
          streamingQueries={researchState.streamingQueries}
          isExpanded={isQueriesExpanded}
          onToggleExpand={() => setIsQueriesExpanded(!isQueriesExpanded)}
          isResetting={isResetting}
          glassStyle={glassStyle.base}
        />
      );
    }

    return components;
  };

  // Add cleanup for polling interval
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Simulate research process for the new design
  const simulateResearch = async (companyData: {
    name: string;
    url: string;
    hq: string;
    industry: string;
  }) => {
    setState("researching");
    setCompanyName(companyData.name);
    setOriginalCompanyName(companyData.name);

    // Map the company data to the format expected by handleFormSubmit
    const formData = {
      companyName: companyData.name,
      companyUrl: companyData.url,
      companyHq: companyData.hq,
      companyIndustry: companyData.industry,
    };

    // Start the actual research using existing handler
    await handleFormSubmit(formData);
  };

  const handleNewSearch = () => {
    setState("search");
    setCompanyName("");
    resetResearch();
  };

  const handleDownloadReport = () => {
    handleGeneratePdf();
  };

  const handleShareReport = () => {
    handleCopyToClipboard();
  };

  // Update state transitions based on research progress
  useEffect(() => {
    if (isResearching && state === "search") {
      setState("researching");
    } else if (isComplete && state === "researching") {
      setState("completed");
    }
  }, [isResearching, isComplete, state]);

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Innovative Hero Section with Integrated Header */}
      <section className="relative overflow-hidden bg-gradient-hero">
        {/* Main Content Container */}
        <div className="relative container mx-auto px-6 py-6">
          {/* Top Row - Logo and CTA */}
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-8 mb-8">
            {/* Logo Section */}
            <div className="flex-shrink-0">
              {/* Increase logo size by bumping container heights */}
              <div className="h-20 md:h-24 lg:h-28 flex items-start">
                <img
                  src="/sfalogo.png"
                  alt="SalesFactory.AI"
                  className="block h-full w-auto -mt-4 md:-mt-6 lg:-mt-8"
                />
              </div>
            </div>

            {/* CTA Section - Desktop */}
            {state === "search" && (
              <div className="hidden lg:block">
                <Button
                  variant="hero"
                  size="lg"
                  className="text-lg px-8 py-4 shadow-glow animate-fade-in"
                  onClick={() => {
                    document.getElementById("company-search")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                >
                  <Brain className="h-5 w-5" />
                  Start Research
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Hero Content - Centered and Compact */}
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight animate-fade-in">
                While Markets Shift, Will Your Playbook <span className="text-[#FF6B6B] font-bold">Hold Up?</span>
                <br />
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed animate-fade-in">
                Your competitor just launched a new strategy. Consumer trends flipped overnight. Are you confident your eCommerce strategy can keep pace?
              </p>
              <p className="text-lg md:text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed animate-fade-in">Test it with the <strong className="text-[#FF6B6B]">Sales Factory AI eCommerce Audit Tool</strong></p>
            </div>

            {/* Mobile CTA */}
            {state === "search" && (
              <div className="lg:hidden animate-fade-in">
                <Button
                  variant="hero"
                  size="lg"
                  className="text-lg px-8 py-4 shadow-glow"
                  onClick={() => {
                    document.getElementById("company-search")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                >
                  <Brain className="h-5 w-5" />
                  Start Research
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Feature Cards - Compact Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
            <Card className="p-6 bg-card/90 backdrop-blur-sm border-border text-center hover-scale animate-fade-in">
              <Zap className="h-10 w-10 text-primary mx-auto mb-3 animate-bounce" style={{animationDuration: '3s'}} />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Lightning Fast
              </h3>
              <p className="text-muted-foreground text-sm">
              Multi-agent AI scans and analyzes in minutes while others take weeks
              </p>
            </Card>

            <Card className="p-6 bg-card/90 backdrop-blur-sm border-border text-center hover-scale animate-fade-in">
              <Users className="h-10 w-10 text-primary mx-auto mb-3 animate-bounce" style={{animationDuration: '3s'}} />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Specialized Intelligence
              </h3>
              <p className="text-muted-foreground text-sm">
              Agents built for company, and market insights - tailored to eCommerce
              </p>
            </Card>

            <Card className="p-6 bg-card/90 backdrop-blur-sm border-border text-center hover-scale animate-fade-in">
              <Search className="h-10 w-10 text-primary mx-auto mb-3 animate-bounce" style={{animationDuration: '3s'}} />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Actionable Results
              </h3>
              <p className="text-muted-foreground text-sm">
                Get a clear audit with recommendations to strengthen your next move
              </p>
            </Card>
          </div>
          
          {/* Call to Action Section */}
          <div className="text-center mt-12 max-w-3xl mx-auto">
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed animate-fade-in">
              Don't wait for the market to expose the gaps.
            </p>
            <p className="text-lg md:text-xl text-foreground leading-relaxed animate-fade-in mt-2">
              <strong>Run your audit today.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="mx-auto space-y-8">
          {state === "search" && (
            <div>
              <CompanySearch
                onSearch={simulateResearch}
                isSearching={isResearching}
              />
            </div>
          )}

          {state === "researching" && (
            <div className="space-y-6">
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={handleNewSearch}
                  className="mb-6"
                >
                  ← Start New Research
                </Button>
              </div>

              {/* Status Box */}
              <ResearchStatus
                status={status}
                error={error}
                isComplete={isComplete}
                currentPhase={currentPhase}
                isResetting={isResetting}
                glassStyle={glassStyle}
                loaderColor={loaderColor}
                statusRef={statusRef}
              />

              {/* Error Message */}
              {error && (
                <div
                  className={`${
                    glassStyle.card
                  } border-[#FE363B]/30 bg-[#FE363B]/10 ${
                    fadeInAnimation.fadeIn
                  } ${
                    isResetting
                      ? "opacity-0 transform -translate-y-4"
                      : "opacity-100 transform translate-y-0"
                  } font-['DM_Sans']`}
                >
                  <p className="text-[#FE363B]">{error}</p>
                </div>
              )}

              {/* Progress Components Container */}
              <div className="space-y-12 transition-all duration-500 ease-in-out">
                {renderProgressComponents()}
              </div>
            </div>
          )}

          {state === "completed" && output && (
            <div className="space-y-6">
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={handleNewSearch}
                  className="mb-6"
                >
                  ← Research Another Company
                </Button>
              </div>
              <SplitView
                output={output}
                jobId={currentJobId}
                isResetting={isResetting}
                glassStyle={glassStyle}
                fadeInAnimation={fadeInAnimation}
                loaderColor={loaderColor}
                isGeneratingPdf={isGeneratingPdf}
                isCopied={isCopied}
                onCopyToClipboard={handleCopyToClipboard}
                onGeneratePdf={handleGeneratePdf}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
