
import React, { useState } from 'react';
import ImageColorizer from './components/ImageColorizer';

type ColorizationResult = {
  originalUrl: string;
  colorizedUrl: string;
};

export default function App() {
  const [lastResult, setLastResult] = useState<ColorizationResult | null>(null);
  const [theme, setTheme] = useState<'black' | 'blue'>('blue');

  const handleAnalysisResult = (result: ColorizationResult) => {
    console.log('Colorization complete:', result);
    setLastResult(result);
  };

  return (
    <main className={`min-h-screen w-full flex flex-col items-center justify-center p-4 font-sans text-white transition-colors duration-500 ${theme === 'black' ? 'bg-black' : 'bg-[#0a192f]'}`}>
      
      <div className="absolute top-6 right-6 z-50 flex items-center gap-3">
          <span className={`text-xs font-bold tracking-widest transition-colors duration-300 ${theme === 'black' ? 'text-white' : 'text-white/40'}`}>BLACK</span>
          <button 
              onClick={() => setTheme(t => t === 'black' ? 'blue' : 'black')}
              className="relative w-14 h-7 rounded-full bg-white transition-all duration-300 focus:outline-none shadow-[0_0_10px_rgba(255,255,255,0.2)]"
              aria-label="Toggle Theme"
          >
              <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-[#0a192f] shadow-sm transform transition-transform duration-300 ${theme === 'blue' ? 'translate-x-7' : 'translate-x-0'}`} />
          </button>
          <span className={`text-xs font-bold tracking-widest transition-colors duration-300 ${theme === 'blue' ? 'text-white' : 'text-white/40'}`}>BLUE</span>
      </div>

      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            Image Colorizer
          </h1>
          <p className="text-white mt-2 max-w-2xl mx-auto">
            Upload a black & white image to restore its colors. Our AI pipeline uses self-supervised learning to reimagine the past.
          </p>
        </header>

        <ImageColorizer 
          onResult={handleAnalysisResult} 
          className="w-full"
          theme={theme}
        />
        
      </div>
    </main>
  );
}
