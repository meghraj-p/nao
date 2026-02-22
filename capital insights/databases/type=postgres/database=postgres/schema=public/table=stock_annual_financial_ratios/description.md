# stock_annual_financial_ratios

**Dataset:** `public`

## Table Metadata

| Property | Value |
|----------|-------|
| **Row Count** | 19,065 |
| **Column Count** | 23 |

## Description

This table contains yearly data regarding key financial ratios of listed companies. The values in columns are in percentages except for 'year_ending' (contains the last date of the financial year in datetime format, e.g. financial year 2024 will be 2024-03-31), 'book_value_per_share' (in INR), 'enterprise_value' (Enterprise Value aka EV in Crores INR), and 'ev_per_net_sales' (ratio of EV to net sales). The ratios are categorised as follows:
   1. Profitability ratios: 'ebdit_margin', 'ebit_margin', 'pbt_margin', 'net_profit_margin', 'asset_turnover'
   2. Liquidity ratios: 'current_ratio', 'quick_ratio', 'dividend_payout_to_np', 'earning_retention', 'cash_earning_retention'
   3. Valuation ratios: 'enterprise_value', 'ev_per_net_sales', 'ev_per_ebitda', 'market_cap_per_sales', 'retention_ratio', 'earnings_yield'
