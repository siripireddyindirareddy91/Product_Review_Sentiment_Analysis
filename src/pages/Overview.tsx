import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleCheck,
  Download,
  MessageSquareText,
  Minus,
  Star,
  TriangleAlert,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useData, useWorkspace } from "../context";
import { Distribution, TrendChart } from "../components/charts";
import {
  Busy,
  colors,
  Empty,
  Failure,
  Heading,
  number,
  Panel,
  percent,
  showDate,
  Tag,
} from "../components/ui";
import type { Overview as OverviewData } from "../types";

export default function Overview() {
  const { dataset, threshold } = useWorkspace();
  const query = useData<OverviewData>("/analytics/overview", { threshold });
  const data = query.data;
  const metrics = data?.metrics;
  return (
    <>
      <Heading
        title="Executive overview"
        description="Monitor customer sentiment, product performance, and emerging complaints."
        actions={
          <Link className="button ghost" to="/reports">
            <Download size={16} /> Export report
          </Link>
        }
      />
      {dataset?.is_demo && (
        <div className="dataset-banner">
          <span className="status-dot" />
          <strong>Demo dataset</strong>
          <span>{number(dataset.rows)} synthetic reviews</span>
          <Link to="/data">
            Manage datasets <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {query.isPending && <Busy />}
      {query.error && (
        <Failure error={query.error} retry={() => query.refetch()} />
      )}
      {data && metrics && (
        <>
          <div className="kpi-grid">
            {[
              {
                title: "Total reviews",
                value: number(metrics.total),
                sub: `${number(metrics.products)} products across ${metrics.categories} categories`,
                icon: MessageSquareText,
                color: "violet",
              },
              {
                title: "Positive sentiment",
                value: percent(metrics.positive_pct),
                sub: `${number(metrics.positive)} positive reviews`,
                icon: ArrowUpRight,
                color: "positive",
              },
              {
                title: "Negative sentiment",
                value: percent(metrics.negative_pct),
                sub: `${number(metrics.negative)} negative reviews`,
                icon: ArrowDownRight,
                color: "negative",
              },
              {
                title: "Average rating",
                value: metrics.rating.toFixed(2),
                sub: `${percent(metrics.verified_pct)} verified purchases`,
                icon: Star,
                color: "neutral",
              },
            ].map(({ title, value, sub, icon: Icon, color }, index) => (
              <motion.article
                className="kpi"
                key={title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: index * 0.04 }}
              >
                <div>
                  <span>{title}</span>
                  <span className={`metric-icon ${color}`}>
                    <Icon size={17} />
                  </span>
                </div>
                <strong>
                  {value}
                  {title === "Average rating" && <small> / 5</small>}
                </strong>
                <p>{sub}</p>
              </motion.article>
            ))}
          </div>
          <div className="dashboard-grid">
            <Panel
              title="Sentiment over time"
              subtitle="Monthly share of reviews by predicted sentiment"
              action={
                <Link className="button ghost small" to="/trends">
                  <CalendarDays size={14} /> Explore trends
                </Link>
              }
            >
              <div className="line-legend">
                <span>
                  <i style={{ background: colors.positive }} />
                  Positive
                </span>
                <span>
                  <i style={{ background: colors.negative }} />
                  Negative
                </span>
                <span>
                  <i style={{ background: colors.neutral }} />
                  Neutral
                </span>
              </div>
              <TrendChart data={data.trends} />
            </Panel>
            <Panel
              title="Sentiment distribution"
              subtitle="All classified reviews"
            >
              <Distribution metrics={metrics} />
            </Panel>
          </div>
          <div className="signal-strip">
            <Link to="/reviews?sentiment=neutral">
              <Minus size={16} />
              <span>Neutral reviews</span>
              <strong>{number(metrics.neutral)}</strong>
            </Link>
            <Link to="/segments">
              <CircleCheck size={16} />
              <span>Verified reviews</span>
              <strong>{number(metrics.verified)}</strong>
            </Link>
            <Link to="/reviews?disagreement=true">
              <TriangleAlert size={16} />
              <span>Rating disagreements</span>
              <strong>{number(metrics.disagreement)}</strong>
            </Link>
          </div>
          <div className="dashboard-grid secondary-grid">
            <Panel
              title="Product performance"
              subtitle="Ranked by positive sentiment"
              action={
                <Link className="text-link" to="/products">
                  All products <ArrowRight size={14} />
                </Link>
              }
            >
              {data.products.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Reviews</th>
                        <th>Rating</th>
                        <th>Positive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.slice(0, 5).map((product) => (
                        <tr key={product.id}>
                          <td>
                            <strong>{product.name}</strong>
                            <small>{product.category}</small>
                          </td>
                          <td>{number(product.total)}</td>
                          <td>
                            <span className="rating">
                              <Star size={13} />
                              {product.rating.toFixed(2)}
                            </span>
                          </td>
                          <td className="positive-text">
                            {percent(product.positive_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty />
              )}
              {data.products.length > 1 && (
                <div className="panel-note">
                  Lowest positive share{" "}
                  <strong>{data.products.at(-1)?.name}</strong> ·{" "}
                  {percent(data.products.at(-1)?.positive_pct || 0)}
                </div>
              )}
            </Panel>
            <Panel
              title="Issues to watch"
              subtitle={
                metrics.top_complaint_category
                  ? `Most negative reviews · ${metrics.top_complaint_category}`
                  : "Recent negative reviews"
              }
              action={
                <Link className="text-link" to="/topics">
                  View topics <ArrowRight size={14} />
                </Link>
              }
            >
              {data.alerts.length > 0 && (
                <Link className="alert-inline" to="/trends">
                  <TriangleAlert size={16} /> {data.alerts.length} negative
                  sentiment {data.alerts.length === 1 ? "spike" : "spikes"}{" "}
                  detected
                </Link>
              )}
              {data.recent_complaints.length ? (
                <div className="complaint-list">
                  {data.recent_complaints.slice(0, 3).map((review) => (
                    <Link to={`/reviews?review=${review.id}`} key={review.id}>
                      <span className="complaint-icon">
                        <TriangleAlert size={15} />
                      </span>
                      <div>
                        <strong>{review.product}</strong>
                        <p>{review.text}</p>
                        <small>{showDate(review.date)}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No recent complaints"
                  text="Negative reviews will appear here when available."
                />
              )}
            </Panel>
          </div>
          <Panel
            title="Frequently mentioned terms"
            subtitle="Ranked by TF-IDF across up to 2,500 recent reviews"
          >
            {data.keywords.length ? (
              <div className="chips">
                {data.keywords.map((keyword) => (
                  <span className="chip" key={keyword.term}>
                    {keyword.term}
                    <strong>{keyword.mentions}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel
            title="Category satisfaction"
            subtitle="Text-derived sentiment by product category"
          >
            {data.categories.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Reviews</th>
                      <th>Positive</th>
                      <th>Neutral</th>
                      <th>Negative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((category) => (
                      <tr key={category.name}>
                        <td>{category.name}</td>
                        <td>{number(category.total)}</td>
                        <td>
                          <Tag label="positive" />{" "}
                          {percent(category.positive_pct)}
                        </td>
                        <td>{percent(category.neutral_pct)}</td>
                        <td>{percent(category.negative_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </Panel>
        </>
      )}
    </>
  );
}
