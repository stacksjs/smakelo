# Smakelo

Find the good places near you, order from them, and watch it arrive.

Smakelo is a local food marketplace: business discovery and reviews, ordering
with real courier delivery and live tracking, and table-QR ordering for dine-in.
Restaurants, coffee shops, and farms.

> [!IMPORTANT]
> **This is a demonstration.** The businesses listed are real places in Los
> Angeles and Santa Monica, but the partner merchants, menus, reviews, orders
> and couriers are invented, card payments use Stripe test mode when configured, and no order
> placed here reaches anybody. Nothing on this site can be bought.

## What it does

**Discover.** Browse and search real local businesses by cuisine, distance,
rating and whether they are open right now, as a list or on a map.

**Order.** Partner merchants have full menus with modifier groups, so an order
line records what was actually chosen. Delivery, pickup, or scheduled for later.

**Track.** Couriers stream GPS from their phones; the customer watches the
courier move along the route with a live ETA.

**Dine in.** A QR code on the table opens the menu, opens a tab, takes orders
round by round, and splits the check.

**Sell.** Merchants manage their menu, hours, orders and tables from the partner
portal, and are paid out through Stripe Connect.

## Running it

```bash
bun install --frozen-lockfile
cp .env.example .env
./buddy key:generate
./buddy migrate
./buddy seed:demo
./buddy dev
```

Requires Bun >= 1.3.0 and SQLite >= 3.47.2.

Choose an invented account on the Account page to try the kitchen or courier
flows. Use `./buddy dev --dashboard` for the Stacks dashboard and its Marketplace
section.

To exercise card checkout, configure `STRIPE_SECRET_KEY` and
`STRIPE_PUBLISHABLE_KEY` from the same Stripe sandbox. For the hosted demo, set
both secrets on the GitHub `production` environment. The demo can record orders
without those keys.

## Built on

[Stacks](https://github.com/stacksjs/stacks), with
[ts-maps](https://github.com/stacksjs/ts-maps) for the maps and
[ts-qr-codes](https://github.com/stacksjs/ts-qr-codes) for the QR codes.

## Data

Business listings come from Foursquare's Open Source Places dataset (Apache
2.0), cross-checked against OpenStreetMap. Map tiles are served by
OpenStreetMap. Everything else is invented.

## License

MIT
