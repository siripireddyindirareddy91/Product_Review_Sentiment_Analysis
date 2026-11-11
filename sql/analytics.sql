-- Bind :dataset_id to the authorized dataset ID before executing.
WITH facts AS (
    SELECT r.id, r.rating, r.verified, r.date, p.name AS product, c.name AS category,
           s.name AS store, sp.sentiment
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN categories c ON c.id = p.category_id
    JOIN sentiment_predictions sp ON sp.review_id = r.id
    LEFT JOIN stores s ON s.id = r.store_id
    WHERE r.dataset_id = :dataset_id
),
dimensions AS (
    SELECT 'product' AS dimension, product AS group_name, * FROM facts
    UNION ALL SELECT 'category', category, * FROM facts
    UNION ALL SELECT 'month', SUBSTR(date, 1, 7), * FROM facts WHERE date IS NOT NULL
    UNION ALL SELECT 'purchase', CASE WHEN verified THEN 'Verified' ELSE 'Unverified' END, * FROM facts
    UNION ALL SELECT 'store', store, * FROM facts WHERE store IS NOT NULL
)
SELECT dimension, group_name, COUNT(*) AS reviews, ROUND(AVG(rating)::numeric, 2) AS average_rating,
       SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
       SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) AS neutral,
       SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
       ROUND(100.0 * SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) / COUNT(*), 1) AS negative_share
FROM dimensions
GROUP BY dimension, group_name
ORDER BY dimension, negative_share DESC, reviews DESC;
