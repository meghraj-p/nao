# stock_annual_cashflow

**Dataset:** `public`

## Columns (11)

- year_ending (timestamp(6) NOT NULL, "Last date of the financial year in datetime format e.g. financial year 2024 will be 2024-03-31")
- symbol (string NOT NULL, "Symbol/Ticker of the company listed on National Stock Exchange in India.")
- cash_from_operating_activity (float64, "Cash from operating activity in the financial year in Crores INR")
- profit_before_tax (float64, "Profit before tax/PBT in the financial year in Crores INR. This is part of cash_from_operating_activity")
- interest (float64, "Interest paid in the financial year in Crores INR. This is part of cash_from_operating_activity")
- tax (float64, "Tax paid in the financial year in Crores INR. This is part of cash_from_operating_activity")
- cash_from_investing_activity (float64, "Cash from investing activity in the financial year in Crores INR")
- cash_from_financing_activity (float64, "Cash from financing activity in the financial year in Crores INR")
- net_cash_flow (float64, "Net cash flow in the financial year in Crores INR")
- cash_plus_cash_equivalent_begin_of_year (float64, "Cash plus cash equivalents at the beginning of the financial year in Crores INR")
- cash_plus_cash_equivalent_end_of_year (float64, "Cash plus cash equivalents at the end of the financial year in Crores INR")
