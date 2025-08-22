# Task 5 Pre-step 1: Simulation Start Time Control - Implementation Details

**Duration**: 1 day  
**Priority**: Critical  
**Status**: Ready for Implementation

## Overview
Add simulation start time selection control where users choose a specific date/time to begin simulation, then load historical data before that point for chart context.

## Requirements
- Date/time picker for simulation start point selection
- Load historical data before selected start time for chart context
- Display historical data on chart before simulation begins
- Integration with existing timeframe selector

## UI Elements to Add

### 1. StartTimeSelector Component
**Location**: `frontend/src/components/StartTimeSelector.tsx`

**Elements**:
- Date picker input (`<input type="date">`)
- Time picker input (`<input type="time">`)
- **"Load Historical Data" button**
- Current selected start time display

**Component Structure**:
```typescript
const StartTimeSelector = ({ onStartTimeSelected, selectedStartTime }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  
  const handleLoadHistoricalData = () => {
    const selectedDateTime = new Date(`${date}T${time}`);
    onStartTimeSelected(selectedDateTime);
  };
  
  return (
    <div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <button onClick={handleLoadHistoricalData}>Load Historical Data</button>
      {selectedStartTime && <div>Selected: {selectedStartTime.toLocaleString()}</div>}
    </div>
  );
};
```

### 2. App.tsx Updates
**State Management**:
```typescript
const [selectedStartTime, setSelectedStartTime] = useState<Date | null>(null);
const [historicalContextData, setHistoricalContextData] = useState(null);

const loadHistoricalData = async (endTime: Date, interval: string) => {
  const endTimeMs = endTime.getTime();
  const response = await fetch(
    `/api/market/historical?symbol=${symbol}&endTime=${endTimeMs}&interval=${interval}&limit=1000`
  );
  const data = await response.json();
  setHistoricalContextData(data);
};

// When timeframe changes
const handleTimeframeChange = (newTimeframe: string) => {
  setTimeframe(newTimeframe);
  
  // If we have a selected start time, reload data with new timeframe
  if (selectedStartTime) {
    loadHistoricalData(selectedStartTime, newTimeframe);
  }
};
```

## Backend API Usage

### Reuse Existing Endpoint
**Endpoint**: `/api/market/historical`  
**Method**: GET

**Parameters for Historical Context Loading**:
- `symbol`: Trading pair (BTCUSDT/ETHUSDT)
- `endTime`: Selected start time in milliseconds
- `interval`: Current timeframe from selector
- `limit`: Default (1000) for sufficient historical context
- **NO startTime parameter** - let API return data ending at selected time

**API Call Pattern**:
```
GET /api/market/historical?symbol=BTCUSDT&endTime={selectedStartTime}&interval={timeframe}&limit=1000
```

## Control Flow & Data Flow

### 1. Start Time Selection Flow
```
1. User selects date/time in StartTimeSelector
2. User clicks "Load Historical Data" button
3. Frontend updates selectedStartTime state
4. Frontend automatically calls loadHistoricalData() with current timeframe
5. API returns up to 1000 candles ending at selectedStartTime
6. Chart displays historical context data
```

### 2. Timeframe Change Integration
```
1. User changes timeframe in ChartControls
2. handleTimeframeChange() is called
3. If selectedStartTime exists:
   - Automatically reload historical data with new timeframe
   - Use same selectedStartTime as endTime
   - Use new interval parameter
4. If no selectedStartTime:
   - Use existing chart behavior (load recent data)
```

### 3. Chart Integration Workflow
```
1. Chart component receives historicalContextData prop
2. When historicalContextData exists:
   - Display historical candles up to selectedStartTime
   - Add visual marker at selectedStartTime
   - Don't load recent data
3. When historicalContextData is null:
   - Use existing behavior (load recent data)
```

## Implementation Steps

### Step 1: Create StartTimeSelector Component
- Create `frontend/src/components/StartTimeSelector.tsx`
- Implement date/time picker UI
- Add "Load Historical Data" button
- Handle date/time state management

### Step 2: Update App.tsx
- Add selectedStartTime and historicalContextData state
- Integrate StartTimeSelector component
- Implement loadHistoricalData function
- Update handleTimeframeChange to support selected start time

### Step 3: Update Chart Component
- Accept historicalContextData prop
- Handle display of historical context vs recent data
- Add visual marker at selectedStartTime
- Prepare for future simulation data streaming

### Step 4: Integration Testing
- Test start time selection and data loading
- Test timeframe changes with selected start time
- Verify chart displays historical context correctly
- Ensure smooth user experience

## Technical Considerations

### State Management
- selectedStartTime persists across timeframe changes
- historicalContextData updates when timeframe or start time changes
- Existing chart behavior maintained when no start time selected

### API Efficiency
- Reuse existing `/api/market/historical` endpoint
- Use limit parameter instead of startTime for better performance
- Single API call per timeframe change

### Chart Display
- Historical context displayed up to selected start time
- Visual indicator shows simulation start point
- Ready for simulation engine integration in main Task 5

## Success Criteria
- [ ] User can select simulation start date/time via UI
- [ ] "Load Historical Data" button loads context data ending at selected time
- [ ] Chart displays historical data before selected start time
- [ ] Timeframe changes automatically reload data with selected start time
- [ ] Historical context data loads properly using existing API
- [ ] Ready to begin simulation from selected start point

## What NOT to Do
- Don't implement time validation or data availability checks
- Don't add complex time zone handling
- Don't add preset time selection buttons
- Don't validate market hours or trading sessions
- Don't persist selected start times to database

## Notes
- This task provides the foundation for the full simulation engine in Task 5
- Uses existing API infrastructure efficiently
- Maintains compatibility with current chart behavior
- Prepares for historical data replay starting from selected point