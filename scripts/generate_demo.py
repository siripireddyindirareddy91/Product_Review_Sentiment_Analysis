"""Generate a reproducible synthetic dataset for demonstrations and tests."""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

PRODUCTS = [
    ("EchoTone Headphones", "Electronics", "sound and noise cancellation", "Bluetooth connection", 0.79),
    ("LumaDesk Lamp", "Home & Living", "warm light and adjustable arm", "dimmer switch", 0.86),
    ("AeroFit Running Shoes", "Apparel", "cushioning and arch support", "heel lining", 0.69),
    ("BrewForm Coffee Maker", "Home & Living", "brewing speed and flavor", "water reservoir", 0.73),
    ("VoltEdge Power Bank", "Electronics", "charging speed and size", "battery life", 0.47),
    ("FlexTrail Daypack", "Outdoors", "padded straps and pockets", "main zipper", 0.74),
    ("TerraSteel Bottle", "Outdoors", "insulation and finish", "cap seal", 0.80),
    ("StudioCotton Tee", "Apparel", "fabric and stitching", "fit after washing", 0.63),
]
GOOD = [
    "Excellent {feature}. I would recommend this to a friend.",
    "I love the {feature}. Great value for my budget.",
    "The {feature} impressed me. Everything worked perfectly after setup.",
    "The {feature} was amazing and the whole experience was smooth.",
    "Outstanding {feature}. Delivery was fast and the packaging was sturdy.",
    "Very happy with the {feature}. This is a reliable purchase.",
    "The {feature} is great and easy to use in my routine.",
]
MIXED = [
    "The {feature} is as described. I have only used it a few times.",
    "The {feature} is acceptable. Nothing really stands out at this price.",
    "I noticed the {problem}, but for occasional use it does the job.",
    "The {feature} matched the listing. Setup took about as long as expected.",
    "I can use the {feature}, although I would change the {problem}.",
    "About what I expected for the price. The {feature} does the job.",
    "The {feature} and the {problem} both feel fairly standard for this item.",
]
BAD = [
    "The {problem} failed. I am disappointed and asked for a refund.",
    "Poor {problem}. It stopped working after a few uses.",
    "The {problem} is defective and the return process is frustrating.",
    "I hate how weak the {problem} is. I cannot use this reliably.",
    "The package arrived damaged and the {problem} was broken.",
    "The {problem} was awful. Support was slow to respond.",
    "Overpriced for the build quality. The {problem} felt flimsy.",
]
CONTEXTS = ["during my morning routine", "on a weekend away", "in a shared workspace", "at home",
            "while visiting family", "on my commute", "throughout the holidays", "during a busy workweek"]

def generate(path):
    rng = random.Random(42)
    start = date(2025, 1, 1)
    with open(path, "w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target)
        writer.writerow(["review_id", "review_text", "rating", "product", "category", "verified_purchase", "review_date", "store", "customer_segment"])
        for index, (product, category, feature, problem, positive_rate) in enumerate(PRODUCTS):
            used = set()
            for offset in range(56):
                period = offset // 5
                p = positive_rate - (0.20 if index == 4 and period >= 9 else 0)
                chance = rng.random()
                templates, rating = (GOOD, rng.choice([4, 5, 5])) if chance < p else (MIXED, 3) if chance < p+0.13 else (BAD, rng.choice([1, 2]))
                options = [(template, context, duration) for template in templates for context in CONTEXTS for duration in ["a few days", "one week", "a few weeks", "a month"]]
                template, context, duration = rng.choice([option for option in options if option not in used])
                used.add((template, context, duration))
                review = template.format(feature=feature, problem=problem) + f" I tried it {context} for {duration}."
                if offset % 37 == 0:
                    rating = 2 if rating >= 4 else 4
                day = start + timedelta(days=period*30 + rng.randrange(27))
                writer.writerow([f"demo-{index}-{offset}", review, rating, product, category, rng.random() < 0.84, day.isoformat(),
                                 rng.choice(["Verdict Direct", "Northline Market"]), rng.choice(["First purchase", "Returning customer"])])

if __name__ == "__main__":
    generate(Path(__file__).resolve().parents[1] / "data/sample/reviews.csv")
