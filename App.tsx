
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Timer, Zap, Target, Settings, GraduationCap, RefreshCw, Users, Trophy, ShieldCheck, Trash2, Download, Play, Keyboard, Activity, CheckCircle2, Focus, FileText, Type } from 'lucide-react';
import { TestStatus, TypingStats, TestSettings, StudentInfo, LeaderboardEntry } from './types';
import { generateTypingText, getPerformanceFeedback, getStaticText, CS_STATIC_TEXTS } from './services/geminiService';
import { StatsCard } from './components/StatsCard';
import { ResultView } from './components/ResultView';

// Optimized Audio Engine
const AudioEngine = (() => {
  let ctx: AudioContext | null = null;
  const init = () => { 
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn("Audio Context failed", e);
      }
    }
  };
  
  const play = (freq: number, type: OscillatorType, volume: number, duration: number) => {
    try {
      init();
      if (!ctx || ctx.state === 'closed') return;
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
    } catch (e) {}
  };

  return {
    init,
    key: () => play(440, 'sine', 0.04, 0.05),
    error: () => play(180, 'square', 0.08, 0.1),
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
  const [hasConfirmedIdentity, setHasConfirmedIdentity] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  
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
        const lookAhead = 12;
        let found = false;
        for (let s = 1; s <= lookAhead; s++) {
          if (targetText[tIdx + s] === uChar) {
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
    AudioEngine.init();
    setCountdown(3);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setStatus(TestStatus.RUNNING);
      setCountdown(null);
      setTimeout(() => inputRef.current?.focus(), 150);
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
    if (status === TestStatus.RUNNING && timeLeft > 0 && isFocused) {
      timerRef.current = window.setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && status === TestStatus.RUNNING) {
      endTest();
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [status, timeLeft, endTest, isFocused]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (status !== TestStatus.RUNNING || !isFocused) return;
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
    a.href = url; a.download = `typing_report_grade_${student.className}.csv`;
    a.click();
  };

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter(e => e.className === student.className).sort((a, b) => b.currentMarks - a.currentMarks);
  }, [leaderboard, student.className]);

  const isFormValid = student.admissionNumber.trim().length > 1 && student.studentName.trim().length > 1;

  return (
    <div className={`min-h-screen bg-[#0a0f1e] text-slate-100 flex flex-col font-sans transition-all duration-700 ${status === TestStatus.RUNNING ? 'bg-[#050811]' : ''}`}>
      <header className={`sticky top-0 z-50 bg-[#0a0f1e]/80 backdrop-blur-xl border-b border-white/5 transition-opacity duration-500 ${status === TestStatus.RUNNING ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Keyboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">TypingMaster Pro</h1>
              <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-[0.2em]">CS Assessment Platform</p>
            </div>
          </div>
          
          <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
            <button onClick={() => setActiveTab('test')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'test' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white'}`}>Assessment</button>
            <button onClick={() => setActiveTab('leaderboard')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'leaderboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white'}`}>Leaderboard</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full relative">
        {countdown !== null && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center">
            <div className="text-9xl font-black text-white animate-pulse drop-shadow-[0_0_50px_rgba(79,70,229,0.5)]">{countdown === 0 ? "GO!" : countdown}</div>
          </div>
        )}

        {activeTab === 'test' ? (
          status === TestStatus.COMPLETED ? (
            <ResultView stats={stats} maxMarks={settings.maxMarks} feedback={feedback} onRestart={() => resetTest(false)} />
          ) : (
            <div className="space-y-8">
              <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-700 ${status === TestStatus.RUNNING ? 'scale-95 opacity-80' : 'scale-100 opacity-100'}`}>
                <StatsCard label="Remaining" value={`${timeLeft}s`} icon={<Timer className="w-5 h-5" />} color="text-indigo-400" />
                <StatsCard label="Current Speed" value={stats.wpm} icon={<Zap className="w-5 h-5" />} color="text-amber-400" pulse={status === TestStatus.RUNNING && stats.wpm > settings.targetWpm} />
                <StatsCard label="Accuracy" value={`${stats.accuracy}%`} icon={<Target className="w-5 h-5" />} color={stats.accuracy > 90 ? "text-emerald-400" : "text-rose-400"} />
                <StatsCard label="Grade Points" value={stats.currentMarks} icon={<GraduationCap className="w-5 h-5" />} color="text-violet-400" />
              </div>

              <div className="relative">
                {!hasConfirmedIdentity && (
                  <div className="absolute inset-0 z-50 bg-[#0a0f1e] flex items-center justify-center p-8 transition-opacity duration-300 rounded-[2.5rem]">
                    <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-3xl ring-1 ring-white/5 space-y-6">
                      <div className="text-center space-y-2">
                        <Users className="w-10 h-10 text-indigo-500 mx-auto" />
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">Identity Verification</h3>
                      </div>
                      <div className="space-y-3">
                        <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-indigo-500 transition-all font-mono placeholder:text-slate-700" placeholder="Student ID (Admission No.)" value={student.admissionNumber} onChange={e => setStudent({...student, admissionNumber: e.target.value})} />
                        <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-indigo-500 transition-all placeholder:text-slate-700" placeholder="Full Student Name" value={student.studentName} onChange={e => setStudent({...student, studentName: e.target.value})} />
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-indigo-500 transition-all" value={student.className} onChange={e => setStudent({...student, className: e.target.value})}>
                          {['8', '9', '10', '11', '12'].map(c => <option key={c} value={c}>Section: Grade {c}</option>)}
                        </select>
                      </div>
                      <button 
                        disabled={!isFormValid}
                        onClick={() => setHasConfirmedIdentity(true)}
                        className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${isFormValid ? 'bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-600/20 active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                      >
                        <CheckCircle2 className="w-4 h-4" /> VERIFY IDENTITY
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
                  {/* LEFT PANE: SOURCE TEXT */}
                  <div className={`bg-slate-900/40 border border-slate-800 rounded-[2rem] p-8 flex flex-col transition-all duration-500 ${status === TestStatus.RUNNING ? 'ring-1 ring-indigo-500/20' : ''}`}>
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3 text-indigo-400">
                        <FileText className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Reference Material</span>
                      </div>
                      <div className="text-[10px] font-black text-slate-500 uppercase">Topic: {settings.topic}</div>
                    </div>
                    <div className="relative flex-1 text-xl md:text-2xl leading-[1.8] font-medium select-none font-mono whitespace-pre-wrap text-slate-500 overflow-y-auto max-h-[400px] scrollbar-hide">
                       {targetText.split("").map((char, i) => {
                         const isPassed = i < alignment.currentTargetIdx;
                         const isCurrent = i === alignment.currentTargetIdx;
                         return (
                           <span key={i} className={`transition-colors ${isPassed ? 'text-slate-700' : isCurrent ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-300'}`}>
                             {char}
                           </span>
                         );
                       })}
                    </div>
                  </div>

                  {/* RIGHT PANE: INPUT TERMINAL */}
                  <div className={`bg-slate-900/40 border border-slate-800 rounded-[2rem] p-8 flex flex-col relative transition-all duration-500 ${status === TestStatus.RUNNING ? 'ring-1 ring-emerald-500/20' : ''}`}>
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3 text-emerald-400">
                        <Type className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Digital Input Terminal</span>
                      </div>
                      {status === TestStatus.RUNNING && (
                        <div className="flex items-center gap-2">
                           <div className={`w-2 h-2 rounded-full ${isFocused ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                           <span className="text-[9px] font-black text-slate-500 uppercase">{isFocused ? 'Terminal Active' : 'Focus Lost'}</span>
                        </div>
                      )}
                    </div>

                    <div className="relative flex-1 text-xl md:text-2xl leading-[1.8] font-medium select-none font-mono whitespace-pre-wrap overflow-y-auto max-h-[400px] scrollbar-hide">
                       {/* Focus Guard Overlay */}
                       {status === TestStatus.RUNNING && !isFocused && (
                        <div onClick={() => inputRef.current?.focus()} className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center cursor-pointer rounded-xl">
                          <div className="text-center space-y-3">
                             <Focus className="w-10 h-10 text-indigo-400 mx-auto animate-pulse" />
                             <p className="text-xs font-black uppercase tracking-widest text-white">Click to Resume Input</p>
                          </div>
                        </div>
                       )}

                       {/* The Actual Colored Input Display */}
                       <div className="z-10 relative">
                        {alignment.parts.map((p, i) => (
                          <span key={i} className={`
                              ${p.type === 'match' ? 'text-emerald-400' : ''}
                              ${p.type === 'mismatch' ? 'text-rose-500 bg-rose-500/10 underline decoration-2 underline-offset-4' : ''}
                              ${p.type === 'skip' ? 'text-rose-500/30 line-through' : ''}
                              ${p.type === 'extra' ? 'text-amber-500' : ''}
                            `}>
                            {p.char}
                          </span>
                        ))}
                        {status === TestStatus.RUNNING && isFocused && (
                          <span className="w-2 h-8 bg-emerald-500 inline-block animate-[pulse_0.6s_infinite] align-middle shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                        )}
                       </div>
                    </div>

                    <textarea 
                      ref={inputRef} 
                      className={`absolute inset-0 w-full h-full opacity-0 outline-none resize-none overflow-hidden ${status === TestStatus.RUNNING ? 'z-40 pointer-events-auto' : 'z-0 pointer-events-none'}`}
                      value={userInput} 
                      onChange={handleInput} 
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      disabled={status !== TestStatus.RUNNING} 
                      spellCheck={false} 
                      autoFocus={false}
                    />

                    {status === TestStatus.IDLE && hasConfirmedIdentity && (
                      <div className="absolute inset-0 z-30 flex items-center justify-center p-12 bg-slate-900/20 backdrop-blur-[2px]">
                        <button 
                          onClick={startTest} 
                          className="w-full max-w-sm bg-indigo-600 hover:bg-indigo-500 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-4 transition-all shadow-2xl shadow-indigo-600/40 hover:scale-[1.02] active:scale-95 group"
                        >
                          <Play className="w-6 h-6 fill-current" /> 
                          START ASSESSMENT
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* FOOTER ACTIONS - Only Visible when IDLE */}
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-500 ${status === TestStatus.RUNNING ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                <div className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 flex items-center justify-between">
                   <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Curriculum Module</p>
                      <select className="bg-transparent text-white font-black text-sm outline-none focus:text-indigo-400 cursor-pointer" value={settings.topic} onChange={e => {
                        const val = e.target.value;
                        setSettings({...settings, topic: val});
                        setTargetText(getStaticText(val));
                        resetTest(false);
                      }}>
                        {Object.keys(CS_STATIC_TEXTS).map(t => <option key={t} className="bg-slate-900">{t}</option>)}
                      </select>
                   </div>
                   <button onClick={() => resetTest(true)} disabled={isLoading} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-white/5">
                      {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-indigo-400" />}
                   </button>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 flex items-center justify-between">
                   <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assessment Criteria</p>
                      <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Goal:</span>
                            <input type="number" className="bg-transparent text-white font-mono font-black text-sm w-12 outline-none border-b border-white/10 focus:border-indigo-500" value={settings.targetWpm} onChange={e => setSettings({...settings, targetWpm: Math.max(1, Number(e.target.value))})} />
                            <span className="text-[9px] text-slate-600 font-bold">WPM</span>
                         </div>
                         <div className="w-px h-4 bg-white/5" />
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Grade Max:</span>
                            <input type="number" className="bg-transparent text-white font-mono font-black text-sm w-12 outline-none border-b border-white/10 focus:border-indigo-500" value={settings.maxMarks} onChange={e => setSettings({...settings, maxMarks: Math.max(1, Number(e.target.value))})} />
                         </div>
                      </div>
                   </div>
                   <button onClick={() => setHasConfirmedIdentity(false)} className="text-[9px] font-black text-rose-500/50 hover:text-rose-500 uppercase tracking-widest transition-colors">Clear Identity</button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* LEADERBOARD TAB */
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20"><Trophy className="w-7 h-7 text-amber-500" /></div>
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tighter">Academic Gradebook</h2>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-0.5">Records for Section: Grade {student.className}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={exportToCSV} className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-500/20 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95">
                  <Download className="w-4 h-4" /> EXPORT DATA
                </button>
                <button onClick={() => { if(confirm("Confirm deletion of Section Grades?")) { setLeaderboard([]); localStorage.removeItem('cs_typing_leaderboard'); }}} className="p-3 text-rose-500/40 hover:text-rose-500 transition-colors bg-rose-500/5 rounded-xl border border-rose-500/10"><Trash2 className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="bg-[#0f172a]/60 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-500 text-[9px] uppercase font-black tracking-widest">
                      <th className="px-10 py-6 w-20">Rnk</th>
                      <th className="px-8 py-6">Candidate</th>
                      <th className="px-8 py-6 text-center">Net WPM</th>
                      <th className="px-8 py-6 text-center">Accuracy</th>
                      <th className="px-10 py-6 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredLeaderboard.length > 0 ? filteredLeaderboard.map((e, i) => (
                      <tr key={e.id} className="hover:bg-indigo-500/[0.04] transition-colors group">
                        <td className="px-10 py-6">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shadow-lg ${i === 0 ? 'bg-amber-500 text-amber-950 shadow-amber-500/20' : 'bg-slate-800 text-slate-400'}`}>{i + 1}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-white font-black text-base group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{e.studentName}</span>
                            <span className="text-[9px] text-slate-500 font-mono tracking-widest">{e.admissionNumber}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="text-xl font-black text-indigo-400">{e.wpm}</div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black ${e.accuracy > 90 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{e.accuracy}%</span>
                        </td>
                        <td className="px-10 py-6 text-right font-black text-3xl text-white tracking-tighter">{e.currentMarks}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-10 py-32 text-center opacity-10">
                          <Users className="w-24 h-24 mx-auto mb-4" />
                          <p className="font-black text-sm uppercase tracking-widest">No Candidate Data</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <footer className={`py-8 border-t border-white/5 text-center transition-opacity duration-500 overflow-hidden ${status === TestStatus.RUNNING ? 'opacity-0' : 'opacity-100'}`}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
           <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.5em]">Academic Assessment v3.9 // Side-Pane Logic Stable</p>
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Encrypted Local Database</span>
             </div>
             <div className="w-px h-3 bg-white/5" />
             <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Teacher Controlled Environment</span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
