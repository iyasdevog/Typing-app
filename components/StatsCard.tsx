
import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, color }) => {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center space-x-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-20`}>
        {icon}
      </div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white leading-none mt-1">{value}</p>
      </div>
    </div>
  );
};
