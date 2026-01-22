
import React from 'react';
import { TypingStats } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RotateCcw, Share2, Award, Target, Zap, AlertCircle, GraduationCap } from 'lucide-react';

interface ResultViewProps {
  stats: TypingStats;
  maxMarks: number;
  feedback: string;
  onRestart: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ stats, maxMarks, feedback, onRestart }) => {
  const data = [
    { name: 'Start', wpm: 0 },
    { name: '1/3', wpm: stats.wpm * 0.8 },
    { name: '2/3', wpm: stats.wpm * 1.1 },
    { name: 'End', wpm: stats.wpm },
  ];

  const getGrade = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 90) return { label: 'Distinction (A+)', color: 'text-emerald-400' };
    if (percentage >= 80) return { label: 'Excellent (A)', color: 'text-blue-400' };
    if (percentage >= 70) return { label: 'Very Good (B)', color: 'text-indigo-400' };
    if (percentage >= 60) return { label: 'Good (C)', color: 'text-yellow-400' };
    if (percentage >= 50) return { label: 'Pass (D)', color: 'text-orange-400' };
    return { label: 'Needs Practice (E)', color: 'text-rose-400' };
  };

  const grade = getGrade(stats.currentMarks, maxMarks);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white">Assessment Results</h2>
        <p className="text-slate-400 mt-2">Evaluation complete for Computer Science typing module.</p>
      </div>

      <div className="bg-slate-900 border-2 border-indigo-500/30 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl shadow-indigo-500/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
            <GraduationCap className="w-12 h-12 text-indigo-500/20" />
        </div>
        <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-2">Final Score</p>
        <div className="flex items-baseline gap-2">
            <span className="text-7xl font-black text-white">{stats.currentMarks}</span>
            <span className="text-2xl text-slate-500 font-bold">/ {maxMarks}</span>
        </div>
        <p className={`mt-4 text-xl font-bold ${grade.color}`}>{grade.label}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <Zap className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
          <p className="text-3xl font-black text-white">{stats.wpm}</p>
          <p className="text-slate-400 text-xs uppercase font-semibold">WPM</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <Target className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
          <p className="text-3xl font-black text-white">{stats.accuracy}%</p>
          <p className="text-slate-400 text-xs uppercase font-semibold">Accuracy</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-3xl font-black text-white">{stats.errors}</p>
          <p className="text-slate-400 text-xs uppercase font-semibold">Mistakes</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <Award className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
          <p className="text-3xl font-black text-white">{stats.totalChars}</p>
          <p className="text-slate-400 text-xs uppercase font-semibold">Chars</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white mb-6">Educator Feedback</h3>
        <div className="flex items-start gap-4 bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-xl">
          <div className="p-3 bg-indigo-500 rounded-full">
            <Award className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-indigo-100 italic leading-relaxed">"{feedback}"</p>
            <p className="text-indigo-300 text-sm mt-2 font-medium">— Gemini AI Teacher Evaluation</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 h-64">
        <h3 className="text-lg font-bold text-white mb-4">Speed Trends</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" hide />
            <YAxis stroke="#94a3b8" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#818cf8' }}
            />
            <Line type="monotone" dataKey="wpm" stroke="#818cf8" strokeWidth={3} dot={{ fill: '#818cf8' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center gap-4 pt-4">
        <button 
          onClick={onRestart}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-bold transition-all transform hover:scale-105 shadow-xl shadow-indigo-600/20"
        >
          <RotateCcw className="w-5 h-5" />
          Take Another Test
        </button>
        <button className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-8 py-4 rounded-2xl font-bold transition-all">
          <Share2 className="w-5 h-5" />
          Print Result
        </button>
      </div>
    </div>
  );
};
