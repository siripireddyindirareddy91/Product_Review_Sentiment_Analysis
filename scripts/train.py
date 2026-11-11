"""Train and persist a classifier and holdout report from a CSV or workbook."""
import argparse
import json
from pathlib import Path

import joblib

from backend.app.ingest import read_file, validate
from backend.app.nlp import train

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("models/saved"))
    args = parser.parse_args()
    headers, records = read_file(args.source.name, args.source.read_bytes())
    _, valid, quality = validate(headers, records)
    rows = [{**row, "text": row["review_text"], "date": row["review_date"]} for row in valid]
    model, report = train(rows)
    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output / "sentiment.joblib", compress=3)
    (args.output / "evaluation.json").write_text(json.dumps({**report, "quality": quality}, indent=2), encoding="utf-8")
    print(f'Selected {report["selected"]} using cross-validation macro F1.')

if __name__ == "__main__":
    main()
