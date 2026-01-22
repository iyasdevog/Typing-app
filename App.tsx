
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Timer, Zap, Target, BookOpen, Settings, Info, Award, GraduationCap, RefreshCw, Users, Trophy, UserCheck, ShieldCheck, Trash2 } from 'lucide-react';
import { TestStatus, TypingStats, TestSettings, StudentInfo, LeaderboardEntry } from './types';
import { generateTypingText, getPerformanceFeedback, getStaticText, CS_STATIC_TEXTS } from './services/geminiService';
import { StatsCard } from './components/StatsCard';
import { ResultView } from './components/ResultView';

// Fix: Ensure the App component is exported as default to match the import in index.tsx
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'test' | 'leaderboard'>('test');
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  
  const [settings, setSettings] = useState<TestSettings>({
    duration: 60,
    difficulty: 'Medium',
    topic: 'Official Assessment: Hardware',
    maxMarks: 100
  });
  
  const [student, setStudent] = useState<StudentInfo>(() => {
    const saved = localStorage.getItem('cs_student_info');
    return saved ? JSON.parse(saved) : { admissionNumber: '', studentName: '', className: 'Class 10-A' };
  });

  const [targetText, setTargetText] = useState(() => getStaticText('Official Assessment: Hardware'));
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

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('cs_student_info', JSON.stringify(student));
  }, [student]);

  const calculateMarks = useCallback((wpm: number, accuracy: number, maxMarks: number, totalChars: number) => {
    if (totalChars === 0) return 0;
    
    // 70% Accuracy weight (Penalized exponentially)
    const accWeight = 0.7;
    const accFactor = Math.pow(accuracy / 100, 2);
    const accPoints = maxMarks * accWeight * accFactor;
    
    // 30% Speed weight 
    // Target WPM updated to 60 (Middle of average ~40 and proficient ~80)
    const speedWeight = 0.3;
    const targetWPM = 60; 
    const speedFactor = Math.min(wpm / targetWPM, 1.5); 
    const speedPoints = maxMarks * speedWeight * speedFactor;
    
    const finalScore = Math.round(accPoints + speedPoints);
    return Math.min(finalScore, maxMarks);
  }, []);

  const resetTest = useCallback((useAi: boolean = false) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setUserInput("");
    setTimeLeft(settings.duration);
    const initialStats = { wpm: 0, accuracy: 100, errors: 0, totalChars: 0, timeElapsed: 0, currentMarks: 0 };
    setStats(initialStats);
    statsRef.current = initialStats;
    setStatus(TestStatus.IDLE);
    
    if (useAi) {
      setIsLoading(true);
      generateTypingText(settings.topic, settings.difficulty).then(text => {
        setTargetText(text);
        setIsLoading(false);
      });
    } else {
      setTargetText(getStaticText(settings.topic));
    }
  }, [settings.topic, settings.difficulty, settings.duration]);

  const endTest = useCallback(async (finalStatsOverride?: TypingStats) => {
    const finalStats = finalStatsOverride || statsRef.current;
    
    setStatus(TestStatus.COMPLETED);
    if (timerRef.current) window.clearInterval(timerRef.current);
    
    const finalMarks = calculateMarks(finalStats.wpm, finalStats.accuracy, settings.maxMarks, finalStats.totalChars);
    
    const entry: LeaderboardEntry = {
      ...student,
      ...finalStats,
      currentMarks: finalMarks,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      topic: settings.topic
    };

    setLeaderboard(prev => {
      const next = [entry, ...prev];
      localStorage.setItem('cs_typing_leaderboard', JSON.stringify(next));
      return next;
    });

    getPerformanceFeedback({
      wpm: finalStats.wpm,
      accuracy: finalStats.accuracy,
      topic: settings.topic
    }).then(setFeedback);
  }, [student, settings.topic, settings.maxMarks, calculateMarks]);

  useEffect(() => {
    if (status === TestStatus.RUNNING && timeLeft > 0) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && status === TestStatus.RUNNING) {
      endTest();
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [status, timeLeft, endTest]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (status === TestStatus.COMPLETED || isLoading) return;
    if (!student.admissionNumber.trim() || !student.studentName.trim()) {
      alert("Registration Required: Please enter your Admission Number and Name first.");
      return;
    }
    
    if (status === TestStatus.IDLE) setStatus(TestStatus.RUNNING);

    const val = e.target.value;
    setUserInput(val);

    const totalTyped = val.length;
    let errors = 0;
    for (let i = 0; i < totalTyped; i++) {
      if (val[i] !== targetText[i]) errors++;
    }

    const accuracy = totalTyped > 0 ? Math.max(0, Math.round(((totalTyped - errors) / totalTyped) * 100)) : 100;
    
    const timeElapsedSecs = settings.duration - timeLeft;
    const effectiveTimeSecs = Math.max(0.5, timeElapsedSecs); 
    const wpm = Math.round(((totalTyped / 5) / (effectiveTimeSecs / 60)));
    
    const currentMarks = calculateMarks(wpm, accuracy, settings.maxMarks, totalTyped);

    const updatedStats = {
      wpm, accuracy, errors, totalChars: totalTyped,
      timeElapsed: Math.round(effectiveTimeSecs),
      currentMarks
    };

    setStats(updatedStats);
    statsRef.current = updatedStats;

    if (val.length >= targetText.length) {
      endTest(updatedStats);
    }
  };

  const clearLeaderboard = () => {
    if (confirm("Are you sure you want to clear ALL classroom records?")) {
      setLeaderboard([]);
      localStorage.removeItem('cs_typing_leaderboard');
    }
  };

  const deleteEntry = (id: string) => {
    if (confirm("Delete this student record?")) {
      setLeaderboard(prev => {
        const next = prev.filter(e => e.id !== id);
        localStorage.setItem('cs_typing_leaderboard', JSON.stringify(next));
        return next;
      });
    }
  };

  const filteredLeaderboard = useMemo(() => {
    return leaderboard
      .filter(entry => entry.className === student.className)
      .sort((a, b) => b.currentMarks - a.currentMarks);
  }, [leaderboard, student.className]);

  const isFormValid = student.admissionNumber.trim() !== '' && student.studentName.trim() !== '';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg">CS</div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight">TypingMaster Pro</h1>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Classroom Assessment</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-800/50 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setActiveTab('test')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'test' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <UserCheck className="w-4 h-4" /> Assessment
              </button>
              <button 
                onClick={() => setActiveTab('leaderboard')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'leaderboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Trophy className="w-4 h-4" /> Leaderboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        {activeTab === 'test' ? (
          status === TestStatus.COMPLETED ? (
            <ResultView stats={stats} maxMarks={settings.maxMarks} feedback={feedback} onRestart={() => resetTest(false)} />
          ) : (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatsCard label="Time" value={`${timeLeft}s`} icon={<Timer className="w-6 h-6" />} color="text-indigo-400" />
                <StatsCard label="Speed" value={stats.wpm} icon={<Zap className="w-6 h-6" />} color="text-yellow-400" />
                <StatsCard label="Accuracy" value={`${stats.accuracy}%`} icon={<Target className="w-6 h-6" />} color="text-emerald-400" />
                <StatsCard label="Score" value={stats.currentMarks} icon={<GraduationCap className="w-6 h-6" />} color="text-blue-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
                    {!isFormValid && (
                      <div className="absolute inset-0 z-20 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-8">
                        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
                          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Users className="w-6 h-6 text-indigo-400" /> Registration</h3>
                          <div className="space-y-4">
                            <input 
                              type="text" placeholder="Admission Number"
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none"
                              value={student.admissionNumber}
                              onChange={e => setStudent({...student, admissionNumber: e.target.value})}
                            />
                            <input 
                              type="text" placeholder="Full Name"
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none"
                              value={student.studentName}
                              onChange={e => setStudent({...student, studentName: e.target.value})}
                            />
                            <select 
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none"
                              value={student.className}
                              onChange={e => setStudent({...student, className: e.target.value})}
                            >
                              <option>Class 10-A</option>
                              <option>Class 10-B</option>
                              <option>Class 11-CS</option>
                              <option>Class 12-CS</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" /> {settings.topic}
                        </h3>
                      </div>
                      <div className="relative text-xl md:text-2xl leading-relaxed font-medium select-none text-slate-400 whitespace-pre-wrap min-h-[200px]">
                        <div className="absolute inset-0 text-white z-10 pointer-events-none">
                          {userInput.split("").map((char, i) => (
                            <span key={i} className={char === targetText[i] ? "text-emerald-400" : "bg-rose-500/50 text-white"}>
                              {char}
                            </span>
                          ))}
                        </div>
                        {targetText}
                      </div>
                    </div>

                    <textarea
                      ref={inputRef}
                      className="w-full h-0 opacity-0 absolute"
                      value={userInput}
                      onChange={handleInput}
                      autoFocus
                    />
                    
                    <div 
                      onClick={() => inputRef.current?.focus()}
                      className="w-full bg-slate-800/50 border-2 border-slate-700 rounded-2xl p-6 cursor-text hover:border-indigo-500/50 transition-colors"
                    >
                      <p className="text-slate-500 italic text-sm">
                        {status === TestStatus.IDLE ? "Start typing to begin assessment..." : "Keep typing..."}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-12 text-slate-500 px-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest">Mistakes</p>
                      <p className={`text-xl font-mono ${stats.errors > 0 ? 'text-rose-500' : 'text-slate-700'}`}>{stats.errors}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest">Target Class Speed</p>
                      <p className="text-xl font-mono text-indigo-400">60 <span className="text-xs opacity-50">WPM</span></p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <Settings className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-bold text-white">Config</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <select 
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none"
                        value={settings.topic}
                        onChange={e => setSettings({...settings, topic: e.target.value})}
                      >
                        {Object.keys(CS_STATIC_TEXTS).map(t => <option key={t}>{t}</option>)}
                      </select>

                      <button 
                        onClick={() => resetTest(true)}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl font-bold transition-all"
                      >
                        {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                        Generate AI Text
                      </button>

                      <button 
                        onClick={() => resetTest(false)}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 py-4 rounded-2xl font-bold transition-all"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <Trophy className="w-8 h-8 text-yellow-500" /> Records
              </h2>
              <button onClick={clearLeaderboard} className="text-rose-400 text-sm font-bold flex items-center gap-2 hover:text-rose-300 transition-colors">
                <Trash2 className="w-4 h-4" /> Clear All Data
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/50 border-b border-slate-800 text-slate-400 text-xs uppercase font-bold">
                    <th className="px-6 py-4">Rank</th>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">WPM</th>
                    <th className="px-6 py-4">ACC</th>
                    <th className="px-6 py-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {filteredLeaderboard.length > 0 ? filteredLeaderboard.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-bold">{index + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-white font-bold">{entry.studentName}</span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-tighter">{entry.admissionNumber}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-indigo-400 font-mono">{entry.wpm}</td>
                      <td className="px-6 py-4 text-emerald-400 font-mono">{entry.accuracy}%</td>
                      <td className="px-6 py-4 text-right font-black text-white">{entry.currentMarks}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        No records found for this class.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
