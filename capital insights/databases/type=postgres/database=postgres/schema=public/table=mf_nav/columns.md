# mf_nav

**Dataset:** `public`

## Columns (7)

- scheme_code (int32 NOT NULL, "Unique identifier for the mutual fund scheme.")
- scheme_name (string, "Name of the mutual fund scheme.")
- ISIN (string, "International Securities Identification Number for the scheme.")
- net_asset_value (float64, "Net Asset Value (also known as Net Asset Value per Unit, NAV, NAV per unit) of the mutual fund scheme as on date in 'Date' column.")
- date (timestamp(6) NOT NULL, "Date for the Net Asset Value in datetime format.")
- mutual_fund_house (string, "Name of the mutual fund house that manages the scheme; also known as Asset Management Company or AMC.")
- category (string, "Category of the mutual fund scheme as defined by the Securities and Exchange Board of India (SEBI).")
