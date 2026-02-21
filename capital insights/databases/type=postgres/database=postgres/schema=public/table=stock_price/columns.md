# stock_price

**Dataset:** `public`

## Columns (7)

- date (timestamp(6) NOT NULL, "Date in datetime format.")
- symbol (string NOT NULL, "Symbol or ticker of the company listed on the stock exchange.")
- open (float64, "Opening price of the stock on date in 'Date' column.")
- high (float64, "Highest price of the stock on date in 'Date' column.")
- low (float64, "Lowest price of the stock on date in 'Date' column.")
- close (float64, "Closing price of the stock on date in 'Date' column. Take this price if no specific price is specified.")
- volume (int64, "Volume of shares traded on date in 'Date' column.")
