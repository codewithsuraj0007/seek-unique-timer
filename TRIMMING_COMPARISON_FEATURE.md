# Trimming Comparison Feature

## Overview
The Trimming Grand Time Comparison is a read-only vertical bar chart that displays relative trimming performance across all real users in the company. The chart appears in the Tools container, directly after the "Productivity" row.

## Features
- **Read-only**: No database writes or updates - purely for visualization
- **Real-time data**: Shows live production user data from hourly reports
- **Privacy-focused**: Only shows relative percentages and ranks (no exact times for other users)
- **Responsive design**: Adapts to different screen sizes
- **Auto-refresh**: Updates every 60 seconds with server-side caching

## API Endpoint

### `getTrimmingComparison`
- **URL**: `https://us-central1-seek-unique-timer.cloudfunctions.net/getTrimmingComparison`
- **Method**: GET only
- **Parameters**:
  - `date` (optional): YYYY-MM-DD format, defaults to today
  - `limit` (optional): Max users to return, default 30, max 50
- **Caching**: 45-second server-side cache to prevent DB spikes
- **Rate limiting**: Built-in via Firebase Functions

### Response Format
```json
{
  "date": "2024-01-15",
  "users": [
    {
      "userId": "user123",
      "name": "John Doe", 
      "grandTrimmingSeconds": 3600
    }
  ],
  "maxTrimmingSeconds": 3600,
  "totalUsers": 5,
  "generatedAt": "2024-01-15T10:30:00.000Z"
}
```

## Data Source
- **Collection**: `hourlyReports`
- **Filter**: `category == 'trimming'`
- **Aggregation**: Groups by `userId` and sums `reportedSec`
- **User names**: Retrieved from `users` collection

## Privacy & Security
- Uses read-only database credentials
- No exact trimming times shown for other users
- Only displays:
  - Rank (e.g., "#2")
  - Relative percentage (e.g., "75% of Top")
  - Current user can see their exact time
- No personally sensitive data exposed

## Configuration
Located in `app.js`:
```javascript
const TRIMMING_COMPARISON_CONFIG = {
  apiUrl: 'https://us-central1-seek-unique-timer.cloudfunctions.net/getTrimmingComparison',
  refreshInterval: 60000, // 1 minute
  maxUsers: 30,
  featureFlag: true // Toggle to disable
};
```

## Feature Toggle
To disable the feature:
1. Set `TRIMMING_COMPARISON_CONFIG.featureFlag = false` in `app.js`
2. Or hide the section with CSS: `.trimming-comparison-section { display: none !important; }`

## Performance
- **Server-side caching**: 45 seconds TTL
- **Client-side refresh**: Every 60 seconds
- **Firestore queries**: Optimized with compound indexes
- **Rate limiting**: Automatic via Firebase Functions

## Accessibility
- ARIA labels for screen readers
- Keyboard navigation support
- High contrast tooltips
- Responsive design for mobile devices

## Rollback
If issues occur:
1. Set feature flag to `false`
2. Or comment out the chart initialization in `initTrimmingOnAuth()`
3. The API endpoint can be disabled independently

## Testing Checklist
- [ ] API returns correct data structure
- [ ] Chart renders with proper styling
- [ ] Tooltips show appropriate information
- [ ] Auto-refresh works correctly
- [ ] No database writes performed
- [ ] Privacy requirements met (no exact times for others)
- [ ] Responsive design works on mobile
- [ ] Accessibility features functional
- [ ] Feature flag toggle works
- [ ] Error handling displays properly

## Dependencies
- Firebase Functions (for API)
- Firestore (read-only access)
- Modern browser with fetch API support