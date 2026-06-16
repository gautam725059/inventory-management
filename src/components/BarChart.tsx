"use client";

export interface BarSeries {
  label: string;
  color: string; // tailwind bg-* class
}

export interface BarGroup {
  label: string; // x-axis label
  values: number[]; // one per series
}

interface Props {
  groups: BarGroup[];
  series: BarSeries[];
  format?: (n: number) => string;
  height?: number; // px
}

/** A tiny dependency-free grouped vertical bar chart (CSS heights). */
export default function BarChart({ groups, series, format, height = 180 }: Props) {
  const max = Math.max(
    1,
    ...groups.flatMap((g) => g.values)
  );
  const fmt = format ?? ((n: number) => String(n));

  if (groups.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        No data for this period.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ height }}>
        {groups.map((g) => (
          <div key={g.label} className="flex h-full min-w-14 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              {g.values.map((v, i) => (
                <div
                  key={i}
                  title={`${series[i].label}: ${fmt(v)}`}
                  className={`w-4 rounded-t ${series[i].color} transition-all`}
                  style={{ height: `${(v / max) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 truncate text-center text-xs text-slate-500">
              {g.label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-4">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`h-3 w-3 rounded ${s.color}`} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
