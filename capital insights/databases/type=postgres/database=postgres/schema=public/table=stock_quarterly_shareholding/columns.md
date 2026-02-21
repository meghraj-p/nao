# stock_quarterly_shareholding

**Dataset:** `public`

## Columns (10)

- quarter_ending (timestamp(6) NOT NULL, "Last date of the quarter in datetime format e.g., fourth/last quarter of financial year 2024 will be 2024-03-31")
- symbol (string NOT NULL, "Symbol/Ticker of the company listed on National Stock Exchange in India.")
- promoter (float64, "Percentage of shares held by promoters")
- holding (float64, "Percentage of shares held by promoters")
- pledged (float64, "Percentage of promoter holding pledged")
- locked (float64, "Percentage of promoter holding locked")
- fii (float64, "Percentage of shares held by Foreign Institutional Investors (FII)")
- dii (float64, "Percentage of shares held by Domestic Institutional Investors (DII)")
- public (float64, "Percentage of shares held by retail investors")
- others (float64, "Percentage of shares held by entities not belonging to the previously mentioned categories")
