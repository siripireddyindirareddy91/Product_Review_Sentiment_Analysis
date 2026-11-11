import { useState } from "react";
import { Database, Download, FileUp, Play, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useData, useWorkspace } from "../context";
import { api, download, endpoint } from "../services/api";
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
  titleCase,
} from "../components/ui";
import type { Dataset, ModelReport, Quality, Upload } from "../types";

function QualitySummary({ quality }: { quality: Quality }) {
  return (
    <div className="stack">
      {quality.missing_columns.length > 0 && (
        <div className="alert-inline">
          Missing required columns ·{" "}
          {quality.missing_columns.map(titleCase).join(", ")}
        </div>
      )}
      <div className="mini-grid">
        {[
          ["Rows", quality.total],
          ["Valid", quality.valid],
          ["Invalid", quality.invalid],
          ["Missing values", quality.missing_values],
          ["Duplicates", quality.duplicates],
          ["Invalid ratings", quality.invalid_ratings],
          ["Invalid booleans", quality.invalid_booleans],
          ["Invalid dates", quality.invalid_dates],
        ].map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {quality.issues.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source row</th>
                <th>Validation issues (up to 50 rows)</th>
              </tr>
            </thead>
            <tbody>
              {quality.issues.map((item) => (
                <tr key={item.row}>
                  <td>{item.row}</td>
                  <td>{item.issues.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DataManagement() {
  const { profile, dataset, datasets, selectDataset, notify, health } =
    useWorkspace();
  const client = useQueryClient();
  const [file, setFile] = useState<File>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState(false);
  const [deleting, setDeleting] = useState<Dataset>();
  const [imported, setImported] = useState(false);
  const quality = useData<Quality>(
    `/datasets/${dataset?.id}/quality`,
    {},
    !!dataset,
  );
  const token = profile?.access_token;
  const upload = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (!file) throw new Error("Choose a file first.");
      const body = new FormData();
      body.set("file", file);
      body.set("mapping", JSON.stringify(mapping));
      body.set("confirm", String(confirm));
      return api<Upload>("/datasets/upload", token, { method: "POST", body });
    },
    onSuccess: async (result) => {
      setMapping(result.mapping);
      setEdited(false);
      if (result.dataset) {
        setImported(true);
        await client.invalidateQueries({ queryKey: ["datasets"] });
        selectDataset(result.dataset.id);
        notify(`Imported ${number(result.dataset.rows)} reviews.`);
      }
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      api<void>(`/datasets/${id}`, token, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      setDeleting(undefined);
      if (dataset?.id === id) selectDataset(undefined);
      await client.invalidateQueries({ queryKey: ["datasets"] });
      notify("Dataset deleted.");
    },
  });
  const save = (path: string, filename: string) =>
    download(path, filename, token).catch((error) =>
      notify(error.message, "error"),
    );
  const canUpload =
    profile?.role === "member" && health?.accounts_enabled !== false;
  const preview = upload.data;
  return (
    <>
      <Heading
        title="Data management"
        description="Validate, import, and manage isolated review datasets."
        actions={
          <button
            className="button ghost"
            onClick={() => save("/datasets/sample", "verdictra-sample.csv")}
          >
            <Download size={16} /> Sample CSV
          </button>
        }
      />
      <Panel
        title="Import reviews"
        subtitle="Choose a UTF-8 CSV or Excel workbook, review the mapping, then confirm valid records."
      >
        {!canUpload ? (
          <div className="empty">
            <Database size={23} />
            <strong>
              {health?.accounts_enabled === false
                ? "Imports are unavailable in this deployment"
                : "Sign in to import a dataset"}
            </strong>
            <span>
              {health?.accounts_enabled === false
                ? "Persistent storage and a signing secret are required."
                : "Personal datasets are visible only to the account that imports them."}
            </span>
            {health?.accounts_enabled !== false && (
              <Link to="/login" className="button primary">
                Sign in
              </Link>
            )}
          </div>
        ) : (
          <div className="stack">
            <label className="file-picker">
              <FileUp size={23} />
              <span>{file?.name || "Choose a CSV or XLSX file"}</span>
              <small>Up to 20,000 rows · 4 MB on Vercel, 8 MB locally</small>
              <input
                type="file"
                accept=".csv,.xlsx"
                disabled={upload.isPending}
                onChange={(event) => {
                  setFile(event.target.files?.[0]);
                  setMapping({});
                  setEdited(false);
                  setImported(false);
                  upload.reset();
                }}
              />
            </label>
            {upload.error && <Failure error={upload.error} />}
            {preview && (
              <>
                <div className="filters">
                  {Object.entries(mapping).map(([field, source]) => (
                    <label key={field}>
                      {titleCase(field)}
                      <select
                        value={source}
                        disabled={upload.isPending}
                        onChange={(event) => {
                          setMapping({
                            ...mapping,
                            [field]: event.target.value,
                          });
                          setEdited(true);
                          setImported(false);
                        }}
                      >
                        <option value="">Unmapped</option>
                        {preview.headers.map((header) => (
                          <option key={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {edited ? (
                  <div className="panel-note">
                    Revalidate after changing the column mapping.
                  </div>
                ) : (
                  <>
                    <QualitySummary quality={preview.quality} />
                    {preview.preview.length > 0 && (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Cleaned review text</th>
                              <th>Product</th>
                              <th>Rating</th>
                              <th>Verified</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.preview.map((row, index) => (
                              <tr key={index}>
                                <td>{row.review_text}</td>
                                <td>{row.product}</td>
                                <td>{row.rating}</td>
                                <td>{row.verified_purchase ? "Yes" : "No"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <div className="actions">
              <button
                className="button ghost"
                disabled={!file || upload.isPending}
                onClick={() => upload.mutate(false)}
              >
                {upload.isPending
                  ? "Processing…"
                  : preview
                    ? "Revalidate file"
                    : "Validate file"}
              </button>
              {preview && (
                <button
                  className="button primary"
                  disabled={
                    edited ||
                    imported ||
                    upload.isPending ||
                    !preview.quality.valid
                  }
                  onClick={() => upload.mutate(true)}
                >
                  {imported
                    ? "Imported"
                    : `Import ${number(preview.quality.valid)} valid reviews`}
                </button>
              )}
            </div>
          </div>
        )}
      </Panel>
      <Panel
        title="Dataset history"
        subtitle="Select one dataset to use across the workspace."
      >
        {datasets.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Reviews</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {item.is_demo ? "Synthetic demo" : "Private upload"}
                        {item.id === dataset?.id ? " · Active" : ""}
                      </small>
                    </td>
                    <td>{number(item.rows)}</td>
                    <td>{showDate(item.created_at)}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="button ghost small"
                          disabled={item.id === dataset?.id}
                          onClick={() => selectDataset(item.id)}
                        >
                          Use dataset
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Download ${item.name}`}
                          onClick={() =>
                            save(
                              `/datasets/${item.id}/download`,
                              "verdictra-cleaned.csv",
                            )
                          }
                        >
                          <Download size={16} />
                        </button>
                        {!item.is_demo && (
                          <button
                            className="icon-button"
                            aria-label={`Delete ${item.name}`}
                            onClick={() => {
                              setDeleting(item);
                              remove.reset();
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Busy />
        )}
      </Panel>
      <Panel title="Data quality" subtitle={dataset?.name}>
        {quality.isFetching && <Busy />}
        {quality.error && (
          <Failure error={quality.error} retry={() => quality.refetch()} />
        )}
        {quality.data && <QualitySummary quality={quality.data} />}
      </Panel>
      {deleting && (
        <Modal title="Delete dataset" close={() => setDeleting(undefined)}>
          <div className="stack">
            <p>
              Delete <strong>{deleting.name}</strong> and its associated
              reviews, models, and reports?
            </p>
            {remove.error && <Failure error={remove.error} />}
            <div className="actions">
              <button
                className="button ghost"
                onClick={() => setDeleting(undefined)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleting.id)}
              >
                Delete dataset
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

type ModelVersion = {
  id: number | string;
  status: string;
  created_at: string | null;
};
const modelDimensions = [
  "product",
  "store",
  "customer_segment",
  "review_period",
];

export function ModelCenter() {
  const { dataset, profile, notify } = useWorkspace();
  const client = useQueryClient();
  const [dimension, setDimension] = useState("product");
  const [search, setSearch] = useState("");
  const versions = useData<ModelVersion[]>(
    "/ml/models",
    {},
    true,
    dataset?.is_demo ? undefined : 3000,
  );
  const report = useData<ModelReport | null>("/ml/evaluate", {
    revision: versions.data?.find((item) => item.status === "ready")?.id,
  });
  const busy = versions.data?.some((item) => item.status === "training");
  const training = useMutation({
    mutationFn: () =>
      api(endpoint("/ml/train", dataset?.id), profile?.access_token, {
        method: "POST",
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["api"] });
      notify("Training started. Model history updates automatically.");
    },
  });
  const result = report.data;
  const matches =
    result?.errors.filter((row) =>
      [row.text, row.product, row.expected, row.predicted].some((value) =>
        value.toLowerCase().includes(search.toLowerCase()),
      ),
    ) || [];
  const save = () =>
    download(
      endpoint("/reports/export", dataset?.id, {
        report: "model",
        format: "csv",
      }),
      "verdictra-model.csv",
      profile?.access_token,
    ).catch((error) => notify(error.message, "error"));
  return (
    <>
      <Heading
        title="Model performance center"
        description="Compare classifiers, evaluate holdout performance, and inspect misclassifications."
        actions={
          <>
            {result && (
              <button className="button ghost" onClick={save}>
                <Download size={16} /> Evaluation report
              </button>
            )}
            {profile?.role === "member" && dataset && !dataset.is_demo && (
              <button
                className="button primary"
                disabled={busy || training.isPending}
                onClick={() => training.mutate()}
              >
                <Play size={15} />{" "}
                {busy || training.isPending ? "Training…" : "Train model"}
              </button>
            )}
          </>
        }
      />
      {training.error && <Failure error={training.error} />}
      {report.isPending && <Busy />}
      {report.error && (
        <Failure error={report.error} retry={() => report.refetch()} />
      )}
      {result ? (
        <>
          <Panel
            title="Model comparison"
            subtitle={`${result.selected} selected by ${result.folds}-fold cross-validation · ${result.training_rows} training and ${result.holdout_rows} holdout reviews`}
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Classifier</th>
                    <th>CV macro F1</th>
                    <th>Macro F1</th>
                    <th>Weighted F1</th>
                    <th>Accuracy</th>
                    <th>Precision</th>
                    <th>Recall</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.map((item) => (
                    <tr key={item.name}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.name === result.selected && (
                          <small>Selected</small>
                        )}
                      </td>
                      {[
                        item.cv_macro_f1,
                        item.macro_f1,
                        item.weighted_f1,
                        item.accuracy,
                        item.precision,
                        item.recall,
                      ].map((value, index) => (
                        <td key={index}>{probability(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-note">
              {result.methodology} Excluded{" "}
              {result.excluded_duplicates_or_conflicts} duplicate, conflicting,
              or unusable rows.
            </div>
          </Panel>
          <div className="dashboard-grid equal">
            <Panel
              title="Confusion matrix"
              subtitle="Rows are rating-derived labels. Columns are text predictions."
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Actual / predicted</th>
                      {result.labels.map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.matrix.map((counts, i) => (
                      <tr key={result.labels[i]}>
                        <th>{result.labels[i]}</th>
                        {counts.map((value, j) => (
                          <td key={j}>
                            <span
                              className={
                                i === j ? "heat-cell correct" : "heat-cell"
                              }
                            >
                              {value}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Per-class results">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.labels.map((label) => (
                      <tr key={label}>
                        <td>
                          <Tag label={label} />
                        </td>
                        <td>
                          {probability(result.classification[label].precision)}
                        </td>
                        <td>
                          {probability(result.classification[label].recall)}
                        </td>
                        <td>
                          {probability(
                            result.classification[label]["f1-score"],
                          )}
                        </td>
                        <td>{result.classification[label].support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
          <Panel
            title="Error analysis by dimension"
            action={
              <select
                aria-label="Error analysis dimension"
                value={dimension}
                onChange={(event) => setDimension(event.target.value)}
              >
                {modelDimensions.map((item) => (
                  <option key={item} value={item}>
                    {titleCase(item)}
                  </option>
                ))}
              </select>
            }
          >
            {result.dimensions[dimension]?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Holdout reviews</th>
                      <th>Errors</th>
                      <th>Error rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.dimensions[dimension].map((item) => (
                      <tr key={item.group}>
                        <td>{item.group}</td>
                        <td>{item.examples}</td>
                        <td>{item.errors}</td>
                        <td>{probability(item.error_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Dimension unavailable"
                text="No holdout reviews contain values for this dimension."
              />
            )}
          </Panel>
          <Panel
            title="Misclassified reviews"
            subtitle="An error means a prediction differs from the rating-derived label."
            action={
              <input
                aria-label="Search errors"
                placeholder="Search errors…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            }
          >
            {matches.length ? (
              <div className="table-wrap">
                <table className="reviews-table">
                  <thead>
                    <tr>
                      <th>Review</th>
                      <th>Product</th>
                      <th>Rating label</th>
                      <th>Predicted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.slice(0, 100).map((row, i) => (
                      <tr key={row.id || i}>
                        <td>{row.text}</td>
                        <td>{row.product}</td>
                        <td>
                          <Tag label={row.expected} />
                        </td>
                        <td>
                          <Tag label={row.predicted} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No matching errors"
                text="No holdout misclassifications match the current search."
              />
            )}
            {matches.length > 100 && (
              <div className="panel-note">
                Showing 100 of {number(matches.length)} matches. Narrow the
                search to see specific reviews.
              </div>
            )}
          </Panel>
        </>
      ) : (
        report.isSuccess && (
          <Empty
            title="No trained model for this dataset"
            text="Train a text-only classifier to compare models and inspect holdout errors."
          />
        )
      )}
      <Panel title="Version history" subtitle={dataset?.name}>
        {versions.isPending && <Busy />}
        {versions.error && (
          <Failure error={versions.error} retry={() => versions.refetch()} />
        )}
        {versions.data &&
          (versions.data.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.data.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {typeof item.id === "number"
                          ? `model-${item.id}`
                          : item.id}
                      </td>
                      <td>
                        <Tag label={item.status} />
                      </td>
                      <td>{showDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No versions yet"
              text="New training runs will appear here."
            />
          ))}
      </Panel>
    </>
  );
}

const reports = [
  {
    id: "executive",
    title: "Executive sentiment",
    text: "Summary metrics, review counts, sentiment shares, and verified purchase rates.",
  },
  {
    id: "products",
    title: "Product performance",
    text: "Product-level ratings, sentiment splits, and prominent feedback terms.",
  },
  {
    id: "complaints",
    title: "Complaint analysis",
    text: "Negative review counts and sentiment distribution by category.",
  },
  {
    id: "model",
    title: "Model evaluation",
    text: "Model comparisons, holdout metrics, and the confusion matrix.",
  },
  {
    id: "quality",
    title: "Data quality",
    text: "Import validation totals, duplicates, and examples of invalid records.",
  },
];

export function Reports() {
  const { dataset, profile, notify } = useWorkspace();
  const [format, setFormat] = useState("csv");
  const mutation = useMutation({
    mutationFn: (report: string) =>
      download(
        endpoint("/reports/export", dataset?.id, { report, format }),
        `verdictra-${report}.${format}`,
        profile?.access_token,
      ),
    onSuccess: () => notify("Report downloaded."),
  });
  return (
    <>
      <Heading
        title="Reports"
        description="Download evidence and metric definitions for the selected dataset."
        actions={
          <label className="inline-field">
            Export format{" "}
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
        }
      />
      {mutation.error && <Failure error={mutation.error} />}
      <div className="dashboard-grid equal">
        {reports.map((item) => (
          <Panel key={item.id} title={item.title} subtitle={item.text}>
            <button
              className="button ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(item.id)}
            >
              <Download size={16} />{" "}
              {mutation.isPending && mutation.variables === item.id
                ? "Generating…"
                : `Download ${format.toUpperCase()}`}
            </button>
          </Panel>
        ))}
      </div>
    </>
  );
}
