-- Preserve the Los Angeles roster already created by seed:demo.
INSERT INTO courier_markets (courier_id, market_id)
SELECT couriers.id, markets.id
FROM couriers
JOIN markets ON markets.slug = 'los-angeles'
WHERE couriers.license = 'DEMO'
  AND couriers.phone = '+15550000000'
  AND couriers.name IN (
    'Rosa Delgado', 'Tomas Neal', 'Priya Raman', 'Bea Whitfield',
    'Ade Okonjo', 'Sam Ruiz', 'Nia Fletcher', 'Ivan Petrov'
  )
ON CONFLICT (courier_id, market_id) DO NOTHING;

-- Let the new coverage rules consider ready orders with outdated offers.
UPDATE delivery_offers
SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
WHERE status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM orders
    JOIN businesses ON businesses.id = orders.business_id
    JOIN markets ON markets.id = businesses.market_id AND markets.is_active = 1
    JOIN courier_markets ON courier_markets.market_id = markets.id
    WHERE orders.id = delivery_offers.order_id
      AND courier_markets.courier_id = delivery_offers.courier_id
  );
