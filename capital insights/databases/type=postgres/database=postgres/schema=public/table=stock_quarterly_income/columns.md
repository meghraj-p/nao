# stock_quarterly_income

**Dataset:** `public`

## Columns (15)

- quarter_ending (timestamp(6) NOT NULL, "Last date of the quarter in datetime format e.g., first quarter of financial year 2024 will be 2023-06-30")
- symbol (string NOT NULL, "Symbol or ticker of the company listed on the stock exchange.")
- total_revenue (float64, "Total revenue in the quarter in Crores INR")
- oper_rev (float64, "Operating revenue in the quarter in Crores INR. This is part of the total_revenue")
- other_income (float64, "Other income in the quarter in Crores INR. This is part of the total_revenue")
- operating_expenses (float64, "Operating expenses in the quarter in Crores INR")
- operating_profit (float64, "Operating profit/EBIT in the quarter in Crores INR")
- operating_profit_margin (float64, "Operating profit/EBIT margin in the quarter in percentage")
- depreciation (float64, "Depreciation in the quarter in Crores INR")
- interest (float64, "Interest paid in the quarter in Crores INR")
- profit_before_tax (float64, "Profit before tax (PBT) in the quarter in Crores INR")
- tax (float64, "Tax paid in the quarter in Crores INR")
- net_profit (float64, "Net profit in the quarter in Crores INR")
- net_profit_ttm (float64, "Trailing 12 months net profit in Crores INR")
- basic_eps_ttm (float64, "Trailing 12 months basic EPS in INR")
