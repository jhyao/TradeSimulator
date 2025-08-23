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