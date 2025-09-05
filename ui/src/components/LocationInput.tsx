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
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const placeAutocompleteRef = useRef<any>(null);
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
      }
    };

    loadApi();
  }, []);

  // Initialize the new PlaceAutocompleteElement when API is loaded
  useEffect(() => {
    if (!isApiLoaded || !containerRef.current || isInitializedRef.current) {
      return;
    }

    const initPlaceAutocomplete = async () => {
      try {
        // Import the places library
        await window.google.maps.importLibrary("places");

        // Create the new PlaceAutocompleteElement
        const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement({
          types: ['(cities)'],
        });

        placeAutocompleteRef.current = placeAutocomplete;

        // Style the PlaceAutocompleteElement to match our design
        placeAutocomplete.style.width = '100%';
        placeAutocomplete.style.fontFamily = '"DM Sans", sans-serif';
        
        // Set up CSS custom properties for the component to match other inputs exactly
        const style = document.createElement('style');
        style.textContent = `
          gmp-place-autocomplete {
            --gmp-place-autocomplete-font-family: "DM Sans", sans-serif !important;
            --gmp-place-autocomplete-font-size: 0.875rem !important;
            --gmp-place-autocomplete-background-color: transparent !important;
            --gmp-place-autocomplete-border: 1px solid hsl(var(--input)) !important;
            --gmp-place-autocomplete-border-radius: 0.375rem !important;
            --gmp-place-autocomplete-color: hsl(var(--foreground)) !important;
            --gmp-place-autocomplete-placeholder-color: hsl(var(--muted-foreground)) !important;
            width: 100% !important;
            background: transparent !important;
            background-color: transparent !important;
          }
          gmp-place-autocomplete > * {
            background: transparent !important;
            background-color: transparent !important;
          }
          gmp-place-autocomplete div[role="textbox"] {
            background: transparent !important;
            background-color: transparent !important;
          }
          gmp-place-autocomplete input {
            height: 48px !important;
            padding: 0.25rem 0.75rem 0.25rem 2.5rem !important;
            font-size: 0.875rem !important;
            line-height: 1.25rem !important;
            background: transparent !important;
            background-color: transparent !important;
            border: 1px solid hsl(var(--input)) !important;
            border-radius: 0.375rem !important;
            color: hsl(var(--foreground)) !important;
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05) !important;
            transition: all 0.2s ease-in-out !important;
          }
          gmp-place-autocomplete input[type="text"] {
            background: transparent !important;
            background-color: transparent !important;
          }
          gmp-place-autocomplete input:focus {
            outline: none !important;
            border-color: hsl(var(--ring)) !important;
            box-shadow: 0 0 0 1px hsl(var(--ring)) !important;
          }
          gmp-place-autocomplete input:focus-visible {
            outline: none !important;
            border-color: hsl(var(--ring)) !important;
            box-shadow: 0 0 0 1px hsl(var(--ring)) !important;
          }
          gmp-place-autocomplete input::placeholder {
            color: hsl(var(--muted-foreground)) !important;
          }
          gmp-place-autocomplete input:disabled {
            cursor: not-allowed !important;
            opacity: 0.5 !important;
          }
          gmp-place-autocomplete .PAE-predictions {
            background-color: hsl(var(--background)) !important;
            border: 1px solid hsl(var(--border)) !important;
            border-radius: 0.5rem !important;
            margin-top: 0.5rem !important;
            box-shadow: 0 4px 20px -4px hsl(20 6% 85% / 0.3) !important;
          }
          gmp-place-autocomplete .PAE-prediction {
            padding: 0.875rem 1.25rem !important;
            border-bottom: 1px solid hsl(var(--border)) !important;
            transition: all 0.2s ease-in-out !important;
          }
          gmp-place-autocomplete .PAE-prediction:last-child {
            border-bottom: none !important;
          }
          gmp-place-autocomplete .PAE-prediction:hover {
            background-color: hsl(var(--accent)) !important;
          }
          gmp-place-autocomplete .PAE-prediction[selected] {
            background-color: hsl(var(--accent)) !important;
          }
          gmp-place-autocomplete .PAE-primary-text {
            color: hsl(var(--foreground)) !important;
            font-weight: 500 !important;
          }
          gmp-place-autocomplete .PAE-secondary-text {
            color: hsl(var(--muted-foreground)) !important;
            font-size: 0.8125rem !important;
          }
        `;
        document.head.appendChild(style);

        // Add event listener for place selection
        placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
          try {
            const place = placePrediction.toPlace();
            await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
            
            const address = place.formattedAddress || place.displayName;
            if (address) {
              onChangeRef.current(address);
              // Update hidden input for form compatibility
              if (hiddenInputRef.current) {
                hiddenInputRef.current.value = address;
              }
            }
          } catch (error) {
            console.error('Error fetching place details:', error);
          }
        });

        // Append to container
        containerRef.current.appendChild(placeAutocomplete);
        
        // Set initial value if provided
        if (value && placeAutocomplete.input) {
          placeAutocomplete.input.value = value;
        }

        isInitializedRef.current = true;
      } catch (error) {
        console.error('Error initializing PlaceAutocompleteElement:', error);
        // Fallback: show a regular input if PlaceAutocompleteElement fails
        if (containerRef.current && hiddenInputRef.current) {
          hiddenInputRef.current.style.display = 'block';
        }
      }
    };

    initPlaceAutocomplete();

    // Cleanup
    return () => {
      if (placeAutocompleteRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(placeAutocompleteRef.current);
        } catch (e) {
          // Element may already be removed
        }
        placeAutocompleteRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [isApiLoaded, value]);

  // Handle manual input changes for fallback input
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
      
      {/* Container for PlaceAutocompleteElement */}
      <div ref={containerRef} className="w-full"></div>
      
      {/* Fallback input (hidden by default) */}
      <input
        ref={hiddenInputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
          }
        }}
        className={`${className} hidden`}
        placeholder="City, Country"
      />
    </div>
  );
};

export default LocationInput;
