# 📦 Inventory Management

A simple, self-contained inventory management web app built with **Next.js + TypeScript**.
Add, edit, delete, and search inventory items — no external database required (data is
stored in a local JSON file).

## Features

- **Full CRUD** — create, read, update, and delete items
- Fields: name, SKU, category, quantity, unit price
- **Live search** by name, SKU, or category
- **Summary stats** — item count, total units, and total inventory value
- **Low-stock highlighting** (quantity ≤ 5 shown in red)
- Server-side validation on every write
- Data persisted to `data/items.json`

## Getting started

```bash
npm install      # first time only
npm run dev      # start the dev server
```

Then open http://localhost:3000

## Other commands

```bash
npm run build    # production build
npm start        # run the production build
```

## Project structure

```
app/
  page.tsx                  # Main UI (the inventory page)
  layout.tsx                # Root layout
  globals.css               # Styles
  api/items/route.ts        # GET (list) + POST (create)
  api/items/[id]/route.ts   # GET, PUT (update), DELETE
lib/
  types.ts                  # Item / ItemInput types
  db.ts                     # JSON-file data store (serialized writes)
  validate.ts               # Request validation
data/
  items.json                # Your inventory data (created on first write)
```

## Notes

- The JSON file store is great for a single user / single machine. To scale up
  (multiple users, larger datasets), swap `lib/db.ts` for a real database such as
  SQLite, PostgreSQL, or a hosted DB — the API routes stay the same.
- To keep inventory data out of version control, uncomment the `data/items.json`
  line in `.gitignore`.
