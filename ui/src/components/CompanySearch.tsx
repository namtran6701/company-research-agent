import React, { useState } from 'react';
import { Search, Building2, Globe, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import LocationInput from './LocationInput';
import { EXAMPLE_COMPANIES, type ExampleCompany } from './ExamplePopup';

interface CompanySearchProps {
  onSearch: (companyData: {
    name: string;
    url: string;
    hq: string;
    industry: string;
  }) => void;
  isSearching: boolean;
}

const CompanySearch = ({ onSearch, isSearching }: CompanySearchProps) => {
  const [companyName, setCompanyName] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [companyHq, setCompanyHq] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('');

  // Animated example text state
  const EXAMPLE_WORDS = ['Tesla', 'Apple', 'Nvidia', 'Google'];
  const EXAMPLE_DETAILS: Record<string, ExampleCompany> = {
    Tesla: { name: 'Tesla', url: 'tesla.com', hq: 'Austin, TX', industry: 'Automotive & Energy' },
    Apple: { name: 'Apple', url: 'apple.com', hq: 'Cupertino, CA', industry: 'Consumer Electronics' },
    Nvidia: { name: 'Nvidia', url: 'nvidia.com', hq: 'Santa Clara, CA', industry: 'Semiconductors' },
    Google: { name: 'Google', url: 'google.com', hq: 'Mountain View, CA', industry: 'Internet Services' }
  };
  const [exampleIndex, setExampleIndex] = useState(0); // initial shows Tesla
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      return;
    }

    onSearch({
      name: companyName.trim(),
      url: companyUrl.trim(),
      hq: companyHq.trim(),
      industry: companyIndustry.trim()
    });
  };

  const handleExampleClick = (example: ExampleCompany) => {
    setCompanyName(example.name);
    setCompanyUrl(example.url);
    setCompanyHq(example.hq);
    setCompanyIndustry(example.industry);
  };

  // Click helper when we only have a name
  const handleExampleClickByName = (name: string) => {
    // Prefer our detailed mapping for the cycling examples
    const mapped = EXAMPLE_DETAILS[name as keyof typeof EXAMPLE_DETAILS];
    if (mapped) {
      handleExampleClick(mapped);
      return;
    }
    // Fallback: look in shared examples list
    const found = EXAMPLE_COMPANIES.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (found) return handleExampleClick(found);
    // Last resort: only set name
    setCompanyName(name);
    setCompanyUrl('');
    setCompanyHq('');
    setCompanyIndustry('');
  };

  // Cycle example words every 3s with a smooth transition
  React.useEffect(() => {
    if (isPaused) return; // pause animation when user interacts
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setExampleIndex((prev) => (prev + 1) % EXAMPLE_WORDS.length);
        setIsAnimating(false);
      }, 220);
    }, 3000);
    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <Card className="p-8 shadow-card bg-card border border-border" id="company-search">
      <div className="space-y-6">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-foreground">
            Company Research Agent
          </h1>
          <p className="text-muted-foreground">
            Conduct in-depth company research powered by AI
          </p>
          <div className="flex justify-center">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleExampleClickByName(EXAMPLE_WORDS[exampleIndex])}
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              className="text-primary hover:text-primary/80 text-base md:text-lg font-medium"
            >
              ⚡ Try an example:
              <span
                className={`ml-1 inline-block transition-all duration-300 ease-in-out ${
                  isAnimating ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
                }`}
              >
                {EXAMPLE_WORDS[exampleIndex]}
              </span>
              <span className="ml-1">→</span>
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Enter company name"
                  value={companyName}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                  onChange={(e) => {
                    setIsPaused(true);
                    setCompanyName(e.target.value);
                  }}
                  className="pl-10 h-12"
                  disabled={isSearching}
                />
              </div>
            </div>

            {/* Company URL */}
            <div className="space-y-2">
              <Label htmlFor="companyUrl" className="text-sm font-medium">
                Company URL
              </Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  id="companyUrl"
                  type="text"
                  placeholder="example.com"
                  value={companyUrl}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                  onChange={(e) => {
                    setIsPaused(true);
                    setCompanyUrl(e.target.value);
                  }}
                  className="pl-10 h-12"
                  disabled={isSearching}
                />
              </div>
            </div>

            {/* Company HQ */}
            <div className="space-y-2">
              <Label htmlFor="companyHq" className="text-sm font-medium">
                Company HQ
              </Label>
              <LocationInput
                value={companyHq}
                onFocus={() => setIsPaused(true)}
                onBlur={() => setIsPaused(false)}
                onChange={(v) => {
                  setIsPaused(true);
                  setCompanyHq(v);
                }}
                className="flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-10 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>

            {/* Company Industry */}
            <div className="space-y-2">
              <Label htmlFor="companyIndustry" className="text-sm font-medium">
                Company Industry
              </Label>
              <div className="relative">
                <BarChart3 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  id="companyIndustry"
                  type="text"
                  placeholder="e.g. Technology, Healthcare"
                  value={companyIndustry}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                  onChange={(e) => {
                    setIsPaused(true);
                    setCompanyIndustry(e.target.value);
                  }}
                  className="pl-10 h-12"
                  disabled={isSearching}
                />
              </div>
            </div>
          </div>
          
          <Button 
            type="submit" 
            variant="outline" 
            size="lg" 
            className="w-full h-12 text-base"
            disabled={isSearching || !companyName.trim()}
          >
            {isSearching ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Researching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Start Research
              </>
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
};

export default CompanySearch;
