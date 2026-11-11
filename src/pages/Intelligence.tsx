import { useState } from "react";
import { ArrowRight, Star, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useData, useWorkspace } from "../context";
import { TrendChart } from "../components/charts";
import {
  Busy,
  colors,
  Empty,
  Failure,
  Heading,
  Modal,
  number,
  Panel,
  percent,
  sentiments,
  Tag,
} from "../components/ui";
import type {
  Group,
  Product,
  Recommendation,
  Review,
  Topic,
  Trend,
} from "../types";

type MetricRow = Product | Group;
function Heatmap({ rows }: { rows: MetricRow[] }) {
  return (
    <div className="table-wrap">
      <table className="heatmap">
        <thead>
          <tr>
            <th>Group</th>
            <th>Reviews</th>
            {sentiments.map((label) => (
              <th key={label}>{label}</th>
            ))}
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td>
                <strong>{row.name}</strong>
              </td>
              <td>{number(row.total)}</td>
              {sentiments.map((label) => (
                <td key={label}>
                  <span
                    className="heat-cell"
                    style={{
                      background: `color-mix(in srgb, ${colors[label]} ${Math.max(8, row[`${label}_pct`] * 0.62)}%, var(--panel))`,
                    }}
                  >
                    {percent(row[`${label}_pct`])}
                  </span>
                </td>
              ))}
              <td>
                <span className="rating">
                  <Star size={13} />
                  {row.rating.toFixed(2)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductTrend({ product }: { product: Product }) {
  const query = useData<Trend[]>("/analytics/trends", {
    product_id: product.id,
  });
  return (
    <Panel title={product.name} subtitle={product.category}>
      {query.isPending && <Busy />}
      {query.error && (
        <Failure error={query.error} retry={() => query.refetch()} />
      )}
      {query.data && <TrendChart data={query.data} />}
      <dl className="details">
        <dt>Appreciated term</dt>
        <dd>{product.feature || "Unavailable"}</dd>
        <dt>Complaint term</dt>
        <dd>{product.complaint || "Unavailable"}</dd>
      </dl>
    </Panel>
  );
}

export function Products() {
  const [selected, setSelected] = useState<number[]>([]);
  const [rank, setRank] = useState("negative");
  const query = useData<Product[]>("/analytics/products");
  const category = useData<Group[]>("/analytics/categories");
  const products = [...(query.data || [])].sort((a, b) =>
    rank === "positive"
      ? b.positive_pct - a.positive_pct
      : rank === "rating"
        ? b.rating - a.rating
        : b.negative_pct - a.negative_pct,
  );
  const comparison = products.filter((product) =>
    selected.includes(product.id),
  );
  return (
    <>
      <Heading
        title="Product intelligence"
        description="Rank products by sentiment and compare their feedback and ratings."
      />
      <Panel
        title="Product rankings"
        subtitle="Risk ranking uses negative sentiment share. Compare review volumes before acting."
        action={
          <label className="inline-field">
            Rank by{" "}
            <select
              value={rank}
              onChange={(event) => setRank(event.target.value)}
            >
              <option value="negative">Negative share</option>
              <option value="positive">Positive share</option>
              <option value="rating">Average rating</option>
            </select>
          </label>
        }
      >
        {query.isPending && <Busy />}
        {query.error && (
          <Failure error={query.error} retry={() => query.refetch()} />
        )}
        {query.data &&
          (products.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Compare</th>
                    <th>Product</th>
                    <th>Reviews</th>
                    <th>Rating</th>
                    <th>Positive</th>
                    <th>Neutral</th>
                    <th>Negative</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Compare ${product.name}`}
                          checked={selected.includes(product.id)}
                          disabled={
                            !selected.includes(product.id) &&
                            comparison.length >= 4
                          }
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selected, product.id]
                                : selected.filter((id) => id !== product.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <Link
                          className="text-link"
                          to={`/reviews?product=${encodeURIComponent(product.name)}`}
                        >
                          {product.name}
                        </Link>
                        <small>{product.category}</small>
                      </td>
                      <td>{number(product.total)}</td>
                      <td>{product.rating.toFixed(2)}</td>
                      <td className="positive-text">
                        {percent(product.positive_pct)}
                      </td>
                      <td>{percent(product.neutral_pct)}</td>
                      <td className="negative-text">
                        {percent(product.negative_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          ))}
      </Panel>
      {comparison.length > 0 && (
        <div className="dashboard-grid equal">
          {comparison.map((product) => (
            <ProductTrend key={product.id} product={product} />
          ))}
        </div>
      )}
      <Panel
        title="Category sentiment heatmap"
        subtitle="Color intensity reflects the share within each category."
      >
        {category.isPending && <Busy />}
        {category.error && (
          <Failure error={category.error} retry={() => category.refetch()} />
        )}
        {category.data &&
          (category.data.length ? <Heatmap rows={category.data} /> : <Empty />)}
      </Panel>
    </>
  );
}

const dimensions = {
  verified: "Verified purchase",
  category: "Product category",
  store: "Store",
  segment: "Customer segment",
  rating: "Rating",
  period: "Review month",
};

export function Segments() {
  const [dimension, setDimension] =
    useState<keyof typeof dimensions>("verified");
  const query = useData<Group[]>("/analytics/segments", { dimension });
  return (
    <>
      <Heading
        title="Customer segments"
        description="Compare sentiment across the dimensions present in the selected dataset."
      />
      <Panel
        title="Segment comparison"
        subtitle="Rows with missing values in the selected dimension are excluded."
        action={
          <label className="inline-field">
            Group by{" "}
            <select
              value={dimension}
              onChange={(event) =>
                setDimension(event.target.value as keyof typeof dimensions)
              }
            >
              {Object.entries(dimensions).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {query.isPending && <Busy />}
        {query.error && (
          <Failure error={query.error} retry={() => query.refetch()} />
        )}
        {query.data &&
          (query.data.length ? (
            <Heatmap rows={query.data} />
          ) : (
            <Empty
              title={`${dimensions[dimension]} data unavailable`}
              text="This dataset has no values for the selected dimension."
            />
          ))}
      </Panel>
    </>
  );
}

export function Trends() {
  const [period, setPeriod] = useState("month");
  const [metric, setMetric] = useState<"share" | "rating" | "complaints">(
    "share",
  );
  const [productId, setProductId] = useState("");
  const { threshold, setThreshold } = useWorkspace();
  const products = useData<Product[]>("/analytics/products");
  const query = useData<Trend[]>("/analytics/trends", {
    period,
    threshold,
    product_id: productId,
  });
  const spikes = query.data?.filter((row) => row.spike) || [];
  return (
    <>
      <Heading
        title="Sentiment trends"
        description="Track shifts in sentiment, ratings, and complaint volume over time."
      />
      <Panel title="Trend controls">
        <div className="filters">
          <label>
            Period
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </label>
          <label>
            Product
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">All products</option>
              {products.data?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Metric
            <select
              value={metric}
              onChange={(event) =>
                setMetric(event.target.value as typeof metric)
              }
            >
              <option value="share">Sentiment share</option>
              <option value="rating">Average rating</option>
              <option value="complaints">Complaint frequency</option>
            </select>
          </label>
          <label>
            Spike threshold
            <input
              type="number"
              min="1"
              max="100"
              value={threshold}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (value >= 1 && value <= 100) setThreshold(value);
              }}
            />
          </label>
        </div>
      </Panel>
      <Panel
        title="Historical performance"
        subtitle="Only reviews with dates are included."
      >
        {query.isPending && <Busy />}
        {query.error && (
          <Failure error={query.error} retry={() => query.refetch()} />
        )}
        {query.data && <TrendChart data={query.data} metric={metric} />}
      </Panel>
      <Panel
        title="Negative sentiment spikes"
        subtitle="The alert compares adjacent periods with data. Both periods need at least five reviews."
      >
        {query.isPending && <Busy />}
        {query.error && (
          <Failure error={query.error} retry={() => query.refetch()} />
        )}
        {query.data &&
          (spikes.length ? (
            <div className="stack">
              {spikes.map((row) => (
                <div className="alert-inline" key={row.period}>
                  <TriangleAlert size={17} />
                  <div>
                    <strong>
                      {row.period} · +{row.negative_change} percentage points
                    </strong>
                    <p>
                      {row.negative} negative reviews out of {row.total} (
                      {percent(row.negative_pct)}).
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No spikes detected"
              text="No period meets the current alert threshold and minimum review count."
            />
          ))}
      </Panel>
    </>
  );
}

export function Topics() {
  const [active, setActive] = useState<Topic>();
  const [page, setPage] = useState(1);
  const query = useData<Topic[]>("/topics");
  const detail = useData<Review[]>(
    `/topics/${active?.id}/reviews`,
    { page },
    !!active,
  );
  return (
    <>
      <Heading
        title="Topics & complaints"
        description="Discover recurring themes using topic modeling and review text."
      />
      {query.isPending && <Busy />}
      {query.error && (
        <Failure error={query.error} retry={() => query.refetch()} />
      )}
      {query.data &&
        (query.data.length ? (
          <div className="dashboard-grid equal">
            {query.data.map((topic) => (
              <Panel
                key={topic.id}
                title={topic.terms.slice(0, 2).join(" · ")}
                subtitle={`${number(topic.count)} assigned reviews · ${number(topic.sampled_reviews)} sampled`}
              >
                <div className="stack">
                  <div className="chips">
                    {topic.terms.map((term) => (
                      <span key={term} className="chip">
                        {term}
                      </span>
                    ))}
                  </div>
                  <div
                    className="stack-bar"
                    aria-label="Sentiment distribution"
                  >
                    {sentiments.map((label) => (
                      <i
                        key={label}
                        style={{
                          width: percent(
                            (topic.distribution[label] * 100) / topic.count,
                          ),
                          background: colors[label],
                        }}
                      />
                    ))}
                  </div>
                  <div className="chips">
                    {sentiments.map((label) => (
                      <span key={label}>
                        <Tag label={label} /> {topic.distribution[label]}
                      </span>
                    ))}
                  </div>
                  <button
                    className="text-link"
                    onClick={() => {
                      setActive(topic);
                      setPage(1);
                    }}
                  >
                    Read assigned reviews <ArrowRight size={15} />
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <Empty
            title="No topics detected"
            text="Topic modeling needs at least three reviews with usable text."
          />
        ))}
      {active && (
        <Modal
          title={active.terms.slice(0, 2).join(" · ")}
          close={() => setActive(undefined)}
        >
          {detail.isPending && <Busy />}
          {detail.error && (
            <Failure error={detail.error} retry={() => detail.refetch()} />
          )}
          {detail.data && (
            <>
              <div className="stack">
                {detail.data.map((review) => (
                  <blockquote key={review.id}>
                    <Tag label={review.sentiment} />
                    <p>{review.text}</p>
                    <Link
                      className="text-link"
                      to={`/reviews?review=${review.id}`}
                    >
                      {review.product} <ArrowRight size={14} />
                    </Link>
                  </blockquote>
                ))}
              </div>
              <div className="pagination">
                <button
                  className="button ghost small"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  className="button ghost small"
                  disabled={page * 20 >= active.count}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

export function Recommendations() {
  const query = useData<Recommendation[]>("/recommendations");
  return (
    <>
      <Heading
        title="Recommendations"
        description="Investigate issues surfaced by actual review evidence and product risk rankings."
      />
      {query.isPending && <Busy />}
      {query.error && (
        <Failure error={query.error} retry={() => query.refetch()} />
      )}
      {query.data &&
        (query.data.length ? (
          query.data.map((item) => (
            <Panel
              title={item.issue}
              subtitle={item.evidence}
              action={<Tag label={item.priority} />}
              key={item.id}
            >
              <div className="stack">
                <p>
                  <strong>Suggested action</strong> {item.action}
                </p>
                <p className="muted">{item.explanation}</p>
                <div className="chips">
                  {item.affected.map((product) => (
                    <Link
                      key={product}
                      className="chip"
                      to={`/reviews?product=${encodeURIComponent(product)}&sentiment=negative`}
                    >
                      {product}
                      <ArrowRight size={13} />
                    </Link>
                  ))}
                </div>
                {item.examples.map((review) => (
                  <blockquote key={review.id}>
                    {review.text}{" "}
                    <Link
                      className="text-link"
                      to={`/reviews?review=${review.id}`}
                    >
                      Read review
                    </Link>
                  </blockquote>
                ))}
              </div>
            </Panel>
          ))
        ) : (
          <Empty
            title="No recommendations yet"
            text="Recommendations appear when the selected dataset contains relevant negative feedback."
          />
        ))}
    </>
  );
}
