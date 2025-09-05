import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadGoogleMapsScript } from '../utils/googleMaps';
import { MapPin } from 'lucide-react';

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

declare global {
  interface Window {
    google: any;
    initGoogleMapsCallback: () => void;
  }
}

const LocationInput: React.FC<LocationInputProps> = ({ value, onChange, className }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteElementRef = useRef<any>(null);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const onChangeRef = useRef(onChange);
  const isInitializedRef = useRef(false);

  // Update the ref when onChange changes
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load the Google Maps API
  useEffect(() => {
    const loadApi = async () => {
      try {
        await loadGoogleMapsScript();
        setIsApiLoaded(true);
      } catch (error) {
        console.error('Failed to load Google Maps API:', error);
        // Ensure input is visible when Google Maps fails to load
        if (inputRef.current) {
          inputRef.current.style.display = '';
        }
      }
    };

    loadApi();
  }, []);

  // Initialize autocomplete when API is loaded and input is available
  useEffect(() => {
    if (!isApiLoaded || !inputRef.current || !window.google?.maps?.places || isInitializedRef.current) {
      return;
    }

    try {
      // Always use legacy Google Places Autocomplete for consistent styling
      autocompleteElementRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['(cities)'],
      });

      // Add place_changed listener
      const autocomplete = autocompleteElementRef.current;
      if (autocomplete) {
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place?.formatted_address) {
            onChangeRef.current(place.formatted_address);
          }
        });
      }

      // Style the autocomplete dropdown (legacy PAC)
      const style = document.createElement('style');
      style.textContent = `
        .pac-container {
          background-color: white !important;
          border: 1px solid rgba(70, 139, 255, 0.1) !important;
          border-radius: 0.75rem !important;
          margin-top: 0.5rem !important;
          font-family: "Noto Sans", sans-serif !important;
          overflow: hidden !important;
          box-shadow: none !important;
        }
        .pac-item {
          padding: 0.875rem 1.25rem !important;
          cursor: pointer !important;
          transition: all 0.2s ease-in-out !important;
          border-bottom: 1px solid rgba(70, 139, 255, 0.05) !important;
        }
        .pac-item:last-child {
          border-bottom: none !important;
        }
        .pac-item:hover {
          background-color: rgba(70, 139, 255, 0.03) !important;
        }
        .pac-item-selected {
          background-color: rgba(70, 139, 255, 0.05) !important;
        }
        .pac-item-query {
          color: #1a365d !important;
          font-size: 0.9375rem !important;
          font-weight: 500 !important;
        }
        .pac-matched {
          font-weight: 600 !important;
        }
        .pac-item span:not(.pac-item-query) {
          color: #64748b !important;
          font-size: 0.8125rem !important;
          margin-left: 0.5rem !important;
        }
        /* Hide the location icon */
        .pac-icon {
          display: none !important;
        }
      `;
      document.head.appendChild(style);

      isInitializedRef.current = true;
    } catch (error) {
      console.error('Error initializing Google Maps Autocomplete:', error);
    }

    // Cleanup
    return () => {
      if (autocompleteElementRef.current) {
        // Legacy Autocomplete cleanup
        if (window.google?.maps?.event) {
          window.google.maps.event.clearInstanceListeners(autocompleteElementRef.current);
        }
        autocompleteElementRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [isApiLoaded]); // Removed onChange from dependencies

  // Handle manual input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-r from-gray-50/0 via-gray-100/50 to-gray-50/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg"></div>
      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 stroke-[#468BFF] transition-all duration-200 group-hover:stroke-[#8FBCFA] z-10" strokeWidth={1.5} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
          }
        }}
        className={`${className} !font-['DM_Sans']`}
        placeholder="City, Country"
      />
    </div>
  );
};

export default LocationInput;
