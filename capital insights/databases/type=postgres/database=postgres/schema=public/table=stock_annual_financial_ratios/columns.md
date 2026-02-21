# stock_annual_financial_ratios

**Dataset:** `public`

## Columns (23)

- year_ending (timestamp(6) NOT NULL, "Last date of the financial year in datetime format e.g. financial year 2024 will be 2024-03-31")
- symbol (string NOT NULL, "Symbol/Ticker of the company listed on National Stock Exchange in India.")
- book_value_per_share (float64, "Book value per share in INR.")
- roa (float64, "Return on Assets (ROA) as a percentage.")
- roe (float64, "Return on Equity (ROE) as a percentage.")
- roce (float64, "Return on Capital Employed (ROCE) as a percentage.")
- ebdit_margin (float64, "EBITDA margin as a percentage.")
- ebit_margin (float64, "Earnings Before Interest and Tax (EBIT) margin as a percentage.")
- pbt_margin (float64, "Profit Before Tax (PBT) margin as a percentage.")
- net_profit_margin (float64, "Net profit margin as a percentage.")
- asset_turnover (float64, "Asset turnover ratio.")
- current_ratio (float64, "Current ratio, a measure of liquidity.")
- quick_ratio (float64, "Quick ratio, a measure of liquidity excluding inventory.")
- dividend_payout_to_np (float64, "Dividend payout ratio to net profit as a percentage.")
- earning_retention (float64, "Earnings retention ratio as a percentage.")
- cash_earning_retention (float64, "Cash earnings retention ratio as a percentage.")
- enterprise_value (float64, "Enterprise value in INR Crores.")
- ev_per_net_sales (float64, "Enterprise value per net sales ratio.")
- ev_per_ebitda (float64, "Enterprise value per EBITDA ratio.")
- market_cap_per_sales (float64, "Market capitalization per sales ratio.")
- retention_ratio (float64, "Retention ratio as a percentage.")
- earnings_yield (float64, "Earnings yield as a percentage.")
- total_debt_to_total_equity (float64, "Total debt to total equity ratio.")
