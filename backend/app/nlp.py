import html
import re
from collections import Counter

LABELS = ["negative", "neutral", "positive"]
POSITIVE = set("excellent amazing great perfect love comfortable easy fast reliable sturdy fresh clear bright smooth responsive impressed recommend satisfied fantastic wonderful convenient accurate quiet soft durable helpful outstanding happy crisp fits".split())
NEGATIVE = set("bad terrible awful hate broken damaged late slow poor flimsy defective disappointed disappointing uncomfortable noisy refund failed failure cracked leaking misleading unusable frustrating overpriced stopped delays itchy weak faulty".split())
NEGATION = {"not", "no", "never", "without", "hardly"}

def clean(value):
    value = re.sub(r"<[^>]*>", " ", html.unescape(str(value)).lower())
    value = re.sub(r"n['’]t\b", " not", value)
    return " ".join(re.findall(r"[^\W_]+", value, flags=re.UNICODE))

def rating_label(rating):
    return "negative" if rating < 3 else "positive" if rating > 3 else "neutral"

def lexical_prediction(text):
    score = 0
    negated = 0
    terms = []
    for term in clean(text).split():
        if term in NEGATION:
            negated = 3
            continue
        weight = int(term in POSITIVE) - int(term in NEGATIVE)
        if weight:
            weight *= -1 if negated else 1
            score += weight
            terms.append({"term": term, "weight": weight})
        negated = max(0, negated - 1)
    strength = min(abs(score), 4)
    confidence = round(0.54 + strength * 0.09, 2)
    label = LABELS[(score > 0) - (score < 0) + 1]
    return {"sentiment": label, "confidence": confidence,
            "probabilities": {key: confidence if key == label else round((1-confidence)/2, 3) for key in LABELS},
            "terms": terms[:10], "model_version": "lexicon-1",
            "explanation": "A text-only lexicon scored recognized terms and nearby negation. These scores are heuristic and uncalibrated."}

def feature_vectorizer():
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
    return TfidfVectorizer(preprocessor=clean, stop_words=sorted(ENGLISH_STOP_WORDS - NEGATION),
                           ngram_range=(1, 2), sublinear_tf=True, max_features=12000)

def train(rows):
    from sklearn.dummy import DummyClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score
    from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.pipeline import Pipeline

    unique = {}
    conflicts = set()
    for row in rows:
        key = clean(row["text"])
        if not key:
            continue
        if key in unique and rating_label(unique[key]["rating"]) != rating_label(row["rating"]):
            conflicts.add(key)
        unique.setdefault(key, row)
    samples = [row for key, row in unique.items() if key not in conflicts]
    labels = [rating_label(row["rating"]) for row in samples]
    counts = Counter(labels)
    if min(counts.get(label, 0) for label in LABELS) < 5:
        raise ValueError("Training needs at least five unique reviews in each rating-derived class.")
    fit, holdout = train_test_split(samples, test_size=0.25, random_state=42, stratify=labels)
    x = [r["text"] for r in fit]
    y = [rating_label(r["rating"]) for r in fit]
    truth = [rating_label(r["rating"]) for r in holdout]
    cv = StratifiedKFold(n_splits=min(5, min(Counter(y).values())), shuffle=True, random_state=42)
    candidates = [
        ("Majority baseline", DummyClassifier(strategy="most_frequent"), {}),
        ("Multinomial Naive Bayes", MultinomialNB(), {"classifier__alpha": [0.1, 0.5, 1.0]}),
        ("Logistic Regression", LogisticRegression(max_iter=1500, random_state=42, class_weight="balanced"),
         {"classifier__C": [0.3, 1, 3, 10]}),
    ]
    comparisons, fitted = [], []
    for name, classifier, grid in candidates:
        search = GridSearchCV(Pipeline([("tfidf", feature_vectorizer()), ("classifier", classifier)]), grid, scoring="f1_macro", cv=cv, error_score="raise")
        search.fit(x, y)
        fitted.append(search.best_estimator_)
        predicted = search.predict([r["text"] for r in holdout])
        comparisons.append(dict(name=name, cv_macro_f1=search.best_score_, macro_f1=f1_score(truth, predicted, average="macro", zero_division=0),
            weighted_f1=f1_score(truth, predicted, average="weighted", zero_division=0), accuracy=accuracy_score(truth, predicted),
            precision=precision_score(truth, predicted, average="macro", zero_division=0),
            recall=recall_score(truth, predicted, average="macro", zero_division=0), parameters=search.best_params_))
    best = max(range(len(fitted)), key=lambda index: comparisons[index]["cv_macro_f1"])
    model = fitted[best]
    predicted = model.predict([r["text"] for r in holdout])
    errors = [{**row, "expected": actual, "predicted": str(guess)} for row, actual, guess in zip(holdout, truth, predicted) if actual != guess]
    dimensions = {}
    for dimension in ["product", "store", "customer_segment", "review_period"]:
        counts = Counter()
        mistakes = Counter()
        for row, actual, guess in zip(holdout, truth, predicted):
            value = (row.get("date") or "")[:7] if dimension == "review_period" else row.get(dimension)
            if value:
                counts[value] += 1
                mistakes[value] += int(actual != guess)
        dimensions[dimension] = [{"group": key, "examples": value, "errors": mistakes[key], "error_rate": mistakes[key]/value} for key, value in counts.most_common()]
    return model, dict(comparison=comparisons, selected=comparisons[best]["name"], labels=LABELS,
                       matrix=confusion_matrix(truth, predicted, labels=LABELS).tolist(),
                       classification=classification_report(truth, predicted, labels=LABELS, output_dict=True, zero_division=0),
                       errors=errors, dimensions=dimensions, training_rows=len(fit), holdout_rows=len(holdout),
                       excluded_duplicates_or_conflicts=len(rows)-len(samples), folds=cv.n_splits,
                       methodology="Rating proxy: below 3 negative, 3 neutral, above 3 positive. Text-only TF-IDF. Duplicate texts and conflicting labels handled before splitting. Selection uses training CV macro F1.")

def model_prediction(model, text, version):
    import numpy as np
    vectorizer = model.named_steps["tfidf"]
    classifier = model.named_steps["classifier"]
    vector = vectorizer.transform([text])
    scores = classifier.predict_proba(vector)[0]
    label_index = int(scores.argmax())
    weights = getattr(classifier, "coef_", getattr(classifier, "feature_log_prob_", None))
    terms = []
    if weights is not None and vector.nnz:
        indices = vector.indices
        competing_index = int(np.argsort(scores)[-2])
        contributions = vector.data * (weights[label_index, indices] - weights[competing_index, indices])
        names = vectorizer.get_feature_names_out()
        terms = [{"term": str(names[indices[i]]), "weight": round(float(contributions[i]), 4)}
                 for i in np.argsort(-np.abs(contributions))[:8] if contributions[i]]
    return {"sentiment": str(classifier.classes_[label_index]), "confidence": float(scores[label_index]),
            "probabilities": dict(zip(classifier.classes_.tolist(), scores.tolist())),
            "terms": terms, "model_version": version,
            "explanation": "The model estimates rating-derived sentiment from review text. Contributions compare the winning class against the runner-up. Probabilities are uncalibrated."}

def topics_for(rows):
    import numpy as np
    from sklearn.decomposition import NMF
    samples = rows[:2500]
    if len(samples) < 3:
        return []
    vectorizer = feature_vectorizer()
    try:
        matrix = vectorizer.fit_transform([row["text"] for row in samples])
    except ValueError:
        return []
    count = min(7, max(2, len(samples)//15), matrix.shape[0], matrix.shape[1])
    if count < 2:
        return []
    model = NMF(n_components=count, init="nndsvda", random_state=42, max_iter=450)
    weights = model.fit_transform(matrix)
    words = vectorizer.get_feature_names_out()
    results = []
    for index, component in enumerate(model.components_):
        assignments = [(row, float(weights[i, index])) for i, row in enumerate(samples) if weights[i, index] > 0 and weights[i].argmax() == index]
        assignments.sort(key=lambda item: item[1], reverse=True)
        if not assignments:
            continue
        terms = [str(words[i]) for i in np.argsort(-component)[:6] if component[i] > 0]
        counts = Counter(row["sentiment"] for row, _ in assignments)
        results.append(dict(terms=terms, count=len(assignments), distribution={label: counts[label] for label in LABELS},
                            reviews=[row for row, _ in assignments[:6]],
                            assignments=[(row["id"], relevance) for row, relevance in assignments],
                            sampled_reviews=len(samples)))
    return sorted(results, key=lambda topic: topic["count"], reverse=True)

def keywords_for(rows, limit=14):
    import numpy as np
    vectorizer = feature_vectorizer()
    try:
        matrix = vectorizer.fit_transform([row["text"] for row in rows[:2500]])
    except ValueError:
        return []
    ranks = np.asarray(matrix.sum(axis=0)).ravel()
    names = vectorizer.get_feature_names_out()
    return [{"term": str(names[i]), "mentions": int(matrix[:, i].count_nonzero())}
            for i in np.argsort(-ranks)[:limit] if ranks[i] > 0]
