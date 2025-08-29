# how to simulate real-time update
In real live candlestick chart, the last one candle is updating, for example we are displaying in 5 minutes timeframe, the last candle will keep updating untile this 5 minutes frame end, and then a new candle will be added. So in relay simulation, we still can achieve similar "real-time" updating, for example, we are replay in 5 minutes timeframe, and replay speed is 1 second to 1 minutes (60x), then every 5 seconds, there should be one new candle, if we want the last candle update once per second, then we can use 1m level historical data to simulate 5m candle.

For example 1m level sample data:
timestamp  open  high  low  close  volume
000  1      1.5     0.8     0.9     1
060  0.9    1.1     0.7     0.8     1 
120  0.8    0.9     0.6     0.7     1
180  0.7    0.8     0.5     0.6     1
240  0.6    0.7     0.4     0.5     1

when simulating a 5m candle, it will have 5 updates
timestamp   open    high    low     close   volume
000         1       1.5     0.8     0.9     1
000         1       1.5     0.7     0.8     2
000         1       1.5     0.6     0.7     3
000         1       1.5     0.5     0.6     4
000         1       1.5     0.4     0.5     1

So during updating
open = first open
high = max high
low = min low
close = last close
volume = sum volume
timestamp = start time of this 5-minute frame

Assume we require at least one updates per second in any timeframe, we should always use lower level data to replay.

If we define the replay speed relative to time, instead of use a number mutiplier (5x, 10x, 60s), we define replay speed as 1s -> 1m (60x), 1s -> 5m (300x), ...

Speed           Display     SimulateData
1s->1m (60x)    1m          1m
1s->1m (60x)    5m          1m
1s->1m (60x)    1h          1m

1s->2m (120x)   1m          1m
1s->2m (120x)   5m          1m
1s->2m (120x)   1h          1m

1s->5m (300x)   1m          1m
1s->5m (300x)   5m          5m
1s->5m (300x)   1h          5m

So the solution is
Assume replay speed = X
1s in simulation = X seconds = X / 60 minutes = Y minutes
If display timeframe < Y minutes, then use the timeframe < Y minutes
If display timeframe >= Y minutes, then use simulate timeframe <= Y minutes


Here is all supported by binance api
1s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M

Update1: handle change display timeframe during simulation.
For example User start simulation with 300x speed, and initially using 5m display timeframe, so for backend will use 5m level historical data, publish one new candle every second.
When user changing display timeframe from 5m to 1h, backend can still use 5m level data, but will publish 1h level candle with updates.
But when user changing display timeframe from 5m to 1m, 5m level historical data will not suitable for this case, if we want to support 1m level display, backend have to switch to 1m level historical data.
To simplify the issue, if speed is 300s, we can limit min display timeframe level to 5m, 1m or lower will not be supported.

So update the algorithm:
Assume replay speed = X
1s in simulation = X seconds = X / 60 minutes = Y minutes
min display timeframe = used historical data timeframe in backend = the largest timeframe that <= Y minutes

Add restriction both in frontend and backend.

Update2: Edge case for the first candle
when frontend selected a start time, for example 2025-08-01 06:02, and timeframe is 5m, because in binance api, if set endtime is 06:02, it will return the last candle of 06:00 to 06:05. So the chart actually already showed data until 06:05.
But when starting simulation, backend load historical data from 06:02, but interval use 1m, so it get 1m level candles for 06:02, 06:03, 06:04, 06:05, and then used them to build 5m candle updates, that will cause the last one 5m candle already displayed on UI been updated again, but sliently different, because backend did get all 1m candle from 06:00. so open price, and other open price must be wrong, high/low price may also be wrong, close price is correct.
And another case is when switch display timeframe during replay, for example, at simulation time 06:05, I switched display timeframe from 5m to 1h, in this case, the chart will load 1h candles end time is 06:05, so similar issue, if get from binance api, it will return the completed 1h candle from 06:00 to 07:00. Then candle updates from websocket will update this candle, but open/high/low are incorrect.

Solution:
1. simulate incompleted candle on the market historical data api, for example, when requesting 5m candles endtime 06:02, for the last candle, backend should use 1m candle 06:00 and 06:01 to get the incompleted 06:00 5m level candle. Similar for other timeframes, if the last candle time range is incompleted, use 1m level data to generate the incompleted candle.
2. in frontend, when receiving updates from websocket, need to recalculate with displayed last candle, if the updateing candle is incompleted, then can do the update.
3. in candle data model, beside the starttime of the candle, add also endtime of the candle, for completed candle, endtime = starttime + interval, for incompleted candle, endtime in a middle time.

Update3: Move progressive candle update from backend to frontend
There is a unavoidable problem in current design.
For example, initial setting is startTime: 06:02, speed: 60x, display timeframe: 5m
Under this setting, baseInterval (historical data interval for replay) = 1m, ticker = 1s
At the beginning, the UI already loaded historical data wth incompleted candle, so the last candle startTime=06:00, and its OHLCV is aggreagted using two 1m candled from 06:00 to 06:02
Then we start replay, simulation engine load 1m level base dataset from 06:02, at the first ticker, it will publish updated candle which startTime=06:00, but aggregated using 1 1m candle from 06:02 to 06:03, so the issue is except the close price, open/high/low/volume are incorrect, correct candle should be aggregated using candles from 06:00 to 06:03. The second update is aggregated using two 1m candle from 06:02 to 06:04, .... 
And when used changed display timeframe, for example at simulation time 07:04, user changed display timeframe to 1h, then UI will load historical data again, so the last candle should be startTime=07:00 and incompleted (at here UI has another issue, UI still load historical data to 06:02, means still using the initial startTime, but should use the simulation time or endTime of last candle, two time should be same, this issue also need to be fixed), new received updates from websocket will be startTime = 07:00, but based data is from 07:04.
So the fix this, need to move progressive aggregation logic from backend to frontend, in backend every ticker, will publish one record(one complated base candle) in baseDataset (including OHLCV), then in frontend, if the last candle is incompleted, need to merge with latest update.
