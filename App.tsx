
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Timer, Zap, Target, Settings, GraduationCap, RefreshCw, Users, Trophy, ShieldCheck, Trash2, Download, Play, Keyboard, Activity } from 'lucide-react';
import { TestStatus, TypingStats, TestSettings, StudentInfo, LeaderboardEntry } from './types';
import { generateTypingText, getPerformanceFeedback, getStaticText, CS_STATIC_TEXTS } from './services/geminiService';
import { StatsCard } from './components/StatsCard';
import { ResultView } from './components/ResultView';

// Optimized Audio Engine (Wait for user gesture)
const AudioEngine = (() => {
  let ctx: AudioContext | null = null;
  const init = () => { 
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn("Audio Context failed to initialize", e);
      }
    }
  };
  
  const play = (freq: number, type: OscillatorType, volume: number, duration: number) => {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  return {
    init,
    key: () => play(440, 'sine', 0.05, 0.05),
    error: () => play(180, 'square', 0.1, 0.1),
    success: () => play(880, 'triangle', 0.1, 0.3)
  };
})();

interface AlignmentPart {
  type: 'match' | 'mismatch' | 'skip' | 'extra';
  char: string;
  targetIdx?: number;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'test' | 'leaderboard'>('test');
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [settings, setSettings] = useState<TestSettings>(() => {
    const saved = localStorage.getItem('cs_typing_settings');
    return saved ? JSON.parse(saved) : {
      duration: 60,
      difficulty: 'Medium',
      topic: 'Official Assessment: Hardware',
      maxMarks: 100,
      targetWpm: 60
    };
  });
  
  const [student, setStudent] = useState<StudentInfo>(() => {
    const saved = localStorage.getItem('cs_student_info');
    return saved ? JSON.parse(saved) : { admissionNumber: '', studentName: '', className: '10' };
  });

  const [targetText, setTargetText] = useState(() => getStaticText(settings.topic));
  const [userInput, setUserInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(settings.duration);
  const [stats, setStats] = useState<TypingStats>({
    wpm: 0, accuracy: 100, errors: 0, totalChars: 0, timeElapsed: 0, currentMarks: 0
  });
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    const saved = localStorage.getItem('cs_typing_leaderboard');
    return saved ? JSON.parse(saved) : [];
  });

  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const statsRef = useRef<TypingStats>(stats);

  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { localStorage.setItem('cs_student_info', JSON.stringify(student)); }, [student]);
  useEffect(() => { localStorage.setItem('cs_typing_settings', JSON.stringify(settings)); }, [settings]);

  // Dynamic Alignment Engine: Solves the "Cascade Error" problem
  const alignment = useMemo(() => {
    const parts: AlignmentPart[] = [];
    let tIdx = 0;
    let iIdx = 0;

    while (iIdx < userInput.length) {
      const uChar = userInput[iIdx];
      const tChar = targetText[tIdx];

      if (tIdx >= targetText.length) {
        parts.push({ type: 'extra', char: uChar });
        iIdx++;
        continue;
      }

      if (uChar === tChar) {
        parts.push({ type: 'match', char: tChar, targetIdx: tIdx });
        tIdx++;
        iIdx++;
      } else {
        // Evaluate for skips: Look ahead up to 10 characters to find a resync point
        const lookAhead = 10;
        let found = false;
        for (let s = 1; s <= lookAhead; s++) {
          if (targetText[tIdx + s] === uChar) {
            // Found a match ahead! Mark the intermediate chars as "skipped"
            for (let skip = 0; skip < s; skip++) {
              parts.push({ type: 'skip', char: targetText[tIdx + skip], targetIdx: tIdx + skip });
            }
            tIdx += s;
            parts.push({ type: 'match', char: targetText[tIdx], targetIdx: tIdx });
            tIdx++; iIdx++;
            found = true;
            break;
          }
        }
        if (!found) {
          parts.push({ type: 'mismatch', char: uChar, targetIdx: tIdx });
          tIdx++; iIdx++;
        }
      }
    }

    const matches = parts.filter(p => p.type === 'match').length;
    return { parts, currentTargetIdx: tIdx, matchCount: matches, errorCount: parts.length - matches };
  }, [userInput, targetText]);

  const calculateMarks = useCallback((wpm: number, accuracy: number, maxMarks: number, targetWpm: number) => {
    const accFactor = Math.pow(accuracy / 100, 2.5);
    const speedFactor = Math.min(wpm / targetWpm, 1.1); 
    return Math.min(Math.round((maxMarks * 0.75 * accFactor) + (maxMarks * 0.25 * speedFactor)), maxMarks);
  }, []);

  const endTest = useCallback(async (finalStatsOverride?: TypingStats) => {
    const finalStats = finalStatsOverride || statsRef.current;
    setStatus(TestStatus.COMPLETED);
    if (timerRef.current) window.clearInterval(timerRef.current);
    
    const finalMarks = calculateMarks(finalStats.wpm, finalStats.accuracy, settings.maxMarks, settings.targetWpm);
    const entry: LeaderboardEntry = {
      ...student, ...finalStats, currentMarks: finalMarks,
      id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), topic: settings.topic
    };

    setLeaderboard(prev => {
      const next = [entry, ...prev].slice(0, 1000);
      localStorage.setItem('cs_typing_leaderboard', JSON.stringify(next));
      return next;
    });

    AudioEngine.success();
    getPerformanceFeedback({ wpm: finalStats.wpm, accuracy: finalStats.accuracy, topic: settings.topic }).then(setFeedback);
  }, [student, settings, calculateMarks]);

  const startTest = useCallback(() => {
    if (!student.admissionNumber.trim() || !student.studentName.trim()) {
      alert("Registration Required: Please enter student details.");
      return;
    }
    AudioEngine.init(); // Initialize audio on click
    setCountdown(3);
  }, [student]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setStatus(TestStatus.RUNNING);
      setCountdown(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [countdown]);

  const resetTest = useCallback((useAi: boolean = false) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setUserInput("");
    setTimeLeft(settings.duration);
    setStats({ wpm: 0, accuracy: 100, errors: 0, totalChars: 0, timeElapsed: 0, currentMarks: 0 });
    setStatus(TestStatus.IDLE);
    setCountdown(null);
    if (useAi) {
      setIsLoading(true);
      generateTypingText(settings.topic, settings.difficulty).then(text => {
        setTargetText(text);
        setIsLoading(false);
      });
    } else {
      setTargetText(getStaticText(settings.topic));
    }
  }, [settings]);

  useEffect(() => {
    if (status === TestStatus.RUNNING && timeLeft > 0) {
      timerRef.current = window.setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && status === TestStatus.RUNNING) {
      endTest();
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [status, timeLeft, endTest]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (status !== TestStatus.RUNNING) return;
    const val = e.target.value;
    
    if (val.length > userInput.length) {
      const lastInputChar = val[val.length - 1];
      const expectedChar = targetText[alignment.currentTargetIdx];
      lastInputChar === expectedChar ? AudioEngine.key() : AudioEngine.error();
    }

    setUserInput(val);
    const timeElapsedSecs = Math.max(0.5, settings.duration - timeLeft);
    const totalPotential = Math.max(val.length, alignment.currentTargetIdx);
    const accuracy = totalPotential > 0 ? Math.round((alignment.matchCount / totalPotential) * 100) : 100;
    const wpm = Math.round(((alignment.matchCount / 5) / (timeElapsedSecs / 60)));
    const currentMarks = calculateMarks(wpm, accuracy, settings.maxMarks, settings.targetWpm);

    const updatedStats = { wpm, accuracy, errors: alignment.errorCount, totalChars: val.length, timeElapsed: Math.round(timeElapsedSecs), currentMarks };
    setStats(updatedStats);
    if (alignment.currentTargetIdx >= targetText.length) endTest(updatedStats);
  };

  const exportToCSV = () => {
    const headers = ["Rank", "Name", "ID", "Class", "WPM", "Accuracy", "Score", "Date"];
    const rows = filteredLeaderboard.map((e, i) => [i + 1, e.studentName, e.admissionNumber, e.className, e.wpm, `${e.accuracy}%`, e.currentMarks, new Date(e.timestamp).toLocaleDateString()]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `typing_report_${student.className}.csv`;
    a.click();
  };

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter(e => e.className === student.className).sort((a, b) => b.currentMarks - a.currentMarks);
  }, [leaderboard, student.className]);

  const isFormValid = student.admissionNumber.trim() !== '' && student.studentName.trim() !== '';

  return (
    <div className={`min-h-screen bg-[#0a0f1e] text-slate-100 flex flex-col font-sans transition-all duration-700 ${status === TestStatus.RUNNING ? 'bg-[#050811]' : ''}`}>
      <header className={`sticky top-0 z-50 bg-[#0a0f1e]/80 backdrop-blur-xl border-b border-white/5 transition-opacity duration-500 ${status === TestStatus.RUNNING ? 'opacity-10 pointer-events-none' : 'opacity-100'}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Keyboard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">TypingMaster Pro</h1>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Academic Console</p>
            </div>
          </div>
          
          <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/5">
            <button onClick={() => setActiveTab('test')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'test' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white'}`}>Assessment</button>
            <button onClick={() => setActiveTab('leaderboard')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'leaderboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white'}`}>Leaderboard</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full relative">
        {countdown !== null && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center">
            <div className="text-9xl font-black text-white animate-pulse drop-shadow-[0_0_50px_rgba(79,70,229,0.5)]">{countdown === 0 ? "GO!" : countdown}</div>
          </div>
        )}

        {activeTab === 'test' ? (
          status === TestStatus.COMPLETED ? (
            <ResultView stats={stats} maxMarks={settings.maxMarks} feedback={feedback} onRestart={() => resetTest(false)} />
          ) : (
            <div className="space-y-12">
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 transition-all duration-700 ${status === TestStatus.RUNNING ? 'scale-95 opacity-80' : 'scale-100 opacity-100'}`}>
                <StatsCard label="Time Left" value={`${timeLeft}s`} icon={<Timer className="w-6 h-6" />} color="text-indigo-400" />
                <StatsCard label="Speed" value={stats.wpm} icon={<Zap className="w-6 h-6" />} color="text-amber-400" pulse={stats.wpm > settings.targetWpm} />
                <StatsCard label="Accuracy" value={`${stats.accuracy}%`} icon={<Target className="w-6 h-6" />} color={stats.accuracy > 90 ? "text-emerald-400" : "text-rose-400"} />
                <StatsCard label="Current Mark" value={stats.currentMarks} icon={<GraduationCap className="w-6 h-6" />} color="text-violet-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
                <div className="lg:col-span-2 space-y-8">
                  <div className={`bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-12 relative overflow-hidden group shadow-2xl transition-all duration-500 ${status === TestStatus.RUNNING ? 'ring-2 ring-indigo-500/20' : ''}`}>
                    {!isFormValid && (
                      <div className="absolute inset-0 z-20 bg-[#0a0f1e]/98 backdrop-blur-xl flex items-center justify-center p-8">
                        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-3xl ring-1 ring-white/5">
                          <h3 className="text-2xl font-black mb-8 flex items-center justify-center gap-3"><Users className="w-8 h-8 text-indigo-500" /> Student Identity</h3>
                          <div className="space-y-6">
                            <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 outline-none focus:ring-2 ring-indigo-500 transition-all font-mono" placeholder="Admission ID" value={student.admissionNumber} onChange={e => setStudent({...student, admissionNumber: e.target.value})} />
                            <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 outline-none focus:ring-2 ring-indigo-500 transition-all" placeholder="Full Student Name" value={student.studentName} onChange={e => setStudent({...student, studentName: e.target.value})} />
                            <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 outline-none focus:ring-2 ring-indigo-500 transition-all" value={student.className} onChange={e => setStudent({...student, className: e.target.value})}>
                              {['8', '9', '10', '11', '12'].map(c => <option key={c} value={c}>Grade {c}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="relative mb-8">
                      <div className={`flex items-center justify-between mb-10 pb-4 border-b border-white/5 transition-all duration-700 ${status === TestStatus.RUNNING ? 'opacity-30 blur-[2px]' : ''}`}>
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-500" />
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{settings.topic}</h3>
                        </div>
                        <div className="text-[11px] font-black text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-full ring-1 ring-indigo-500/20">TARGET: {settings.targetWpm} WPM</div>
                      </div>
                      
                      <div className="relative text-2xl md:text-3xl leading-[1.8] font-medium select-none font-mono whitespace-pre-wrap min-h-[350px] transition-all duration-300">
                        {/* Dynamic Alignment Layer */}
                        <div className="absolute inset-0 z-10 pointer-events-none">
                          {alignment.parts.map((p, i) => (
                            <span key={i} className={`
                                ${p.type === 'match' ? 'text-indigo-400' : ''}
                                ${p.type === 'mismatch' ? 'text-rose-500 bg-rose-500/10 underline decoration-4' : ''}
                                ${p.type === 'skip' ? 'text-rose-500/30 line-through' : ''}
                                ${p.type === 'extra' ? 'text-amber-500 underline' : ''}
                              `}>
                              {p.char}
                            </span>
                          ))}
                          {status === TestStatus.RUNNING && (
                            <span className="w-1.5 h-10 bg-indigo-500 inline-block animate-[pulse_0.6s_infinite] align-middle shadow-[0_0_20px_rgba(99,102,241,1)]" />
                          )}
                        </div>
                        
                        {/* Target Path Layer */}
                        <div className="text-slate-700 opacity-60">
                          {targetText.split("").map((char, i) => {
                            const isProcessed = alignment.parts.some(p => p.targetIdx === i);
                            return <span key={i} className={isProcessed ? 'invisible' : ''}>{char}</span>;
                          })}
                        </div>
                      </div>
                    </div>

                    <textarea ref={inputRef} className="absolute inset-0 w-full h-full opacity-0 cursor-default" value={userInput} onChange={handleInput} disabled={status === TestStatus.IDLE || countdown !== null} spellCheck={false} />
                    
                    {status === TestStatus.IDLE && (
                      <div className="mt-8">
                        <button onClick={startTest} className="w-full bg-indigo-600 hover:bg-indigo-500 py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 transition-all shadow-2xl shadow-indigo-600/40 hover:scale-[1.01]">
                          <Play className="w-8 h-8 fill-current" /> START ASSESSMENT
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className={`space-y-8 transition-opacity duration-500 ${status === TestStatus.RUNNING ? 'opacity-20' : 'opacity-100'}`}>
                  <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
                    <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                      <Settings className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-black text-white uppercase tracking-widest text-xs">Test Setup</h3>
                    </div>
                    
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Curriculum Topic</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-sm outline-none focus:ring-1 ring-indigo-500/50" value={settings.topic} onChange={e => {
                          const val = e.target.value;
                          setSettings({...settings, topic: val});
                          setTargetText(getStaticText(val));
                          resetTest(false);
                        }}>
                          {Object.keys(CS_STATIC_TEXTS).map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Speed (WPM)</label>
                        <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-xl outline-none font-mono" value={settings.targetWpm} onChange={e => setSettings({...settings, targetWpm: Math.max(1, Number(e.target.value))})} />
                      </div>

                      <div className="pt-6 border-t border-white/5 space-y-4">
                        <button onClick={() => resetTest(true)} disabled={isLoading} className="w-full flex items-center justify-center gap-3 bg-slate-800/80 hover:bg-slate-700 text-white py-5 rounded-2xl font-black text-sm transition-all">
                          {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                          GENERATE AI TOPIC
                        </button>
                        <button onClick={() => resetTest(false)} className="w-full text-slate-600 hover:text-indigo-400 text-[10px] font-black uppercase tracking-[0.4em] transition-colors py-2">Reset Session</button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 rounded-[2rem] p-8">
                    <div className="flex items-center gap-4 mb-4 text-indigo-400">
                      <Activity className="w-6 h-6" />
                      <span className="font-black uppercase tracking-widest text-xs">Live Efficiency</span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">WPM Ratio</span>
                        <span className="text-xl font-mono font-black text-indigo-400">{Math.round((stats.wpm / settings.targetWpm) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${Math.min(100, (stats.wpm / settings.targetWpm) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-amber-500/10 rounded-[2rem] ring-1 ring-amber-500/20"><Trophy className="w-12 h-12 text-amber-500" /></div>
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tighter">Student Grades</h2>
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.3em] mt-1">Class: {student.className}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={exportToCSV} className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-500/20 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3 transition-all">
                  <Download className="w-5 h-5" /> Export Grades
                </button>
                <button onClick={() => { if(confirm("Purge class database?")) { setLeaderboard([]); localStorage.removeItem('cs_typing_leaderboard'); }}} className="p-4 text-rose-500/40 hover:text-rose-500 transition-colors"><Trash2 className="w-7 h-7" /></button>
              </div>
            </div>

            <div className="bg-[#0f172a]/60 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl backdrop-blur-xl">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-500 text-[10px] uppercase font-black tracking-[0.3em]">
                    <th className="px-12 py-8">Rank</th>
                    <th className="px-8 py-8">Student Detail</th>
                    <th className="px-8 py-8 text-center">WPM</th>
                    <th className="px-8 py-8 text-center">Accuracy</th>
                    <th className="px-12 py-8 text-right">Final Mark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredLeaderboard.length > 0 ? filteredLeaderboard.map((e, i) => (
                    <tr key={e.id} className="hover:bg-indigo-500/[0.04] transition-colors group">
                      <td className="px-12 py-8">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg ${i === 0 ? 'bg-amber-500 text-amber-950 shadow-amber-500/20' : 'bg-slate-800 text-slate-400'}`}>{i + 1}</div>
                      </td>
                      <td className="px-8 py-8">
                        <div className="flex flex-col">
                          <span className="text-white font-black text-lg group-hover:text-indigo-400 transition-colors">{e.studentName}</span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-widest">{e.admissionNumber}</span>
                        </div>
                      </td>
                      <td className="px-8 py-8 text-center">
                        <div className="text-2xl font-black text-indigo-400">{e.wpm}</div>
                      </td>
                      <td className="px-8 py-8 text-center">
                        <span className={`px-4 py-2 rounded-full text-[10px] font-black ${e.accuracy > 90 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{e.accuracy}%</span>
                      </td>
                      <td className="px-12 py-8 text-right font-black text-4xl text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">{e.currentMarks}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-12 py-32 text-center opacity-10">
                        <Users className="w-32 h-32 mx-auto mb-6" />
                        <p className="font-black text-xl uppercase tracking-[0.5em]">No Class Data</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
      
      <footer className="py-10 border-t border-white/5 text-center overflow-hidden">
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.8em]">Assessment v3.6 // Deployment Stabilized</p>
      </footer>
    </div>
  );
};

export default App;
