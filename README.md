# Tāmētājs PRO v4

## Smart Estimate
Smart Estimate now uses a Vercel serverless endpoint `/api/estimate` and OpenAI Structured Outputs. The browser sends only the free-text job description and the catalog IDs/names/units. API key stays server-side in `OPENAI_API_KEY`.

The AI returns structured work items, quantities, confidence and assumptions. The app then applies the user's saved catalog costs/labor rates locally. AI never sets or invents prices.

## Vercel deploy
1. Deploy this folder/project to Vercel.
2. Vercel → Project Settings → Environment Variables → add `OPENAI_API_KEY`.
3. Apply the variable to the environment used by the deployment.
4. Redeploy.
5. Open the app in a fresh browser tab. If the PWA was installed before, reload/update it so the v4 service worker replaces the old cache.

## Test
Open `/api/estimate` in the deployed project. It should return JSON showing `configured: true` when the environment variable is available.

Recommended acceptance tests:
- `Jākrāso 55 m² dzīvoklis, 1 cilvēks.`
- `Koka grīdas demontāža, 2 cilvēki.`
- `50 mm metāla karkasa starpsienas 87 m²`
- multiple jobs in one paragraph, e.g. `Krāsošana 405 m² 2 kārtās, hidroizolācija 95 m², sienu flīzēšana 95 m², logu un durvju aiļu apdare 135 m, iekšējās palodzes 55 m.`

## Catalog pricing
Catalog defaults can be edited. Saved prices are stored on the device and are applied after AI matches a catalog item. Existing estimates keep their own saved item costs.
