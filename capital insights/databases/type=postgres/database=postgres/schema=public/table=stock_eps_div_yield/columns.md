# stock_eps_div_yield

**Dataset:** `public`

## Columns (4)

- quarter_ending (timestamp(6) NOT NULL, "End date of the quarter in datetime format.")
- symbol (string NOT NULL, "Symbol or ticker of the company listed on the stock exchange.")
- eps (float64, "Earnings Per Share (EPS) of the company for the quarter ending on the date in "quarter_ending" column in INR per share.")
- div_yield (float64, "Dividend Yield of the company for the quarter ending on the date in "quarter_ending" column in percentage.")
