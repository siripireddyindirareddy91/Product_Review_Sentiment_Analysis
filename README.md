# VERDICTRA

VERDICTRA is a product review intelligence workspace. Import a review dataset, inspect its quality, and explore sentiment, complaint topics, product risk, customer segments, and model performance. The public workspace opens with a labeled synthetic dataset of 448 reviews.

## Run locally

Requires Python 3.12 and Node.js 22 or later.

```sh
python -m venv .venv
# Activate the environment. PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m alembic upgrade head
python -m uvicorn backend.app.main:app --reload --port 8000
```

In a second terminal:

```sh
npm ci
npm run dev
```

Open [the local dashboard](http://localhost:5173) or [the API documentation](http://localhost:8000/api/docs). The Vite development proxy forwards API requests to port 8000. To use PostgreSQL locally, run `docker compose up --build` for the API and database, then start Vite separately. The SQLite database and local signing configuration are excluded from Git.

Demo credentials are `demo@verdictra.example` and `VerdictraDemo2026`. The demo role is read-only. Register a personal account to import and train on a private dataset.

## Data workflow

1. In Data management, download the sample CSV or choose a CSV or XLSX file.
2. Validate the file and inspect the detected mappings, cleaned preview, and rejected rows. Override mappings and revalidate if needed.
3. Confirm the valid records and select the imported dataset. Uploaded datasets and the demo are analyzed separately.
4. Explore individual predictions and disagreements, compare product sentiment, and download reports in CSV, Excel, or PDF.
5. In Model center, train and evaluate a classifier on the selected private dataset.

Required columns are `review_text`, `rating`, `product`, `category`, and `verified_purchase`. Optional columns are `review_id`, `review_date`, `store`, and `customer_segment`. Ratings range from 1 to 5. Dates use ISO 8601 or Excel date cells. Verification accepts true/false, yes/no, and 1/0. An import accepts up to 20,000 nonblank rows and 8 MB locally. Use a file smaller than 4 MB on Vercel to leave room for multipart overhead.

## How the analysis works

- SQLAlchemy joins normalized records and aggregates sentiment counts, verified share, and ratings in SQL. The raw SQL example in `sql/analytics.sql` targets PostgreSQL.
- Saved review classifications use a text lexicon with a negation window. Dashboard shares and disagreements use those saved classifications. Live analysis uses the latest trained classifier when available and otherwise uses the lexicon. Training a new model leaves previously saved dashboard classifications intact.
- The ML workflow derives proxy labels from ratings. Below 3 is negative, exactly 3 is neutral, and above 3 is positive. Review text is the only model input. TF-IDF covers unigrams and bigrams, with HTML and whitespace normalization and negation-preserving stopword handling. Rating and customer metadata are excluded from features.
- Normalized duplicate texts and conflicting labels are handled before a 75/25 stratified split. Grid search selects the majority baseline, Multinomial Naive Bayes, or logistic regression by cross-validation macro F1. The holdout reports accuracy, macro precision and recall, macro and weighted F1, per-class metrics, a confusion matrix, and errors by product, store, customer segment, and month. Each class needs at least five unique usable texts.
- TF-IDF and NMF summarize up to 2,500 recent reviews. A review is assigned to its strongest topic when its topic weight is positive. Recommendations cite predicted sentiment and review evidence. Spike alerts compare observed periods that each contain at least five reviews.
- Ratings are a weak proxy for text sentiment, and probabilities are uncalibrated. The synthetic demo repeats writing patterns by design, so its holdout metrics cannot establish real-world model performance. Missing optional fields are surfaced in the relevant views. Very short or unfamiliar text can be difficult to classify.

Run reproducible offline training with `python -m scripts.train data/sample/reviews.csv`. The resulting joblib artifact includes the fitted TF-IDF vectorizer and classifier. The JSON evaluation includes the split sizes, scores, and validation report.

## Verification

```sh
python -m pytest -q
npm run lint
npm test
npm run build
```

GitHub Actions runs these checks on pushes and pull requests.

## Deployment

The root Vercel project serves the React app and routes `/api/*` to the FastAPI Python function. Connect a PostgreSQL database and configure `DATABASE_URL` and a long random `JWT_SECRET` in the production environment, then redeploy. The first API request initializes the current schema and seeds the demo. Run `python -m alembic upgrade head` with the target database URL to apply the tracked migration explicitly.

If the API runs separately, use the included Render Blueprint or deploy the Dockerfile to a Python-capable host. Set `VITE_API_URL` to the deployed API origin when building the frontend, and `CORS_ORIGINS` to the frontend origin on the backend. Use `/api/health` to verify database connectivity and whether registration is enabled. For a Vercel deployment without durable storage, public demo browsing remains available and personal account and import changes are disabled.

Environment variables are read from the process environment. See `.env.example` for names and local defaults. Keep database connection strings and signing keys out of source control.
