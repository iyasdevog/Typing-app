
import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  pulse?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, color, pulse }) => {
  return (
    <div className={`bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex items-center space-x-6 backdrop-blur-sm shadow-xl transition-all duration-300 ${pulse ? 'ring-2 ring-indigo-500/30' : 'hover:border-slate-700'}`}>
      <div className={`p-4 rounded-2xl ${color} bg-opacity-10 border border-white/5 shadow-inner transition-transform duration-300 ${pulse ? 'scale-110' : ''}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">{label}</p>
        <p className={`text-3xl font-black text-white leading-none mt-2 tabular-nums tracking-tighter transition-all ${pulse ? 'text-indigo-400' : ''}`}>{value}</p>
      </div>
    </div>
  );
};
