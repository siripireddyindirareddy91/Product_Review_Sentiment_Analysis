import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colors, Empty, number, percent, sentiments } from "./ui";
import type { Metrics, Trend } from "../types";

const tooltip = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "10px",
  fontSize: 12,
};
const tick = { fill: "var(--muted)", fontSize: 11 };

export function TrendChart({
  data,
  metric = "share",
}: {
  data: Trend[];
  metric?: "share" | "rating" | "complaints";
}) {
  if (!data.length)
    return (
      <Empty
        title="Review dates unavailable"
        text="Import a review date column to see sentiment over time."
      />
    );
  const chartData = data.map((row) => ({
    ...row,
    label:
      row.period.length === 7
        ? new Date(`${row.period}-01T00:00:00Z`).toLocaleDateString(undefined, {
            month: "short",
            timeZone: "UTC",
          })
        : row.period.slice(5),
  }));
  const axes = (
    <>
      <CartesianGrid
        vertical={false}
        stroke="var(--border)"
        strokeDasharray="4 5"
      />
      <XAxis
        dataKey="label"
        tick={tick}
        tickLine={false}
        axisLine={false}
        minTickGap={22}
      />
      <YAxis
        tick={tick}
        tickLine={false}
        axisLine={false}
        width={37}
        domain={
          metric === "share"
            ? [0, 100]
            : metric === "rating"
              ? [0, 5]
              : [0, "auto"]
        }
        tickFormatter={(value) =>
          metric === "share" ? `${value}%` : String(value)
        }
      />
      <Tooltip
        contentStyle={tooltip}
        labelFormatter={(_, items) => items?.[0]?.payload?.period || ""}
        formatter={(value: number) =>
          metric === "share" ? percent(value) : value
        }
      />
    </>
  );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        {metric === "share" ? (
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 10, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={colors.positive}
                  stopOpacity={0.27}
                />
                <stop
                  offset="100%"
                  stopColor={colors.positive}
                  stopOpacity={0.01}
                />
              </linearGradient>
              <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={colors.negative}
                  stopOpacity={0.17}
                />
                <stop
                  offset="100%"
                  stopColor={colors.negative}
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>
            {axes}
            <Area
              type="monotone"
              dataKey="positive_pct"
              name="Positive"
              stroke={colors.positive}
              strokeWidth={2.5}
              fill="url(#positiveGradient)"
            />
            <Area
              type="monotone"
              dataKey="negative_pct"
              name="Negative"
              stroke={colors.negative}
              strokeWidth={2}
              fill="url(#negativeGradient)"
            />
            <Area
              type="monotone"
              dataKey="neutral_pct"
              name="Neutral"
              stroke={colors.neutral}
              strokeWidth={1.6}
              fill="none"
              strokeDasharray="4 4"
            />
          </AreaChart>
        ) : (
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 10, bottom: 0, left: 0 }}
          >
            {axes}
            <Line
              type="monotone"
              dataKey={metric === "rating" ? "rating" : "negative"}
              name={metric === "rating" ? "Average rating" : "Negative reviews"}
              stroke={metric === "rating" ? colors.violet : colors.negative}
              strokeWidth={2.5}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function Distribution({ metrics }: { metrics: Metrics }) {
  if (!metrics.total) return <Empty />;
  const data = sentiments.map((label) => ({
    name: label,
    value: metrics[label],
    color: colors[label],
    share: metrics[`${label}_pct`],
  }));
  return (
    <div className="distribution">
      <div className="donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="69%"
              outerRadius="89%"
              paddingAngle={3}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-label">
          <strong>{number(metrics.total)}</strong>
          <span>Total reviews</span>
        </div>
      </div>
      <div className="chart-legend">
        {data.map((item) => (
          <div key={item.name}>
            <span>
              <i style={{ background: item.color }} />
              {item.name}
            </span>
            <strong>{percent(item.share)}</strong>
            <small>{number(item.value)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
