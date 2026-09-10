# Master Dataset Schema Specification: MPLADS Anomaly & Fraud Detection System

This document provides the formal Data Dictionary and Schema Definitions for the three Principal Master Datasets generated for the **AI-Powered MPLADS Monitoring and Analytics Platform**.

---

## 1. Master Works Schema (`principal_master_works.csv`)

- **Primary Key**: `work_id`
- **Foreign Keys**: `mp_id` $\rightarrow$ `principal_master_mp_summary.csv`, `contractor_vendor_id` $\rightarrow$ `principal_master_payments.csv`
- **Record Level**: Project / Work Recommendation Level (111,525 rows)

| Column Name | Data Type | Nullable | Primary Purpose & Anomaly Description | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `work_id` | String (UUID/ID) | NO | Unique primary key for each work/project record. | `WRK_REAL_175556` |
| `data_source` | String (Enum) | NO | Source identifier (`WEB_SCRAPED_REAL` or `SYNTHETIC_BENCHMARK`). | `WEB_SCRAPED_REAL` |
| `mp_id` | String (Hash) | NO | Foreign key linking work to MP master registry. | `575306419c50` |
| `mp_name` | String | NO | Full official name of Hon'ble Member of Parliament. | `BISHNU PADA RAY` |
| `house` | String (Enum) | NO | House of Parliament (`Lok Sabha` or `Rajya Sabha`). | `Lok Sabha` |
| `state` | String | NO | State or Union Territory name. | `Andaman And Nicobar Islands` |
| `constituency` | String | NO | Parliamentary constituency name. | `ANDAMAN AND NICOBAR ISLANDS` |
| `district` | String | YES | District or Implementing District Authority (IDA) name. | `SOUTH ANDAMANS` |
| `block` | String | YES | Administrative block or taluka. | `Block_84` |
| `village_or_ward` | String | YES | Village or Ward location detail. | `Village_434` |
| `latitude` | Float | YES | GIS latitude coordinate. | `34.228792` |
| `longitude` | Float | YES | GIS longitude coordinate. | `88.655221` |
| `work_description` | String | NO | Detailed textual description of recommended work. | `Repair and renovation of road from CPWD complex` |
| `work_category` | String | NO | Standardized category (Road, Drinking Water, School, etc.). | `Road` |
| `implementing_agency` | String | YES | Executing department or district agency (IDA). | `SOUTH ANDAMANS(Implementing District Authority)` |
| `contractor_vendor_id` | String | YES | Assigned contractor/vendor identifier. | `Vendor_104` |
| `contractor_name` | String | YES | Full legal display name of assigned contractor. | `M/s Pioneer Infrastructure (Vendor_104)` |
| `is_contractor_blacklisted` | Integer (0/1) | NO | Flag (1 if contractor is blacklisted, else 0). | `1` |
| `blacklisted_reason` | String | YES | Reason for contractor blacklisting. | `PRIOR_FUND_MISMANAGEMENT_2022` |
| `is_blacklisted_contractor_anomaly` | Integer (0/1) | NO | Anomaly flag (1 if work awarded to blacklisted contractor). | `1` |
| `estimated_cost` | Float (INR) | NO | Initial cost estimate or recommended amount ($₹$). | `4947034.00` |
| `sanctioned_amount` | Float (INR) | NO | Official financial sanction amount ($₹$). | `4947034.00` |
| `expenditure` | Float (INR) | NO | Actual funds spent to date ($₹$). | `2473517.00` |
| `physical_progress_percent` | Float (%) | NO | Real physical completion percentage ($0-100\%$). | `50.0` |
| `financial_progress_percent` | Float (%) | NO | Financial expenditure ratio ($0-100\%$). | `50.0` |
| `recommendation_date` | Date | YES | MP recommendation date (`YYYY-MM-DD`). | `2025-02-14` |
| `sanction_date` | Date | YES | Official sanction date (`YYYY-MM-DD`). | `2025-03-24` |
| `expected_completion_date` | Date | YES | Targeted project completion date (`YYYY-MM-DD`). | `2025-10-30` |
| `actual_completion_date` | Date | YES | Actual completion date (`YYYY-MM-DD`). | `2025-11-15` |
| `status` | String | NO | Work stage status (e.g., `Completed`, `Work partially Completed`). | `Work partially Completed` |
| `sanction_delay_days` | Integer | YES | Days elapsed between recommendation and sanction. | `38` |
| `completion_delay_days` | Integer | YES | Days elapsed between expected and actual completion. | `16` |
| `cost_overrun_amount` | Float (INR) | NO | Excess expenditure over sanctioned amount ($₹$). | `0.00` |
| `cost_overrun_percent` | Float (%) | NO | Percentage cost overrun relative to sanction. | `0.0` |
| `progress_mismatch_gap` | Float (%) | NO | Absolute gap between financial and physical progress %. | `0.0` |
| `category_national_avg_duration_days` | Integer | NO | National benchmark average completion days in India. | `180` |
| `project_duration_days` | Integer | NO | Actual or estimated execution duration in days. | `494` |
| `duration_variance_vs_national_avg_days` | Integer | NO | Variance in days vs national category average. | `314` |
| `duration_to_national_avg_ratio` | Float | NO | Ratio of project duration vs national benchmark average. | `2.74` |
| `is_exceeds_national_avg_duration` | Integer (0/1) | NO | Binary flag (1 if duration exceeds national average). | `1` |
| `is_excess_duration_anomaly` | Integer (0/1) | NO | Anomaly flag (1 if duration ratio $\ge 1.5\times$). | `1` |
| `letter_no` | String | YES | Administrative sanction letter reference number. | `LN/MP18275/2024-2025/1` |
| `synthetic_record` | String (Bool) | NO | Synthetic record flag (`True` or `False`). | `False` |
| `synthetic_scenario` | String | NO | Applied synthetic scenario pattern name. | `N/A` |
| `ground_truth_anomaly` | String | NO | Categorical anomaly label(s). | `AWARDED_TO_BLACKLISTED_CONTRACTOR` |
| `ground_truth_severity` | String (Enum) | NO | Anomaly severity (`CRITICAL`, `HIGH`, `MEDIUM`, `NORMAL`). | `CRITICAL` |

---

## 2. Master MP Summary Schema (`principal_master_mp_summary.csv`)

- **Primary Key**: `mp_id`
- **Record Level**: Member of Parliament / Constituency Level (776 rows)

| Column Name | Data Type | Nullable | Primary Purpose & Description | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `mp_id` | String (Hash) | NO | Unique primary key for MP. | `575306419c50` |
| `mp_name` | String | NO | Full official name of Hon'ble MP. | `AASHTIKAR PATIL NAGESH BAPURAO` |
| `state` | String | NO | State or Union Territory. | `Maharashtra` |
| `constituency` | String | NO | Parliamentary constituency name. | `HINGOLI` |
| `house` | String (Enum) | NO | Parliament house (`Lok Sabha` or `Rajya Sabha`). | `Lok Sabha` |
| `entitlement_amt` | Float (INR) | NO | Total scheme allocation limit entitlement ($₹$). | `190289442.00` |
| `scraped_works_recommended` | Integer | NO | Total works recommended on portal. | `916` |
| `total_works_count` | Integer | NO | Total count of works under MP in dataset. | `916` |
| `completed_works_count` | Integer | NO | Count of completed projects under MP. | `450` |
| `ongoing_works_count` | Integer | NO | Count of ongoing/in-progress projects under MP. | `466` |
| `total_recommended_amt` | Float (INR) | NO | Total recommended funds ($₹$). | `269501566.00` |
| `total_sanctioned_amt` | Float (INR) | NO | Total sanctioned funds ($₹$). | `269101566.00` |
| `total_expenditure_amt` | Float (INR) | NO | Total actual expenditure disbursed ($₹$). | `257800000.00` |
| `unutilized_fund_amt` | Float (INR) | NO | Remaining unutilized entitlement funds ($₹$). | `0.00` |
| `utilisation_rate_pct` | Float (%) | NO | Percentage of entitlement sanctioned ($0-100\%$). | `95.80` |
| `avg_sanction_delay_days` | Float | NO | Average sanction delay in days across MP works. | `42.5` |
| `avg_project_duration_days` | Float | NO | Average project completion duration in days. | `198.4` |
| `total_cost_overrun_amt` | Float (INR) | NO | Total cost overrun amount across MP works ($₹$). | `1250000.00` |
| `blacklisted_contractor_works_count` | Integer | NO | Works under MP awarded to blacklisted contractors. | `4` |
| `blacklisted_contractor_funds_amount` | Float (INR) | NO | Sanctioned funds awarded to blacklisted contractors ($₹$). | `18500000.00` |
| `has_blacklisted_contractor_flag` | Integer (0/1) | NO | Binary alert (1 if MP assigned work to blacklisted entity). | `1` |
| `anomaly_works_count` | Integer | NO | Total count of anomalous works under MP. | `85` |
| `excess_duration_works_count` | Integer | NO | Count of works exceeding national benchmark duration. | `62` |
| `anomaly_works_pct` | Float (%) | NO | Percentage of works under MP flagged for anomalies. | `9.28` |
| `composite_risk_score` | Float | NO | Unified Risk Score ($0$ to $100$) for decision dashboards. | `48.25` |

---

## 3. Master Payments Schema (`principal_master_payments.csv`)

- **Primary Key**: `payment_id`
- **Foreign Keys**: `work_id` $\rightarrow$ `principal_master_works.csv`, `mp_id` $\rightarrow$ `principal_master_mp_summary.csv`
- **Record Level**: Transaction Payment Ledger Level (12,040 rows)

| Column Name | Data Type | Nullable | Primary Purpose & Description | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `payment_id` | String (UUID) | NO | Unique primary key for payment transaction. | `d549e22f-521b-4edb-af38-83837cfd1e3d` |
| `work_id` | String | NO | Foreign key linking payment to target work. | `e90f4eae-30d0-4411-bf05-08b38bdc9445` |
| `mp_id` | String | NO | Foreign key linking payment to MP. | `575306419c50` |
| `implementing_agency` | String | NO | Executing department or agency. | `Municipal Corporation` |
| `payment_date` | Date | NO | Date payment was disbursed (`YYYY-MM-DD`). | `2023-08-01` |
| `payment_amount` | Float (INR) | NO | Monetary payment amount ($₹$). | `5596983.55` |
| `payment_type` | String (Enum) | NO | Transfer mode (`Cheque`, `Bank Transfer`, `ECS`). | `Cheque` |
| `vendor_id` | String | NO | Payee vendor identifier. | `Vendor_45` |
| `is_vendor_blacklisted` | Integer (0/1) | NO | Flag (1 if payee vendor is blacklisted). | `0` |
| `vendor_blacklisted_reason` | String | YES | Reason for vendor blacklisting (`N/A` if clean). | `N/A` |
| `is_blacklisted_vendor_payment_anomaly` | Integer (0/1) | NO | Anomaly flag (1 if payment made to blacklisted vendor). | `0` |
| `synthetic_record` | String (Bool) | NO | Synthetic record flag (`True` or `False`). | `True` |
| `synthetic_scenario` | String | NO | Applied synthetic scenario pattern name. | `NORMAL` |
| `ground_truth_anomaly` | String | NO | Categorical anomaly label for payment. | `NORMAL` |
