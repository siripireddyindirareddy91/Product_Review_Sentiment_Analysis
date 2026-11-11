export type Sentiment = "positive" | "neutral" | "negative";
export type Dataset = {
  id: number;
  name: string;
  is_demo: boolean;
  rows: number;
  created_at: string;
};
export type Profile = {
  email: string;
  role: "member" | "viewer";
  access_token: string;
};
export type Metrics = Record<Sentiment, number> &
  Record<`${Sentiment}_pct`, number> & {
    total: number;
    rating: number;
    verified_pct: number;
    verified: number;
  };
export type Product = Metrics & {
  id: number;
  name: string;
  category: string;
  feature?: string;
  complaint?: string;
};
export type Group = Metrics & { name: string | number };
export type Trend = Metrics & {
  period: string;
  negative_change: number | null;
  spike: boolean;
};
export type Review = {
  id: number;
  text: string;
  rating: number;
  verified: boolean;
  date: string | null;
  customer_segment: string | null;
  store: string | null;
  product: string;
  category: string;
  sentiment: Sentiment;
  confidence: number;
  model_version: string;
};
export type ReviewDetails = Review & {
  rating_sentiment: Sentiment;
  disagreement: boolean;
  explanation: string;
};
export type Overview = {
  metrics: Metrics & {
    products: number;
    categories: number;
    top_complaint_category: string | null;
    disagreement: number;
  };
  trends: Trend[];
  products: Product[];
  categories: Group[];
  keywords: { term: string; mentions: number }[];
  recent_complaints: Review[];
  alerts: Trend[];
};
export type Prediction = {
  sentiment: Sentiment;
  confidence: number;
  probabilities: Record<Sentiment, number>;
  terms: { term: string; weight: number }[];
  model_version: string;
  explanation: string;
};
export type Quality = {
  total: number;
  valid: number;
  invalid: number;
  missing_values: number;
  duplicates: number;
  invalid_ratings: number;
  invalid_booleans: number;
  invalid_dates: number;
  status: string;
  missing_columns: string[];
  issues: { row: number; issues: string[] }[];
};
export type Upload = {
  headers: string[];
  mapping: Record<string, string>;
  quality: Quality;
  preview: Record<string, string | number | boolean | null>[];
  dataset?: Dataset;
};
export type Topic = {
  id: number;
  terms: string[];
  count: number;
  distribution: Record<Sentiment, number>;
  reviews: Review[];
  sampled_reviews: number;
};
export type Recommendation = {
  id: number;
  issue: string;
  evidence: string;
  priority: string;
  affected: string[];
  action: string;
  explanation: string;
  examples: Review[];
};
export type ModelMetric = {
  name: string;
  cv_macro_f1: number;
  macro_f1: number;
  weighted_f1: number;
  accuracy: number;
  precision: number;
  recall: number;
};
export type ModelReport = {
  selected: string;
  version: string;
  comparison: ModelMetric[];
  labels: Sentiment[];
  matrix: number[][];
  classification: Record<
    Sentiment,
    { precision: number; recall: number; "f1-score": number; support: number }
  >;
  training_rows: number;
  holdout_rows: number;
  folds: number;
  excluded_duplicates_or_conflicts: number;
  methodology: string;
  errors: (Review & { expected: Sentiment; predicted: Sentiment })[];
  dimensions: Record<
    string,
    { group: string; examples: number; errors: number; error_rate: number }[]
  >;
};
