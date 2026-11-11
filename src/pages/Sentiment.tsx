import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useWorkspace } from "../context";
import { api, endpoint } from "../services/api";
import {
  Busy,
  Empty,
  Failure,
  Heading,
  Meter,
  Panel,
  probability,
  sentiments,
  Tag,
} from "../components/ui";
import type { Prediction } from "../types";

const examples = [
  "Excellent sound and great battery life. I love how easy it is to use.",
  "The package arrived damaged and support was slow to respond.",
  "The color matches the listing and setup took about as long as expected.",
];

export default function Sentiment() {
  const [text, setText] = useState("");
  const { dataset, profile } = useWorkspace();
  const mutation = useMutation({
    mutationFn: (input: string) =>
      api<Prediction>(
        endpoint("/reviews/predict", dataset?.id),
        profile?.access_token,
        { method: "POST", body: JSON.stringify({ text: input }) },
      ),
  });
  const prediction = mutation.data;
  return (
    <>
      <Heading
        title="Live sentiment"
        description="Analyze review text and see which terms influenced the prediction."
      />
      <div className="dashboard-grid equal">
        <Panel
          title="Review text"
          subtitle="Analyze a customer review or try a sample below."
        >
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(text);
            }}
          >
            <textarea
              aria-label="Review text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={9}
              maxLength={16000}
              placeholder="Paste a product review…"
              required
            />
            <div className="split">
              <span className="muted">
                {text.length.toLocaleString()} / 16,000
              </span>
              <button
                className="button primary"
                disabled={text.trim().length < 3 || mutation.isPending}
              >
                <Sparkles size={16} />{" "}
                {mutation.isPending ? "Analyzing…" : "Analyze review"}
              </button>
            </div>
          </form>
          <div className="chips examples">
            {examples.map((example, index) => (
              <button
                key={example}
                className="chip"
                onClick={() => {
                  setText(example);
                  mutation.reset();
                }}
              >
                {
                  ["Positive example", "Negative example", "Neutral example"][
                    index
                  ]
                }
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title="Prediction"
          subtitle="Text-based sentiment and confidence scores"
        >
          {mutation.isPending ? (
            <Busy />
          ) : mutation.error ? (
            <Failure error={mutation.error} />
          ) : prediction ? (
            <div className="stack">
              <div className="split">
                <Tag label={prediction.sentiment} />
                <strong className="prediction-score">
                  {probability(prediction.confidence)} <small>confidence</small>
                </strong>
              </div>
              {sentiments.map((label) => (
                <Meter
                  key={label}
                  label={label}
                  value={(prediction.probabilities[label] || 0) * 100}
                />
              ))}
              <div className="panel-note">
                <strong>{prediction.model_version}</strong> ·{" "}
                {prediction.explanation}
              </div>
            </div>
          ) : (
            <Empty
              title="Ready to analyze"
              text="Run an analysis to see class scores and contributing terms."
            />
          )}
        </Panel>
      </div>
      {prediction && (
        <Panel
          title="Contributing terms"
          subtitle="Positive weights favor the prediction. Negative weights favor the comparison class."
        >
          {prediction.terms.length ? (
            <div className="chips">
              {prediction.terms.map((term, index) => (
                <span className="chip" key={`${term.term}-${index}`}>
                  {term.term}{" "}
                  <strong
                    className={
                      term.weight >= 0 ? "positive-text" : "negative-text"
                    }
                  >
                    {term.weight > 0 ? "+" : ""}
                    {term.weight.toFixed(3)}
                  </strong>
                </span>
              ))}
            </div>
          ) : (
            <Empty
              title="No term attributions available"
              text="This model or review did not produce explainable terms."
            />
          )}
        </Panel>
      )}
    </>
  );
}
