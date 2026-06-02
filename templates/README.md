# Import Templates

Use these CSV templates to import your bank transactions into the financial dashboard.

## Templates included

| File | Bank | Format |
|---|---|---|
| `import-template.csv` | Generic / Manual | Universal format — works with any bank |
| `import-revolut.csv` | Revolut | Matches Revolut's export format exactly |
| `import-monzo.csv` | Monzo | Matches Monzo's export format exactly |

## How to use (coming soon)

The CSV import feature is currently in development. When released:

1. Export your transactions from your bank app
2. Open the Dashboard → Export/Import page
3. Click "Import CSV"
4. Select your file (or use the template and fill it in manually)
5. Review the mapped transactions
6. Confirm import

## Supported banks (planned)

- Revolut ✓ (template provided)
- Monzo ✓ (template provided)
- Barclays (coming soon)
- Starling (coming soon)
- HSBC (coming soon)
- NatWest (coming soon)

## Field reference (generic template)

| Column | Format | Required | Notes |
|---|---|---|---|
| Date | YYYY-MM-DD | Yes | Transaction date |
| Description | Text | Yes | Merchant or description |
| Amount (GBP) | Decimal | Yes | Negative = money out, positive = money in |
| Category | Text | No | Housing, Food, Transport, Subscription, etc. |
| Type | income/expense/transfer | No | Used for categorisation |
| Notes | Text | No | Any additional notes |
