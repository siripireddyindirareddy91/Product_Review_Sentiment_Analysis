import {
  ArrowLeft,
  ArrowRight,
  Search,
  Star,
  TriangleAlert,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../context";
import {
  Busy,
  Empty,
  Failure,
  Heading,
  Modal,
  number,
  Panel,
  probability,
  showDate,
  Tag,
} from "../components/ui";
import type { Overview, Review, ReviewDetails } from "../types";

export default function ReviewExplorer() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const reviewId = Number(params.get("review")) || undefined;
  const fields = [
    "search",
    "product",
    "category",
    "sentiment",
    "rating",
    "verified",
    "start",
    "end",
    "sort",
    "disagreement",
  ];
  const filters = Object.fromEntries(
    fields.map((key) => [key, params.get(key) || undefined]),
  );
  const overview = useData<Overview>("/analytics/overview");
  const query = useData<{ total: number; size: number; items: Review[] }>(
    "/reviews",
    { ...filters, page },
  );
  const detail = useData<ReviewDetails>(`/reviews/${reviewId}`, {}, !!reviewId);

  function set(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        if (fields.includes(key)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  const products = [
    ...new Set(overview.data?.products.map((product) => product.name)),
  ];
  const categories = overview.data?.categories || [];
  const pages = Math.max(
    1,
    Math.ceil((query.data?.total || 0) / (query.data?.size || 12)),
  );
  return (
    <>
      <Heading
        title="Review explorer"
        description="Search individual reviews and inspect the evidence behind sentiment predictions."
      />
      <Panel
        title="Filter reviews"
        action={
          <button className="button ghost small" onClick={() => setParams({})}>
            Reset filters
          </button>
        }
      >
        <div className="filters">
          <label className="search-control">
            <span>Search text</span>
            <div>
              <Search size={16} />
              <input
                value={filters.search || ""}
                onChange={(event) => set("search", event.target.value)}
                placeholder="Search review text"
                maxLength={200}
              />
            </div>
          </label>
          <label>
            Product
            <select
              value={filters.product || ""}
              onChange={(event) => set("product", event.target.value)}
            >
              <option value="">All products</option>
              {products.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={filters.category || ""}
              onChange={(event) => set("category", event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            Sentiment
            <select
              value={filters.sentiment || ""}
              onChange={(event) => set("sentiment", event.target.value)}
            >
              <option value="">All sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </label>
          <label>
            Rating
            <select
              value={filters.rating || ""}
              onChange={(event) => set("rating", event.target.value)}
            >
              <option value="">All ratings</option>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} stars
                </option>
              ))}
            </select>
          </label>
          <label>
            Purchase
            <select
              value={filters.verified || ""}
              onChange={(event) => set("verified", event.target.value)}
            >
              <option value="">All purchases</option>
              <option value="true">Verified</option>
              <option value="false">Unverified</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={filters.start || ""}
              onChange={(event) => set("start", event.target.value)}
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={filters.end || ""}
              onChange={(event) => set("end", event.target.value)}
            />
          </label>
          <label>
            Sort
            <select
              value={filters.sort || "newest"}
              onChange={(event) => set("sort", event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.disagreement === "true"}
              onChange={(event) =>
                set("disagreement", event.target.checked ? "true" : "")
              }
            />{" "}
            Rating disagreements only
          </label>
        </div>
      </Panel>
      <Panel
        title="Customer reviews"
        subtitle={
          query.data
            ? `${number(query.data.total)} matching reviews`
            : undefined
        }
      >
        {query.isPending && <Busy />}
        {query.error && (
          <Failure error={query.error} retry={() => query.refetch()} />
        )}
        {query.data &&
          (query.data.items.length ? (
            <div className="table-wrap">
              <table className="reviews-table">
                <thead>
                  <tr>
                    <th>Review</th>
                    <th>Product</th>
                    <th>Sentiment</th>
                    <th>Rating</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <button
                          className="review-link"
                          onClick={() => set("review", String(review.id))}
                        >
                          {review.text}
                        </button>
                      </td>
                      <td>
                        <strong>{review.product}</strong>
                        <small>{review.category}</small>
                      </td>
                      <td>
                        <Tag label={review.sentiment} />
                      </td>
                      <td>
                        <span className="rating">
                          <Star size={13} />
                          {review.rating}
                        </span>
                      </td>
                      <td>{showDate(review.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          ))}
        {query.data && pages > 1 && (
          <div className="pagination">
            <button
              className="button ghost small"
              disabled={page <= 1}
              onClick={() => set("page", String(page - 1))}
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              className="button ghost small"
              disabled={page >= pages}
              onClick={() => set("page", String(page + 1))}
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        )}
      </Panel>
      {reviewId && (
        <Modal title="Review details" close={() => set("review", "")}>
          {detail.isPending && <Busy />}
          {detail.error && (
            <Failure error={detail.error} retry={() => detail.refetch()} />
          )}
          {detail.data && (
            <div className="stack">
              <div className="chips">
                <Tag label={detail.data.sentiment} />
                <span className="chip">
                  {probability(detail.data.confidence)} confidence
                </span>
                <span className="chip">{detail.data.rating} / 5 stars</span>
                <span className="chip">
                  {detail.data.verified ? "Verified" : "Unverified"}
                </span>
              </div>
              <blockquote>{detail.data.text}</blockquote>
              <dl className="details">
                <dt>Product</dt>
                <dd>{detail.data.product}</dd>
                <dt>Category</dt>
                <dd>{detail.data.category}</dd>
                <dt>Review date</dt>
                <dd>{showDate(detail.data.date)}</dd>
                <dt>Store</dt>
                <dd>{detail.data.store || "Unavailable"}</dd>
                <dt>Customer segment</dt>
                <dd>{detail.data.customer_segment || "Unavailable"}</dd>
                <dt>Model</dt>
                <dd>{detail.data.model_version}</dd>
              </dl>
              {detail.data.disagreement && (
                <div className="alert-inline">
                  <TriangleAlert size={16} />
                  <div>
                    <strong>
                      Rating implies {detail.data.rating_sentiment} sentiment.
                    </strong>
                    <p>{detail.data.explanation}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
