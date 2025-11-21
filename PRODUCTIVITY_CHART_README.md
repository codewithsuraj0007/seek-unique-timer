# Live Productivity Chart Implementation

## Overview

This implementation adds a live vertical bar chart to the Tools section of the Admin Panel that compares productivity (%) across real, active company users. The chart displays user productivity data sourced exclusively from the Admin Panel Hourly Reports → Productivity column.

## Features

- **Real-time Updates**: Chart updates every 60 seconds without affecting existing features
- **Purple Gradient Visualization**: Bar colors use purple gradient with intensity based on productivity
- **Admin-Only Access**: Permission-checked to ensure only admins can view
- **Accessibility Compliant**: Includes proper ARIA labels, keyboard navigation, and screen reader support
- **Feature Flag Controlled**: Staged rollout behind configurable feature flags
- **Responsive Design**: Works on desktop and mobile devices
- **Interactive Tooltips**: Hover for detailed user information

## Files Added/Modified

### Backend Files
- `functions/productivity-chart.js` - Backend aggregation endpoint (read-only)
- `functions/index.js` - Updated to include new endpoint
- `functions/__tests__/productivity-chart.test.js` - Backend tests

### Frontend Files
- `renderer/productivity-chart.js` - Main chart component
- `renderer/admin-productivity-chart.js` - Initialization logic
- `renderer/feature-flags.js` - Feature flag management system
- `renderer/__tests__/productivity-chart.test.js` - Frontend tests
- `renderer/admin.html` - Updated to include chart container and scripts

## Data Source & Filtering

### Real User Criteria
Users are considered "real" if ALL of the following are true:
- `is_active = true` (or equivalent active flag)
- `is_dummy = false` OR `role != 'test'`
- Email does not match test domains (@example.com, @test.com, @dummy.com)
- `last_login` within last 180 days (configurable threshold)
- `account_verified = true` (if field exists)

### Data Exclusions
- Hourly report rows flagged as `is_test` or `manual_test_entry`
- Users with test email domains
- Dummy/test accounts

## Aggregation Logic

### Weighted Average Calculation
```javascript
user_productivity = sum(productivity_i * duration_i) / sum(duration_i)
```

Where:
- `productivity_i` are percent values (0–∞)
- `duration_i` are durations in seconds
- Each hourly report entry is weighted by its tracked duration

### Fallback Options
- Simple average of productivity values
- Latest checkpoint productivity
- Max productivity (not recommended for comparison)

## API Endpoint

### GET `/getProductivityChartData`

**Parameters:**
- `date` (optional): Date in YYYY-MM-DD format (default: today)
- `companyId` (optional): Company filter
- `limit` (optional): Maximum number of users to return

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user_id": "user123",
      "display_name": "John Doe",
      "aggregated_productivity_percent": 85.7,
      "last_reported_at": "2024-01-15T10:30:00Z",
      "report_count": 3
    }
  ],
  "metadata": {
    "date": "2024-01-15",
    "total_users": 15,
    "generated_at": "2024-01-15T11:00:00Z"
  }
}
```

## Feature Flag Management

### Console Commands
```javascript
// Enable/disable chart
window.enableProductivityChart()
window.disableProductivityChart()

// Set rollout percentage (0-100)
window.setProductivityChartRollout(50) // 50% of users

// Check flag status
window.featureFlags.getFlagStatus('PRODUCTIVITY_CHART')
```

### Configuration
```javascript
{
  PRODUCTIVITY_CHART: {
    enabled: true,
    rolloutPercentage: 100, // 0-100
    adminOnly: true,
    description: 'Live productivity comparison chart in Tools section'
  }
}
```

## Chart Visualization

### Color Mapping
- **Low Productivity (0%)**: Light purple (`rgba(232, 121, 249, 0.3)`)
- **High Productivity (100%+)**: Deep purple (`rgba(124, 58, 237, 1.0)`) with glow effect
- **Gradient Calculation**: `intensity = min(productivity / 100, 1)`

### Interactive Features
- **Hover Tooltips**: Show user name, productivity %, report count, last update
- **Click Navigation**: Click bar to view user's detailed hourly reports
- **Responsive Layout**: Adapts to screen size with horizontal scrolling on mobile

## Accessibility Features

- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Navigation**: Full keyboard support
- **Color Contrast**: Meets WCAG guidelines
- **Tooltips**: Accessible hover information
- **Focus Management**: Proper focus indicators

## Testing

### Frontend Tests
```bash
npm test -- productivity-chart.test.js
```

Tests cover:
- Component initialization
- Data fetching and filtering
- Chart rendering
- User interactions
- Accessibility compliance
- Error handling

### Backend Tests
```bash
npm test -- functions/__tests__/productivity-chart.test.js
```

Tests cover:
- User filtering logic
- Weighted average calculations
- Data validation
- Error handling
- Security checks

## Performance Considerations

### Caching Strategy
- **Client-side**: 30-second TTL for aggregated results
- **Rate Limiting**: Protects endpoint from excessive calls
- **Efficient Queries**: Uses indexed fields (user_id, date, company_id)
- **Server-side Aggregation**: Reduces client-side processing

### Live Updates
- **Default Interval**: 60 seconds
- **Visibility Aware**: Pauses updates when tab is hidden
- **WebSocket Ready**: Architecture supports future WebSocket implementation

## Security & Permissions

### Authorization
- Admin email verification required
- Same authorization rules as Admin panel
- Audit logging for chart access

### Data Privacy
- No PII beyond display names exposed
- Read-only operations only
- Secure token-based authentication

## Deployment & Rollout

### Staged Rollout Plan
1. **Internal Testing**: Enable for admin users only
2. **Limited Rollout**: 25% of admin users
3. **Gradual Expansion**: 50%, 75%, 100%
4. **Full Deployment**: All admin users

### Monitoring
- Chart API latency and error rates
- Cache hit rates and DB query performance
- Data parity validation against CSV exports
- User engagement metrics

## Troubleshooting

### Common Issues

**Chart not loading:**
- Check feature flag: `window.featureFlags.getFlagStatus('PRODUCTIVITY_CHART')`
- Verify admin permissions
- Check browser console for errors

**No data showing:**
- Verify hourly reports exist for selected date
- Check user filtering criteria
- Ensure users have recent activity

**Performance issues:**
- Check network tab for slow API calls
- Verify database indexes are in place
- Monitor cache hit rates

### Debug Commands
```javascript
// Check chart instance
window.productivityChart

// Force refresh
window.productivityChart?.fetchData()

// Check feature flags
window.featureFlags.getAllFlags()

// Enable debug logging
localStorage.setItem('DEBUG_PRODUCTIVITY_CHART', 'true')
```

## Future Enhancements

### Planned Features
- WebSocket real-time updates
- Historical trend view
- Export chart data to CSV
- Custom date range selection
- Team/department filtering
- Performance benchmarking

### Technical Improvements
- GraphQL endpoint for more efficient queries
- Progressive Web App caching
- Offline mode support
- Advanced analytics integration

## Maintenance

### Regular Tasks
- Monitor data parity with CSV exports
- Review and update user filtering criteria
- Performance optimization based on usage patterns
- Security audit of data access patterns

### Updates
- Feature flag configuration changes
- Chart styling and UX improvements
- Backend performance optimizations
- Test coverage expansion