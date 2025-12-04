import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from 'framer-motion';

type Status = 'idle' | 'uploading' | 'processing' | 'complete';

interface ProgressReport {
  stageIndex: number;
  stageName: string;
  percent: number;
}

interface ColorizationResult {
  originalUrl: string;
  colorizedUrl: string;
}

interface ImageColorizerProps {
  onResult: (result: ColorizationResult) => void;
  simulate?: boolean;
  stageDurations?: number[];
  className?: string;
  theme?: 'black' | 'blue';
}

const STAGES = [
  { name: 'Image Preprocessing', icon: (p: any) => <path {...p} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
  { name: 'Lab Color Conversion', icon: (p: any) => <path {...p} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /> },
  { name: 'Encoder Analysis', icon: (p: any) => <path {...p} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /> },
  { name: 'Decoder Reconstruction', icon: (p: any) => <path {...p} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /> },
  { name: 'Final RGB Output', icon: (p: any) => <path {...p} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
];

const DEFAULT_STAGE_DURATIONS = [1.0, 1.5, 2.5, 2.0, 1.0]; // in seconds

const DESKTOP_ZIGZAG = {
  path: "M 40 100 C 130 100 130 40 220 40 C 310 40 310 160 400 160 C 490 160 490 40 580 40 C 670 40 670 100 760 100",
  nodes: [
    { cx: 40, cy: 100 }, { cx: 220, cy: 40 }, { cx: 400, cy: 160 },
    { cx: 580, cy: 40 }, { cx: 760, cy: 100 },
  ],
  viewBox: "-60 -50 920 300",
};

const MOBILE_ZIGZAG = {
  path: "M 50 50 C 150 50 150 125 250 125 C 150 125 150 200 50 200 C 150 200 150 275 250 275 C 150 275 150 350 50 350",
  nodes: [
    { cx: 50, cy: 50 }, { cx: 250, cy: 125 }, { cx: 50, cy: 200 },
    { cx: 250, cy: 275 }, { cx: 50, cy: 350 },
  ],
  viewBox: "0 0 300 400",
};

async function processImage(
  file: File,
  onProgress: (report: ProgressReport) => void,
  stageDurations: number[]
): Promise<ColorizationResult> {
  console.log(`Starting colorization for: ${file.name}`);

  const totalDuration = stageDurations.reduce((a, b) => a + b, 0);
  let elapsedDuration = 0;

  // 1. Start API call
  const formData = new FormData();
  formData.append('file', file);
  
  const apiPromise = fetch('http://localhost:8000/colorize', {
      method: 'POST',
      body: formData,
  })
  .then(res => {
      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      return res.blob();
  })
  .then(blob => URL.createObjectURL(blob));

  // 2. Run visuals
  for (let i = 0; i < STAGES.length; i++) {
    onProgress({
      stageIndex: i,
      stageName: STAGES[i].name,
      percent: (elapsedDuration / totalDuration) * 100,
    });
    await new Promise(resolve => setTimeout(resolve, stageDurations[i] * 1000));
    elapsedDuration += stageDurations[i];
  }
  
  // 3. Wait for API
  let colorizedUrl;
  try {
      colorizedUrl = await apiPromise;
  } catch (e) {
      console.error(e);
      throw new Error("Failed to connect to the backend. Is the server running on port 8000?");
  }

  onProgress({
    stageIndex: STAGES.length - 1,
    stageName: STAGES[STAGES.length - 1].name,
    percent: 100,
  });

  const originalUrl = URL.createObjectURL(file);

  return {
    originalUrl,
    colorizedUrl
  };
}

const ImageColorizer: React.FC<ImageColorizerProps> = ({
  onResult,
  simulate = true,
  stageDurations = DEFAULT_STAGE_DURATIONS,
  className = '',
  theme = 'black',
}) => {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(-1);
  const [result, setResult] = useState<ColorizationResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { path, nodes, viewBox } = isMobile ? MOBILE_ZIGZAG : DESKTOP_ZIGZAG;
  
  const resultCtaRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState(0);

  const dotProgress = useMotionValue(0);

  const checkIsMobile = useCallback(() => setIsMobile(window.innerWidth < 768), []);
  useLayoutEffect(() => {
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, [checkIsMobile]);

  const measurePath = useCallback((node: SVGPathElement | null) => {
      pathRef.current = node;
      if (node) {
          setPathLength(node.getTotalLength());
      }
  }, []);

  useLayoutEffect(() => {
    if (pathRef.current) setPathLength(pathRef.current.getTotalLength());
  }, [isMobile, status, path]);

  useEffect(() => {
    if (status === 'complete' && resultCtaRef.current) resultCtaRef.current.focus();
  }, [status]);

  const handleFileSelect = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) return;

    setStatus('uploading');
    setFileName(selectedFile.name);

    await new Promise(resolve => setTimeout(resolve, 1000));

    setStatus('processing');
    await new Promise(resolve => setTimeout(resolve, 100));

    const onProgress = (report: ProgressReport) => {
      setProgress(report.percent);
      setStageIndex(report.stageIndex);
      const targetDotProgress = (report.stageIndex + 1) / STAGES.length;
      animate(dotProgress, targetDotProgress, {
        duration: stageDurations[report.stageIndex] || 1,
        ease: [0.22, 1, 0.36, 1],
      });
    };
    
    try {
        const colorizationResult = await processImage(selectedFile, onProgress, stageDurations);
        
        setTimeout(() => {
            setResult(colorizationResult);
            setStatus('complete');
            onResult(colorizationResult);
        }, 300);
    } catch (error) {
        console.error(error);
        setStatus('idle');
        alert(error instanceof Error ? error.message : "An error occurred during colorization");
    }
  }, [simulate, onResult, stageDurations, dotProgress]);

  const resetState = () => {
    setStatus('idle');
    setProgress(0);
    setStageIndex(-1);
    setResult(null);
    setFileName(null);
    dotProgress.set(0);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
    else if (e.type === 'dragleave') setIsDragging(false);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  return (
    <>
      <style>{`
        :root {
          --bg-color: ${theme === 'black' ? '#000000' : '#0a192f'};
          --text-primary: #E6F1FF;
          --text-secondary: #8892b0;
          --accent-teal: #04D9FF;
          --accent-purple: #BD34FE;
          --glow-teal: drop-shadow(0 0 8px var(--accent-teal));
          --glow-purple: drop-shadow(0 0 8px var(--accent-purple));
        }
        .vignette { box-shadow: inset 0px 60px 100px -40px rgba(0,0,0,0.95); }
        .breathing-glow { animation: breathing-glow 2s ease-in-out infinite; }
        @keyframes breathing-glow {
          0%, 100% { filter: drop-shadow(0 0 8px var(--accent-teal)); }
          50% { filter: drop-shadow(0 0 16px var(--accent-teal)); }
        }
      `}</style>
      <div className={`relative ${theme === 'black' ? 'vignette' : ''} rounded-lg p-6 min-h-[400px] flex flex-col justify-center items-center transition-all duration-300 overflow-hidden ${className}`} style={{ backgroundColor: 'var(--bg-color)' }}>
        
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div key="idle" exit={{ opacity: 0, scale: 0.9 }} className="w-full">
              <Dropzone theme={theme} onDrop={handleDrop} onDragOver={handleDragEvents} onDragEnter={handleDragEvents} onDragLeave={handleDragEvents} onFileChange={handleFileChange} isDragging={isDragging} />
            </motion.div>
          )}

          {status === 'uploading' && (
            <motion.div key="uploading" exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center">
              <UploadingIndicator />
              <p className="text-white mt-6 font-medium">Uploading Image...</p>
              <p className="text-white text-sm font-mono truncate max-w-xs md:max-w-md">{fileName}</p>
            </motion.div>
          )}

          {status === 'processing' && (
            <motion.div key="processing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full flex flex-col items-center">
              <div aria-live="polite" className="text-center mb-4 h-12 flex flex-col justify-center">
                <p className="text-white font-medium text-lg">{stageIndex > -1 ? STAGES[stageIndex].name : "Initializing Pipeline..."}</p>
                <p className="text-white text-sm font-mono truncate max-w-xs md:max-w-md">{fileName}</p>
              </div>

              <div className="relative w-full max-w-3xl aspect-[4/2] md:aspect-auto">
                <svg viewBox={viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="pipeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--accent-teal)" />
                        <stop offset="100%" stopColor="#BD34FE" />
                    </linearGradient>
                  </defs>
                  <path ref={measurePath} d={path} fill="none" stroke="rgba(4, 217, 255, 0.15)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
                  {pathLength > 0 && <AnimatedPipeAndDot pathRef={pathRef} path={path} pathLength={pathLength} progress={dotProgress} startX={nodes[0].cx} startY={nodes[0].cy} />}
                  {nodes.map((node, i) => <PipelineNode key={i} {...node} label={STAGES[i].name} Icon={STAGES[i].icon} isActive={stageIndex >= i} isCurrent={stageIndex === i} isMobile={isMobile} />)}
                </svg>
              </div>
              
              <div className="w-full max-w-md mt-8">
                  <div className="flex justify-between text-xs uppercase tracking-widest text-[#04D9FF] mb-2 font-bold">
                    <span className="drop-shadow-[0_0_5px_rgba(4,217,255,0.5)]">Colorizing<ProcessingDots /></span>
                    <span className="drop-shadow-[0_0_5px_rgba(4,217,255,0.5)]">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-black/50 rounded-full h-3 relative overflow-hidden border border-[#04D9FF]/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Analysis Progress">
                    <motion.div 
                      className="absolute top-0 left-0 h-full rounded-full" 
                      style={{ 
                          width: `${progress}%`, 
                          background: 'linear-gradient(90deg, #04D9FF 0%, #BD34FE 100%)',
                          boxShadow: '0 0 15px rgba(4, 217, 255, 0.6)'
                      }} 
                      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                    >
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                    </motion.div>
                  </div>
              </div>
            </motion.div>
          )}

          {status === 'complete' && result && (
             <motion.div key="complete" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="text-center w-full">
                <ResultView result={result} onReset={resetState} ctaRef={resultCtaRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

const Dropzone: React.FC<any> = ({ theme, onDrop, onDragOver, onDragEnter, onDragLeave, onFileChange, isDragging }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const triggerUpload = () => inputRef.current?.click();
    const isBlue = theme === 'blue';

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            triggerUpload();
        }
    };

    return (
        <div 
            onDrop={onDrop} 
            onDragOver={onDragOver} 
            onDragEnter={onDragEnter} 
            onDragLeave={onDragLeave} 
            className={`w-full h-full p-8 border-2 border-dashed rounded-lg flex flex-col justify-center items-center transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-[#04D9FF] ${isDragging ? 'border-[#04D9FF] bg-[#04D9FF]/10' : (isBlue ? 'border-[#04D9FF]' : 'border-white/20')}`}
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            aria-label="Upload Image Dropzone"
        >
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            
            <svg onClick={triggerUpload} xmlns="http://www.w3.org/2000/svg" className={`w-16 h-16 mb-4 transition-colors cursor-pointer hover:text-[#04D9FF] ${isDragging ? 'text-[#04D9FF]' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
            </svg>

            <div onClick={triggerUpload} className="px-6 py-4 rounded-xl flex flex-col items-center cursor-pointer transition-colors border bg-white/10 border-white/10 backdrop-blur-sm hover:bg-white/20">
              <p className="text-white font-semibold text-lg">Drag & drop a B/W image here</p>
              <p className="text-white/60 my-2 text-sm uppercase tracking-wider">or</p>
              <button type="button" tabIndex={-1} className={`px-6 py-2 font-bold rounded transition-all focus:outline-none ${isBlue ? 'bg-[#04D9FF] text-black ring-1 ring-offset-4 ring-[#04D9FF] ring-offset-[#0a192f] hover:bg-[#04D9FF]/90' : 'bg-[#04D9FF] text-white hover:bg-opacity-80 focus:ring-offset-black focus:ring-[#04D9FF]'}`}>Browse Files</button>
            </div>
        </div>
    );
};

const UploadingIndicator = () => (
    <div className="relative w-32 h-32">
        <motion.div className="absolute inset-0 border-4 border-dashed border-accent-purple rounded-full" animate={{ rotate: 360 }} transition={{ ease: 'linear', duration: 10, repeat: Infinity }} />
        <motion.div className="absolute inset-2 border-2 border-accent-purple rounded-full" animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} />
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100"><motion.circle cx="50" cy="50" r="45" stroke="var(--accent-purple)" strokeWidth="6" fill="none" strokeDasharray="283" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 0.25, opacity: 1, rotate: -90 }} transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }} style={{ transformOrigin: '50% 50%' }} /></svg>
    </div>
);

const PipelineNode: React.FC<any> = ({ cx, cy, label, Icon, isActive, isCurrent, isMobile }) => {
  const textY = isMobile ? (cy > 200 ? cy + 30 : cy + 25) : (cy > 100 ? cy + 50 : cy - 40);
  const textAnchor = isMobile ? (cx < 150 ? 'end' : 'start') : 'middle';
  const textX = isMobile ? (cx < 150 ? cx - 20 : cx + 20) : cx;

  const words = label.split(' ');
  let line1 = label;
  let line2 = '';
  
  if (words.length > 2 && label.length > 20) {
      const mid = Math.ceil(words.length / 2);
      line1 = words.slice(0, mid).join(' ');
      line2 = words.slice(mid).join(' ');
  }

  return (
    <motion.g initial={{ scale: 1, opacity: 0.7 }} animate={isActive ? "active" : "inactive"} variants={{ active: { scale: 1.12, opacity: 1, transition: { duration: 0.22 } }, inactive: { scale: 1, opacity: 0.7 }}}>
      {isActive && <motion.circle cx={cx} cy={cy} r="25" fill="var(--accent-teal)" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 0.1 }} transition={{ delay: 0.2 }} />}
      <motion.circle cx={cx} cy={cy} r="16" fill="var(--bg-color)" stroke={isActive ? "var(--accent-teal)" : "var(--text-secondary)"} strokeWidth="2" className={isActive ? 'breathing-glow' : ''} />
      <Icon fill={isActive ? "var(--accent-teal)" : "var(--text-secondary)"} transform={`translate(${cx-12}, ${cy-12})`} />
      
      <text x={textX} y={textY} textAnchor={textAnchor} fontSize={isMobile ? "12" : "14"} className="transition-fill duration-300" fill={isActive ? "#FFFFFF" : "#94a3b8"} style={{ fontWeight: isActive ? 600 : 400 }}>
          <tspan x={textX} dy="0">{line1}</tspan>
          {line2 && <tspan x={textX} dy="1.2em">{line2}</tspan>}
      </text>
    </motion.g>
  );
};

const AnimatedPipeAndDot = ({ pathRef, path, pathLength, progress, startX, startY }: any) => {
    const [pos, setPos] = useState<{x: number, y: number}>({ x: startX || 0, y: startY || 0 });
    
    const strokeDashoffset = useTransform(progress, (v: number) => pathLength * (1 - v));

    useLayoutEffect(() => {
        const updatePos = (val: number) => {
            if (pathRef.current && pathLength > 0) {
                try {
                    const point = pathRef.current.getPointAtLength(val * pathLength);
                    setPos({ x: point.x, y: point.y });
                } catch (e) {
                    console.warn("getPointAtLength failed", e);
                }
            }
        };

        updatePos(progress.get());

        const unsubscribe = progress.on("change", (latest: number) => {
            updatePos(latest);
        });

        return unsubscribe;
    }, [pathRef, pathLength, progress]);

    const trailX = useSpring(pos.x, { stiffness: 500, damping: 50 });
    const trailY = useSpring(pos.y, { stiffness: 500, damping: 50 });

    return (
        <>
            <motion.path d={path} fill="none" stroke="url(#pipeGradient)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: pathLength, strokeDashoffset, filter: 'var(--glow-teal)' }}/>
            {/* Trail effect */}
            <motion.ellipse cx={trailX} cy={trailY} rx="20" ry="8" fill="var(--accent-teal)" style={{ opacity: 0.3, filter: 'blur(8px)' }} />
            
            {/* Main glowing ball */}
            <motion.g style={{ x: pos.x, y: pos.y }}>
                {/* Outer pulsing ring */}
                <motion.circle 
                    r="20" 
                    fill="var(--accent-teal)" 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: [0, 0.4, 0], scale: [0.5, 1.5, 2] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                />
                {/* Inner glow */}
                <circle r="12" fill="var(--accent-teal)" style={{ filter: 'blur(4px)', opacity: 0.8 }} />
                {/* Core */}
                <circle r="8" fill="white" style={{ filter: 'drop-shadow(0 0 4px white)' }} />
            </motion.g>
        </>
    );
};

const ResultView: React.FC<{ result: ColorizationResult, onReset: () => void, ctaRef: React.RefObject<HTMLButtonElement> }> = ({ result, onReset, ctaRef }) => {
  return (
    <div className="flex flex-col items-center w-full" role="region" aria-live="polite" aria-label="Colorization Result">
      <h2 className="text-2xl font-bold tracking-wider text-white mb-6">
        Colorization Complete
      </h2>
      
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-4xl justify-center items-center">
          <div className="flex flex-col items-center">
              <p className="text-gray-400 mb-2 text-sm uppercase tracking-widest">Original</p>
              <img src={result.originalUrl} alt="Original B/W" className="max-w-xs md:max-w-sm rounded-lg border border-white/20 shadow-lg grayscale" />
          </div>
          
          <div className="text-white text-2xl font-bold">→</div>

          <div className="flex flex-col items-center">
              <p className="text-[#04D9FF] mb-2 text-sm uppercase tracking-widest font-bold">Colorized</p>
              <div className="relative group">
                <img src={result.colorizedUrl} alt="Colorized Output" className="max-w-xs md:max-w-sm rounded-lg border-2 border-[#04D9FF] shadow-[0_0_20px_rgba(4,217,255,0.3)]" />
                <a 
                    href={result.colorizedUrl} 
                    download="colorized_image.png"
                    className="absolute bottom-3 right-3 p-3 bg-black/60 text-white rounded-full hover:bg-[#04D9FF] hover:text-black transition-all backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 duration-300 shadow-lg"
                    title="Download Image"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                </a>
              </div>
          </div>
      </div>
      
      <button ref={ctaRef} onClick={onReset} className="mt-10 px-10 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
        Colorize Another Image
      </button>
    </div>
  );
};

const ProcessingDots = () => {
    const [dots, setDots] = useState('');
  
    useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => prev.length >= 6 ? '' : prev + '.');
      }, 300);
      return () => clearInterval(interval);
    }, []);
  
    return <span className="inline-block w-8 text-left">{dots}</span>;
};

export default ImageColorizer;
