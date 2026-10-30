# Backend Schema Document - Status: RECOVERED

## Source
Recovered from `supabase-schema.sql` in the repository root

## Content
The complete database schema as defined in the Supabase SQL file, including:

### Core Tables
1. **Profiles**: User information (name, DOB, goals, targets, etc.)
2. **Food Logs**: Nutrition tracking with macros and meal types
3. **Weight Logs**: Weight tracking over time
4. **Sleep Logs**: Sleep tracking with start/end times and duration
5. **Health Tracking Preferences**: Per-user step/sleep goals and time zone
6. **Activity Daily Summaries**: Per-user local-date step totals and source metadata
7. **Activity Sessions**: GPS walk/run summaries and bounded route points
8. **Conversations & Messages**: AI coaching chat history
9. **User Memories**: Preferences, dietary restrictions, habits, etc.
10. **Subscriptions**: Payment provider subscription data
11. **AI Usage**: Token counting and cost tracking per user per period
12. **Billing Webhook Events**: Webhook event logging for idempotency

### Security Features
- Row Level Security (RLS) enabled on all tables
- Policies restrict access to user-owned data only
- No client access to sensitive billing webhook events table
- Proper foreign key relationships with cascade deletes
- Constraints and indexes for data integrity and performance

### Functions & Triggers
- `record_ai_usage`: Secure function for tracking AI consumption
- `handle_new_user`: Auto-creates profile on new user signup
- Database triggers for automatic profile creation
- `consume_ai_usage` and `release_ai_usage`: Atomic AI quota reservation functions

### Indexes
Various indexes for query performance optimization on frequently queried columns

## Completeness Assessment
This file represents the complete database schema as implemented in the Kayven application. It includes all table definitions, relationships, constraints, indexes, security policies, and database functions.

## Verification
The schema can be verified by examining the file directly at `supabase-schema.sql` in the repository root. The file includes comments indicating it should be run in the Supabase SQL Editor to set up the database.

Note: As mentioned in the audit reports, some tables referenced in the application code (such as workout and supplement tables) may not be fully defined in this schema and may require additional migrations for complete functionality.

Activity and sleep changes are defined by the additive migration `supabase/migrations/20261025000000_health_activity_sleep_tracking.sql`. See [Activity and sleep tracking](../ACTIVITY_SLEEP_TRACKING.md) for browser limitations, source handling, and migration details.