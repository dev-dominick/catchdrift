"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TimelineRow = {
  interval_start: string;
  spend: string;
  paid_clicks: string;
  sessions: string;
  internal_submissions: string;
  attributed_conversions: string;
  revenue: string;
};

type TimelineMarker = {
  timestamp: string;
  label: string;
};

export function EvidenceTimeline({ rows, markers = [] }: { rows: TimelineRow[]; markers?: TimelineMarker[] }) {
  const data = rows.map((row) => {
    const paidClicks = Number(row.paid_clicks);
    const sessions = Number(row.sessions);
    const submissions = Number(row.internal_submissions);
    const attributed = Number(row.attributed_conversions);

    return {
      intervalStart: row.interval_start,
      time: new Date(row.interval_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      spend: Number(row.spend),
      revenue: Number(row.revenue),
      clickLoss: paidClicks > 0 ? ((paidClicks - sessions) / paidClicks) * 100 : 0,
      attributionRate: submissions > 0 ? (attributed / submissions) * 100 : 0,
    };
  });

  return (
    <div className="h-70 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={24} />
          <YAxis yAxisId="money" />
          <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} />
          <Tooltip />
          <Legend />
          {markers.map((marker) => {
            const x = new Date(marker.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <ReferenceLine
                key={`${marker.label}-${marker.timestamp}`}
                x={x}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{ value: marker.label, position: "insideTop", fill: "#334155", fontSize: 11 }}
              />
            );
          })}
          <Line yAxisId="money" type="monotone" dataKey="spend" stroke="#334155" dot={false} />
          <Line yAxisId="money" type="monotone" dataKey="revenue" stroke="#15803d" dot={false} />
          <Line yAxisId="rate" type="monotone" dataKey="clickLoss" stroke="#be123c" dot={false} />
          <Line yAxisId="rate" type="monotone" dataKey="attributionRate" stroke="#0369a1" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
