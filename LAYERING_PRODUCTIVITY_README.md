# Layering Productivity Chart Implementation

## Overview
This implementation provides a live "Layering Productivity" comparison chart that looks and behaves exactly like the existing Trimming chart, using real data from the admin panel.

## Backend Implementation

### Endpoints

#### GET /api/productivity/layering
- **Purpose**: Fetch layering productivity data
- **Auth**: Bearer token required (401 if missing)
- **Query Parameters**:
  - `from`: ISO date string (optional, defaults to today)
  - `to`: ISO date string (optional, defaults to today)
  - `team`: team filter string (optional)
  - `limit`: integer, max results (optional, default 1000)
- **Headers**: `Cache-Control: no-store`
- **Response**: Array of objects with:
  - `user_id`: string
  - `name`: string
  - `avatar_url`: string (optional)
  - `layering_percent`: number (0-100)
  - `layering_seconds`: number (raw seconds)
  - `jobs_count`: number
  - `last_updated`: ISO date string
- **Sorting**: By layering_percent descending
- **Data Source**: Reads from hourlyReports collection where category='layering', joins with users table
- **Validation**: Returns 400 for bad dates, 200 + empty array if no data
- **Logging**: Logs request ID, user ID, row count, and time window

#### GET /api/productivity/layering/stream
- **Purpose**: Server-Sent Events for live updates
- **Auth**: Bearer token required (supports query param `?token=`)
- **Response**: SSE stream with:
  - Connection events
  - Heartbeat every ~25s
  - Single-user update payloads in same format as main endpoint
- **Error Handling**: Closes with 401/440 when auth expires

## Frontend Implementation

### File: productivity_layering.js

#### Exported Functions
- `initLayeringProductivityChart({ containerEl, dropdownEl })`
- `destroyLayeringProductivityChart()`

#### Key Features
- **Data Fetching**: `fetchLayeringData(params)` calls `/api/productivity/layering`
- **Live Updates**: `connectLiveStream()` subscribes to SSE endpoint
- **Chart Rendering**: `renderChart(dataset)` with same visual style as Trimming
- **Live Updates**: `updateChartPoint(update)` patches individual bars without full re-render
- **Error Handling**: `handleError(err)` shows toast + exponential backoff retry
- **Empty State**: `handleEmpty()` shows "No layering data in this range"

#### Chart Features
- **Labels**: First name + last initial (truncated if needed)
- **Bar Values**: Show percentage (0-100%)
- **Tooltips**: Name, %, raw time (HH:MM:SS), jobs count, last updated
- **Footer**: "Last updated: HH:MM AM/PM"
- **Accessibility**: `role="img"` + `aria-label="Layering productivity comparison bar chart"`
- **Y-axis**: 0-100% scale
- **Sorting**: Bars sorted descending by percentage

#### Performance & Reliability
- **Filter Debouncing**: 300ms debounce on filter changes
- **Batch Updates**: Live updates batched every ~250ms to reduce reflows
- **User Limit**: If >100 users, shows top 50 + "Others" bar with average %
- **Data Validation**: Clamps bad data outside 0-100% with warnings
- **Auto-Reconnect**: SSE reconnection with jittered backoff up to ~30s
- **Reconnect UI**: Shows "Reconnecting..." badge during reconnection attempts

## Integration

### Dropdown Integration
The chart integrates with the existing productivity dropdown in `app.html`:
```html
<select id="productivityMetricSelect">
  <option value="trimming">Trimming Productivity</option>
  <option value="layering">Layering Productivity</option>
</select>
```

### Chart Switching
The existing `productivity-chart.js` handles switching between metrics:
- When "Layering Productivity" is selected, it destroys the trimming chart and initializes the layering chart
- When "Trimming Productivity" is selected, it destroys the layering chart and reinitializes the trimming chart

## Data Flow

1. **Initial Load**: Frontend calls `/api/productivity/layering` with current filters
2. **Live Updates**: Frontend connects to `/api/productivity/layering/stream`
3. **Data Processing**: Backend reads from `hourlyReports` collection, filters by `category='layering'`
4. **Calculation**: Productivity = (reported_seconds / target_seconds) * 100, capped at 100%
5. **Real-time**: When new hourly reports are added, SSE pushes updates to connected clients
6. **UI Update**: Frontend batches updates and patches individual bars

## Files Modified

### Backend
- `api/server.js` - Added route mapping
- `api/layering-productivity.js` - Complete endpoint implementation
- `api/__tests__/layering-productivity.test.js` - Basic API tests

### Frontend
- `renderer/productivity_layering.js` - Complete chart implementation (NEW)
- `renderer/productivity-chart.js` - Added metric switching logic
- `renderer/app.html` - Already contains dropdown and container (NO CHANGES)

## Testing

### Backend Tests
```bash
cd api
npm test
```

Tests cover:
- Authentication requirements
- Query parameter validation
- Response schema validation
- Header verification
- Data sorting

### Manual Testing
1. Start the API server: `cd api && npm start`
2. Open the app and navigate to the productivity section
3. Switch between "Trimming Productivity" and "Layering Productivity"
4. Verify charts load with real data
5. Test live updates by adding hourly reports with category='layering'

## Deployment Notes

1. **Authentication**: Replace placeholder auth with real JWT validation
2. **Firebase Config**: Ensure `firebase-service-key.json` is properly configured
3. **CORS**: Update CORS settings for production domains
4. **Rate Limiting**: Consider adding rate limiting for the SSE endpoint
5. **Monitoring**: Add proper logging and monitoring for the live stream connections

## Troubleshooting

### Common Issues
1. **401 Errors**: Check authentication token configuration
2. **Empty Charts**: Verify hourly reports exist with `category='layering'`
3. **SSE Connection Fails**: Check CORS and authentication setup
4. **Data Not Updating**: Verify Firebase listeners are working

### Debug Mode
Enable debug logging by setting `localStorage.setItem('debug', 'true')` in browser console.