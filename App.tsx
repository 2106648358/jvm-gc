
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, 
  Pause,
  RotateCcw, 
  Cpu, 
  AlertOctagon, 
  Box,
  Info,
  Zap,
  ArrowRight,
  Database
} from 'lucide-react';

// --- Types ---

type AlgoType = 'CMS' | 'G1' | 'ZGC';
type RegionType = 'Eden' | 'Survivor' | 'Old' | 'Free';

interface GCObject {
  id: number;
  label: string;
  refs: number[];
  isRoot: boolean;
  regionId: number; // 0-15
}

interface ObjectState {
  id: number;
  color: string;
  borderColor: string;
  glowColor: string;
  status: 'live' | 'garbage' | 'unknown' | 'relocated' | 'evacuating';
  opacity: number;
  scale: number;
  label?: string;
}

interface StepInfo {
  title: string;
  description: string;
  isSTW: boolean;
  phase: string;
  visualNote: string;
}

// --- Constants & Mock Data ---

// 18 Objects
const INITIAL_OBJECTS: GCObject[] = [
  // --- Region 0 (Eden) ---
  { id: 0, label: 'Root', refs: [2, 3], isRoot: true, regionId: 0 },
  { id: 1, label: 'Root', refs: [4], isRoot: true, regionId: 0 },
  { id: 2, label: 'Obj', refs: [6], isRoot: false, regionId: 0 }, 
  
  // --- Region 1 (Eden) ---
  { id: 3, label: 'Obj', refs: [7], isRoot: false, regionId: 1 },
  
  // --- Region 5 (Survivor) ---
  { id: 4, label: 'Surv', refs: [8], isRoot: false, regionId: 5 },
  { id: 5, label: 'Surv', refs: [9], isRoot: false, regionId: 5 },

  // --- Region 2 (Eden Garbage) ---
  { id: 11, label: 'Garb', refs: [], isRoot: false, regionId: 2 },
  { id: 12, label: 'Garb', refs: [11], isRoot: false, regionId: 2 },

  // --- Region 9 (Old) ---
  { id: 6, label: 'Old', refs: [10], isRoot: false, regionId: 9 },
  { id: 7, label: 'Old', refs: [], isRoot: false, regionId: 9 },
  
  // --- Region 10 (Old) ---
  { id: 8, label: 'Old', refs: [], isRoot: false, regionId: 10 },
  { id: 9, label: 'Old', refs: [], isRoot: false, regionId: 10 },
  { id: 10, label: 'Old', refs: [], isRoot: false, regionId: 10 },

  // --- Region 12 (Old Garbage Cycle) ---
  { id: 13, label: 'Cyc1', refs: [14], isRoot: false, regionId: 12 },
  { id: 14, label: 'Cyc2', refs: [13], isRoot: false, regionId: 12 },

  // --- Region 13 (Old Garbage Complex) ---
  { id: 15, label: 'Garb', refs: [16], isRoot: false, regionId: 13 },
  { id: 16, label: 'Garb', refs: [17], isRoot: false, regionId: 13 },
  { id: 17, label: 'Garb', refs: [15], isRoot: false, regionId: 13 },
];

const G1_REGION_TYPES: Record<number, RegionType> = {
  0: 'Eden', 1: 'Eden', 2: 'Eden', 3: 'Eden',
  5: 'Survivor', 6: 'Survivor',
  9: 'Old', 10: 'Old', 12: 'Old', 13: 'Old', 14: 'Old', 15: 'Old',
  4: 'Free', 7: 'Free', 8: 'Free', 11: 'Free'
};

// CMS Positions - Adjusted for larger objects
const CMS_POSITIONS: Record<number, {x: number, y: number}> = {
  // Young Gen (Top)
  0: { x: 20, y: 15 }, 1: { x: 50, y: 15 }, 2: { x: 20, y: 32 },
  3: { x: 50, y: 32 }, 4: { x: 80, y: 20 }, 5: { x: 80, y: 38 },
  11: { x: 35, y: 38 }, 12: { x: 20, y: 38 }, 

  // Old Gen (Bottom)
  6: { x: 20, y: 65 }, 7: { x: 35, y: 65 },
  8: { x: 20, y: 82 }, 9: { x: 35, y: 82 }, 10: { x: 28, y: 92 },
  13: { x: 60, y: 70 }, 14: { x: 75, y: 70 }, 
  15: { x: 60, y: 88 }, 16: { x: 75, y: 88 }, 17: { x: 68, y: 95 } 
};

// --- Cyberpunk Theme Colors ---
const PALETTE = {
  unknown: { bg: '#1e293b', border: '#334155', glow: 'transparent', text: '#94a3b8' }, // Slate 800
  marking: { bg: '#b45309', border: '#fbbf24', glow: 'rgba(251, 191, 36, 0.5)', text: '#fffbeb' }, // Amber 700
  live:    { bg: '#047857', border: '#34d399', glow: 'rgba(52, 211, 153, 0.6)', text: '#ecfdf5' }, // Emerald 700
  garbage: { bg: '#be123c', border: '#fb7185', glow: 'rgba(251, 113, 133, 0.4)', text: '#fff1f2' }, // Rose 700
  evac:    { bg: '#0369a1', border: '#38bdf8', glow: 'rgba(56, 189, 248, 0.7)', text: '#f0f9ff' }, // Sky 700
  reloc:   { bg: '#6d28d9', border: '#a78bfa', glow: 'rgba(167, 139, 250, 0.7)', text: '#f5f3ff' }, // Violet 700
};

const REGION_STYLES = {
  Eden: 'bg-green-900/10 border-green-500/30 text-green-500',
  Survivor: 'bg-cyan-900/10 border-cyan-500/30 text-cyan-500',
  Old: 'bg-blue-900/10 border-blue-500/30 text-blue-500',
  Free: 'bg-slate-900/20 border-slate-800 text-slate-700'
};

// --- Steps ---

const CMS_STEPS: StepInfo[] = [
  { title: "系统运行 (Running)", description: "对象分配在新生代(上)。", isSTW: false, phase: "Reset", visualNote: "灰色对象：未知状态。背景上下分层。" },
  { title: "初始标记 (Init Mark)", description: "STW！标记GC Roots。", isSTW: true, phase: "Marking", visualNote: "Root(0,1)变绿，直接引用对象变黄(入队)。" },
  { title: "并发标记 (Conc Mark)", description: "遍历引用链。", isSTW: false, phase: "Marking", visualNote: "黄色波浪扩散，所有可达对象变为绿色(存活)。" },
  { title: "重新标记 (Remark)", description: "STW！修正变动。", isSTW: true, phase: "Marking", visualNote: "最终确认存活对象。未变绿的对象即将被回收。" },
  { title: "并发清除 (Sweep)", description: "清除垃圾。", isSTW: false, phase: "Sweeping", visualNote: "白色对象变红(垃圾)并缩小消失。无对象移动。" },
  { title: "重置 (Reset)", description: "准备下一次。", isSTW: false, phase: "Reset", visualNote: "状态复位。" },
];

const G1_STEPS: StepInfo[] = [
  { title: "运行中 (Running)", description: "对象分布在不同Region。", isSTW: false, phase: "Reset", visualNote: "对象散落在不同格子(Region)中。" },
  { title: "初始标记 (Init Mark)", description: "STW！标记Roots。", isSTW: true, phase: "Marking", visualNote: "根节点点亮。" },
  { title: "并发标记 (Conc Mark)", description: "计算存活率。", isSTW: false, phase: "Marking", visualNote: "全图扫描，识别存活对象(绿)。" },
  { title: "最终标记 (Remark)", description: "STW！处理SATB。", isSTW: true, phase: "Marking", visualNote: "标记结束。" },
  { title: "筛选回收 (Evac)", description: "STW！复制存活对象。", isSTW: true, phase: "Evacuation", visualNote: "绿色对象变蓝，飞向Region 7！垃圾留在原地。" },
  { title: "重置 (Reset)", description: "清空旧Region。", isSTW: false, phase: "Reset", visualNote: "红色垃圾消失，蓝色对象在Region 7定居。" },
];

const ZGC_STEPS: StepInfo[] = [
  { title: "运行中 (Running)", description: "ZGC 分页布局。", isSTW: false, phase: "Reset", visualNote: "均匀的内存页布局。" },
  { title: "初始标记 (Init Mark)", description: "STW！标记Roots。", isSTW: true, phase: "Marking", visualNote: "毫秒级暂停。" },
  { title: "并发标记 (Conc Mark)", description: "染色指针标记。", isSTW: false, phase: "Marking", visualNote: "全量标记存活对象(绿)。" },
  { title: "再标记 (Remark)", description: "STW！结束标记。", isSTW: true, phase: "Marking", visualNote: "最终确认。" },
  { title: "并发转移 (Relocate)", description: "指针变色+逻辑移动。", isSTW: false, phase: "Relocating", visualNote: "对象变紫(Relocated)。读屏障修正引用。" },
  { title: "重映射 (Remap)", description: "回收旧页。", isSTW: false, phase: "Remapping", visualNote: "垃圾页被释放。" },
];

// --- Helper Component ---
const LegendItem = ({ color, label, glow }: { color: string, label: string, glow?: string }) => (
  <div className="flex items-center gap-2">
    <div 
      className="w-4 h-4 rounded shadow-sm border border-white/10" 
      style={{ backgroundColor: color, boxShadow: glow ? `0 0 10px ${glow}` : 'none' }}
    ></div>
    <span className="text-[11px] text-slate-300 font-medium">{label}</span>
  </div>
);

const Legend = ({ algo }: { algo: AlgoType }) => (
  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm mt-auto">
    <h4 className="font-bold text-cyan-400 flex items-center gap-2 text-xs mb-3 uppercase tracking-wider">
      <Info className="w-3 h-3" /> 视觉图例
    </h4>
    <div className="grid grid-cols-2 gap-y-3 gap-x-2">
      <LegendItem color={PALETTE.unknown.bg} label="未访问 / Unknown" />
      <LegendItem color={PALETTE.marking.bg} label="标记队列 / Marking" glow={PALETTE.marking.glow} />
      <LegendItem color={PALETTE.live.bg} label="存活对象 / Live" glow={PALETTE.live.glow} />
      <LegendItem color={PALETTE.garbage.bg} label="垃圾对象 / Garbage" glow={PALETTE.garbage.glow} />
      {algo === 'G1' && <LegendItem color={PALETTE.evac.bg} label="转移中 / Evacuating" glow={PALETTE.evac.glow} />}
      {algo === 'ZGC' && <LegendItem color={PALETTE.reloc.bg} label="重定位 / Relocated" glow={PALETTE.reloc.glow} />}
    </div>
  </div>
);

// --- Main Component ---

export default function GCVisualizer() {
  const [algo, setAlgo] = useState<AlgoType>('CMS');
  const [step, setStep] = useState(0);
  const [objectStates, setObjectStates] = useState<ObjectState[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize
  useEffect(() => {
    resetObjects();
  }, []);

  useEffect(() => {
    setStep(0);
    setIsPlaying(false);
    resetObjects();
  }, [algo]);

  // Auto Run
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setStep(prev => {
          const next = prev + 1;
          if (next >= currentSteps.length) {
             setIsPlaying(false);
             return 0;
          }
          return next;
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, algo]);

  const currentSteps = algo === 'CMS' ? CMS_STEPS : (algo === 'G1' ? G1_STEPS : ZGC_STEPS);
  const currentInfo = currentSteps[step];

  const resetObjects = () => {
    setObjectStates(INITIAL_OBJECTS.map(obj => ({
      id: obj.id,
      color: PALETTE.unknown.bg,
      borderColor: PALETTE.unknown.border,
      glowColor: PALETTE.unknown.glow,
      status: 'unknown',
      opacity: 1,
      scale: 1,
      label: obj.label
    })));
  };

  // --- Layout Logic (Deterministic) ---
  
  // Pre-calculate grouping to ensure stable positions without overlap
  const objectLayoutMap = useMemo(() => {
    const layout = new Map<number, { index: number, total: number }>();
    
    // Group by Region
    const regionGroups = new Map<number, number[]>();
    INITIAL_OBJECTS.forEach(obj => {
      const list = regionGroups.get(obj.regionId) || [];
      list.push(obj.id);
      regionGroups.set(obj.regionId, list);
    });

    regionGroups.forEach((ids) => {
      ids.forEach((id, idx) => {
        layout.set(id, { index: idx, total: ids.length });
      });
    });
    
    return layout;
  }, []);

  // Pre-calculate Evacuation target layout (For G1 Step 4)
  const evacLayoutMap = useMemo(() => {
    const layout = new Map<number, { index: number, total: number }>();
    // Find all potentially live objects in Eden/Survivor
    const candidates = INITIAL_OBJECTS.filter(o => 
       ['Eden', 'Survivor'].includes(G1_REGION_TYPES[o.regionId])
    ).map(o => o.id);
    
    candidates.forEach((id, idx) => {
      layout.set(id, { index: idx, total: candidates.length });
    });
    return layout;
  }, []);


  const getPos = (id: number) => {
    const obj = INITIAL_OBJECTS.find(o => o.id === id);
    if (!obj) return { x: 0, y: 0 };

    if (algo === 'CMS') {
      const pos = CMS_POSITIONS[id] || { x: 50, y: 50 };
      return pos;
    } 

    // Grid Logic (G1 / ZGC)
    let regionId = obj.regionId;
    let layoutInfo = objectLayoutMap.get(id) || { index: 0, total: 1 };

    // Handle G1 Evacuation Movement
    if (algo === 'G1' && step === 4 && objectStates[id]?.status === 'evacuating') {
       regionId = 7; // Move to Target Region
       layoutInfo = evacLayoutMap.get(id) || { index: 0, total: 1 };
    }

    // Calculate Region Center
    const regionRow = Math.floor(regionId / 4);
    const regionCol = regionId % 4;
    const centerX = 12.5 + (regionCol * 25);
    const centerY = 12.5 + (regionRow * 25);

    // If single object, return center
    if (layoutInfo.total === 1) {
       return { x: centerX, y: centerY };
    }

    // Distribute multiple objects in a circle or grid pattern within the region box
    // Region box is 25x25 %. Safe area is roughly 20x20.
    const radius = 6; // % distance from center
    // Distribute evenly in a circle
    const angle = (2 * Math.PI / layoutInfo.total) * layoutInfo.index - (Math.PI / 2);
    
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  };

  // --- Logic Engine ---
  useEffect(() => {
    if (objectStates.length === 0) return;

    const batchUpdate = (cb: (states: ObjectState[]) => void) => {
      setObjectStates(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        cb(next);
        return next;
      });
    };

    const markRoots = () => {
      batchUpdate(states => {
        INITIAL_OBJECTS.forEach(obj => {
          if (obj.isRoot) {
            const s = PALETTE.live;
            states[obj.id].color = s.bg;
            states[obj.id].borderColor = s.border;
            states[obj.id].glowColor = s.glow;
            states[obj.id].status = 'live';
            states[obj.id].scale = 1.1;
          }
        });
      });
    };

    const markReachable = (intermediate: boolean) => {
      const queue = INITIAL_OBJECTS.filter(o => o.isRoot).map(o => o.id);
      const visited = new Set(queue);
      const liveIds = new Set<number>();
      
      while(queue.length > 0) {
        const currId = queue.shift()!;
        liveIds.add(currId);
        const obj = INITIAL_OBJECTS.find(o => o.id === currId);
        obj?.refs.forEach(refId => {
          if (!visited.has(refId)) {
            visited.add(refId);
            queue.push(refId);
          }
        });
      }

      batchUpdate(states => {
        liveIds.forEach(id => {
          const style = intermediate ? PALETTE.marking : PALETTE.live;
          states[id].color = style.bg;
          states[id].borderColor = style.border;
          states[id].glowColor = style.glow;
          states[id].status = 'live';
        });
      });
    };

    if (step === 0) { resetObjects(); return; }

    // Generic phases based on step index (simplified for demo)
    if (algo === 'CMS') {
      if (step === 1) markRoots();
      else if (step === 2) markReachable(true);
      else if (step === 3) markReachable(false);
      else if (step === 4) {
        batchUpdate(states => {
          states.forEach(s => {
            if (s.status !== 'live') {
              const st = PALETTE.garbage;
              s.color = st.bg; s.borderColor = st.border; s.glowColor = st.glow;
              s.status = 'garbage';
              s.opacity = 0.5;
            }
          });
        });
      }
      else if (step === 5) {
        batchUpdate(states => {
           states.forEach(s => {
             if (s.status === 'garbage') { s.opacity = 0; s.scale = 0; }
             else { const st = PALETTE.unknown; s.color = st.bg; s.borderColor = st.border; s.glowColor = st.glow; s.status = 'unknown'; }
           });
        });
      }
    }
    
    if (algo === 'G1') {
      if (step === 1) markRoots();
      else if (step === 2) markReachable(true);
      else if (step === 3) markReachable(false);
      else if (step === 4) { // Evac
        batchUpdate(states => {
           INITIAL_OBJECTS.forEach(obj => {
             // Only evacuate Live objects in Eden/Survivor
             const isYoung = ['Eden','Survivor'].includes(G1_REGION_TYPES[obj.regionId]);
             if (states[obj.id].status === 'live' && isYoung) {
                const st = PALETTE.evac;
                states[obj.id].color = st.bg; states[obj.id].borderColor = st.border; states[obj.id].glowColor = st.glow;
                states[obj.id].status = 'evacuating';
             } else if (states[obj.id].status !== 'live') {
                const st = PALETTE.garbage;
                states[obj.id].color = st.bg; states[obj.id].borderColor = st.border; 
                states[obj.id].status = 'garbage';
             }
           });
        });
      } 
      else if (step === 5) {
        batchUpdate(states => {
          states.forEach(s => {
            if (s.status === 'garbage') { s.opacity = 0; s.scale = 0; }
            else if (s.status === 'evacuating') {
               const st = PALETTE.unknown;
               s.color = st.bg; s.borderColor = st.border; s.glowColor = st.glow; s.status = 'unknown';
            }
          });
        });
      }
    }

    if (algo === 'ZGC') {
      if (step === 1) markRoots();
      else if (step === 2) markReachable(false);
      else if (step === 3) markReachable(false);
      else if (step === 4) { // Relocate
        batchUpdate(states => {
           states.forEach(s => {
             if (s.status === 'live') {
               const st = PALETTE.reloc;
               s.color = st.bg; s.borderColor = st.border; s.glowColor = st.glow;
               s.status = 'relocated';
             }
           });
        });
      }
      else if (step === 5) { // Remap
         batchUpdate(states => {
            states.forEach(s => {
              if (s.status === 'relocated') {
                 const st = PALETTE.live;
                 s.color = st.bg; s.borderColor = st.border; s.glowColor = 'transparent';
                 s.status = 'live';
              } else { s.opacity = 0; s.scale = 0; }
            });
         });
      }
    }

  }, [step, algo]);

  const renderConnections = () => {
    return INITIAL_OBJECTS.map(obj => {
      return obj.refs.map((targetId) => {
        const start = getPos(obj.id);
        const end = getPos(targetId);
        const startState = objectStates[obj.id];
        const endState = objectStates[targetId];
        
        if (!startState || !endState || startState.opacity === 0 || endState.opacity === 0) return null;

        const isActive = startState.status === 'live' && endState.status === 'live';
        const isEvac = startState.status === 'evacuating';
        const strokeColor = isEvac ? PALETTE.evac.border : (isActive ? PALETTE.live.border : '#475569');
        const opacity = isActive || isEvac ? 0.5 : 0.15;
        const width = isActive ? 2 : 1;

        return (
          <line
            key={`${obj.id}-${targetId}`}
            x1={`${start.x}%`}
            y1={`${start.y}%`}
            x2={`${end.x}%`}
            y2={`${end.y}%`}
            stroke={strokeColor}
            strokeWidth={width}
            className="transition-all duration-700 ease-in-out"
            opacity={opacity}
          />
        );
      });
    });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-200 font-sans flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#09090b] to-black">
      
      {/* --- Header --- */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 h-16 flex items-center justify-between px-6 z-40 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
             <Cpu className="text-cyan-400 w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-widest text-cyan-50 hidden sm:block font-mono">
            JVM GC VISUALIZER <span className="text-xs text-cyan-500 ml-2">v2.1</span>
          </h1>
        </div>
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          {(['CMS', 'G1', 'ZGC'] as AlgoType[]).map((t) => (
            <button
              key={t}
              onClick={() => setAlgo(t)}
              className={`px-5 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-2 ${
                algo === t 
                  ? (t === 'CMS' ? 'bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.6)]' : t === 'G1' ? 'bg-sky-600 shadow-[0_0_20px_rgba(14,165,233,0.6)]' : 'bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.6)]') + ' text-white scale-105 z-10' 
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-4 lg:p-6 gap-6 overflow-hidden">
        
        {/* --- Canvas --- */}
        <div className="flex-1 relative bg-[#0c0a09] rounded-3xl border border-slate-800/60 shadow-2xl overflow-hidden min-h-[500px] group ring-1 ring-white/5">
          
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          </div>

          {/* STW Global Effect (Border + Badge, no blocking overlay) */}
          {currentInfo.isSTW && (
            <>
              <div className="absolute inset-0 z-50 border-4 border-red-600/40 pointer-events-none animate-pulse"></div>
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-50 bg-red-950/90 border-b border-x border-red-500/50 text-red-200 px-6 py-2 rounded-b-xl font-bold tracking-widest shadow-[0_0_30px_rgba(220,38,38,0.5)] flex items-center gap-3 backdrop-blur-md">
                 <AlertOctagon className="w-5 h-5 animate-spin-slow" />
                 STOP THE WORLD
              </div>
            </>
          )}

          {/* Regions Layer */}
          {algo === 'CMS' ? (
             <div className="absolute inset-0 flex flex-col pointer-events-none">
                <div className="h-[45%] border-b border-dashed border-slate-700 bg-gradient-to-b from-blue-900/5 to-transparent flex p-6">
                   <span className="text-blue-500/20 font-black text-6xl uppercase select-none tracking-tighter">Young</span>
                </div>
                <div className="h-[55%] bg-gradient-to-t from-yellow-900/5 to-transparent flex p-6 items-end justify-end">
                   <span className="text-yellow-500/20 font-black text-6xl uppercase select-none tracking-tighter">Old</span>
                </div>
             </div>
          ) : (
             <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-2 p-4 pointer-events-none">
                {Array.from({ length: 16 }).map((_, i) => {
                  const regionType = algo === 'G1' ? G1_REGION_TYPES[i] : 'Free';
                  const baseStyle = REGION_STYLES[regionType];
                  const isEvacTarget = algo === 'G1' && step === 4 && i === 7;
                  return (
                    <div key={i} className={`rounded-2xl border transition-all duration-1000 flex items-start justify-between p-2 ${baseStyle} ${isEvacTarget ? 'ring-2 ring-sky-400 bg-sky-900/20 shadow-[inset_0_0_30px_rgba(56,189,248,0.2)]' : 'border-slate-800/40'}`}>
                      <span className="text-[10px] font-mono opacity-30">{i}</span>
                      {algo === 'G1' && <span className="text-[10px] font-bold opacity-50 tracking-wider">{regionType}</span>}
                    </div>
                  )
                })}
             </div>
          )}

          {/* Objects Layer */}
          <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none mix-blend-screen">
             {renderConnections()}
          </svg>

          {objectStates.map((obj) => {
            const pos = getPos(obj.id);
            const isRoot = INITIAL_OBJECTS.find(o => o.id === obj.id)?.isRoot;
            
            // Fix palette lookup logic to handle status mismatch
            let paletteKey = 'unknown';
            if (obj.status === 'live') paletteKey = 'live';
            else if (obj.status === 'garbage') paletteKey = 'garbage';
            else if (obj.status === 'evacuating') paletteKey = 'evac';
            else if (obj.status === 'relocated') paletteKey = 'reloc';
            
            // @ts-ignore
            const pEntry = PALETTE[paletteKey] || PALETTE.unknown;
            const textColor = ['#fffbeb', '#ecfdf5', '#f0f9ff', '#f5f3ff'].includes(pEntry.text) ? 'text-slate-900' : 'text-white';

            return (
              <div
                key={obj.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-xl shadow-xl transition-all duration-[1500ms] ease-in-out z-20"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  backgroundColor: obj.color,
                  border: `2px solid ${isRoot ? '#fff' : obj.borderColor}`,
                  boxShadow: `0 0 20px ${obj.glowColor}`,
                  opacity: obj.opacity,
                  transform: `translate(-50%, -50%) scale(${obj.scale})`
                }}
              >
                <div className="flex flex-col items-center justify-center">
                   {isRoot && <Database className="w-3 h-3 text-white mb-0.5 opacity-80" />}
                   <span className={`text-[13px] font-extrabold font-mono leading-none drop-shadow-md ${textColor}`}>
                     {obj.id}
                   </span>
                </div>
                
                {/* Status Indicator Dot */}
                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${obj.status === 'live' ? 'bg-emerald-400' : (obj.status === 'garbage' ? 'bg-red-500' : 'bg-slate-500')}`}></div>

                {/* ZGC Effect */}
                {algo === 'ZGC' && step === 4 && obj.status === 'relocated' && (
                   <div className="absolute -top-3 -right-3 bg-yellow-400 rounded-full p-0.5 shadow-lg animate-bounce">
                      <Zap className="w-3 h-3 text-yellow-900 fill-current" />
                   </div>
                )}
              </div>
            );
          })}

        </div>

        {/* --- Controls Sidebar --- */}
        <aside className="w-full lg:w-[420px] flex flex-col gap-5 z-30">
           
           {/* Main Info Card */}
           <div className="bg-slate-900/80 border border-slate-700/60 p-6 rounded-3xl shadow-2xl relative overflow-hidden backdrop-blur-md flex-1 flex flex-col">
              {/* Progress Bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                 <div 
                   className={`h-full transition-all duration-500 ${currentInfo.isSTW ? 'bg-red-500' : 'bg-cyan-500'}`} 
                   style={{ width: `${((step + 1) / currentSteps.length) * 100}%` }}
                 ></div>
              </div>
              
              <div className="flex justify-between items-start mb-6 mt-2">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                       <span className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Phase {step + 1}/{currentSteps.length}</span>
                       <div className={`h-px flex-1 w-10 ${currentInfo.isSTW ? 'bg-red-500/50' : 'bg-cyan-500/50'}`}></div>
                    </div>
                    <h2 className={`text-2xl font-black tracking-tight ${currentInfo.isSTW ? 'text-red-100' : 'text-white'}`}>
                       {currentInfo.title}
                    </h2>
                 </div>
                 <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest border shadow-lg ${currentInfo.isSTW ? 'text-red-400 border-red-500/30 bg-red-950/50 animate-pulse' : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/50'}`}>
                    {currentInfo.isSTW ? 'STOP THE WORLD' : 'RUNNING'}
                 </span>
              </div>

              <div className="bg-slate-950/50 rounded-xl p-4 mb-6 border border-white/5">
                 <p className="text-sm text-slate-300 leading-relaxed font-medium">
                    {currentInfo.description}
                 </p>
              </div>

              <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 flex gap-4 items-start mb-4">
                 <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
                    <Box className="w-5 h-5 text-blue-400" />
                 </div>
                 <div>
                    <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Visual Guide</h5>
                    <p className="text-xs text-blue-200/80 leading-relaxed">
                       {currentInfo.visualNote}
                    </p>
                 </div>
              </div>
              
              <div className="mt-auto">
                  <Legend algo={algo} />
              </div>
           </div>

           {/* Control Bar */}
           <div className="grid grid-cols-[auto_1fr_auto] gap-3 p-2 bg-slate-900/50 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
              <button onClick={() => { setIsPlaying(false); setStep(0); resetObjects(); }} 
                className="w-14 h-14 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 shadow-lg group">
                <RotateCcw className="w-5 h-5 group-hover:-rotate-90 transition-transform" />
              </button>
              
              <button onClick={() => setIsPlaying(!isPlaying)} 
                className={`h-14 px-6 rounded-xl font-bold transition-all flex justify-center items-center gap-3 border shadow-xl ${isPlaying ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'}`}>
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                <span className="tracking-wider">{isPlaying ? '暂停演示' : '自动播放'}</span>
              </button>

              <button onClick={() => { setIsPlaying(false); setStep(prev => (prev + 1) % currentSteps.length); }} 
                className="h-14 px-6 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(8,145,178,0.4)] border border-cyan-400/50 active:scale-95">
                下一步 <ArrowRight className="w-5 h-5" />
              </button>
           </div>

        </aside>

      </main>
    </div>
  );
}
